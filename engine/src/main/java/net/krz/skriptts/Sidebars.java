package net.krz.skriptts;

import io.papermc.paper.scoreboard.numbers.NumberFormat;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scoreboard.Criteria;
import org.bukkit.scoreboard.DisplaySlot;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Score;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.ScoreboardManager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;


/**
 * Per-player sidebars (feedback D, engine-only): a title plus up
 * to {@link #MAX_LINES} lines shown in the SIDEBAR display slot.
 *
 * Skript core has no sidebar / scoreboard-objective syntax at
 * all (the sidebar forms in the wild belong to addons), so —
 * like the phase 26 HTTP client — this is a skript-ts engine
 * extension with no .sk form, designed from the public Bukkit /
 * Paper scoreboard API only.
 *
 * Design notes (lane findings, U1):
 *  - The script API replaces the whole sidebar in one statement
 *    (HUDs are redrawn wholesale; line-at-a-time APIs invite
 *    stale-line bugs). Lines are addressed by 1-based position
 *    only, for the read-back expressions.
 *  - Entry names are internal keys ("sbt" + index), never the
 *    line text: duplicate and empty lines must not collapse.
 *    The visible text rides on Score.customName, and the score
 *    numbers are hidden with NumberFormat.blank().
 *  - State is runtime-only: nothing is persisted, quitting
 *    forgets the player, and a script reload clears every
 *    sidebar (the timers discipline).
 *  - Setting a sidebar replaces the player's scoreboard, so it
 *    competes with any other plugin doing the same; clearing
 *    restores the server's main scoreboard (it cannot restore
 *    another plugin's board).
 */

final class Sidebars {
    public static final int MAX_LINES = 15;

    private static final Map<UUID, State> STATES = new HashMap<>();

    private Sidebars() {
    }

    static void set(Player player, String title, List<String> lines) {
        if (player == null) {
            return;
        }

        ScoreboardManager manager = Bukkit.getScoreboardManager();
        if (manager == null) {
            return;
        }

        List<String> safeLines = new ArrayList<>(MAX_LINES);
        if (lines != null) {
            for (int i = 0; i < lines.size() && i < MAX_LINES; i++) {
                String line = lines.get(i);
                safeLines.add(line == null ? "" : line);
            }
        }

        List<String> storedLines = List.copyOf(safeLines);
        STATES.put(player.getUniqueId(), new State(title, storedLines));

        Scoreboard board = manager.getNewScoreboard();
        Objective objective = board.registerNewObjective("skript-ts-sb", Criteria.DUMMY, component(title));
        objective.setDisplaySlot(DisplaySlot.SIDEBAR);
        objective.numberFormat(NumberFormat.blank());

        for (int i = 0; i < storedLines.size(); i++) {
            Score score = objective.getScore("sbt" + i);
            score.setScore(storedLines.size() - i);
            score.customName(component(storedLines.get(i)));
            score.numberFormat(NumberFormat.blank());
        }

        player.setScoreboard(board);
    }

    static void clear(Player player) {
        if (player == null) {
            return;
        }

        STATES.remove(player.getUniqueId());

        if (player.isOnline()) {
            ScoreboardManager manager = Bukkit.getScoreboardManager();
            if (manager != null) {
                player.setScoreboard(manager.getMainScoreboard());
            }
        }
    }

    static void forget(Player player) {
        if (player == null) {
            return;
        }

        STATES.remove(player.getUniqueId());
    }

    static void clearAll() {
        ScoreboardManager manager = Bukkit.getScoreboardManager();

        for (Player player : Bukkit.getOnlinePlayers()) {
            if (STATES.containsKey(player.getUniqueId()) && manager != null) {
                player.setScoreboard(manager.getMainScoreboard());
            }
        }

        STATES.clear();
    }

    static boolean has(Player player) {
        return player != null && STATES.containsKey(player.getUniqueId());
    }

    static String title(Player player) {
        if (player == null) {
            return null;
        }

        State state = STATES.get(player.getUniqueId());
        return state == null ? null : state.title();
    }

    static String line(Player player, int oneBased) {
        if (player == null) {
            return null;
        }

        State state = STATES.get(player.getUniqueId());
        if (state == null) {
            return null;
        }

        int index = oneBased - 1;
        if (index < 0 || index >= state.lines().size()) {
            return null;
        }

        return state.lines().get(index);
    }

    static Integer lineCount(Player player) {
        if (player == null) {
            return null;
        }

        State state = STATES.get(player.getUniqueId());
        return state == null ? null : state.lines().size();
    }

    private static Component component(String legacyText) {
        return LegacyComponentSerializer.legacySection().deserialize(legacyText == null ? "" : legacyText);
    }

    private record State(String title, List<String> lines) {
    }
}
