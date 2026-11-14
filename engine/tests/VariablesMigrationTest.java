package net.krz.skriptts;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.logging.Handler;
import java.util.logging.Level;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

/**
 * Unit checks for the player-name -> UUID variable key migration
 * (feedback B6 / B6-2), run by engine/test.sh. Plain main-based
 * assertions: the engine has no test framework, and the migration
 * is the one piece of store logic whose failure mode is silent
 * data loss, so it gets a direct check.
 *
 * The cases pin the B6-2 safeguard contract:
 *  - a candidate whose segment merely spells a player name (a
 *    plain string key) migrates together with a player-derived
 *    key — the store format cannot tell them apart — and the
 *    pre-migration warning names it;
 *  - the warning is logged before anything moves, at WARNING
 *    level, and explains the string-key consequence;
 *  - a conflict (the UUID key already exists) keeps the name
 *    key and its value;
 *  - unmatched segments and a variable NAME equal to a player
 *    name (players only ever appear as indices) stay untouched;
 *  - the returned counts are {moved, conflicts, candidates}.
 */
public final class VariablesMigrationTest {
    private static int failures = 0;

    private static void check(boolean condition, String label) {
        if (condition) {
            System.out.println("ok - " + label);
        } else {
            failures++;
            System.out.println("FAIL - " + label);
        }
    }

    /** A logger that records everything handed to it, in order. */
    private static final class Capturing extends Handler {
        final List<LogRecord> records = new ArrayList<>();

        @Override
        public void publish(LogRecord record) {
            records.add(record);
        }

        @Override
        public void flush() {}

        @Override
        public void close() {}
    }

    public static void main(String[] args) throws Exception {
        Path dir = Files.createTempDirectory("skript-ts-migration-test");
        Path file = dir.resolve("variables.json");
        Files.writeString(
                file,
                "{"
                        // Player-derived style entry (an economy
                        // balance stored under a player index).
                        + "\"uvgrowth::steve\": 4242,"
                        // A plain string key that merely spells the
                        // same player name (feedback B6-2's accident:
                        // data written through a name string).
                        + "\"eco.balance::steve\": 100,"
                        // A conflict pair: both the name key and the
                        // UUID key already exist.
                        + "\"duel::steve\": 1,"
                        + "\"duel::11111111-2222-3333-4444-555555555555\": 2,"
                        // An unmatched name segment: no known player.
                        + "\"misc::alex\": 7,"
                        // A multi-segment key with the name in the middle.
                        + "\"shop::steve::daily\": 3,"
                        // The variable NAME itself equals a player
                        // name: never an index, never migrated.
                        + "\"steve\": 9"
                        + "}\n");

        Logger logger = Logger.getLogger("skript-ts-migration-test");
        logger.setUseParentHandlers(false);
        Capturing capture = new Capturing();
        capture.setLevel(Level.ALL);
        logger.addHandler(capture);
        logger.setLevel(Level.ALL);

        Variables variables = new Variables(file, logger);
        variables.load();
        String uuid = "11111111-2222-3333-4444-555555555555";
        int[] result = variables.migratePlayerNameKeys(Map.of("steve", uuid));

        check(result[2] == 4, "candidates counts every name-matched entry (got " + result[2] + ")");
        check(result[0] == 3, "moved counts the non-conflicting candidates (got " + result[0] + ")");
        check(result[1] == 1, "conflicts counts the existing-UUID pair (got " + result[1] + ")");

        check(uuid.equals(segmentOf(variables, "uvgrowth")), "player-derived key moved to the UUID segment");
        check(
                uuid.equals(segmentOf(variables, "eco.balance")),
                "plain string key spelling the player name migrated with it (indistinguishable)");
        check("steve".equals(segmentOf(variables, "duel")), "conflicting entry stays name-keyed");
        check(
                Double.valueOf(1).equals(variables.get("duel::steve")),
                "conflicting entry keeps its own value");
        check(
                Double.valueOf(2).equals(variables.get("duel::" + uuid)),
                "existing UUID entry keeps its own value");
        check("alex".equals(segmentOf(variables, "misc")), "unmatched segment stays as it is");
        check(
                uuid.equals(middleSegmentOf(variables, "shop")),
                "a name segment in the middle of a key migrates");
        check(Double.valueOf(9).equals(variables.get("steve")), "variable name itself is never migrated");

        // The persisted file reflects the migration (a restart
        // must not resurrect the name keys).
        String saved = Files.readString(file);
        check(saved.contains("\"uvgrowth::" + uuid + "\""), "saved store carries the UUID key");
        check(!saved.contains("\"uvgrowth::steve\""), "saved store no longer carries the moved name key");
        check(saved.contains("\"duel::steve\""), "saved store keeps the conflicting name key");

        // The B6-2 warning: exactly one WARNING, logged by the
        // migration, naming the string-key example and the
        // consequence, and mentioning the opt-out.
        List<LogRecord> warnings = new ArrayList<>();
        for (LogRecord record : capture.records) {
            if (record.getLevel() == Level.WARNING) warnings.add(record);
        }
        check(warnings.size() == 1, "exactly one warning is logged (got " + warnings.size() + ")");
        if (!warnings.isEmpty()) {
            String message = warnings.get(0).getMessage();
            check(message.contains("eco.balance::steve"), "warning names an affected string key as an example");
            check(
                    message.contains("no longer be reachable by that name string"),
                    "warning states the string-key consequence");
            check(message.contains("playerKeysUseUuid=false"), "warning names the legacy opt-out");
            check(message.contains("4 stored entries"), "warning counts the candidate entries");
        }

        // A store with no candidates migrates nothing and warns
        // about nothing.
        Path quietFile = dir.resolve("quiet.json");
        Files.writeString(quietFile, "{\"misc::alex\": 7}\n");
        Capturing quietCapture = new Capturing();
        Logger quietLogger = Logger.getLogger("skript-ts-migration-test-quiet");
        quietLogger.setUseParentHandlers(false);
        quietLogger.addHandler(quietCapture);
        quietLogger.setLevel(Level.ALL);
        Variables quiet = new Variables(quietFile, quietLogger);
        quiet.load();
        int[] quietResult = quiet.migratePlayerNameKeys(Map.of("steve", uuid));
        check(
                quietResult[0] == 0 && quietResult[1] == 0 && quietResult[2] == 0,
                "no candidates means no moves, conflicts or candidates");
        check(quietCapture.records.isEmpty(), "no candidates means no warning");

        if (failures > 0) {
            System.out.println(failures + " migration check(s) FAILED");
            System.exit(1);
        }
        System.out.println("all migration checks passed");
    }

    /** The single index segment of the one key starting with name::, or null. */
    private static String segmentOf(Variables variables, String name) {
        for (String key : variables.keysWithPrefix(name + "::")) {
            return key.substring(name.length() + 2);
        }
        return null;
    }

    /** The middle segment of the one three-segment key starting with name::, or null. */
    private static String middleSegmentOf(Variables variables, String name) {
        for (String key : variables.keysWithPrefix(name + "::")) {
            String[] segments = key.split("::", -1);
            if (segments.length == 3) return segments[1];
        }
        return null;
    }
}
