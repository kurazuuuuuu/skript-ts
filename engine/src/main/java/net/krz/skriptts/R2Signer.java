package net.krz.skriptts;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * AWS Signature V4 signer for the S3-compatible R2 API (CF-3),
 * JDK-only: HMAC/SHA-256 from javax.crypto, digests from
 * java.security. Used both for header-signed operations and for
 * presigned GET URLs (query signing, UNSIGNED-PAYLOAD). Drafted
 * with the Ollama drafting lane and reviewed/adapted by the
 * implementation lane; the canonical-request construction follows
 * the SigV4 specification (per-segment URI encoding, sorted
 * canonical query, trimmed header values).
 */
final class R2Signer {
    private static final DateTimeFormatter AMZ_DATE =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter DATE_STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC);
    private static final char[] HEX = "0123456789abcdef".toCharArray();
    private static final char[] HEX_UPPER = "0123456789ABCDEF".toCharArray();
    private static final String ALGORITHM = "AWS4-HMAC-SHA256";
    private static final String UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

    private R2Signer() {
    }

    static byte[] hmacSha256(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 failed", e);
        }
    }

    static String sha256Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return hex(md.digest(data));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 failed", e);
        }
    }

    static String deriveSigningKey(String secret, String dateStamp, String region, String service) {
        return hex(deriveSigningKeyBytes(secret, dateStamp, region, service));
    }

    private static byte[] deriveSigningKeyBytes(String secret, String dateStamp, String region, String service) {
        byte[] kDate = hmacSha256(("AWS4" + secret).getBytes(StandardCharsets.UTF_8), dateStamp);
        byte[] kRegion = hmacSha256(kDate, region);
        byte[] kService = hmacSha256(kRegion, service);
        return hmacSha256(kService, "aws4_request");
    }

    static Map<String, String> signHeaders(
            String method,
            URI uri,
            Map<String, String> extraHeaders,
            String payloadHashHexIn,
            String accessKey,
            String secretKey,
            String region,
            String service,
            Instant now) {

        if (now == null) now = Instant.now();
        String amzDate = AMZ_DATE.format(now);
        String dateStamp = DATE_STAMP.format(now);
        String host = hostValue(uri);
        String payloadHashHex = payloadHashHexIn == null ? UNSIGNED_PAYLOAD : payloadHashHexIn;

        Map<String, String> headers = new TreeMap<>();
        if (extraHeaders != null) {
            for (Map.Entry<String, String> e : extraHeaders.entrySet()) {
                headers.put(e.getKey().toLowerCase(Locale.ROOT), normalizeHeaderValue(e.getValue()));
            }
        }
        headers.put("host", host);
        headers.put("x-amz-date", amzDate);
        headers.put("x-amz-content-sha256", payloadHashHex);

        String canonicalUri = canonicalUri(uri);
        String canonicalQuery = canonicalQuery(uri.getRawQuery(), null, null);
        String canonicalHeaders = canonicalHeaders(headers);
        String signedHeaders = String.join(";", headers.keySet());

        String canonicalRequest = method.toUpperCase(Locale.ROOT) + "\n"
                + canonicalUri + "\n"
                + canonicalQuery + "\n"
                + canonicalHeaders + "\n"
                + signedHeaders + "\n"
                + payloadHashHex;

        String credentialScope = dateStamp + "/" + region + "/" + service + "/aws4_request";
        String stringToSign = ALGORITHM + "\n"
                + amzDate + "\n"
                + credentialScope + "\n"
                + sha256Hex(canonicalRequest.getBytes(StandardCharsets.UTF_8));

        byte[] signingKey = deriveSigningKeyBytes(secretKey, dateStamp, region, service);
        String signature = hex(hmacSha256(signingKey, stringToSign));

        String authorization = ALGORITHM + " Credential=" + accessKey + "/" + credentialScope
                + ", SignedHeaders=" + signedHeaders
                + ", Signature=" + signature;

        Map<String, String> result = new LinkedHashMap<>(headers);
        result.put("authorization", authorization);
        return result;
    }

    static Map<String, String> signHeaders(
            String method,
            URI uri,
            Map<String, String> extraHeaders,
            String accessKey,
            String secretKey,
            String region,
            String service,
            Instant now) {
        return signHeaders(method, uri, extraHeaders, null, accessKey, secretKey, region, service, now);
    }

    static String presignGetUrl(
            URI baseObjectUri,
            String accessKey,
            String secretKey,
            String region,
            String service,
            int ttlSeconds,
            Instant now) {

        if (now == null) now = Instant.now();
        String amzDate = AMZ_DATE.format(now);
        String dateStamp = DATE_STAMP.format(now);
        String host = hostValue(baseObjectUri);
        String canonicalUri = canonicalUri(baseObjectUri);

        String credential = accessKey + "/" + dateStamp + "/" + region + "/" + service + "/aws4_request";

        LinkedHashMap<String, String> addParams = new LinkedHashMap<>();
        addParams.put("X-Amz-Algorithm", ALGORITHM);
        addParams.put("X-Amz-Credential", credential);
        addParams.put("X-Amz-Date", amzDate);
        addParams.put("X-Amz-Expires", Integer.toString(ttlSeconds));
        addParams.put("X-Amz-SignedHeaders", "host");

        Set<String> exclude = new HashSet<>(Arrays.asList(
                "X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Expires",
                "X-Amz-SignedHeaders", "X-Amz-Signature"
        ));

        String canonicalQuery = canonicalQuery(baseObjectUri.getRawQuery(), addParams, exclude);
        String canonicalHeaders = "host:" + host + "\n";
        String signedHeaders = "host";

        String canonicalRequest = "GET\n"
                + canonicalUri + "\n"
                + canonicalQuery + "\n"
                + canonicalHeaders + "\n"
                + signedHeaders + "\n"
                + UNSIGNED_PAYLOAD;

        String credentialScope = dateStamp + "/" + region + "/" + service + "/aws4_request";
        String stringToSign = ALGORITHM + "\n"
                + amzDate + "\n"
                + credentialScope + "\n"
                + sha256Hex(canonicalRequest.getBytes(StandardCharsets.UTF_8));

        byte[] signingKey = deriveSigningKeyBytes(secretKey, dateStamp, region, service);
        String signature = hex(hmacSha256(signingKey, stringToSign));

        String scheme = baseObjectUri.getScheme();
        if (scheme == null) scheme = "https";
        return scheme + "://" + host + canonicalUri + "?" + canonicalQuery
                + "&X-Amz-Signature=" + signature;
    }

    /** Percent-encode a decoded URI path: unreserved characters and '/' pass through, everything else becomes UTF-8 %XX. */
    static String encodeUriPath(String decoded) {
        StringBuilder sb = new StringBuilder(decoded.length());
        for (int i = 0; i < decoded.length();) {
            int cp = decoded.codePointAt(i);
            if (cp == '/' || isUnreserved(cp)) {
                sb.appendCodePoint(cp);
            } else {
                for (byte b : new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8)) {
                    sb.append('%').append(HEX_UPPER[(b >> 4) & 0xF]).append(HEX_UPPER[b & 0xF]);
                }
            }
            i += Character.charCount(cp);
        }
        return sb.toString();
    }

    private static String canonicalHeaders(Map<String, String> headers) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : headers.entrySet()) {
            sb.append(e.getKey()).append(':').append(e.getValue()).append('\n');
        }
        return sb.toString();
    }

    private static String normalizeHeaderValue(String value) {
        if (value == null) return "";
        return value.trim().replaceAll("\\s+", " ");
    }

    private static String canonicalUri(URI uri) {
        String raw = uri.getRawPath();
        if (raw == null || raw.isEmpty()) return "/";
        return canonicalEncode(raw, true);
    }

    private static String canonicalQuery(String rawQuery, Map<String, String> add, Set<String> exclude) {
        List<String[]> params = new ArrayList<>();
        if (rawQuery != null && !rawQuery.isEmpty()) {
            for (String pair : rawQuery.split("&", -1)) {
                if (pair.isEmpty()) continue;
                int eq = pair.indexOf('=');
                String name = eq >= 0 ? pair.substring(0, eq) : pair;
                String value = eq >= 0 ? pair.substring(eq + 1) : "";
                if (exclude != null && exclude.contains(name)) continue;
                params.add(new String[]{canonicalEncode(name, false), canonicalEncode(value, false)});
            }
        }
        if (add != null) {
            for (Map.Entry<String, String> e : add.entrySet()) {
                params.add(new String[]{canonicalEncode(e.getKey(), false), canonicalEncode(e.getValue(), false)});
            }
        }
        params.sort((a, b) -> {
            int c = a[0].compareTo(b[0]);
            if (c != 0) return c;
            return a[1].compareTo(b[1]);
        });
        StringBuilder sb = new StringBuilder();
        for (String[] p : params) {
            if (sb.length() > 0) sb.append('&');
            sb.append(p[0]).append('=').append(p[1]);
        }
        return sb.toString();
    }

    private static String canonicalEncode(String raw, boolean keepSlash) {
        if (raw == null) return "";
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); ) {
            int cp = raw.codePointAt(i);
            if (cp == '%' && i + 2 < raw.length()
                    && isHex(raw.charAt(i + 1)) && isHex(raw.charAt(i + 2))) {
                sb.append('%');
                sb.append(Character.toUpperCase(raw.charAt(i + 1)));
                sb.append(Character.toUpperCase(raw.charAt(i + 2)));
                i += 3;
            } else if (cp == '/' && keepSlash) {
                sb.append('/');
                i++;
            } else if (isUnreserved(cp)) {
                sb.appendCodePoint(cp);
                i += Character.charCount(cp);
            } else {
                byte[] bytes = new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8);
                for (byte b : bytes) {
                    sb.append('%');
                    sb.append(HEX_UPPER[(b >> 4) & 0xF]);
                    sb.append(HEX_UPPER[b & 0xF]);
                }
                i += Character.charCount(cp);
            }
        }
        return sb.toString();
    }

    private static boolean isUnreserved(int cp) {
        return (cp >= 'A' && cp <= 'Z') || (cp >= 'a' && cp <= 'z')
                || (cp >= '0' && cp <= '9') || cp == '-' || cp == '.' || cp == '_' || cp == '~';
    }

    private static boolean isHex(char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    }

    private static String hostValue(URI uri) {
        String host = uri.getHost();
        if (host == null) {
            String auth = uri.getRawAuthority();
            if (auth == null) return "";
            int at = auth.lastIndexOf('@');
            if (at >= 0) auth = auth.substring(at + 1);
            return auth;
        }
        int port = uri.getPort();
        if (port != -1 && !isDefaultPort(uri.getScheme(), port)) {
            return host + ":" + port;
        }
        return host;
    }

    private static boolean isDefaultPort(String scheme, int port) {
        if (scheme == null) return false;
        if (scheme.equalsIgnoreCase("https")) return port == 443;
        if (scheme.equalsIgnoreCase("http")) return port == 80;
        return false;
    }

    private static String hex(byte[] bytes) {
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xFF;
            out[i * 2] = HEX[v >>> 4];
            out[i * 2 + 1] = HEX[v & 0x0F];
        }
        return new String(out);
    }
}

