package net.krz.skriptts;

import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

/**
 * Interpreter for skript-ts IR programs, covering exactly the v0
 * subset from the project SPEC (README): events join / first join /
 * quit / chat / death, commands with at most one argument, the effects
 * send / broadcast / give / teleport / set / add / if-else / loop all
 * players, the documented expressions, and the conditions
 * has permission / is op.
 *
 * Clean-room: every semantic here is specified by the SPEC and locked
 * in by the mineflayer behavior tests. No code is taken from the
 * Skript project (GPL); this engine only shares the *behavior
 * contract* of the subset, the same contract the .sk emitter targets.
 *
 * Value model (plain Java objects):
 *   Player, World, String, Double, Boolean, Location, Database.DataSource
 *   (phase 8), or null (no value).
 * Item expressions evaluate to their type name as a String; items only
 * become real ItemStacks inside the give effect.
 *
 * Phase 6 adds the first engine-builtin addon slice (MundoSK scope:
 * WebSocket client connections and world borders). Builtin statements
 * and expressions execute natively here; they have no Skript text form.
 * Phase 7 adds the second slice (SharpSK scope: named countdown
 * timers with tick/complete events). Phase 8 adds the third slice
 * (skript-db scope: data source values, parameterized SQL execution
 * with result storage into variables, and the last-error expression).
 * Phase 9 adds the fourth slice (skUtilities scope: the text file
 * core — create / delete / write / append / read files under an
 * engine-confined root, line access, and an existence condition).
 * Phase 10 adds the fifth slice (Ersatz scope: the PlaceholderAPI
 * bridge — a placeholder-value expression, and script-served
 * placeholder prefixes with a request event and a result statement;
 * PlaceholderAPI itself stays an external, optional plugin).
 * Phase 11 adds core-language comparisons, logic and arithmetic
 * (no addon scope): equality / ordering conditions with Skript's
 * compare semantics, and/or/not composition, and binary arithmetic
 * whose "+" concatenates two texts and whose remainder is the
 * mathematical modulo of Skript's mod() function.
 * Phase 12 adds core-language list variables and the remaining
 * control flow (no addon scope): {name::*} lists whose indices
 * are addressed by their string form — a number and a numeric
 * text are the same index, as probed against the real Skript —
 * with Skript's iteration order (text indices first — numeric
 * texts by value, then alphabetically — then numeric indices
 * ascending; text indices are case-insensitive and stored
 * lowercased, as in Skript), list
 * add (smallest unused positive integer index) / remove (first
 * match) / delete (holes stay), list size, loops over lists,
 * counted loops, numeric range loops, while loops over leaf
 * conditions, and wait — which suspends the rest of the trigger
 * through the continuation-based executor below, matching the
 * timed behavior probed against the real Skript.
 */
final class Engine {

    /** Execution context: the entities and data the running code is attached to. */
    static final class Ctx {
        Player player;      // "player": event player, or the command executor
        Player eventPlayer; // "event-player"
        Player loopPlayer;  // "loop-player" inside loop all players
        Object loopValue;   // "loop-value": element / counter / player of the enclosing loop
        Object loopIndex;   // "loop-index" (a Double or String) inside list loops; null elsewhere
        Player victim;      // "victim" in death events
        String chatMessage; // "message" in chat events
        String wsId;        // websocket connection id in websocket events
        String wsText;      // received text in websocket message events
        String timerId;     // timer name in timer tick/complete events
        String papiPrefix;  // matched expansion prefix in placeholder request events
        String papiIdentifier; // parameter part of the placeholder being requested
        String papiResult;  // answer set by the set-result statement (read back after dispatch)
        String argType;     // command argument type ("text"/"player"/"integer") or null
        String[] rawArgs = new String[0];

        Ctx copy() {
            Ctx c = new Ctx();
            c.player = player;
            c.eventPlayer = eventPlayer;
            c.loopPlayer = loopPlayer;
            c.loopValue = loopValue;
            c.loopIndex = loopIndex;
            c.victim = victim;
            c.chatMessage = chatMessage;
            c.wsId = wsId;
            c.wsText = wsText;
            c.timerId = timerId;
            c.papiPrefix = papiPrefix;
            c.papiIdentifier = papiIdentifier;
            c.papiResult = papiResult;
            c.argType = argType;
            c.rawArgs = rawArgs;
            return c;
        }
    }

    /**
     * Bridge to the plugin's WebSocket connection manager. The engine
     * only issues commands through this interface; connection events
     * come back as engine events fired by the plugin.
     */
    interface WsHost {
        void connect(String id, String url);
        void send(String id, String text);
        void disconnect(String id);
    }

    /**
     * Bridge to the plugin's PlaceholderAPI manager. The value
     * expression delegates evaluation through this interface; request
     * events come back as engine dispatches fired by the plugin.
     * Only the manager class touches PlaceholderAPI classes, so its
     * absence cannot affect the rest of the engine.
     */
    interface PlaceholderHost {
        /** Evaluate the placeholders in text for the player; the manager returns the input unchanged if it cannot. */
        String parse(Player player, String text);
    }

    /**
     * Bridge to the server scheduler for the wait statement: run a
     * continuation after a number of ticks, on the main thread.
     */
    interface DelayHost {
        void runLater(long ticks, Runnable task);
    }

