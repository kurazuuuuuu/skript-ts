package net.krz.skriptts;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Cloudflare REST client manager (M4 CF-1: the common base plus D1;
 * KV and R2 build on the same base in later slices).
 *
 * The destination is fixed: {@code https://api.cloudflare.com/client/v4}
 * (or the {@code SKRIPTTS_CF_API_BASE_URL} environment override, which
 * exists so verification can point the client at a local stub server;
 * the plugin logs a loud warning when it is set). Scripts never supply
 * a URL — they name a handle — so the phase-26 SSRF policy for
 * arbitrary URLs does not apply here. What IS inherited from the
 * phase-26 HTTP manager ({@link Urls}) is the execution discipline:
 * a daemon executor, at most 8 operations in flight (further calls
 * complete as {@code busy}), connect timeout 5 s, a per-operation
 * deadline, an 8 MiB response cap, and exactly-once completion.
 *
 * Credentials are resolved from {@code SKRIPTTS_CF_*} environment
 * variables at call time (the JVM's environment is fixed at launch,
 * like {@code env()}): for a handle named H (uppercased, non
 * [A-Z0-9] characters folded to '_'), the variables are
 * {@code SKRIPTTS_CF_<H>_TOKEN}, {@code SKRIPTTS_CF_<H>_ACCOUNT_ID}
 * and {@code SKRIPTTS_CF_<H>_D1_DATABASE_ID}. The handle named
 * {@code default} additionally falls back to the unprefixed
 * {@code SKRIPTTS_CF_TOKEN} / {@code SKRIPTTS_CF_ACCOUNT_ID} /
 * {@code SKRIPTTS_CF_D1_DATABASE_ID}; other handles never inherit
 * another handle's credentials. A handle that cannot be fully
 * resolved completes with error kind {@code policy} and a detail
 * naming the missing variables — values are never logged, and
 * neither are SQL texts or parameter values.
 *
 * Script-visible error kinds are the phase-26 set
 * ({@code policy | network | timeout | size | io | busy}) plus
 * {@code auth | notfound | quota | api} for Cloudflare-side
 * failures. Only the kind reaches scripts; the detail (the
 * Cloudflare error message and code, or the local refusal reason)
 * goes to the server log.
 */
final class Cloudflare {

    interface Completion {
        void onComplete(Result result);
    }

    /**
     * Outcome of one operation. {@code rows} is the D1 result row
     * list (empty for statements without a result set);
     * {@code changes} / {@code rowsRead} / {@code rowsWritten} are
     * the D1 meta figures (the billing unit), logged on success.
     * {@code storeVar} is carried through untouched so the engine
     * can apply the store mapping when the completion is handled.
     */
    record Result(String id, boolean ok, String errorKind, String detail,
                  String storeVar, List<Map<String, Object>> rows,
                  double changes, double rowsRead, double rowsWritten,
                  String signedUrl, Double r2Size, List<String> listKeys,
                  UUID playerUuid) {
        /** CF-1 (D1) shape: no R2 payload, no originating player. */
        Result(String id, boolean ok, String errorKind, String detail,
               String storeVar, List<Map<String, Object>> rows,
               double changes, double rowsRead, double rowsWritten) {
            this(id, ok, errorKind, detail, storeVar, rows, changes, rowsRead, rowsWritten,
                    null, null, null, null);
        }
    }

    private static final int MAX_BODY = 8 * 1024 * 1024;

    private final Completion completion;
    private final Logger logger;
    private final Semaphore permits = new Semaphore(8);
    private final ExecutorService executor;
    private final HttpClient client;
    private final AtomicBoolean shutdownFlag = new AtomicBoolean(false);
    private final Object shutdownLock = new Object();
    private final String baseUrl;
    // R2 (CF-3): the engine data folder is the root every script
    // file path resolves against, and the folder holding the
    // persistent monthly usage counter. The limits come from
    // config.json's cloudflare section (plugin-parsed).
    private final Path dataDir;
    private final long r2ClassALimit;
    private final long r2ClassBLimit;
    private final Object usageLock = new Object();
    private final AtomicLong r2Sequence = new AtomicLong();
    private boolean r2EndpointWarned = false;

    Cloudflare(Completion completion, Path dataDir, long r2ClassALimit, long r2ClassBLimit, Logger logger) {
        this.completion = completion;
        this.dataDir = dataDir.toAbsolutePath().normalize();
        this.r2ClassALimit = r2ClassALimit;
        this.r2ClassBLimit = r2ClassBLimit;
        this.logger = logger != null ? logger : Logger.getLogger(Cloudflare.class.getName());

        AtomicInteger threadNumber = new AtomicInteger();
        this.executor = Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "skript-ts-cf-" + threadNumber.incrementAndGet());
            t.setDaemon(true);
            return t;
        });

        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();

        String override = System.getenv("SKRIPTTS_CF_API_BASE_URL");
        this.baseUrl = override != null && !override.isBlank()
                ? stripTrailingSlashes(override.trim())
                : "https://api.cloudflare.com/client/v4";
    }

    void d1Query(String id, String handle, String sql, List<Object> params, String storeVar, double timeoutSeconds, UUID playerUuid) {
        Job job = new Job(id, storeVar, playerUuid);
        if (shutdownFlag.get()) {
            return;
        }

        Resolved resolved = resolveD1(handle);
        if (resolved.missing != null) {
            complete(job, fail(job, "policy",
                    "handle '" + handle + "' is not configured: missing " + String.join(", ", resolved.missing)));
            return;
        }

        // Parameter conversion mirrors the JDBC binder's contract:
        // null, strings, numbers (as doubles) and booleans bind
        // natively; anything else binds as its string form.
        List<Object> converted = new ArrayList<>();
        if (params != null) {
            for (Object value : params) {
                if (value == null || value instanceof String || value instanceof Boolean) {
                    converted.add(value);
                } else if (value instanceof Number number) {
                    converted.add(number.doubleValue());
                } else {
                    converted.add(String.valueOf(value));
                }
            }
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sql", sql);
        payload.put("params", converted);
        String json;
        try {
            json = Json.write(payload);
        } catch (RuntimeException e) {
            complete(job, fail(job, "policy", "a query parameter is not a finite number"));
            return;
        }

        if (!permits.tryAcquire()) {
            complete(job, fail(job, "busy", "Too many concurrent requests"));
            return;
        }
        if (shutdownFlag.get()) {
            permits.release();
            return;
        }

        try {
            executor.submit(() -> {
                try {
                    execute(job, resolved, json, timeoutSeconds);
                } catch (Throwable t) {
                    complete(job, fail(job, "io", t.toString()));
                } finally {
                    permits.release();
                }
            });
        } catch (RejectedExecutionException e) {
            permits.release();
            if (!shutdownFlag.get()) {
                complete(job, fail(job, "io", "Executor rejected request: " + e.getMessage()));
            }
        }
    }

    void shutdown() {
        synchronized (shutdownLock) {
            if (shutdownFlag.get()) {
                return;
            }
            shutdownFlag.set(true);
        }

        int cancelled = Math.max(0, 8 - permits.availablePermits());
        executor.shutdownNow();
        logger.log(Level.INFO, "Cloudflare shutdown: cancelled {0} in-flight request(s)", cancelled);
    }

    // ------------------------------------------------------------------
    // Handle resolution
    // ------------------------------------------------------------------

    private static final class Resolved {
        final String token;
        final String accountId;
        final String databaseId;
        /** Names of the environment variables consulted but unset; non-null when resolution failed. */
        final List<String> missing;

        Resolved(String token, String accountId, String databaseId, List<String> missing) {
            this.token = token;
            this.accountId = accountId;
            this.databaseId = databaseId;
            this.missing = missing;
        }
    }

    private static Resolved resolveD1(String handle) {
        String normalized = handle == null
                ? ""
                : handle.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "_");
        boolean isDefault = normalized.equals("DEFAULT");
        String prefix = "SKRIPTTS_CF_" + normalized + "_";

        List<String> missing = new ArrayList<>();
        String token = resolveVar(prefix + "TOKEN", isDefault ? "SKRIPTTS_CF_TOKEN" : null, missing);
        String accountId = resolveVar(prefix + "ACCOUNT_ID", isDefault ? "SKRIPTTS_CF_ACCOUNT_ID" : null, missing);
        String databaseId = resolveVar(prefix + "D1_DATABASE_ID", isDefault ? "SKRIPTTS_CF_D1_DATABASE_ID" : null, missing);

        if (!missing.isEmpty()) {
            return new Resolved(null, null, null, missing);
        }
        return new Resolved(token, accountId, databaseId, null);
    }

    private static String resolveVar(String primary, String fallback, List<String> missing) {
        String value = System.getenv(primary);
        if (value != null && !value.isBlank()) {
            return value;
        }
        if (fallback != null) {
            value = System.getenv(fallback);
            if (value != null && !value.isBlank()) {
                return value;
            }
            missing.add(primary + ", " + fallback);
        } else {
            missing.add(primary);
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Execution
    // ------------------------------------------------------------------

    private void execute(Job job, Resolved resolved, String json, double timeoutSeconds) {
        HttpRequest request;
        try {
            request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/accounts/" + resolved.accountId
                            + "/d1/database/" + resolved.databaseId + "/query"))
                    .timeout(timeoutDuration(timeoutSeconds))
                    .header("Authorization", "Bearer " + resolved.token)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                    .build();
        } catch (Exception e) {
            complete(job, fail(job, "io", "Invalid request: " + e.getMessage()));
            return;
        }

        HttpResponse<InputStream> response;
        try {
            response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpConnectTimeoutException e) {
            complete(job, fail(job, "timeout", e.toString()));
            return;
        } catch (HttpTimeoutException e) {
            complete(job, fail(job, "timeout", e.toString()));
            return;
        } catch (IOException e) {
            complete(job, fail(job, "network", e.toString()));
            return;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            complete(job, fail(job, "io", "Interrupted"));
            return;
        } catch (Throwable t) {
            complete(job, fail(job, "io", t.toString()));
            return;
        }

        int status = response.statusCode();
        byte[] bytes;
        try (InputStream in = response.body()) {
            bytes = readLimited(in);
        } catch (BodyTooLargeException e) {
            complete(job, fail(job, status, "size", "Response body exceeds 8 MiB"));
            return;
        } catch (IOException e) {
            complete(job, fail(job, status, "io", "Body read failed: " + e.getMessage()));
            return;
        }

        complete(job, interpret(job, status, new String(bytes, StandardCharsets.UTF_8)));
    }

    /**
     * Turn an HTTP response into a Result. Success requires both a
     * 2xx status and the envelope's {@code success} flag. On success
     * the D1 meta figures are logged (they are the billing unit)
     * before the ok result is completed.
     */
    private Result interpret(Job job, int status, String text) {
        Object parsed;
        try {
            parsed = Json.parse(text);
        } catch (RuntimeException e) {
            parsed = null;
        }

        boolean status2xx = status >= 200 && status < 300;
        if (!(parsed instanceof Map<?, ?>)) {
            return status2xx
                    ? fail(job, status, "api", "Unparseable response body")
                    : fail(job, status, kindForStatus(status, null), "HTTP " + status);
        }

        Map<String, Object> envelope = asMap(parsed);
        if (status2xx && Boolean.TRUE.equals(envelope.get("success"))) {
            List<Map<String, Object>> rows = new ArrayList<>();
            double changes = 0;
            double rowsRead = 0;
            double rowsWritten = 0;

            if (envelope.get("result") instanceof List<?> resultList && !resultList.isEmpty()
                    && resultList.get(0) instanceof Map<?, ?>) {
                Map<String, Object> first = asMap(resultList.get(0));
                if (first.get("results") instanceof List<?> resultsList) {
                    for (Object rowObj : resultsList) {
                        if (rowObj instanceof Map<?, ?>) {
                            rows.add(asMap(rowObj));
                        }
                    }
                }
                if (first.get("meta") instanceof Map<?, ?>) {
                    Map<String, Object> meta = asMap(first.get("meta"));
                    changes = numberValue(meta.get("changes"));
                    rowsRead = numberValue(meta.get("rows_read"));
                    rowsWritten = numberValue(meta.get("rows_written"));
                }
            }

            logger.log(Level.INFO,
                    "cf d1 query {0} ok: rows_read={1} rows_written={2} changes={3} rows={4}",
                    new Object[]{job.id, (long) rowsRead, (long) rowsWritten, (long) changes, rows.size()});
            return new Result(job.id, true, null, null, job.storeVar, rows, changes, rowsRead, rowsWritten,
                    null, null, null, job.playerUuid);
        }

        return fail(job, status, kindForStatus(status, envelope), failureDetail(status, envelope));
    }

    private static String kindForStatus(int status, Map<String, Object> envelope) {
        if (envelope != null && hasErrorCode(envelope, 10429)) {
            return "quota";
        }
        return switch (status) {
            case 401, 403 -> "auth";
            case 404 -> "notfound";
            case 429 -> "quota";
            default -> "api";
        };
    }

    private static boolean hasErrorCode(Map<String, Object> envelope, int target) {
        if (envelope.get("errors") instanceof List<?> errors) {
            for (Object errorObj : errors) {
                if (errorObj instanceof Map<?, ?>) {
                    Object code = asMap(errorObj).get("code");
                    if (code instanceof Number number && number.doubleValue() == target) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static String failureDetail(int status, Map<String, Object> envelope) {
        if (envelope.get("errors") instanceof List<?> errors) {
            for (Object errorObj : errors) {
                if (errorObj instanceof Map<?, ?>) {
                    Map<String, Object> error = asMap(errorObj);
                    if (error.get("message") instanceof String message && !message.isEmpty()) {
                        if (error.get("code") instanceof Number code) {
                            return message + " (code " + code.longValue() + ")";
                        }
                        return message;
                    }
                }
            }
        }
        return "HTTP " + status;
    }

    // ------------------------------------------------------------------
    // R2 (CF-3): S3-compatible object operations
    //
    // The destination is fixed: https://<accountId>.
    // r2.cloudflarestorage.com (virtual-host style,
    // <bucket>.<host>/<key>). The per-handle environment override
    // SKRIPTTS_CF_<H>_R2_ENDPOINT replaces the endpoint and switches
    // to path-style (<endpoint>/<bucket>/<key>); it exists for
    // verification stubs, and using it logs a warning. Scripts name
    // a handle, a bucket and a key — never a URL or a credential.
    //
    // Every operation is counted BEFORE dispatch by the persistent
    // monthly quota counter (cf-r2-usage.json in the data folder,
    // UTC month): Put / Delete / List are Class A, Get / Head /
    // presign issuance are Class B. An operation that would exceed
    // its class limit is never sent; it completes with error kind
    // "quota" and a SEVERE log line. R2's free tier is 1M Class A /
    // 10M Class B operations a month and R2 bills overages, so the
    // defaults (config.json cloudflare.r2MonthlyClassALimit /
    // r2MonthlyClassBLimit) sit at 10% of that as a breakwater.
    //
    // Signing is AWS Signature V4 (region "auto", service "s3")
    // via R2Signer; secrets and signatures are never logged.
    // ------------------------------------------------------------------

    private static final class R2Resolved {
        final String accountId;
        final String accessKeyId;
        final String secretAccessKey;
        /** Endpoint override from SKRIPTTS_CF_<H>_R2_ENDPOINT, or null for the fixed R2 host. */
        final String endpointOverride;
        final List<String> missing;

        R2Resolved(String accountId, String accessKeyId, String secretAccessKey,
                   String endpointOverride, List<String> missing) {
            this.accountId = accountId;
            this.accessKeyId = accessKeyId;
            this.secretAccessKey = secretAccessKey;
            this.endpointOverride = endpointOverride;
            this.missing = missing;
        }
    }

    private static R2Resolved resolveR2(String handle) {
        String normalized = handle == null
                ? ""
                : handle.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "_");
        boolean isDefault = normalized.equals("DEFAULT");
        String prefix = "SKRIPTTS_CF_" + normalized + "_";

        List<String> missing = new ArrayList<>();
        String accountId = resolveVar(prefix + "ACCOUNT_ID", isDefault ? "SKRIPTTS_CF_ACCOUNT_ID" : null, missing);
        String accessKeyId = resolveVar(prefix + "R2_ACCESS_KEY_ID", isDefault ? "SKRIPTTS_CF_R2_ACCESS_KEY_ID" : null, missing);
        String secretAccessKey = resolveVar(prefix + "R2_SECRET_ACCESS_KEY", isDefault ? "SKRIPTTS_CF_R2_SECRET_ACCESS_KEY" : null, missing);
        String endpoint = System.getenv(prefix + "R2_ENDPOINT");
        if (endpoint != null && endpoint.isBlank()) endpoint = null;
        if (!missing.isEmpty()) {
            return new R2Resolved(null, null, null, endpoint, missing);
        }
        return new R2Resolved(accountId, accessKeyId, secretAccessKey, endpoint, null);
    }

    /** The object URI for an operation: virtual-host style by default, path-style under an endpoint override. */
    private URI r2ObjectUri(R2Resolved resolved, String bucket, String key) {
        String encodedKey = R2Signer.encodeUriPath(key);
        if (resolved.endpointOverride != null) {
            String base = stripTrailingSlashes(resolved.endpointOverride.trim());
            return URI.create(base + "/" + R2Signer.encodeUriPath(bucket) + "/" + encodedKey);
        }
        return URI.create("https://" + bucket + "." + resolved.accountId
                + ".r2.cloudflarestorage.com/" + encodedKey);
    }

    /** The bucket URI for a List operation (same style rule as r2ObjectUri, with the list query). */
    private URI r2ListUri(R2Resolved resolved, String bucket, String prefix) {
        // The prefix travels as one query parameter value,
        // percent-encoded like a path (slashes stay readable; the
        // signer canonicalizes the query it finds in the URI, so
        // the signature covers exactly this spelling).
        String query = "list-type=2&max-keys=1000"
                + (prefix != null && !prefix.isEmpty()
                        ? "&prefix=" + R2Signer.encodeUriPath(prefix)
                        : "");
        if (resolved.endpointOverride != null) {
            String base = stripTrailingSlashes(resolved.endpointOverride.trim());
            return URI.create(base + "/" + R2Signer.encodeUriPath(bucket) + "?" + query);
        }
        return URI.create("https://" + bucket + "." + resolved.accountId
                + ".r2.cloudflarestorage.com/?" + query);
    }

    private void warnEndpointOnce(R2Resolved resolved, String handle) {
        if (resolved.endpointOverride == null) return;
        synchronized (usageLock) {
            if (!r2EndpointWarned) {
                r2EndpointWarned = true;
                logger.log(Level.WARNING,
                        "skript-ts: WARNING handle ''{0}'' has an R2 endpoint override set — R2 traffic goes to that endpoint (path-style) instead of <account>.r2.cloudflarestorage.com. This override exists for verification stubs only; do not set it on a production server.",
                        handle);
            }
        }
    }

    /**
     * Resolve a script file path against the data folder root.
     * Returns null (after logging) when the path is absolute or
     * escapes the root — the caller completes with "policy".
     */
    private Path resolveDataPath(String rel) {
        if (rel == null || rel.isBlank()) return null;
        Path candidate;
        try {
            candidate = dataDir.resolve(rel).normalize();
        } catch (RuntimeException e) {
            return null;
        }
        if (!candidate.startsWith(dataDir)) return null;
        return candidate;
    }

    /**
     * Charge one operation to the monthly counter. Returns true
     * when the operation may proceed (the counter was incremented
     * and persisted before dispatch); returns false when the class
     * limit is already reached — the caller completes "quota"
     * without sending anything. A counter file that cannot be read
     * or written logs SEVERE and the operation still proceeds: the
     * counter is a breakwater against billing surprises, not a
     * correctness mechanism, and the log line is the operator's
     * signal to fix the disk.
     */
    private boolean chargeQuota(boolean classA, String opName, String id) {
        synchronized (usageLock) {
            String month = YearMonth.now(ZoneOffset.UTC).toString();
            long classAUsed = 0;
            long classBUsed = 0;
            Path usageFile = dataDir.resolve("cf-r2-usage.json");
            try {
                if (Files.exists(usageFile)) {
                    Object parsed = Json.parse(Files.readString(usageFile, StandardCharsets.UTF_8));
                    if (parsed instanceof Map<?, ?> map && month.equals(map.get("month"))) {
                        classAUsed = (long) numberValue(map.get("classA"));
                        classBUsed = (long) numberValue(map.get("classB"));
                    }
                }
            } catch (Exception e) {
                logger.log(Level.SEVERE, "skript-ts: cf-r2-usage.json could not be read ({0}); the R2 quota counter restarts from zero for this month", e.getMessage());
            }
            long used = classA ? classAUsed : classBUsed;
            long limit = classA ? r2ClassALimit : r2ClassBLimit;
            if (used >= limit) {
                logger.log(Level.SEVERE,
                        "skript-ts: R2 monthly quota reached for {0} (used {1} of {2} in {3}); refusing operation {4} (id {5}) without sending a request",
                        new Object[]{classA ? "Class A" : "Class B", used, limit, month, opName, id});
                return false;
            }
            if (classA) classAUsed++; else classBUsed++;
            Map<String, Object> next = new LinkedHashMap<>();
            next.put("month", month);
            next.put("classA", (double) classAUsed);
            next.put("classB", (double) classBUsed);
            try {
                Files.createDirectories(dataDir);
                Path tmp = dataDir.resolve("cf-r2-usage.json.tmp-" + r2Sequence.incrementAndGet());
                Files.writeString(tmp, Json.write(next) + "\n", StandardCharsets.UTF_8);
                try {
                    Files.move(tmp, usageFile, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(tmp, usageFile, StandardCopyOption.REPLACE_EXISTING);
                }
            } catch (Exception e) {
                logger.log(Level.SEVERE, "skript-ts: cf-r2-usage.json could not be written ({0}); the R2 quota counter may undercount", e.getMessage());
            }
            return true;
        }
    }

    /** Shared prologue for the request-backed R2 operations: resolve handle, resolve path, charge quota, acquire a permit, submit. */
    private void r2Submit(String opName, boolean classA, Job job, String handle,
                          java.util.function.Function<R2Resolved, Runnable> work) {
        if (shutdownFlag.get()) {
            return;
        }
        R2Resolved resolved = resolveR2(handle);
        if (resolved.missing != null) {
            complete(job, fail(job, "policy",
                    "handle '" + handle + "' is not configured for R2: missing " + String.join(", ", resolved.missing)));
            return;
        }
        warnEndpointOnce(resolved, handle);
        if (!chargeQuota(classA, opName, job.id)) {
            complete(job, fail(job, "quota", "R2 monthly " + (classA ? "Class A" : "Class B") + " limit reached"));
            return;
        }
        if (!permits.tryAcquire()) {
            complete(job, fail(job, "busy", "Too many concurrent requests"));
            return;
        }
        if (shutdownFlag.get()) {
            permits.release();
            return;
        }
        try {
            Runnable task = work.apply(resolved);
            executor.submit(() -> {
                try {
                    task.run();
                } catch (Throwable t) {
                    complete(job, fail(job, "io", t.toString()));
                } finally {
                    permits.release();
                }
            });
        } catch (RejectedExecutionException e) {
            permits.release();
            if (!shutdownFlag.get()) {
                complete(job, fail(job, "io", "Executor rejected request: " + e.getMessage()));
            }
        }
    }

    void r2Put(String id, String handle, String bucket, String key, String path,
               double timeoutSeconds, UUID playerUuid) {
        Job job = new Job(id, null, playerUuid);
        Path source = resolveDataPath(path);
        if (source == null) {
            complete(job, fail(job, "policy", "path '" + path + "' is not a relative path inside the data folder"));
            return;
        }
        r2Submit("put", true, job, handle, resolved -> () -> {
            if (!Files.isRegularFile(source)) {
                complete(job, fail(job, "io", "source file does not exist: " + path));
                return;
            }
            String payloadHash;
            try {
                payloadHash = sha256HexOfFile(source);
            } catch (IOException e) {
                complete(job, fail(job, "io", "source file could not be read: " + e.getMessage()));
                return;
            }
            URI uri = r2ObjectUri(resolved, bucket, key);
            HttpRequest request;
            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                        .uri(uri)
                        .timeout(timeoutDuration(timeoutSeconds))
                        .PUT(HttpRequest.BodyPublishers.ofFile(source));
                R2Signer.signHeaders("PUT", uri, Map.of(), payloadHash,
                        resolved.accessKeyId, resolved.secretAccessKey, "auto", "s3", Instant.now())
                        .forEach((name, value) -> applySignedHeader(builder, name, value));
                request = builder.build();
            } catch (Exception e) {
                complete(job, fail(job, "io", "Invalid request: " + e.getMessage()));
                return;
            }
            complete(job, interpretS3(job, sendForS3(job, request, false)));
        });
    }

    void r2Get(String id, String handle, String bucket, String key, String path,
               double timeoutSeconds, UUID playerUuid) {
        Job job = new Job(id, null, playerUuid);
        Path target = resolveDataPath(path);
        if (target == null) {
            complete(job, fail(job, "policy", "path '" + path + "' is not a relative path inside the data folder"));
            return;
        }
        r2Submit("get", false, job, handle, resolved -> () -> {
            URI uri = r2ObjectUri(resolved, bucket, key);
            HttpRequest request;
            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                        .uri(uri)
                        .timeout(timeoutDuration(timeoutSeconds))
                        .GET();
                R2Signer.signHeaders("GET", uri, Map.of(), R2Signer.sha256Hex(new byte[0]),
                        resolved.accessKeyId, resolved.secretAccessKey, "auto", "s3", Instant.now())
                        .forEach((name, value) -> applySignedHeader(builder, name, value));
                request = builder.build();
            } catch (Exception e) {
                complete(job, fail(job, "io", "Invalid request: " + e.getMessage()));
                return;
            }
            complete(job, downloadS3(job, request, target, path));
        });
    }

    void r2Head(String id, String handle, String bucket, String key,
                double timeoutSeconds, UUID playerUuid) {
        Job job = new Job(id, null, playerUuid);
        r2Submit("head", false, job, handle, resolved -> () -> {
            URI uri = r2ObjectUri(resolved, bucket, key);
            HttpRequest request;
            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                        .uri(uri)
                        .timeout(timeoutDuration(timeoutSeconds))
                        .method("HEAD", HttpRequest.BodyPublishers.noBody());
                R2Signer.signHeaders("HEAD", uri, Map.of(), R2Signer.sha256Hex(new byte[0]),
                        resolved.accessKeyId, resolved.secretAccessKey, "auto", "s3", Instant.now())
                        .forEach((name, value) -> applySignedHeader(builder, name, value));
                request = builder.build();
            } catch (Exception e) {
                complete(job, fail(job, "io", "Invalid request: " + e.getMessage()));
                return;
            }
            S3Outcome outcome = sendForS3(job, request, true);
            if (outcome == null) return; // completion already delivered
            if (outcome.ok) {
                Double size = outcome.contentLength;
                complete(job, new Result(job.id, true, null, null, null, List.of(), 0, 0, 0,
                        null, size, null, job.playerUuid));
            } else {
                complete(job, fail(job, outcome.status, outcome.kind, outcome.detail));
            }
        });
    }

    void r2Delete(String id, String handle, String bucket, String key,
                  double timeoutSeconds, UUID playerUuid) {
        Job job = new Job(id, null, playerUuid);
        r2Submit("delete", true, job, handle, resolved -> () -> {
            URI uri = r2ObjectUri(resolved, bucket, key);
            HttpRequest request;
            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                        .uri(uri)
                        .timeout(timeoutDuration(timeoutSeconds))
                        .DELETE();
                R2Signer.signHeaders("DELETE", uri, Map.of(), R2Signer.sha256Hex(new byte[0]),
                        resolved.accessKeyId, resolved.secretAccessKey, "auto", "s3", Instant.now())
                        .forEach((name, value) -> applySignedHeader(builder, name, value));
                request = builder.build();
            } catch (Exception e) {
                complete(job, fail(job, "io", "Invalid request: " + e.getMessage()));
                return;
            }
            complete(job, interpretS3(job, sendForS3(job, request, false)));
        });
    }

    void r2List(String id, String handle, String bucket, String prefix, String storeVar,
                double timeoutSeconds, UUID playerUuid) {
        Job job = new Job(id, storeVar, playerUuid);
        r2Submit("list", true, job, handle, resolved -> () -> {
            URI uri = r2ListUri(resolved, bucket, prefix);
            HttpRequest request;
            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder()
                        .uri(uri)
                        .timeout(timeoutDuration(timeoutSeconds))
                        .GET();
                R2Signer.signHeaders("GET", uri, Map.of(), R2Signer.sha256Hex(new byte[0]),
                        resolved.accessKeyId, resolved.secretAccessKey, "auto", "s3", Instant.now())
                        .forEach((name, value) -> applySignedHeader(builder, name, value));
                request = builder.build();
            } catch (Exception e) {
                complete(job, fail(job, "io", "Invalid request: " + e.getMessage()));
                return;
            }
            S3Outcome outcome = sendForS3(job, request, false);
            if (outcome == null) return;
            if (!outcome.ok) {
                complete(job, fail(job, outcome.status, outcome.kind, outcome.detail));
                return;
            }
            // One page only (max-keys=1000): the first page's keys
            // are the result; pagination is a documented limit.
            List<String> keys = parseListKeys(outcome.bodyText);
            complete(job, new Result(job.id, true, null, null, job.storeVar, List.of(), 0, 0, 0,
                    null, null, keys, job.playerUuid));
        });
    }

    void r2Presign(String id, String handle, String bucket, String key, double ttlSeconds, UUID playerUuid) {
        Job job = new Job(id, null, playerUuid);
        if (shutdownFlag.get()) {
            return;
        }
        R2Resolved resolved = resolveR2(handle);
        if (resolved.missing != null) {
            complete(job, fail(job, "policy",
                    "handle '" + handle + "' is not configured for R2: missing " + String.join(", ", resolved.missing)));
            return;
        }
        warnEndpointOnce(resolved, handle);
        // Presign sends no request, but it is the operation that
        // causes downloads, so it is charged as Class B (the
        // breakwater counts it as the download proxy).
        if (!chargeQuota(false, "presign", job.id)) {
            complete(job, fail(job, "quota", "R2 monthly Class B limit reached"));
            return;
        }
        int ttl = (int) Math.max(60, Math.min(604800, Math.round(ttlSeconds)));
        String url = R2Signer.presignGetUrl(r2ObjectUri(resolved, bucket, key),
                resolved.accessKeyId, resolved.secretAccessKey, "auto", "s3", ttl, Instant.now());
        complete(job, new Result(job.id, true, null, null, null, List.of(), 0, 0, 0,
                url, null, null, job.playerUuid));
    }

    // ------------------------------------------------------------------
    // S3 execution helpers
    // ------------------------------------------------------------------

    /**
     * Apply one signer-produced header to a request builder. The
     * "host" entry is part of the signature but must not be set
     * explicitly: HttpClient derives Host from the request URI and
     * rejects the restricted header name.
     */
    private static void applySignedHeader(HttpRequest.Builder builder, String name, String value) {
        if (!"host".equalsIgnoreCase(name)) {
            builder.header(name, value);
        }
    }

    /** The interpreted outcome of one S3 request: ok with the body text ("" for HEAD), or a mapped failure. */
    private static final class S3Outcome {
        final boolean ok;
        final int status;
        final String kind;
        final String detail;
        final String bodyText;
        final Double contentLength;

        S3Outcome(boolean ok, int status, String kind, String detail, String bodyText, Double contentLength) {
            this.ok = ok;
            this.status = status;
            this.kind = kind;
            this.detail = detail;
            this.bodyText = bodyText;
            this.contentLength = contentLength;
        }
    }

    /**
     * Send one S3 request and interpret the status. A null return
     * means a transport failure already completed the job (timeout
     * / network / io, mirroring the D1 execution discipline).
     */
    private S3Outcome sendForS3(Job job, HttpRequest request, boolean headOnly) {
        HttpResponse<InputStream> response;
        try {
            response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpConnectTimeoutException e) {
            complete(job, fail(job, "timeout", e.toString()));
            return null;
        } catch (HttpTimeoutException e) {
            complete(job, fail(job, "timeout", e.toString()));
            return null;
        } catch (IOException e) {
            complete(job, fail(job, "network", e.toString()));
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            complete(job, fail(job, "io", "Interrupted"));
            return null;
        } catch (Throwable t) {
            complete(job, fail(job, "io", t.toString()));
            return null;
        }
        int status = response.statusCode();
        String bodyText = "";
        if (headOnly) {
            try {
                response.body().close();
            } catch (IOException ignored) {
            }
        }
        if (!headOnly) {
            try (InputStream in = response.body()) {
                bodyText = new String(readLimited(in), StandardCharsets.UTF_8);
            } catch (BodyTooLargeException e) {
                return new S3Outcome(false, status, "size", "Response body exceeds 8 MiB", "", null);
            } catch (IOException e) {
                complete(job, fail(job, status, "io", "Body read failed: " + e.getMessage()));
                return null;
            }
        }
        var lengthHeader = response.headers().firstValueAsLong("content-length");
        Double contentLength = lengthHeader.isPresent() ? (double) lengthHeader.getAsLong() : null;
        if (status >= 200 && status < 300) {
            return new S3Outcome(true, status, null, null, bodyText, contentLength);
        }
        String code = extractXmlTag(bodyText, "Code");
        String message = extractXmlTag(bodyText, "Message");
        String kind = s3KindFor(status, code);
        String detail = (code != null ? code + ": " : "") + (message != null ? message : "HTTP " + status);
        return new S3Outcome(false, status, kind, detail, bodyText, contentLength);
    }

    private Result interpretS3(Job job, S3Outcome outcome) {
        if (outcome == null) {
            // Unreachable in practice: transport failures complete
            // inside sendForS3 and the caller's own complete() is
            // exactly-once guarded, so this result is dropped.
            return fail(job, "io", "request failed");
        }
        if (outcome.ok) {
            return new Result(job.id, true, null, null, job.storeVar, List.of(), 0, 0, 0,
                    null, null, null, job.playerUuid);
        }
        return fail(job, outcome.status, outcome.kind, outcome.detail);
    }

    /** Stream a GET response to `<target>.part-<seq>` and rename it into place on success (the Urls discipline). */
    private Result downloadS3(Job job, HttpRequest request, Path target, String scriptPath) {
        HttpResponse<InputStream> response;
        try {
            response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpConnectTimeoutException e) {
            return fail(job, "timeout", e.toString());
        } catch (HttpTimeoutException e) {
            return fail(job, "timeout", e.toString());
        } catch (IOException e) {
            return fail(job, "network", e.toString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return fail(job, "io", "Interrupted");
        } catch (Throwable t) {
            return fail(job, "io", t.toString());
        }
        int status = response.statusCode();
        if (status < 200 || status >= 300) {
            String bodyText = "";
            try (InputStream in = response.body()) {
                bodyText = new String(readLimited(in), StandardCharsets.UTF_8);
            } catch (IOException ignored) {
                // The status and its mapping are the outcome; a
                // body that cannot be read adds nothing.
            }
            String code = extractXmlTag(bodyText, "Code");
            String message = extractXmlTag(bodyText, "Message");
            return fail(job, status, s3KindFor(status, code),
                    (code != null ? code + ": " : "") + (message != null ? message : "HTTP " + status));
        }
        Path part = target.resolveSibling(target.getFileName() + ".part-" + r2Sequence.incrementAndGet());
        try {
            Files.createDirectories(target.getParent());
            try (InputStream in = response.body();
                 java.io.OutputStream out = Files.newOutputStream(part)) {
                in.transferTo(out);
            }
            try {
                Files.move(part, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(part, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            try {
                Files.deleteIfExists(part);
            } catch (IOException ignored) {
            }
            return fail(job, "io", "could not save to " + scriptPath + ": " + e.getMessage());
        }
        return new Result(job.id, true, null, null, null, List.of(), 0, 0, 0,
                null, null, null, job.playerUuid);
    }

    /** Map an S3 failure onto the CF-1 error vocabulary. */
    private static String s3KindFor(int status, String code) {
        if (code != null) {
            switch (code) {
                case "AccessDenied", "SignatureDoesNotMatch", "InvalidAccessKeyId", "AuthFailure" -> {
                    return "auth";
                }
                case "NoSuchKey", "NoSuchBucket", "NotFound" -> {
                    return "notfound";
                }
                case "SlowDown", "TooManyRequests" -> {
                    return "quota";
                }
                default -> {
                    // fall through to the status mapping
                }
            }
        }
        return switch (status) {
            case 401, 403 -> "auth";
            case 404 -> "notfound";
            case 429 -> "quota";
            default -> "api";
        };
    }

    /** Extract one XML element's text (entity-unescaped) from an S3 error or list body; null when absent. */
    private static String extractXmlTag(String xml, String tag) {
        List<String> all = extractXmlTags(xml, tag);
        return all.isEmpty() ? null : all.get(0);
    }

    private static List<String> extractXmlTags(String xml, String tag) {
        List<String> out = new ArrayList<>();
        if (xml == null) return out;
        String open = "<" + tag + ">";
        String close = "</" + tag + ">";
        int from = 0;
        while (true) {
            int start = xml.indexOf(open, from);
            if (start < 0) break;
            int end = xml.indexOf(close, start + open.length());
            if (end < 0) break;
            out.add(xmlUnescape(xml.substring(start + open.length(), end)));
            from = end + close.length();
        }
        return out;
    }

    private static String xmlUnescape(String text) {
        return text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
                .replace("&apos;", "'").replace("&amp;", "&");
    }

    /** The keys of a ListObjectsV2 response body, in document order. */
    private static List<String> parseListKeys(String bodyText) {
        return extractXmlTags(bodyText, "Key");
    }

    private static String sha256HexOfFile(Path file) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (Exception e) {
            throw new IOException("SHA-256 unavailable", e);
        }
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) {
                digest.update(buffer, 0, n);
            }
        }
        return R2Signer.sha256Hex(digest.digest());
    }

    // ------------------------------------------------------------------
    // Completion plumbing (mirrors Urls)
    // ------------------------------------------------------------------

    private void complete(Job job, Result result) {
        synchronized (shutdownLock) {
            if (shutdownFlag.get()) {
                return;
            }
            if (!job.done.compareAndSet(false, true)) {
                return;
            }

            if (!result.ok()) {
                logger.log(Level.WARNING,
                        "cf request {0} failed ({1}): {2}",
                        new Object[]{job.id, result.errorKind(), result.detail()});
            }

            try {
                completion.onComplete(result);
            } catch (Throwable t) {
                logger.log(Level.WARNING, "Completion callback failed for " + job.id, t);
            }
        }
    }

    private static Result fail(Job job, String kind, String detail) {
        return new Result(job.id, false, kind, detail, job.storeVar, List.of(), 0, 0, 0,
                null, null, null, job.playerUuid);
    }

    private static Result fail(Job job, int status, String kind, String detail) {
        // The HTTP status is diagnostic only; scripts see the kind.
        return fail(job, kind, detail + " [HTTP " + status + "]");
    }

    private static byte[] readLimited(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int n;

        while ((n = in.read(buffer)) != -1) {
            total += n;
            if (total > MAX_BODY) {
                throw new BodyTooLargeException();
            }
            out.write(buffer, 0, n);
        }

        return out.toByteArray();
    }

    private static Duration timeoutDuration(double timeoutSeconds) {
        if (Double.isNaN(timeoutSeconds) || timeoutSeconds <= 0) {
            return Duration.ofMillis(1);
        }
        double millis = timeoutSeconds * 1000.0;
        if (millis >= Long.MAX_VALUE) {
            return Duration.ofMillis(Long.MAX_VALUE);
        }
        return Duration.ofMillis(Math.max(1L, (long) millis));
    }

    private static String stripTrailingSlashes(String value) {
        String result = value;
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private static double numberValue(Object value) {
        return value instanceof Number number ? number.doubleValue() : 0;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    private static final class Job {
        final String id;
        final String storeVar;
        /** UUID of the player whose context started the operation, so the completion event can restore player(); null outside player contexts. */
        final UUID playerUuid;
        final AtomicBoolean done = new AtomicBoolean(false);

        Job(String id, String storeVar) {
            this(id, storeVar, null);
        }

        Job(String id, String storeVar, UUID playerUuid) {
            this.id = id;
            this.storeVar = storeVar;
            this.playerUuid = playerUuid;
        }
    }

    private static final class BodyTooLargeException extends IOException {
        BodyTooLargeException() {
            super("body exceeds limit");
        }
    }
}
