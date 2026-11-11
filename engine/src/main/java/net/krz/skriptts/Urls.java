package net.krz.skriptts;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Level;
import java.util.logging.Logger;

final class Urls {
    interface Completion {
        void onComplete(Result result);
    }

    record Result(String id, boolean ok, Double status, String body, String errorKind, String detail, String savedPath) {
    }

    private static final int MAX_BODY = 8 * 1024 * 1024;

    private final Completion completion;
    private final Path filesRoot;
    private final boolean allowPrivateAddresses;
    private final Logger logger;
    private final Semaphore permits = new Semaphore(8);
    private final ExecutorService executor;
    private final HttpClient client;
    private final AtomicBoolean shutdownFlag = new AtomicBoolean(false);
    private final Object shutdownLock = new Object();
    private final Set<Path> inProgressParts = ConcurrentHashMap.newKeySet();
    private final AtomicLong sequence = new AtomicLong();

    Urls(Completion completion, Path filesRoot, boolean allowPrivateAddresses, Logger logger) {
        this.completion = completion;
        this.filesRoot = filesRoot.toAbsolutePath().normalize();
        this.allowPrivateAddresses = allowPrivateAddresses;
        this.logger = logger != null ? logger : Logger.getLogger(Urls.class.getName());

        AtomicInteger threadNumber = new AtomicInteger();
        this.executor = Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "skript-ts-http-" + threadNumber.incrementAndGet());
            t.setDaemon(true);
            return t;
        });

        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    void fetchText(String id, String url, double timeoutSeconds) {
        Job job = new Job(id);
        if (shutdownFlag.get()) {
            return;
        }

        URI uri;
        try {
            if (url == null) {
                throw new IllegalArgumentException("URL is null");
            }
            uri = new URI(url);
        } catch (Exception e) {
            complete(job, fail(job, null, "policy", "Invalid URL: " + e.getMessage()), url);
            return;
        }

        String syntax = UrlPolicy.checkSyntax(uri, allowPrivateAddresses);
        if (syntax != null) {
            complete(job, fail(job, null, "policy", syntax), uri.toString());
            return;
        }

        String literal = literalPolicy(uri);
        if (literal != null) {
            complete(job, fail(job, null, "policy", literal), uri.toString());
            return;
        }

        submit(job, uri, null, false, timeoutSeconds);
    }

    void download(String id, String url, String path, double timeoutSeconds) {
        Job job = new Job(id);
        if (shutdownFlag.get()) {
            return;
        }

        URI uri;
        try {
            if (url == null) {
                throw new IllegalArgumentException("URL is null");
            }
            uri = new URI(url);
        } catch (Exception e) {
            complete(job, fail(job, null, "policy", "Invalid URL: " + e.getMessage()), url);
            return;
        }

        String syntax = UrlPolicy.checkSyntax(uri, allowPrivateAddresses);
        if (syntax != null) {
            complete(job, fail(job, null, "policy", syntax), uri.toString());
            return;
        }

        String literal = literalPolicy(uri);
        if (literal != null) {
            complete(job, fail(job, null, "policy", literal), uri.toString());
            return;
        }

        Path target;
        try {
            target = resolveTarget(path);
        } catch (Exception e) {
            complete(job, fail(job, null, "policy", "Invalid path: " + e.getMessage()), uri.toString());
            return;
        }

        submit(job, uri, target, true, timeoutSeconds);
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

        for (Path part : inProgressParts) {
            try {
                Files.deleteIfExists(part);
            } catch (IOException e) {
                logger.log(Level.FINE, "Could not delete part file " + part, e);
            }
        }
        inProgressParts.clear();

        logger.log(Level.INFO, "HTTP shutdown: cancelled {0} in-flight request(s)", cancelled);
    }

    private void submit(Job job, URI uri, Path target, boolean download, double timeoutSeconds) {
        if (!permits.tryAcquire()) {
            complete(job, fail(job, null, "busy", "Too many concurrent requests"), uri.toString());
            return;
        }

        if (shutdownFlag.get()) {
            permits.release();
            return;
        }

        try {
            executor.submit(() -> {
                try {
                    execute(job, uri, target, download, timeoutSeconds);
                } catch (Throwable t) {
                    complete(job, fail(job, null, "io", t.toString()), uri.toString());
                } finally {
                    permits.release();
                }
            });
        } catch (RejectedExecutionException e) {
            permits.release();
            if (!shutdownFlag.get()) {
                complete(job, fail(job, null, "io", "Executor rejected request: " + e.getMessage()), uri.toString());
            }
        }
    }

    private void execute(Job job, URI initial, Path target, boolean download, double timeoutSeconds) {
        URI current = initial;
        int hops = 0;

        try {
            while (true) {
                String syntax = UrlPolicy.checkSyntax(current, allowPrivateAddresses);
                if (syntax != null) {
                    complete(job, fail(job, null, "policy", syntax), current.toString());
                    return;
                }

                Outcome addressOutcome = checkAddresses(current);
                if (addressOutcome != null) {
                    complete(job, fail(job, null, addressOutcome.kind, addressOutcome.detail), current.toString());
                    return;
                }

                HttpRequest request;
                try {
                    request = HttpRequest.newBuilder(current)
                            .timeout(timeoutDuration(timeoutSeconds))
                            .GET()
                            .build();
                } catch (Exception e) {
                    complete(job, fail(job, null, "policy", "Invalid request: " + e.getMessage()), current.toString());
                    return;
                }

                HttpResponse<InputStream> response;
                try {
                    response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
                } catch (HttpConnectTimeoutException e) {
                    complete(job, fail(job, null, "timeout", e.toString()), current.toString());
                    return;
                } catch (HttpTimeoutException e) {
                    complete(job, fail(job, null, "timeout", e.toString()), current.toString());
                    return;
                } catch (IOException e) {
                    complete(job, fail(job, null, "network", e.toString()), current.toString());
                    return;
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    complete(job, fail(job, null, "io", "Interrupted"), current.toString());
                    return;
                } catch (Throwable t) {
                    complete(job, fail(job, null, "io", t.toString()), current.toString());
                    return;
                }

                int status = response.statusCode();

                if (isRedirect(status)) {
                    Optional<String> location = response.headers().firstValue("Location");
                    if (location.isPresent()) {
                        if (hops >= 3) {
                            closeQuietly(response.body());
                            complete(job, fail(job, null, "network", "Too many redirects"), current.toString());
                            return;
                        }

                        URI next;
                        try {
                            next = current.resolve(location.get());
                        } catch (Exception e) {
                            closeQuietly(response.body());
                            complete(job, fail(job, null, "network", "Invalid redirect location: " + e.getMessage()), current.toString());
                            return;
                        }

                        closeQuietly(response.body());
                        current = next;
                        hops++;
                        continue;
                    }
                }

                Result result = download
                        ? handleDownload(job, response, target)
                        : handleFetch(job, response);
                complete(job, result, current.toString());
                return;
            }
        } catch (Throwable t) {
            complete(job, fail(job, null, "io", t.toString()), current.toString());
        }
    }

    private Outcome checkAddresses(URI uri) {
        String host = uri.getHost();
        if (host == null) {
            return new Outcome("policy", "Missing host");
        }
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }

        InetAddress literal = null;
        try {
            literal = UrlPolicy.parseLiteralIp(host);
        } catch (Exception ignored) {
        }

        InetAddress[] addresses;
        if (literal != null) {
            addresses = new InetAddress[]{literal};
        } else {
            try {
                addresses = InetAddress.getAllByName(host);
            } catch (IOException e) {
                return new Outcome("network", "DNS lookup failed: " + e.getMessage());
            }
        }

        if (!allowPrivateAddresses) {
            for (InetAddress address : addresses) {
                if (UrlPolicy.isRefusedAddress(address)) {
                    return new Outcome("policy", "Refused address: " + address.getHostAddress());
                }
            }
        }

        return null;
    }

    private String literalPolicy(URI uri) {
        if (allowPrivateAddresses) {
            return null;
        }

        String host = uri.getHost();
        if (host == null) {
            return null;
        }
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }

        try {
            InetAddress address = UrlPolicy.parseLiteralIp(host);
            if (address != null && UrlPolicy.isRefusedAddress(address)) {
                return "Refused address: " + address.getHostAddress();
            }
        } catch (Exception ignored) {
        }

        return null;
    }

    private Result handleFetch(Job job, HttpResponse<InputStream> response) {
        int status = response.statusCode();
        Charset charset = charsetFrom(response.headers().firstValue("Content-Type").orElse(null));

        try (InputStream in = response.body()) {
            byte[] bytes = readLimited(in);
            return ok(job, (double) status, new String(bytes, charset), null);
        } catch (BodyTooLargeException e) {
            return fail(job, (double) status, "size", "Response body exceeds 8 MiB");
        } catch (IOException e) {
            return fail(job, (double) status, "io", "Body read failed: " + e.getMessage());
        }
    }

    private Result handleDownload(Job job, HttpResponse<InputStream> response, Path target) {
        int status = response.statusCode();

        Path parent = target.getParent();
        if (parent == null) {
            parent = filesRoot;
        }

        try {
            Files.createDirectories(parent);
        } catch (IOException e) {
            closeQuietly(response.body());
            return fail(job, (double) status, "io", "Cannot create directories: " + e.getMessage());
        }

        String name = target.getFileName() != null ? target.getFileName().toString() : "download";
        Path part = parent.resolve(name + ".part-" + sequence.incrementAndGet());
        inProgressParts.add(part);

        try {
            try (InputStream in = response.body();
                 OutputStream out = Files.newOutputStream(
                         part,
                         StandardOpenOption.CREATE,
                         StandardOpenOption.TRUNCATE_EXISTING,
                         StandardOpenOption.WRITE)) {
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
            }

            try {
                try {
                    Files.move(part, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(part, target, StandardCopyOption.REPLACE_EXISTING);
                }
            } catch (IOException e) {
                deletePart(part);
                return fail(job, (double) status, "io", "Move failed: " + e.getMessage());
            }

            // Scripts see the path they asked for: relative to the files
            // root, '/'-separated (e.g. "dl/hello.txt"), never the
            // server's absolute filesystem layout.
            String savedPath = filesRoot.relativize(target).toString().replace('\\', '/');
            return ok(job, (double) status, null, savedPath);
        } catch (BodyTooLargeException e) {
            deletePart(part);
            return fail(job, (double) status, "size", "Response body exceeds 8 MiB");
        } catch (IOException e) {
            deletePart(part);
            return fail(job, (double) status, "io", "Download failed: " + e.getMessage());
        } finally {
            inProgressParts.remove(part);
        }
    }

    private Path resolveTarget(String path) {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("Path is blank");
        }

        String converted = path.replace('\\', '/');

        if (converted.startsWith("/")) {
            throw new IllegalArgumentException("Absolute paths are not allowed");
        }

        if (converted.length() >= 3
                && Character.isLetter(converted.charAt(0))
                && converted.charAt(1) == ':'
                && converted.charAt(2) == '/') {
            throw new IllegalArgumentException("Windows drive paths are not allowed");
        }

        Path result = filesRoot.resolve(converted).normalize();
        if (!result.startsWith(filesRoot)) {
            throw new IllegalArgumentException("Path escapes files root");
        }

        return result;
    }

    private void complete(Job job, Result result, String urlForLog) {
        synchronized (shutdownLock) {
            if (shutdownFlag.get()) {
                return;
            }
            if (!job.done.compareAndSet(false, true)) {
                return;
            }

            if (!result.ok()) {
                logFailure(job.id, result.errorKind(), result.detail(), urlForLog);
            }

            try {
                completion.onComplete(result);
            } catch (Throwable t) {
                logger.log(Level.WARNING, "Completion callback failed for " + job.id, t);
            }
        }
    }

    private void logFailure(String id, String kind, String detail, String url) {
        String safeUrl = sanitizeUrl(url);
        logger.log(Level.WARNING,
                "HTTP request {0} failed ({1}): {2} [{3}]",
                new Object[]{id, kind, detail, safeUrl});
    }

    private void deletePart(Path part) {
        try {
            Files.deleteIfExists(part);
        } catch (IOException e) {
            logger.log(Level.FINE, "Could not delete part file " + part, e);
        }
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

    private static Charset charsetFrom(String contentType) {
        if (contentType != null) {
            String[] parts = contentType.split(";");
            for (String part : parts) {
                String value = part.trim();
                int eq = value.indexOf('=');
                if (eq > 0 && value.substring(0, eq).trim().equalsIgnoreCase("charset")) {
                    String charsetName = value.substring(eq + 1).trim();
                    if (charsetName.length() >= 2
                            && charsetName.startsWith("\"")
                            && charsetName.endsWith("\"")) {
                        charsetName = charsetName.substring(1, charsetName.length() - 1);
                    }
                    try {
                        return Charset.forName(charsetName);
                    } catch (Exception e) {
                        return StandardCharsets.UTF_8;
                    }
                }
            }
        }
        return StandardCharsets.UTF_8;
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

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    private static void closeQuietly(InputStream in) {
        if (in != null) {
            try {
                in.close();
            } catch (IOException ignored) {
            }
        }
    }

    private static Result fail(Job job, Double status, String kind, String detail) {
        return new Result(job.id, false, status, null, kind, detail, null);
    }

    private static Result ok(Job job, Double status, String body, String savedPath) {
        return new Result(job.id, true, status, body, null, null, savedPath);
    }

    private static String sanitizeUrl(String raw) {
        if (raw == null) {
            return "";
        }
        try {
            return sanitizeUri(new URI(raw));
        } catch (Exception e) {
            return "<invalid-url>";
        }
    }

    private static String sanitizeUri(URI uri) {
        if (uri == null) {
            return "";
        }

        String scheme = uri.getScheme();
        String host = uri.getHost();
        String path = uri.getPath();

        if (scheme != null) {
            if (host != null) {
                return scheme + "://" + host + (path == null ? "" : path);
            }
            return scheme + "://<invalid>" + (path == null ? "" : path);
        }

        return path == null ? "" : path;
    }

    private static final class Job {
        final String id;
        final AtomicBoolean done = new AtomicBoolean(false);

        Job(String id) {
            this.id = id;
        }
    }

    private static final class Outcome {
        final String kind;
        final String detail;

        Outcome(String kind, String detail) {
            this.kind = kind;
            this.detail = detail;
        }
    }

    private static final class BodyTooLargeException extends IOException {
        BodyTooLargeException() {
            super("body exceeds limit");
        }
    }
}