    /**
     * Bridge to the plugin's named-timer manager. Statements command
     * the manager through this interface; tick and complete events
     * come back as engine events fired by the plugin.
     */
    interface TimerHost {
        void create(String id, double seconds);
        void stop(String id);
        void pause(String id);
        void resume(String id);
        boolean isActive(String id);
        /** Remaining seconds, or null when no such timer exists. */
        Double timeLeft(String id);
    }

    private final Variables variables;
    private final Logger logger;
    private List<Map<String, Object>> topLevels = List.of();
    private WsHost wsHost;
    private TimerHost timerHost;
    private DelayHost delayHost;
    private PlaceholderHost placeholderHost;
    private Database database;
    private Files files;

    Engine(Variables variables, Logger logger) {
        this.variables = variables;
        this.logger = logger;
    }

    /** Install the WebSocket host (called by the plugin on enable). */
    void setWsHost(WsHost wsHost) {
        this.wsHost = wsHost;
    }

    /** Install the timer host (called by the plugin on enable). */
    void setTimerHost(TimerHost timerHost) {
        this.timerHost = timerHost;
    }

    /** Install the delay host (called by the plugin on enable). */
    void setDelayHost(DelayHost delayHost) {
        this.delayHost = delayHost;
    }

    /**
     * Install the placeholder host (called by the plugin on enable,
     * only when PlaceholderAPI is present on the server).
     */
    void setPlaceholderHost(PlaceholderHost placeholderHost) {
        this.placeholderHost = placeholderHost;
    }

    /**
     * Install the database executor (called by the plugin on enable).
     * Unlike websockets and timers, the database fires no events back
     * into the engine, so it is held directly rather than through a
     * host interface.
     */
    void setDatabase(Database database) {
        this.database = database;
    }

    /**
     * Install the text-file helper (called by the plugin on enable).
     * Like the database, the file core fires no events back into the
     * engine, so it is held directly rather than through a host
     * interface.
     */
    void setFiles(Files files) {
        this.files = files;
    }

    /** Replace the running program (flat list of top-level IR nodes, in load order). */
    void setProgram(List<Map<String, Object>> topLevels) {
        this.topLevels = topLevels;
    }

    List<Map<String, Object>> topLevels() {
        return topLevels;
    }

    // ------------------------------------------------------------------
    // Events and commands
    // ------------------------------------------------------------------

    /**
     * Fire an event. A first join matches both "firstJoin" and "join"
     * handlers, in program declaration order — the same contract the
     * transpiled .sk files have under Skript.
     */
    void fireEvent(String event, Ctx ctx, boolean firstJoin) {
        for (Map<String, Object> top : topLevels) {
            if (!"event".equals(kind(top))) continue;
            String ev = str(top.get("event"));
            boolean match = ev.equals(event) || (firstJoin && "join".equals(event) && "firstJoin".equals(ev));
            if (match) execBlock(list(top.get("body")), ctx);
        }
    }

    /** All placeholder prefixes (expansion identifiers) the loaded program serves, in declaration order. */
    Set<String> placeholderPrefixes() {
        Set<String> out = new LinkedHashSet<>();
        for (Map<String, Object> top : topLevels) {
            if (!"event".equals(kind(top)) || !"papiRequest".equals(str(top.get("event")))) continue;
            if (top.get("prefixes") instanceof List<?> list) {
                for (Object p : list) {
                    if (p instanceof String s && !s.isBlank()) out.add(s);
                }
            }
        }
        return out;
    }

    /**
     * Serve one PlaceholderAPI request: run every handler registered
     * for the prefix, in declaration order, and return the result the
     * handlers set (null when none did). Runs on the server main
     * thread — the plugin hops asynchronous PAPI calls over. The
     * player is the value's target and is null for offline or
     * console requests, in which case player expressions have no
     * value inside the handler.
     */
    String firePlaceholderRequest(String prefix, String identifier, Player player) {
        // Note: execution is continuation-based (phase 12), so a
        // handler that waits suspends the rest of its body; the
        // result read here is whatever the handler set before any
        // wait — placeholder answers are synchronous by contract.
        Ctx ctx = new Ctx();
        ctx.player = player;
        ctx.eventPlayer = player;
        ctx.papiPrefix = prefix;
        ctx.papiIdentifier = identifier;
        for (Map<String, Object> top : topLevels) {
            if (!"event".equals(kind(top)) || !"papiRequest".equals(str(top.get("event")))) continue;
            if (top.get("prefixes") instanceof List<?> list && list.contains(prefix)) {
                execBlock(list(top.get("body")), ctx);
            }
        }
        return ctx.papiResult;
    }

    void runCommand(Map<String, Object> node, CommandSender sender, String[] args) {
        Ctx ctx = new Ctx();
        if (sender instanceof Player p) {
            ctx.player = p;
            ctx.eventPlayer = p;
        }
        ctx.argType = str(node.get("argType"));
        ctx.rawArgs = args;
        execBlock(list(node.get("body")), ctx);
    }

    // ------------------------------------------------------------------
    // Statements
    // ------------------------------------------------------------------

    private void execBlock(List<Object> body, Ctx ctx) {
        execRange(body, 0, ctx, () -> {
        });
    }

