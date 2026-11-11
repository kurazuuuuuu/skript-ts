package net.krz.skriptts;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

/**
 * URL syntax and address policy helpers.
 */
final class UrlPolicy {

    /** Prevents instantiation. */
    private UrlPolicy() {
    }

    /**
     * Checks whether a URI is syntactically acceptable for the policy.
     *
     * @param uri the URI to check
     * @param allowPrivateAddresses whether non-default ports are allowed
     * @return a refusal reason, or {@code null} if allowed
     */
    static String checkSyntax(URI uri, boolean allowPrivateAddresses) {
        if (uri == null) {
            return "URI is null";
        }

        String scheme = uri.getScheme();
        if (scheme == null) {
            return "URI scheme is missing";
        }
        if (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https")) {
            return "Unsupported URI scheme: " + scheme;
        }

        if (uri.getUserInfo() != null) {
            return "URI must not contain user information";
        }

        String host = uri.getHost();
        if (host == null || host.trim().isEmpty()) {
            return "URI host is missing or blank";
        }

        int port = uri.getPort();
        if (port != -1) {
            if (port <= 0 || port > 65535) {
                return "URI port is out of range: " + port;
            }
            if (!allowPrivateAddresses && port != 80 && port != 443) {
                return "URI port is not allowed when private addresses are disabled: " + port;
            }
        }

        return null;
    }

    /**
     * Checks whether an address is in a refused range.
     *
     * @param addr the address to check
     * @return {@code true} if the address is refused
     */
    static boolean isRefusedAddress(InetAddress addr) {
        if (addr == null) {
            return true;
        }

        if (addr.isLoopbackAddress()
                || addr.isLinkLocalAddress()
                || addr.isSiteLocalAddress()
                || addr.isAnyLocalAddress()
                || addr.isMulticastAddress()) {
            return true;
        }

        byte[] bytes = addr.getAddress();
        if (bytes.length == 4) {
            int first = bytes[0] & 0xff;
            int second = bytes[1] & 0xff;
            if (first == 100 && second >= 64 && second <= 127) {
                return true;
            }
        } else if (bytes.length == 16) {
            int first = bytes[0] & 0xff;
            if ((first & 0xfe) == 0xfc) {
                return true;
            }
        }

        return false;
    }

    /**
     * Parses a literal IPv4 or IPv6 address without resolving host names.
     *
     * @param host the candidate host string
     * @return the parsed address, or {@code null} if it is not a literal IP address
     */
    static InetAddress parseLiteralIp(String host) {
        if (host == null || host.isEmpty()) {
            return null;
        }

        if (host.indexOf(':') >= 0) {
            String candidate = host;
            int percent = candidate.indexOf('%');
            if (percent >= 0) {
                candidate = candidate.substring(0, percent);
            }
            if (candidate.indexOf(':') < 0) {
                return null;
            }

            for (int i = 0; i < candidate.length(); i++) {
                char c = candidate.charAt(i);
                boolean allowed = (c >= '0' && c <= '9')
                        || (c >= 'a' && c <= 'f')
                        || (c >= 'A' && c <= 'F')
                        || c == ':'
                        || c == '.';
                if (!allowed) {
                    return null;
                }
            }

            try {
                return InetAddress.getByName(candidate);
            } catch (UnknownHostException e) {
                return null;
            }
        }

        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) {
            return null;
        }

        byte[] bytes = new byte[4];
        for (int i = 0; i < 4; i++) {
            String part = parts[i];
            if (part.isEmpty()) {
                return null;
            }

            for (int j = 0; j < part.length(); j++) {
                char c = part.charAt(j);
                if (c < '0' || c > '9') {
                    return null;
                }
            }

            try {
                int value = Integer.parseInt(part);
                if (value < 0 || value > 255) {
                    return null;
                }
                bytes[i] = (byte) value;
            } catch (NumberFormatException e) {
                return null;
            }
        }

        try {
            return InetAddress.getByAddress(bytes);
        } catch (UnknownHostException e) {
            return null;
        }
    }
}