package net.krz.skriptts;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.logging.Logger;

/**
 * Clean-room reimplementation of the documented file core of the
 * skUtilities addon (create / delete / write / append / read text
 * files, line access, existence checks). Written from the addon's
 * documented behavior only; no addon code is used — the addon is
 * GPL-3.0, and the engine's clean-room rule for GPL addons is
 * documented-behavior reimplementation (see docs/addon-inventory.md).
 *
 * <p>All requested paths are confined under a single root directory
 * (the plugin passes {@code plugins/skript-ts/files/}); absolute
 * paths and escapes such as ".." are refused rather than clamped.
 * The original addon is deliberately non-restrictive about paths —
 * its README warns it can damage a server — so the confinement is
 * an intentional engine safety rule, not a documented behavior.</p>
 *
 * <p>Operations never throw: refused paths and I/O failures are
 * logged as warnings and surface as no-ops or {@code null} results,
 * matching the engine's failure philosophy.</p>
 */
final class Files {

    private final Path root;
    private final Logger logger;

    Files(Path root, Logger logger) {
        this.root = root;
        this.logger = logger;
    }

    /**
     * Resolves a raw path under the root, or returns null when refused.
     */
    private Path resolve(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            return null;
        }
        try {
            String converted = rawPath.replace('\\', '/');
            if (converted.startsWith("/")
                    || (converted.length() >= 3
                            && Character.isLetter(converted.charAt(0))
                            && converted.charAt(1) == ':'
                            && converted.charAt(2) == '/')) {
                return null;
            }
            Path result = root.resolve(converted).normalize();
            if (!result.startsWith(root)) {
                return null;
            }
            return result;
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Reports whether the resolved path exists.
     */
    boolean exists(String rawPath) {
        Path path = resolve(rawPath);
        if (path == null) {
            return false;
        }
        try {
            return java.nio.file.Files.exists(path);
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Logs that a raw path was refused.
     */
    private void warnRefused(String rawPath) {
        logger.warning("skript-ts: refused file path '" + rawPath + "'");
    }

    /**
     * Creates an empty file, including parent directories, if it is missing.
     */
    void createFile(String rawPath) {
        Path path = resolve(rawPath);
        if (path == null) {
            warnRefused(rawPath);
            return;
        }
        try {
            if (java.nio.file.Files.isDirectory(path)) {
                return;
            }
            Path parent = path.getParent();
            if (parent != null) {
                java.nio.file.Files.createDirectories(parent);
            }
            if (!java.nio.file.Files.exists(path)) {
                java.nio.file.Files.createFile(path);
            }
        } catch (java.io.IOException e) {
            logger.warning(e.toString());
        }
    }

    /**
     * Creates a directory, including parent directories, if it is missing.
     */
    void createDirectory(String rawPath) {
        Path path = resolve(rawPath);
        if (path == null) {
            warnRefused(rawPath);
            return;
        }
        try {
            java.nio.file.Files.createDirectories(path);
        } catch (java.io.IOException e) {
            logger.warning(e.toString());
        }
    }

    /**
     * Deletes a file, or an empty directory.
     */
    void delete(String rawPath) {
        Path path = resolve(rawPath);
        if (path == null) {
            warnRefused(rawPath);
            return;
        }
        try {
            if (!java.nio.file.Files.exists(path)) {
                return;
            }
            java.nio.file.Files.delete(path);
        } catch (java.io.IOException e) {
            logger.warning(e.toString());
        }
    }

    /**
     * Replaces the whole file with the given text.
     */
    void write(String rawPath, String text) {
        Path path = resolve(rawPath);
        if (path == null) {
            warnRefused(rawPath);
            return;
        }
        try {
            Path parent = path.getParent();
            if (parent != null) {
                java.nio.file.Files.createDirectories(parent);
            }
            String body = text == null ? "" : text;
            java.nio.file.Files.writeString(path, body, StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE,
                    java.nio.file.StandardOpenOption.TRUNCATE_EXISTING,
                    java.nio.file.StandardOpenOption.WRITE);
        } catch (java.io.IOException e) {
            logger.warning(e.toString());
        }
    }

    /**
     * Appends text followed by a newline.
     */
    void appendLine(String rawPath, String text) {
        Path path = resolve(rawPath);
        if (path == null) {
            warnRefused(rawPath);
            return;
        }
        try {
            Path parent = path.getParent();
            if (parent != null) {
                java.nio.file.Files.createDirectories(parent);
            }
            String body = (text == null ? "" : text) + "\n";
            java.nio.file.Files.writeString(path, body, StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE,
                    java.nio.file.StandardOpenOption.APPEND);
        } catch (java.io.IOException e) {
            logger.warning(e.toString());
        }
    }

    /**
     * Returns the full file contents, or null when unavailable.
     */
    String contents(String rawPath) {
        Path path = resolve(rawPath);
        if (path == null || !java.nio.file.Files.isRegularFile(path)) {
            return null;
        }
        try {
            return java.nio.file.Files.readString(path, StandardCharsets.UTF_8);
        } catch (java.io.IOException e) {
            logger.warning(e.toString());
            return null;
        }
    }

    /**
     * Returns one 1-based line, or null when unavailable.
     */
    String line(String rawPath, double lineNumber) {
        Path path = resolve(rawPath);
        if (path == null || !java.nio.file.Files.isRegularFile(path)) {
            return null;
        }
        if (!Double.isFinite(lineNumber) || lineNumber <= 0.0 || lineNumber != Math.floor(lineNumber)) {
            return null;
        }
        try {
            List<String> lines = java.nio.file.Files.readAllLines(path, StandardCharsets.UTF_8);
            if (lineNumber > lines.size()) {
                return null;
            }
            return lines.get((int) lineNumber - 1);
        } catch (java.io.IOException e) {
            logger.warning(e.toString());
            return null;
        }
    }

    /**
     * Returns the number of lines as a double, or null when unavailable.
     */
    Double lineCount(String rawPath) {
        Path path = resolve(rawPath);
        if (path == null || !java.nio.file.Files.isRegularFile(path)) {
            return null;
        }
        try {
            List<String> lines = java.nio.file.Files.readAllLines(path, StandardCharsets.UTF_8);
            return (double) lines.size();
        } catch (java.io.IOException e) {
            logger.warning(e.toString());
            return null;
        }
    }
}