    /**
     * Execute the statements from index {@code start}, then run
     * {@code done}. Statement execution is continuation-based: a
     * statement receives the continuation of everything that
     * follows it (the rest of its block, then the rest of every
     * enclosing block, through the nested {@code done} chain), and
     * a wait suspends that chain through the delay host. This is
     * what makes a wait delay not just the next statement but the
     * rest of enclosing if branches, the remaining loop iterations
     * and the statements after the loop — Skript's continuation
     * semantics, verified with timed probes against the real
     * Skript 2.17.1. Synchronous statements invoke their
     * continuation before returning, so plain programs run exactly
     * as the old sequential executor ran them.
     */
    private void execRange(List<Object> body, int start, Ctx ctx, Runnable done) {
        int i = start;
        while (i < body.size()) {
            Object raw = body.get(i);
            i++;
            if (!(raw instanceof Map<?, ?>)) continue;
            Map<String, Object> stmt = node(raw);
            if ("wait".equals(kind(stmt))) {
                long ticks = waitTicks(stmt, ctx);
                if (ticks <= 0) continue;
                if (delayHost == null) {
                    logger.warning("skript-ts: wait without a delay host installed");
                    continue;
                }
                final int resume = i;
                delayHost.runLater(ticks, () -> execRange(body, resume, ctx, done));
                return;
            }
            final int resume = i;
            execStmt(stmt, ctx, () -> execRange(body, resume, ctx, done));
            return;
        }
        done.run();
    }

    /** The wait duration of a wait statement in ticks (0 for a missing or non-numeric amount). */
    private long waitTicks(Map<String, Object> stmt, Ctx ctx) {
        Object amount = evalExpr(node(stmt.get("amount")), ctx);
        if (!(amount instanceof Number n)) return 0;
        double perUnit = switch (str(stmt.get("unit"))) {
            case "seconds" -> 20.0;
            case "minutes" -> 1200.0;
            default -> 1.0; // ticks
        };
        return Math.max(0, Math.round(n.doubleValue() * perUnit));
    }

