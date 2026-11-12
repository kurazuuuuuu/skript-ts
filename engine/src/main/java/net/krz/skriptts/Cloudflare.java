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
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
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
                  double changes, double rowsRead, double rowsWritten) {
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

    Cloudflare(Completion completion, Logger logger) {
        this.completion = completion;
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

    void d1Query(String id, String handle, String sql, List<Object> params, String storeVar, double timeoutSeconds) {
        Job job = new Job(id, storeVar);
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
            return new Result(job.id, true, null, null, job.storeVar, rows, changes, rowsRead, rowsWritten);
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
        return new Result(job.id, false, kind, detail, job.storeVar, List.of(), 0, 0, 0);
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
        final AtomicBoolean done = new AtomicBoolean(false);

        Job(String id, String storeVar) {
            this.id = id;
            this.storeVar = storeVar;
        }
    }

    private static final class BodyTooLargeException extends IOException {
        BodyTooLargeException() {
            super("body exceeds limit");
        }
    }
}