    private void execStmt(Map<String, Object> stmt, Ctx ctx, Runnable cont) {
        switch (kind(stmt)) {
            case "send" -> {
                if (evalExpr(node(stmt.get("target")), ctx) instanceof Player target) {
                    target.sendMessage(renderText(node(stmt.get("message")), ctx));
                }
                cont.run();
            }
            case "broadcast" -> {
                Bukkit.getServer().broadcast(Component.text(renderText(node(stmt.get("message")), ctx)));
                cont.run();
            }
            case "give" -> {
                if (evalExpr(node(stmt.get("target")), ctx) instanceof Player target) {
                    Material mat = resolveMaterial(str(stmt.get("itemName")));
                    int amount = (int) num(stmt.get("amount"));
                    if (mat == null) {
                        logger.warning("skript-ts: unknown item '" + stmt.get("itemName") + "' in give effect");
                    } else if (amount > 0) {
                        target.getInventory().addItem(new ItemStack(mat, amount));
                    }
                }
                cont.run();
            }
            case "teleport" -> {
                Object target = evalExpr(node(stmt.get("target")), ctx);
                Object loc = evalExpr(node(stmt.get("location")), ctx);
                if (target instanceof Player p && loc instanceof Location l) {
                    p.teleport(l);
                }
                cont.run();
            }
            case "setVar" -> {
                variables.set(varKey(node(stmt.get("variable")), ctx), evalExpr(node(stmt.get("value")), ctx));
                cont.run();
            }
            case "addVar" -> {
                Object v = evalExpr(node(stmt.get("value")), ctx);
                if (v instanceof Number n) {
                    variables.add(varKey(node(stmt.get("variable")), ctx), n.doubleValue());
                }
                cont.run();
            }
            case "if" -> {
                if (evalCond(node(stmt.get("cond")), ctx)) {
                    execRange(list(stmt.get("then")), 0, ctx, cont);
                } else if (stmt.get("else") != null) {
                    execRange(list(stmt.get("else")), 0, ctx, cont);
                } else {
                    cont.run();
                }
            }
            case "loopPlayers" -> {
                // Snapshot: bodies may change the online set (kicks, quits).
                loopPlayersStep(stmt, new ArrayList<>(Bukkit.getOnlinePlayers()), 0, ctx, cont);
            }
            case "listAdd" -> {
                // Append at the smallest unused positive integer
                // index (verified against the real Skript: a list
                // holding indices 2 and 3 gains the new entry at 1).
                String name = str(node(stmt.get("list")).get("name"));
                Object value = evalExpr(node(stmt.get("value")), ctx);
                if (value != null) {
                    variables.set(listBase(name) + "::" + nextListIndex(name), value);
                }
                cont.run();
            }
            case "listRemove" -> {
                // Remove only the first matching entry, in
                // iteration order (verified against the real Skript).
                String name = str(node(stmt.get("list")).get("name"));
                Object value = evalExpr(node(stmt.get("value")), ctx);
                if (value != null) {
                    for (Map.Entry<Object, Object> entry : listEntries(name)) {
                        if (valuesEqual(entry.getValue(), value)) {
                            variables.set(listBase(name) + "::" + indexSegment(entry.getKey()), null);
                            break;
                        }
                    }
                }
                cont.run();
            }
            case "deleteVar" -> {
                Map<String, Object> target = node(stmt.get("target"));
                if ("variableList".equals(kind(target))) {
                    // Delete the list's entries; the bare variable
                    // of the same name is a different node and
                    // stays (verified against the real Skript).
                    variables.removePrefix(listBase(str(target.get("name"))) + "::");
                } else {
                    variables.set(varKey(target, ctx), null);
                }
                cont.run();
            }
            case "loopList" ->
                // Snapshot the entries: bodies may change the list
                // while it is being visited.
                loopListStep(stmt, listEntries(str(node(stmt.get("list")).get("name"))), 0, ctx, cont);
            case "loopTimes" -> {
                Object count = evalExpr(node(stmt.get("count")), ctx);
                loopTimesStep(stmt, count instanceof Number n ? n.doubleValue() : 0, 1, ctx, cont);
            }
            case "loopRange" -> {
                Object from = evalExpr(node(stmt.get("from")), ctx);
                Object to = evalExpr(node(stmt.get("to")), ctx);
                double f = from instanceof Number n ? n.doubleValue() : 0;
                double t = to instanceof Number n ? n.doubleValue() : 0;
                loopRangeStep(stmt, f, t, f <= t ? 1 : -1, ctx, cont);
            }
            case "while" -> whileStep(stmt, ctx, cont);
            case "wait" ->
                // Handled in execRange, which owns scheduling; a
                // wait reaching here is simply complete.
                cont.run();
            case "wsConnect" -> {
                if (wsHost == null) {
                    logger.warning("skript-ts: wsConnect without a websocket host installed");
                } else {
                    wsHost.connect(str(stmt.get("id")), renderText(node(stmt.get("url")), ctx));
                }
                cont.run();
            }
            case "wsSend" -> {
                if (wsHost == null) {
                    logger.warning("skript-ts: wsSend without a websocket host installed");
                } else {
                    wsHost.send(str(stmt.get("id")), renderText(node(stmt.get("message")), ctx));
                }
                cont.run();
            }
            case "wsDisconnect" -> {
                if (wsHost == null) {
                    logger.warning("skript-ts: wsDisconnect without a websocket host installed");
                } else {
                    wsHost.disconnect(str(stmt.get("id")));
                }
                cont.run();
            }
            case "setBorderSize" -> {
                Object w = evalExpr(node(stmt.get("world")), ctx);
                Object size = evalExpr(node(stmt.get("size")), ctx);
                if (w instanceof World world && size instanceof Number n) {
                    world.getWorldBorder().setSize(n.doubleValue());
                }
                cont.run();
            }
            case "setBorderCenter" -> {
                Object w = evalExpr(node(stmt.get("world")), ctx);
                Object center = evalExpr(node(stmt.get("center")), ctx);
                if (w instanceof World world && center instanceof Location loc) {
                    world.getWorldBorder().setCenter(loc);
                }
                cont.run();
            }
            case "timerCreate" -> {
                if (timerHost == null) {
                    logger.warning("skript-ts: timerCreate without a timer host installed");
                } else if (evalExpr(node(stmt.get("seconds")), ctx) instanceof Number n) {
                    timerHost.create(str(stmt.get("id")), n.doubleValue());
                }
                cont.run();
            }
            case "timerStop" -> {
                if (timerHost == null) {
                    logger.warning("skript-ts: timerStop without a timer host installed");
                } else {
                    timerHost.stop(str(stmt.get("id")));
                }
                cont.run();
            }
            case "timerPause" -> {
                if (timerHost == null) {
                    logger.warning("skript-ts: timerPause without a timer host installed");
                } else {
                    timerHost.pause(str(stmt.get("id")));
                }
                cont.run();
            }
            case "timerResume" -> {
                if (timerHost == null) {
                    logger.warning("skript-ts: timerResume without a timer host installed");
                } else {
                    timerHost.resume(str(stmt.get("id")));
                }
                cont.run();
            }
            case "dbExecute" -> {
                if (database == null) {
                    logger.warning("skript-ts: dbExecute without a database installed");
                } else if (evalExpr(node(stmt.get("datasource")), ctx) instanceof Database.DataSource source) {
                    QueryText query = buildQuery(node(stmt.get("query")), ctx);
                    String storeKey = stmt.get("store") != null
                            ? varKey(node(stmt.get("store")), ctx)
                            : null;
                    database.execute(source, query.sql, query.params, storeKey);
                } else {
                    logger.warning("skript-ts: dbExecute target is not a data source");
                }
                cont.run();
            }
            case "fileCreate" -> {
                if (files == null) {
                    logger.warning("skript-ts: fileCreate without a file helper installed");
                } else {
                    files.createFile(renderText(node(stmt.get("path")), ctx));
                }
                cont.run();
            }
            case "dirCreate" -> {
                if (files == null) {
                    logger.warning("skript-ts: dirCreate without a file helper installed");
                } else {
                    files.createDirectory(renderText(node(stmt.get("path")), ctx));
                }
                cont.run();
            }
            case "fileDelete" -> {
                if (files == null) {
                    logger.warning("skript-ts: fileDelete without a file helper installed");
                } else {
                    files.delete(renderText(node(stmt.get("path")), ctx));
                }
                cont.run();
            }
            case "fileWrite" -> {
                if (files == null) {
                    logger.warning("skript-ts: fileWrite without a file helper installed");
                } else {
                    files.write(renderText(node(stmt.get("path")), ctx), renderText(node(stmt.get("text")), ctx));
                }
                cont.run();
            }
            case "fileAppend" -> {
                if (files == null) {
                    logger.warning("skript-ts: fileAppend without a file helper installed");
                } else {
                    files.appendLine(renderText(node(stmt.get("path")), ctx), renderText(node(stmt.get("text")), ctx));
                }
                cont.run();
            }
            case "setPlaceholderResult" -> {
                // Only meaningful while a placeholder request is being
                // served; anywhere else the value is simply dropped.
                ctx.papiResult = renderText(node(stmt.get("text")), ctx);
                cont.run();
            }
            default -> {
                logger.warning("skript-ts: unknown statement kind '" + kind(stmt) + "'");
                cont.run();
            }
        }
    }

    // ------------------------------------------------------------------
    // Loop drivers (all continuation-based, like execRange)
    // ------------------------------------------------------------------

    private void loopPlayersStep(Map<String, Object> stmt, List<Player> players, int idx, Ctx ctx, Runnable cont) {
        if (idx >= players.size()) {
            cont.run();
            return;
        }
        Player p = players.get(idx);
        Ctx inner = ctx.copy();
        inner.loopPlayer = p;
        inner.loopValue = p;
        execRange(list(stmt.get("body")), 0, inner,
                () -> loopPlayersStep(stmt, players, idx + 1, ctx, cont));
    }

    private void loopListStep(Map<String, Object> stmt, List<Map.Entry<Object, Object>> entries, int idx, Ctx ctx, Runnable cont) {
        if (idx >= entries.size()) {
            cont.run();
            return;
        }
        Map.Entry<Object, Object> entry = entries.get(idx);
        Ctx inner = ctx.copy();
        inner.loopValue = entry.getValue();
        inner.loopIndex = entry.getKey();
        execRange(list(stmt.get("body")), 0, inner,
                () -> loopListStep(stmt, entries, idx + 1, ctx, cont));
    }

    private void loopTimesStep(Map<String, Object> stmt, double count, long value, Ctx ctx, Runnable cont) {
        if (value > count) {
            cont.run();
            return;
        }
        Ctx inner = ctx.copy();
        inner.loopValue = (double) value;
        execRange(list(stmt.get("body")), 0, inner,
                () -> loopTimesStep(stmt, count, value + 1, ctx, cont));
    }

    private void loopRangeStep(Map<String, Object> stmt, double value, double to, double step, Ctx ctx, Runnable cont) {
        if (step > 0 ? value > to : value < to) {
            cont.run();
            return;
        }
        Ctx inner = ctx.copy();
        inner.loopValue = value;
        execRange(list(stmt.get("body")), 0, inner,
                () -> loopRangeStep(stmt, value + step, to, step, ctx, cont));
    }

    private void whileStep(Map<String, Object> stmt, Ctx ctx, Runnable cont) {
        if (!evalCond(node(stmt.get("cond")), ctx)) {
            cont.run();
            return;
        }
        execRange(list(stmt.get("body")), 0, ctx, () -> whileStep(stmt, ctx, cont));
    }

    // ------------------------------------------------------------------
    // Conditions
    // ------------------------------------------------------------------

    private boolean evalCond(Map<String, Object> cond, Ctx ctx) {
        return switch (kind(cond)) {
            case "hasPermission" -> {
                Object target = evalExpr(node(cond.get("target")), ctx);
                yield target instanceof Player p && p.hasPermission(str(cond.get("permission")));
            }
            case "isOp" -> {
                Object target = evalExpr(node(cond.get("target")), ctx);
                yield target instanceof Player p && p.isOp();
            }
            case "equals" -> valuesEqual(
                    evalExpr(node(cond.get("left")), ctx), evalExpr(node(cond.get("right")), ctx));
            case "notEquals" -> !valuesEqual(
                    evalExpr(node(cond.get("left")), ctx), evalExpr(node(cond.get("right")), ctx));
            case "greaterThan" -> {
                Integer rel = numericRelation(
                        evalExpr(node(cond.get("left")), ctx), evalExpr(node(cond.get("right")), ctx));
                yield rel != null && rel > 0;
            }
            case "greaterOrEqual" -> {
                Integer rel = numericRelation(
                        evalExpr(node(cond.get("left")), ctx), evalExpr(node(cond.get("right")), ctx));
                yield rel != null && rel >= 0;
            }
            case "lessThan" -> {
                Integer rel = numericRelation(
                        evalExpr(node(cond.get("left")), ctx), evalExpr(node(cond.get("right")), ctx));
                yield rel != null && rel < 0;
            }
            case "lessOrEqual" -> {
                Integer rel = numericRelation(
                        evalExpr(node(cond.get("left")), ctx), evalExpr(node(cond.get("right")), ctx));
                yield rel != null && rel <= 0;
            }
            case "and" -> evalCond(node(cond.get("left")), ctx) && evalCond(node(cond.get("right")), ctx);
            case "or" -> evalCond(node(cond.get("left")), ctx) || evalCond(node(cond.get("right")), ctx);
            case "not" -> !evalCond(node(cond.get("cond")), ctx);
            case "timerActive" -> {
                String name = renderText(node(cond.get("name")), ctx);
                yield timerHost != null && name != null && timerHost.isActive(name);
            }
            case "fileExists" -> {
                String path = renderText(node(cond.get("path")), ctx);
                yield files != null && path != null && files.exists(path);
            }
            default -> {
                logger.warning("skript-ts: unknown condition kind '" + kind(cond) + "'");
                yield false;
            }
        };
    }

    /**
     * Skript's compare equality, as verified against the real
     * Skript 2.17.1: a missing value (null) is never equal to
     * anything, not even to another missing value; numbers compare
     * numerically; texts compare case-insensitively; values of
     * different types are never equal (a number is not equal to its
     * text form); anything else compares by identity/equality of
     * the underlying object (players, worlds, locations, booleans).
     * Inequality is the exact boolean negation of this, so an
     * incomparable pair is "not equal" — matching Skript's negated
     * compare patterns.
     */
    private static boolean valuesEqual(Object a, Object b) {
        if (a == null || b == null) return false;
        if (a instanceof Number na && b instanceof Number nb) {
            double x = na.doubleValue(), y = nb.doubleValue();
            return !Double.isNaN(x) && !Double.isNaN(y) && x == y;
        }
        if (a instanceof String sa && b instanceof String sb) return sa.equalsIgnoreCase(sb);
        if (a.getClass() != b.getClass()) return false;
        return a.equals(b);
    }

    /**
     * The numeric ordering relation of two values, or null when
     * they cannot be ordered. Only numbers can be ordered in
     * Skript (texts have no ordering comparator, and mixed types
     * are incomparable), and NaN orders against nothing.
     */
    private static Integer numericRelation(Object a, Object b) {
        if (!(a instanceof Number na) || !(b instanceof Number nb)) return null;
        double x = na.doubleValue(), y = nb.doubleValue();
        if (Double.isNaN(x) || Double.isNaN(y)) return null;
        return Double.compare(x, y);
    }

    // ------------------------------------------------------------------
    // Expressions
    // ------------------------------------------------------------------

    private Object evalExpr(Map<String, Object> expr, Ctx ctx) {
        return switch (kind(expr)) {
            case "player" -> ctx.player;
            case "eventPlayer" -> ctx.eventPlayer != null ? ctx.eventPlayer : ctx.player;
            case "loopPlayer" -> ctx.loopPlayer;
            case "victim" -> ctx.victim;
            case "argument" -> resolveArgument((int) num(expr.get("index")), ctx);
            case "chatMessage" -> ctx.chatMessage;
            case "variable" -> variables.get(varKey(expr, ctx));
            case "variableList" -> {
                // The list's values in iteration order, snapshotted;
                // an empty (or unset) list has no value, like any
                // other missing value in Skript.
                List<Object> values = new ArrayList<>();
                for (Map.Entry<Object, Object> entry : listEntries(str(expr.get("name")))) {
                    values.add(entry.getValue());
                }
                yield values.isEmpty() ? null : values;
            }
            case "listSize" -> (double) listEntries(str(node(expr.get("list")).get("name"))).size();
            case "loopValue" -> ctx.loopValue;
            case "loopIndex" -> ctx.loopIndex;
            case "string" -> str(expr.get("value"));
            case "number" -> num(expr.get("value"));
            case "boolean" -> Boolean.TRUE.equals(expr.get("value"));
            case "item" -> str(expr.get("name"));
            case "locationOf" -> {
                Object target = evalExpr(node(expr.get("target")), ctx);
                yield target instanceof Player p ? p.getLocation() : null;
            }
            case "wsMessage" -> ctx.wsText;
            case "wsId" -> ctx.wsId;
            case "worldOf" -> {
                Object target = evalExpr(node(expr.get("target")), ctx);
                if (target instanceof Player p) yield p.getWorld();
                if (target instanceof Location l) yield l.getWorld();
                yield null;
            }
            case "borderSize" -> {
                Object w = evalExpr(node(expr.get("world")), ctx);
                yield w instanceof World world ? world.getWorldBorder().getSize() : null;
            }
            case "borderCenter" -> {
                Object w = evalExpr(node(expr.get("world")), ctx);
                yield w instanceof World world ? world.getWorldBorder().getCenter() : null;
            }
            case "timerId" -> ctx.timerId;
            case "timerTimeLeft" -> {
                if (timerHost == null) yield null;
                Object name = evalExpr(node(expr.get("name")), ctx);
                yield name == null ? null : timerHost.timeLeft(stringify(name));
            }
            case "dataSource" -> {
                if (database == null) yield null;
                String url = renderText(node(expr.get("url")), ctx);
                try {
                    yield database.parseDataSource(url);
                } catch (IllegalArgumentException e) {
                    logger.warning("skript-ts: " + e.getMessage());
                    yield null;
                }
            }
            case "dbLastError" -> database == null ? null : database.lastError();
            case "fileContents" -> {
                if (files == null) yield null;
                String path = renderText(node(expr.get("path")), ctx);
                yield path == null ? null : files.contents(path);
            }
            case "fileLine" -> {
                if (files == null) yield null;
                String path = renderText(node(expr.get("path")), ctx);
                Object line = evalExpr(node(expr.get("line")), ctx);
                yield path == null || !(line instanceof Number n) ? null : files.line(path, n.doubleValue());
            }
            case "fileLineCount" -> {
                if (files == null) yield null;
                String path = renderText(node(expr.get("path")), ctx);
                yield path == null ? null : files.lineCount(path);
            }
            case "placeholderValue" -> {
                if (placeholderHost == null) yield null;
                Object target = evalExpr(node(expr.get("player")), ctx);
                String text = renderText(node(expr.get("text")), ctx);
                if (!(target instanceof Player p) || text == null) yield null;
                // Documented bare form: a text holding no %...%
                // token is a single placeholder name, so wrap it
                // for PAPI to resolve; a text with tokens is
                // formatted as a whole. Placeholders nobody
                // resolves stay literal, per PAPI's own contract.
                String query = text.contains("%") ? text : "%" + text + "%";
                yield placeholderHost.parse(p, query);
            }
            case "placeholderIdentifier" -> ctx.papiIdentifier;
            case "placeholderPrefix" -> ctx.papiPrefix;
            case "arith" -> evalArith(str(expr.get("op")),
                    evalExpr(node(expr.get("left")), ctx), evalExpr(node(expr.get("right")), ctx));
            case "format" -> renderParts(list(expr.get("parts")), ctx);
            default -> {
                logger.warning("skript-ts: unknown expression kind '" + kind(expr) + "'");
                yield null;
            }
        };
    }

    /**
     * Binary arithmetic with Skript's semantics, as verified
     * against the real Skript 2.17.1: both operands must be
     * numbers, except that "+" over two texts concatenates them;
     * every other type combination (mixed text/number included)
     * yields no value. Division is real division and follows Java
     * doubles at zero (1/0 is Infinity, 0/0 is NaN). The remainder
     * is Skript's mod(): the mathematical modulo whose result
     * takes the divisor's sign — mod(-1, 10) is 9 — and NaN for a
     * zero divisor.
     */
    private static Object evalArith(String op, Object a, Object b) {
        if ("+".equals(op) && a instanceof String sa && b instanceof String sb) {
            return sa + sb;
        }
        if (!(a instanceof Number na) || !(b instanceof Number nb)) return null;
        double x = na.doubleValue(), y = nb.doubleValue();
        return switch (op) {
            case "+" -> x + y;
            case "-" -> x - y;
            case "*" -> x * y;
            case "/" -> x / y;
            case "mod" -> x - Math.floor(x / y) * y;
            default -> null;
        };
    }

    /** Skript text arguments swallow the rest of the line; player/integer args parse one token. */
    private Object resolveArgument(int index, Ctx ctx) {
        if (ctx.argType == null || index < 1 || ctx.rawArgs.length < index) return null;
        return switch (ctx.argType) {
            case "text" -> String.join(" ", List.of(ctx.rawArgs).subList(index - 1, ctx.rawArgs.length));
            case "integer" -> {
                try {
                    yield Double.parseDouble(ctx.rawArgs[index - 1]);
                } catch (NumberFormatException e) {
                    yield null;
                }
            }
            case "player" -> Bukkit.getPlayerExact(ctx.rawArgs[index - 1]);
            default -> null;
        };
    }

    // ------------------------------------------------------------------
    // Text rendering and value formatting
    // ------------------------------------------------------------------

    /** A SQL string plus the values to bind to its {@code ?} placeholders, in order. */
    private static final class QueryText {
        final String sql;
        final List<Object> params;

        QueryText(String sql, List<Object> params) {
            this.sql = sql;
            this.params = params;
        }
    }

    /**
     * Assemble a parameterized query from a query text expression.
     * Literal text (a plain string, or the literal parts of a format)
     * is the script author's own SQL and is used verbatim; every
     * expression part of a format becomes one {@code ?} placeholder
     * whose evaluated value is bound as a parameter by the database
     * layer — never inlined into the SQL text.
     */
    private QueryText buildQuery(Map<String, Object> query, Ctx ctx) {
        switch (kind(query)) {
            case "string":
                return new QueryText(str(query.get("value")), List.of());
            case "format": {
                StringBuilder sql = new StringBuilder();
                List<Object> params = new ArrayList<>();
                for (Object part : list(query.get("parts"))) {
                    if (part instanceof String s) {
                        sql.append(s);
                    } else if (part instanceof Map<?, ?>) {
                        sql.append('?');
                        params.add(evalExpr(node(part), ctx));
                    }
                }
                return new QueryText(sql.toString(), params);
            }
            default:
                // Any other text-producing expression supplies the SQL as a whole.
                return new QueryText(stringify(evalExpr(query, ctx)), List.of());
        }
    }

    /** Render a text expression (string literal or format) to a plain string. */
    private String renderText(Map<String, Object> text, Ctx ctx) {
        return switch (kind(text)) {
            case "string" -> str(text.get("value"));
            case "format" -> renderParts(list(text.get("parts")), ctx);
            default -> stringify(evalExpr(text, ctx));
        };
    }

    private String renderParts(List<Object> parts, Ctx ctx) {
        StringBuilder sb = new StringBuilder();
        for (Object part : parts) {
            if (part instanceof String s) {
                sb.append(s);
            } else if (part instanceof Map<?, ?>) {
                sb.append(stringifyText(evalExpr(node(part), ctx)));
            }
        }
        return sb.toString();
    }

    /**
     * String form of a value inside script text. A missing value
     * renders as {@code <none>} — verified against the real Skript
     * 2.17.1 (an unset variable, a missing list entry and an empty
     * list all read "<none>" inside a string).
     */
    private static String stringifyText(Object value) {
        return value == null ? "<none>" : stringify(value);
    }

    /** String form of a value inside messages and variable indices. */
    static String stringify(Object value) {
        if (value == null) return "";
        if (value instanceof List<?> list) return joinList(list);
        if (value instanceof Database.DataSource ds) return ds.display();
        if (value instanceof Player p) return p.getName();
        if (value instanceof World w) return w.getName();
        if (value instanceof Number n) return formatNumber(n.doubleValue());
        if (value instanceof Boolean b) return b.toString();
        if (value instanceof Location l) {
            String world = l.getWorld() == null ? "" : l.getWorld().getName();
            return world + ": " + formatNumber(l.getX()) + ", " + formatNumber(l.getY()) + ", " + formatNumber(l.getZ());
        }
        return String.valueOf(value);
    }

    /** Whole numbers print without a fraction (1, not 1.0), matching the SPEC's message examples. */
    static String formatNumber(double d) {
        if (Double.isFinite(d) && d == Math.rint(d) && Math.abs(d) < 1e15) {
            return Long.toString((long) d);
        }
        return Double.toString(d);
    }

    /**
     * Skript's list text form, verified against the real Skript
     * 2.17.1: one value reads as itself, two read "a and b", and
     * longer lists read "a, b and c" (comma-separated, "and"
     * before the last). An empty list never reaches here — it has
     * no value and renders as a missing value instead.
     */
    private static String joinList(List<?> values) {
        List<String> parts = new ArrayList<>();
        for (Object v : values) parts.add(stringify(v));
        if (parts.isEmpty()) return "";
        if (parts.size() == 1) return parts.get(0);
        if (parts.size() == 2) return parts.get(0) + " and " + parts.get(1);
        return String.join(", ", parts.subList(0, parts.size() - 1))
                + " and " + parts.get(parts.size() - 1);
    }

    /**
     * Variable storage key: "name" or "name::index". Names and text
     * indices are lowercased, matching Skript (its variable store
     * is case-insensitive: {l::"B"} and {l::"b"} are one entry, and
     * a player-named index does not depend on the name's case).
     */
    private String varKey(Map<String, Object> varNode, Ctx ctx) {
        String name = str(varNode.get("name")).toLowerCase(Locale.ROOT);
        Object index = varNode.get("index");
        if (index == null) return name;
        return name + "::" + indexSegment(evalExpr(node(index), ctx));
    }

    /** The storage base of a list variable (its name, lowercased like variable names). */
    private static String listBase(String name) {
        return name.toLowerCase(Locale.ROOT);
    }

    /**
     * The storage segment for one variable index: the index's
     * string form, canonicalized. A number stores as its plain
     * form ("5", "2.5"), and a text index that reads as a number
     * stores as that number's form too — verified against the
     * real Skript 2.17.1, where an entry set through a numeric
     * expression index is read back through the text "5", i.e.
     * expression indices address entries by their string form.
     * Other texts store lowercased (Skript's variable store is
     * case-insensitive). (Indices written as quoted literals in
     * hand-written .sk text are a different node in Skript — its
     * name keeps the quotes — but the emitter only ever produces
     * expression indices, so that world is unreachable here.)
     */
    static String indexSegment(Object index) {
        if (index == null) return "";
        if (index instanceof Number n) return formatNumber(n.doubleValue());
        String s = stringify(index).toLowerCase(Locale.ROOT);
        Double numeric = parseNumberText(s);
        return numeric != null ? formatNumber(numeric) : s;
    }

    /** Inverse of indexSegment: a numeric segment decodes to a number, anything else to text. */
    static Object decodeIndex(String segment) {
        Double n = parseNumberText(segment);
        return n != null ? n : segment;
    }

    /** Parse a finite number from text, or null (used for index typing and ordering). */
    private static Double parseNumberText(String s) {
        try {
            double d = Double.parseDouble(s);
            return Double.isFinite(d) ? d : null;
        } catch (NumberFormatException | NullPointerException e) {
            return null;
        }
    }

    /**
     * The entries of a list variable, decoded and in Skript's
     * iteration order (verified against the real Skript 2.17.1):
     * text indices first — numeric texts by value, then the rest
     * alphabetically — then numeric indices in ascending order.
     */
    private List<Map.Entry<Object, Object>> listEntries(String rawName) {
        String prefix = listBase(rawName) + "::";
        List<Map.Entry<Object, Object>> out = new ArrayList<>();
        for (String key : variables.keysWithPrefix(prefix)) {
            Object index = decodeIndex(key.substring(prefix.length()));
            out.add(new AbstractMap.SimpleEntry<>(index, variables.get(key)));
        }
        out.sort((a, b) -> compareIndices(a.getKey(), b.getKey()));
        return out;
    }

    private static int compareIndices(Object a, Object b) {
        boolean aNum = a instanceof Number;
        boolean bNum = b instanceof Number;
        if (aNum && bNum) {
            return Double.compare(((Number) a).doubleValue(), ((Number) b).doubleValue());
        }
        if (aNum) return 1; // numeric indices iterate after text indices
        if (bNum) return -1;
        String sa = (String) a;
        String sb = (String) b;
        Double na = parseNumberText(sa);
        Double nb = parseNumberText(sb);
        if (na != null && nb != null) return Double.compare(na, nb);
        if (na != null) return -1; // numeric texts before alphabetic ones
        if (nb != null) return 1;
        int c = sa.compareToIgnoreCase(sb);
        return c != 0 ? c : sa.compareTo(sb);
    }

    /** The smallest positive integer not used as a numeric index of the list. */
    private int nextListIndex(String rawName) {
        Set<Double> used = new HashSet<>();
        for (Map.Entry<Object, Object> entry : listEntries(rawName)) {
            if (entry.getKey() instanceof Number n) used.add(n.doubleValue());
        }
        int i = 1;
        while (used.contains((double) i)) i++;
        return i;
    }

    private static Material resolveMaterial(String itemName) {
        if (itemName == null) return null;
        Material m = Material.matchMaterial(itemName.trim());
        if (m != null) return m;
        try {
            return Material.valueOf(itemName.trim().replace(' ', '_').toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------
    // IR node access helpers (nodes are Json DOM maps)
    // ------------------------------------------------------------------

    private static String kind(Map<String, Object> node) {
        Object k = node.get("kind");
        return k instanceof String s ? s : "";
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> node(Object value) {
        return (Map<String, Object>) value;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Object value) {
        return value instanceof List ? (List<Object>) value : List.of();
    }

    private static String str(Object value) {
        return value instanceof String s ? s : null;
    }

    private static double num(Object value) {
        return value instanceof Number n ? n.doubleValue() : 0.0;
    }
}
