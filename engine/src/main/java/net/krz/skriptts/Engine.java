package net.krz.skriptts;

import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.Cancellable;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.inventory.ItemStack;

import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
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
 * Phase 13 adds core-language custom functions (no addon scope):
 * user-defined functions with typed parameters (defaults, one
 * trailing plural parameter), return values with declared types,
 * and local variables. Every trigger execution and every function
 * call runs in a Frame: locals ({_name}, function parameters
 * included) live in the frame's own map, isolated from other
 * frames and fresh per call, while globals stay in the variable
 * store — probed against the real Skript 2.17.1 over six rounds
 * (see the project development log), including the wait rule: a
 * wait inside a function resumes the caller immediately with no
 * value, the rest of the body runs detached, and its return is
 * dropped.
 * Phase 14 adds core-language gameplay events (no addon scope):
 * block break / place, right / left click and damage, fired by the
 * plugin's Bukkit listeners with the event's values on the context
 * (event block, event item, attacker, the live damage event).
 * Blocks and items are real values now (Block / ItemStack): they
 * print and compare by their Skript type name ("grass block"),
 * typeOf() reads that name back, and the function type system
 * knows "block", "item" and "entity". Cancellation and the damage
 * amount write through to the underlying Bukkit event, so a
 * cancelled break leaves the block standing and setDamage changes
 * what the victim actually takes.
 * Phase 15 adds core-language text operations (no addon scope):
 * length, fitted substring / first / last, strict character-at,
 * case conversion, split (a list value) and join, the contains /
 * starts-with / ends-with conditions, replace, and the color
 * expressions. Skript 2.17 texts are components; this engine's
 * values stay legacy-coded strings, so color parsing (of literals
 * too — Skript parses literals into components) converts & codes
 * and the named tags to § codes, and the strip expressions remove
 * them. All semantics were probed against the real Skript 2.17.1
 * (see the project development log).
 */
final class Engine {

    /**
     * One execution frame (phase 13): the local variables of one
     * trigger body or one function call, plus the return state.
     * Frames are shared by every nested block and loop iteration of
     * the same body (locals are body-scoped, as in Skript), and a
     * function call always runs in a fresh frame — locals never
     * leak between callers and callees or between calls. `returned`
     * is set by the return and stop statements; once set, the
     * statement chain unwinds without running any continuation.
     */
    static final class Frame {
        final Map<String, Object> locals = new LinkedHashMap<>();
        boolean returned;
        Object returnValue;
    }

    /** Execution context: the entities and data the running code is attached to. */
    static final class Ctx {
        Player player;      // "player": event player, or the command executor
        Player eventPlayer; // "event-player"
        Player loopPlayer;  // "loop-player" inside loop all players
        Object loopValue;   // "loop-value": element / counter / player of the enclosing loop
        Object loopIndex;   // "loop-index" (a Double or String) inside list loops; null elsewhere
        Entity victim;      // "victim" in death and damage events (any entity)
        Block eventBlock;   // "event-block" in block break/place/click events; null for air clicks
        ItemStack eventItem; // "event-item" in block break/place/click events
        Entity clickedEntity; // "clicked entity" in right clicks on an entity; null otherwise
        Entity attacker;    // "attacker" in damage events caused by an entity; null otherwise
        Cancellable cancellable; // the Bukkit event being handled, when it can be cancelled
        EntityDamageEvent damageEvent; // the live damage event (damage get/set); null elsewhere
        String chatMessage; // "message" in chat events
        String wsId;        // websocket connection id in websocket events
        String wsText;      // received text in websocket message events
        String timerId;     // timer name in timer tick/complete events
        String papiPrefix;  // matched expansion prefix in placeholder request events
        String papiIdentifier; // parameter part of the placeholder being requested
        String papiResult;  // answer set by the set-result statement (read back after dispatch)
        String argType;     // command argument type ("text"/"player"/"integer") or null
        String[] rawArgs = new String[0];
        Frame frame = new Frame(); // locals + return state of the running body

        Ctx copy() {
            Ctx c = new Ctx();
            c.player = player;
            c.eventPlayer = eventPlayer;
            c.loopPlayer = loopPlayer;
            c.loopValue = loopValue;
            c.loopIndex = loopIndex;
            c.victim = victim;
            c.eventBlock = eventBlock;
            c.eventItem = eventItem;
            c.clickedEntity = clickedEntity;
            c.attacker = attacker;
            c.cancellable = cancellable;
            c.damageEvent = damageEvent;
            c.chatMessage = chatMessage;
            c.wsId = wsId;
            c.wsText = wsText;
            c.timerId = timerId;
            c.papiPrefix = papiPrefix;
            c.papiIdentifier = papiIdentifier;
            c.papiResult = papiResult;
            c.argType = argType;
            c.rawArgs = rawArgs;
            c.frame = frame;
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
    /** Custom functions (phase 13) by exact, case-sensitive name; overloads share a name. */
    private Map<String, List<Map<String, Object>>> functions = Map.of();
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

    /**
     * A key/value store view over one variable space (phase 13):
     * the persistent global variables, or one frame's locals. Both
     * use the same key shape ("name" or "name::index"), so scalar
     * and list operations are written once against this interface.
     * Setting a null value removes the key.
     */
    private interface Store {
        Object get(String key);
        void set(String key, Object value);
        List<String> keysWithPrefix(String prefix);
        void removePrefix(String prefix);
    }

    /** The store of the persistent global variables. */
    private Store globalStore() {
        return new Store() {
            @Override public Object get(String key) { return variables.get(key); }
            @Override public void set(String key, Object value) { variables.set(key, value); }
            @Override public List<String> keysWithPrefix(String prefix) { return variables.keysWithPrefix(prefix); }
            @Override public void removePrefix(String prefix) { variables.removePrefix(prefix); }
        };
    }

    /** The store of one execution frame's local variables. */
    private static Store localStore(Ctx ctx) {
        Map<String, Object> locals = ctx.frame.locals;
        return new Store() {
            @Override public Object get(String key) { return locals.get(key); }
            @Override public void set(String key, Object value) {
                if (value == null) locals.remove(key);
                else locals.put(key, value);
            }
            @Override public List<String> keysWithPrefix(String prefix) {
                List<String> out = new ArrayList<>();
                for (String key : locals.keySet()) {
                    if (key.startsWith(prefix)) out.add(key);
                }
                return out;
            }
            @Override public void removePrefix(String prefix) {
                locals.keySet().removeIf(k -> k.startsWith(prefix));
            }
        };
    }

    /** The store a variable-ish node addresses: local nodes read the frame, the rest the globals. */
    private Store storeFor(Map<String, Object> varNode, Ctx ctx) {
        String k = kind(varNode);
        return "localVariable".equals(k) || "localVariableList".equals(k) ? localStore(ctx) : globalStore();
    }

    /** Replace the running program (flat list of top-level IR nodes, in load order). */
    void setProgram(List<Map<String, Object>> topLevels) {
        this.topLevels = topLevels;
        // Index the custom functions. A duplicate name+signature
        // keeps the first definition (under Skript the later file
        // fails to load with an error and the first one serves);
        // overloads — same name, different parameter types — all
        // register, in declaration order.
        Map<String, List<Map<String, Object>>> byName = new LinkedHashMap<>();
        Set<String> seenSignatures = new HashSet<>();
        for (Map<String, Object> top : topLevels) {
            if (!"function".equals(kind(top))) continue;
            String name = str(top.get("name"));
            if (name == null) continue;
            StringBuilder sig = new StringBuilder(name).append('(');
            for (Object p : list(top.get("params"))) {
                sig.append(str(node(p).get("type"))).append(',');
            }
            sig.append(')');
            if (!seenSignatures.add(sig.toString())) {
                logger.warning("skript-ts: duplicate function '" + sig + "' ignored; the first definition wins");
                continue;
            }
            byName.computeIfAbsent(name, k -> new ArrayList<>()).add(top);
        }
        this.functions = byName;
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
            if (match && filterMatches(top, ctx)) execBlock(list(top.get("body")), ctx);
        }
    }

    /**
     * The filtered event forms (phase 16): a handler carrying an
     * IR "filter" runs only when every filtered slot matches the
     * event's values by Skript type name — the engine counterpart
     * of Skript's own "on break of stone" header matching. A slot
     * whose value the event does not have (an attacker filter on
     * environmental damage, a block filter on an air click) never
     * matches. The "of" slot reads the block for break/place and
     * the item for pickup/drop, mirroring the headers.
     */
    private boolean filterMatches(Map<String, Object> top, Ctx ctx) {
        if (!(top.get("filter") instanceof Map<?, ?> filter)) return true;
        String ev = str(top.get("event"));
        if (filter.get("ofTypes") instanceof List<?> names) {
            Object value = ("pickup".equals(ev) || "drop".equals(ev)) ? ctx.eventItem : ctx.eventBlock;
            if (!typeListMatches(names, value)) return false;
        }
        if (filter.get("victimTypes") instanceof List<?> names && !typeListMatches(names, ctx.victim)) return false;
        if (filter.get("attackerTypes") instanceof List<?> names && !typeListMatches(names, ctx.attacker)) return false;
        if (filter.get("onTypes") instanceof List<?> names && !typeListMatches(names, ctx.eventBlock)) return false;
        if (filter.get("onEntityTypes") instanceof List<?> names && !typeListMatches(names, ctx.clickedEntity)) return false;
        if (filter.get("withTypes") instanceof List<?> names && !typeListMatches(names, ctx.eventItem)) return false;
        return true;
    }

    /** Whether the value's Skript type name is one of the filter's names (compared in the same normalized form). */
    private static boolean typeListMatches(List<?> names, Object value) {
        if (value == null) return false;
        String actual = typeNameOf(value);
        if (actual == null) return false;
        for (Object name : names) {
            if (name instanceof String s
                    && s.trim().toLowerCase(Locale.ROOT).replace('_', ' ').equals(actual)) {
                return true;
            }
        }
        return false;
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
                Map<String, Object> target = node(stmt.get("variable"));
                Object value = evalExpr(node(stmt.get("value")), ctx);
                if ("variableList".equals(kind(target)) || "localVariableList".equals(kind(target))) {
                    // Whole-list assignment replaces the list
                    // (verified against the real Skript): old
                    // entries are cleared, the new values land at
                    // indices 1..n in iteration order.
                    assignList(storeFor(target, ctx), str(target.get("name")), value);
                } else {
                    // A multi-value result assigned to a scalar
                    // yields no value (verified: a list-valued
                    // function result set into a plain variable
                    // reads back as <none>); a one-element list
                    // unwraps to its element.
                    storeFor(target, ctx).set(varKey(target, ctx), scalarValue(value));
                }
                cont.run();
            }
            case "addVar" -> {
                Object v = evalExpr(node(stmt.get("value")), ctx);
                if (v instanceof Number n) {
                    Map<String, Object> target = node(stmt.get("variable"));
                    if ("localVariable".equals(kind(target))) {
                        Store store = localStore(ctx);
                        String key = varKey(target, ctx);
                        Object cur = store.get(key);
                        store.set(key, (cur instanceof Number c ? c.doubleValue() : 0.0) + n.doubleValue());
                    } else {
                        variables.add(varKey(target, ctx), n.doubleValue());
                    }
                }
                cont.run();
            }
            case "return" -> {
                // Exits the function at once: the continuation is
                // deliberately not run, so every enclosing block
                // and loop unwinds. The value is type-checked by
                // the invoker against the declared return type.
                ctx.frame.returnValue = evalExpr(node(stmt.get("value")), ctx);
                ctx.frame.returned = true;
            }
            case "stop" -> {
                // Skript's `stop`: end this trigger (in a function,
                // the call completes with no value).
                ctx.frame.returned = true;
            }
            case "callStmt" -> {
                invokeFunction(str(stmt.get("name")), evalArgs(list(stmt.get("args")), ctx), ctx);
                cont.run();
            }
            case "cancelEvent" -> {
                // Writes through to the Bukkit event the plugin
                // listener is currently dispatching; the vanilla
                // outcome (block stays, damage skipped) follows
                // from the event's cancelled flag.
                if (ctx.cancellable != null) ctx.cancellable.setCancelled(true);
                cont.run();
            }
            case "uncancelEvent" -> {
                if (ctx.cancellable != null) ctx.cancellable.setCancelled(false);
                cont.run();
            }
            case "setDamage" -> {
                // The damage expression is settable in Skript; the
                // write lands on the live event, so later reads of
                // damageAmount() in the same handler see it and the
                // victim takes the rewritten amount.
                Object v = evalExpr(node(stmt.get("value")), ctx);
                if (ctx.damageEvent != null && v instanceof Number n) {
                    ctx.damageEvent.setDamage(n.doubleValue());
                }
                cont.run();
            }
            case "textReplace" -> {
                // Rewrite the text a scalar variable holds
                // (phase 15). A missing or non-text current value,
                // or a non-text search / replacement, leaves the
                // variable untouched (probed: a replace in an
                // unset variable is a no-op).
                Map<String, Object> target = node(stmt.get("target"));
                Object current = evalExpr(target, ctx);
                Object find = evalExpr(node(stmt.get("find")), ctx);
                Object repl = evalExpr(node(stmt.get("replacement")), ctx);
                if (current instanceof String s && find instanceof String f && repl instanceof String r) {
                    boolean firstOnly = Boolean.TRUE.equals(stmt.get("firstOnly"));
                    boolean caseSensitive = Boolean.TRUE.equals(stmt.get("caseSensitive"));
                    storeFor(target, ctx).set(varKey(target, ctx),
                            replaceText(s, f, r, firstOnly, caseSensitive));
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
            }            case "loopPlayers" -> {
                // Snapshot: bodies may change the online set (kicks, quits).
                loopPlayersStep(stmt, new ArrayList<>(Bukkit.getOnlinePlayers()), 0, ctx, cont);
            }
            case "listAdd" -> {
                // Append at the smallest unused positive integer
                // index (verified against the real Skript: a list
                // holding indices 2 and 3 gains the new entry at 1).
                // A list-valued addend contributes all its elements.
                Map<String, Object> listNode = node(stmt.get("list"));
                Store store = storeFor(listNode, ctx);
                String name = str(listNode.get("name"));
                Object value = evalExpr(node(stmt.get("value")), ctx);
                List<Object> elements = new ArrayList<>();
                spreadInto(elements, value);
                for (Object element : elements) {
                    store.set(listBase(name) + "::" + nextListIndex(store, name), element);
                }
                cont.run();
            }
            case "listRemove" -> {
                // Remove only the first matching entry per value,
                // in iteration order (verified against the real
                // Skript).
                Map<String, Object> listNode = node(stmt.get("list"));
                Store store = storeFor(listNode, ctx);
                String name = str(listNode.get("name"));
                Object value = evalExpr(node(stmt.get("value")), ctx);
                List<Object> targets = new ArrayList<>();
                spreadInto(targets, value);
                for (Object target : targets) {
                    for (Map.Entry<Object, Object> entry : listEntries(store, name)) {
                        if (valuesEqual(entry.getValue(), target)) {
                            store.set(listBase(name) + "::" + indexSegment(entry.getKey()), null);
                            break;
                        }
                    }
                }
                cont.run();
            }
            case "deleteVar" -> {
                Map<String, Object> target = node(stmt.get("target"));
                Store store = storeFor(target, ctx);
                if ("variableList".equals(kind(target)) || "localVariableList".equals(kind(target))) {
                    // Delete the list's entries; the bare variable
                    // of the same name is a different node and
                    // stays (verified against the real Skript).
                    store.removePrefix(listBase(str(target.get("name"))) + "::");
                } else {
                    store.set(varKey(target, ctx), null);
                }
                cont.run();
            }
            case "loopList" -> {
                // Snapshot the entries: bodies may change the list
                // while it is being visited.
                Map<String, Object> listNode = node(stmt.get("list"));
                loopListStep(stmt, listEntries(storeFor(listNode, ctx), str(listNode.get("name"))), 0, ctx, cont);
            }
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
    // Custom functions (phase 13)
    //
    // Semantics probed against the real Skript 2.17.1 (six rounds of
    // hand-written probe scripts; see the development log):
    //
    // - Calls resolve by signature. Skript resolves statically at
    //   parse time (wrong arity or a wrongly-typed literal is a
    //   parse error; an overload called through an untyped variable
    //   is rejected as ambiguous). The engine resolves at runtime
    //   by the argument values' types, preferring exact-type
    //   parameters over `object` and earlier declarations on ties —
    //   the same observable behavior for every program Skript
    //   accepts with statically-known argument types.
    // - A value whose runtime type does not match its parameter is
    //   not converted: the parameter is simply left unset and the
    //   body still runs. A missing value passed explicitly does the
    //   same and does NOT trigger the default; defaults apply only
    //   to omitted arguments, are evaluated at call time before any
    //   parameter is bound (they can read globals, never the
    //   arguments), in the callee's fresh frame.
    // - Function bodies have no event context (under Skript,
    //   `player` inside a function is a parse error), so the call
    //   frame starts from a blank Ctx.
    // - A wait inside the body detaches the call: the invocation
    //   completes synchronously only when the body finishes without
    //   suspending. When a wait suspends it, the caller resumes
    //   with no value; the detached remainder keeps running through
    //   the delay host, and a return it eventually reaches is
    //   dropped. Under Skript a return after a delay is a load
    //   ERROR ("A return statement after a delay is useless, as
    //   the calling trigger will resume when the delay starts"),
    //   so loadable programs never contain one; the engine accepts
    //   the shape and drops the value, the same net semantics.
    // ------------------------------------------------------------------

    private List<Object> evalArgs(List<Object> argNodes, Ctx ctx) {
        List<Object> out = new ArrayList<>();
        for (Object arg : argNodes) {
            out.add(evalExpr(node(arg), ctx));
        }
        return out;
    }

    /**
     * Invoke a custom function and return its return value (null
     * for no value: a void function, a missing return, a return
     * type mismatch, or a body that suspended at a wait).
     */
    private Object invokeFunction(String name, List<Object> argValues, Ctx callerCtx) {
        Map<String, Object> fn = selectFunction(functions.getOrDefault(name, List.of()), argValues);
        if (fn == null) {
            logger.warning("skript-ts: call to unknown function '" + name + "' or with unmatched arguments");
            return null;
        }
        List<Object> params = list(fn.get("params"));
        // A fresh frame with no event context; parameters become
        // the frame's locals, bound by (lowercased) name.
        Ctx ctx = new Ctx();
        Store locals = localStore(ctx);
        // Defaults are evaluated BEFORE any parameter is bound
        // (probed: a default referencing a parameter does not see
        // the passed value, but globals are readable).
        Map<String, Object> defaults = new LinkedHashMap<>();
        for (int i = 0; i < params.size(); i++) {
            Map<String, Object> p = node(params.get(i));
            if (i >= argValues.size() && p.get("default") instanceof Map<?, ?>) {
                defaults.put(str(p.get("name")), evalExpr(node(p.get("default")), ctx));
            }
        }
        for (int i = 0; i < params.size(); i++) {
            Map<String, Object> p = node(params.get(i));
            String pname = str(p.get("name")).toLowerCase(Locale.ROOT);
            String ptype = str(p.get("type"));
            if (isPluralTypeName(ptype)) {
                // The plural parameter collects every remaining
                // argument value (lists spread); elements of the
                // wrong type are dropped, as a mismatched singular
                // argument leaves its parameter unset.
                List<Object> collected = new ArrayList<>();
                for (int j = i; j < argValues.size(); j++) {
                    spreadInto(collected, argValues.get(j));
                }
                String elementType = baseTypeName(ptype);
                collected.removeIf(v -> !typeMatches(elementType, v));
                assignList(locals, str(p.get("name")), collected.isEmpty() ? null : collected);
            } else if (i < argValues.size()) {
                bindParameter(locals, pname, ptype, argValues.get(i));
            } else if (defaults.containsKey(str(p.get("name")))) {
                bindParameter(locals, pname, ptype, defaults.get(str(p.get("name"))));
            }
            // Otherwise the parameter stays unset.
        }
        boolean[] finished = { false };
        execRange(list(fn.get("body")), 0, ctx, () -> finished[0] = true);
        if (ctx.frame.returned) {
            return checkedReturn(fn, ctx.frame.returnValue);
        }
        // The body either ran to completion without returning, or
        // suspended at a wait (finished stays false and the
        // detached remainder continues on its own): both give the
        // caller no value.
        return null;
    }

    /** Bind one singular parameter: a mismatched or missing value leaves it unset (no conversion). */
    private void bindParameter(Store locals, String pname, String ptype, Object value) {
        Object scalar = scalarValue(value);
        if (scalar != null && typeMatches(ptype, scalar)) {
            locals.set(pname, scalar);
        }
    }

    /**
     * Pick the overload to call: arity must fit (a trailing plural
     * parameter absorbs any number of extra values but needs at
     * least one argument landing on it, and every parameter past
     * the supplied arguments must have a default — both probed:
     * calling with too few or too many arguments is "the function
     * does not exist" under Skript). Among the fitting candidates
     * the best type score wins: exact-type parameters beat
     * `object`, a missing value is neutral (it binds as unset
     * against anything), a mismatch counts against the candidate.
     */
    private Map<String, Object> selectFunction(List<Map<String, Object>> candidates, List<Object> argValues) {
        Map<String, Object> best = null;
        int bestScore = Integer.MIN_VALUE;
        for (Map<String, Object> fn : candidates) {
            Integer score = matchScore(fn, argValues);
            if (score != null && score > bestScore) {
                bestScore = score;
                best = fn;
            }
        }
        return best;
    }

    private Integer matchScore(Map<String, Object> fn, List<Object> argValues) {
        List<Object> params = list(fn.get("params"));
        int n = params.size();
        boolean pluralLast = n > 0 && isPluralTypeName(str(node(params.get(n - 1)).get("type")));
        if (!pluralLast && argValues.size() > n) return null; // too many arguments
        int score = 0;
        for (int i = 0; i < n; i++) {
            Map<String, Object> p = node(params.get(i));
            boolean plural = isPluralTypeName(str(p.get("type")));
            if (i < argValues.size()) {
                if (plural) {
                    for (int j = i; j < argValues.size(); j++) {
                        score += spreadScore(str(p.get("type")), argValues.get(j));
                    }
                } else {
                    score += valueScore(str(p.get("type")), argValues.get(i));
                }
            } else {
                // Nothing lands on this parameter: it needs a
                // default — a plural parameter too (probed: a
                // zero-argument call to a plural-parameter function
                // does not resolve, even though the list could be
                // empty).
                if (!defaultsCover(p, plural)) return null;
            }
        }
        return score;
    }

    private boolean defaultsCover(Map<String, Object> param, boolean plural) {
        return !plural && param.get("default") instanceof Map<?, ?>;
    }

    /** Score one argument value against a singular parameter type: exact 3, object 1, missing 0, mismatch -10. */
    private static int valueScore(String ptype, Object value) {
        if (value == null) return 0;
        if (value instanceof List<?> l) {
            if (l.size() != 1) return -10;
            value = l.get(0);
        }
        if ("object".equals(ptype)) return 1;
        return typeMatches(ptype, value) ? 3 : -10;
    }

    /** Score one argument value against a plural parameter: its elements score against the element type. */
    private static int spreadScore(String ptype, Object value) {
        if (value == null) return 0;
        String elementType = baseTypeName(ptype);
        List<Object> elements = new ArrayList<>();
        spreadInto(elements, value);
        int worst = 3;
        for (Object element : elements) {
            worst = Math.min(worst, valueScore(elementType, element));
        }
        return elements.isEmpty() ? 1 : worst;
    }

    /**
     * Type-check a returned value against the declared return
     * type (probed: a runtime mismatch means the call yields no
     * value). A plural return type wraps a single value into a
     * one-element list and drops mismatched elements; a singular
     * type rejects a multi-value result outright.
     */
    private Object checkedReturn(Map<String, Object> fn, Object value) {
        String rt = str(fn.get("returnType"));
        if (rt == null || value == null) return null;
        if (isPluralTypeName(rt)) {
            List<Object> values = new ArrayList<>();
            spreadInto(values, value);
            String elementType = baseTypeName(rt);
            values.removeIf(v -> !typeMatches(elementType, v));
            return values.isEmpty() ? null : values;
        }
        if (value instanceof List) return null;
        return typeMatches(rt, value) ? value : null;
    }

    private static final Set<String> PLURAL_TYPE_NAMES =
            Set.of("numbers", "texts", "booleans", "players", "locations", "objects");

    private static boolean isPluralTypeName(String type) {
        return type != null && PLURAL_TYPE_NAMES.contains(type);
    }

    /** The singular element type of a function type name ("numbers" -> "number", "number" -> "number"). */
    private static String baseTypeName(String type) {
        return isPluralTypeName(type) ? type.substring(0, type.length() - 1) : type;
    }

    /**
     * Does a runtime value have the given (singular) Skript type?
     * Probed: there are no conversions between the subset's types —
     * a number is not a text, a text is not a number, a boolean is
     * not either; only `object` accepts anything.
     */
    private static boolean typeMatches(String singularType, Object value) {
        if (value == null) return false;
        return switch (singularType) {
            case "number" -> value instanceof Number;
            case "text" -> value instanceof String;
            case "boolean" -> value instanceof Boolean;
            case "player" -> value instanceof Player;
            case "location" -> value instanceof Location;
            case "block" -> value instanceof Block;
            case "item" -> value instanceof ItemStack;
            case "entity" -> value instanceof Entity;
            default -> true; // object, and any type outside the subset's checks
        };
    }

    /**
     * The value of a multi-value result used in a single-value
     * position: the element when there is exactly one, no value
     * otherwise (verified against the real Skript for function
     * results assigned to scalar variables).
     */
    private static Object scalarValue(Object value) {
        if (value instanceof List<?> l) {
            return l.size() == 1 ? l.get(0) : null;
        }
        return value;
    }

    /** Append a value to a list of values, spreading lists (a missing value contributes nothing). */
    private static void spreadInto(List<Object> out, Object value) {
        if (value == null) return;
        if (value instanceof List<?> l) out.addAll(l);
        else out.add(value);
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
            case "contains" -> evalContains(
                    evalExpr(node(cond.get("container")), ctx), evalExpr(node(cond.get("item")), ctx));
            case "startsWith" -> {
                Object target = evalExpr(node(cond.get("target")), ctx);
                Object prefix = evalExpr(node(cond.get("prefix")), ctx);
                yield target instanceof String s && prefix instanceof String p && s.startsWith(p);
            }
            case "endsWith" -> {
                Object target = evalExpr(node(cond.get("target")), ctx);
                Object suffix = evalExpr(node(cond.get("suffix")), ctx);
                yield target instanceof String s && suffix instanceof String p && s.endsWith(p);
            }
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
     * The contains condition (phase 15), as probed against the
     * real Skript 2.17.1: on texts it is a case-INSENSITIVE
     * substring test (an empty part is always contained) — the
     * asymmetry with the case-sensitive startsWith / endsWith
     * conditions is the original's own. On a list container it is
     * element membership under valuesEqual. A missing operand, or
     * a non-text item for a text container, is false.
     */
    private static boolean evalContains(Object container, Object item) {
        if (container == null || item == null) return false;
        if (container instanceof List<?> list) {
            for (Object el : list) {
                if (valuesEqual(el, item)) return true;
            }
            return false;
        }
        if (container instanceof String s && item instanceof String p) {
            return s.toLowerCase(Locale.ROOT).contains(p.toLowerCase(Locale.ROOT));
        }
        return false;
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
        // Blocks and items compare by type against the subset's
        // text-form item literals ("dirt", "grass block" — the
        // `item` expression evaluates to its name as a String):
        // `type of event-block is dirt` goes through typeOf, but a
        // direct `event-item is dirt` must agree with Skript too.
        String aType = typeNameOf(a);
        String bType = typeNameOf(b);
        if (aType != null && b instanceof String sb) return aType.equalsIgnoreCase(sb);
        if (bType != null && a instanceof String sa) return bType.equalsIgnoreCase(sa);
        if (a instanceof Block ba && b instanceof Block bb) {
            return ba.getType() == bb.getType()
                    && ba.getX() == bb.getX() && ba.getY() == bb.getY() && ba.getZ() == bb.getZ()
                    && ba.getWorld().equals(bb.getWorld());
        }
        if (a instanceof ItemStack ia && b instanceof ItemStack ib) {
            return ia.getType() == ib.getType() && ia.getAmount() == ib.getAmount();
        }
        if (a.getClass() != b.getClass()) return false;
        return a.equals(b);
    }

    /**
     * The Skript type name of a gameplay value, or null when the
     * value has no type name in this subset: a block or an item
     * reads as its material ("grass block", "dirt"), an entity as
     * its kind ("zombie"; players read "player"). Type names are
     * the lowercase, space-separated form Skript prints and its
     * item literals use.
     */
    static String typeNameOf(Object value) {
        if (value instanceof Block block) return materialName(block.getType());
        if (value instanceof ItemStack stack) return materialName(stack.getType());
        if (value instanceof Player) return "player";
        if (value instanceof Entity entity) {
            return entity.getType().name().toLowerCase(Locale.ROOT).replace('_', ' ');
        }
        if (value instanceof Number) return "number";
        if (value instanceof String) return "text";
        if (value instanceof Boolean) return "boolean";
        if (value instanceof Location) return "location";
        if (value instanceof World) return "world";
        return null;
    }

    /** A Bukkit material in Skript's printed form: GRASS_BLOCK -> "grass block". */
    private static String materialName(Material material) {
        return material.name().toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    /**
     * A damage cause in Skript's printed form. Most causes read
     * as their lowercase name ("fall", "lava", "drowning"), but
     * Skript's names are not a mechanical transform of Bukkit's:
     * ENTITY_ATTACK prints as "attack" (verified live against the
     * real Skript 2.17.1) and FIRE_TICK as "burning" (the form
     * Skript's own documentation examples use). Only "attack" is
     * pinned by a behavior test in this subset.
     */
    private static String damageCauseName(EntityDamageEvent.DamageCause cause) {
        return switch (cause) {
            case ENTITY_ATTACK -> "attack";
            case FIRE_TICK -> "burning";
            default -> cause.name().toLowerCase(Locale.ROOT).replace('_', ' ');
        };
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
            case "variableList" -> listValue(globalStore(), str(expr.get("name")));
            case "localVariable" -> localStore(ctx).get(varKey(expr, ctx));
            case "localVariableList" -> listValue(localStore(ctx), str(expr.get("name")));
            case "listSize" -> {
                Map<String, Object> listNode = node(expr.get("list"));
                yield (double) listEntries(storeFor(listNode, ctx), str(listNode.get("name"))).size();
            }
            case "functionCall" ->
                invokeFunction(str(expr.get("name")), evalArgs(list(expr.get("args")), ctx), ctx);
            case "loopValue" -> ctx.loopValue;
            case "loopIndex" -> ctx.loopIndex;
            case "string" -> {
                // String literals are color-parsed, as in Skript:
                // a literal's & codes and named tags become real
                // formatting when the literal is written (2.17
                // parses literals into components). Values that
                // arrive at runtime (chat text, computed strings)
                // are NOT parsed — only literals are.
                String v = str(expr.get("value"));
                yield v == null ? null : colorize(v);
            }
            case "number" -> num(expr.get("value"));
            case "boolean" -> Boolean.TRUE.equals(expr.get("value"));
            case "item" -> str(expr.get("name"));
            case "locationOf" -> {
                Object target = evalExpr(node(expr.get("target")), ctx);
                if (target instanceof Player p) yield p.getLocation();
                if (target instanceof Block b) yield b.getLocation();
                if (target instanceof Entity e) yield e.getLocation();
                yield null;
            }
            case "eventBlock" -> ctx.eventBlock;
            case "eventItem" -> ctx.eventItem;
            case "clickedEntity" -> ctx.clickedEntity;
            case "attacker" -> ctx.attacker;
            case "damageAmount" -> ctx.damageEvent == null ? null : ctx.damageEvent.getDamage();
            case "damageCause" -> ctx.damageEvent == null
                    ? null
                    : damageCauseName(ctx.damageEvent.getCause());
            case "typeOf" -> {
                Object target = evalExpr(node(expr.get("target")), ctx);
                yield target == null ? null : typeNameOf(target);
            }
            case "textLength" -> mapText(evalExpr(node(expr.get("target")), ctx),
                    s -> (double) s.length());
            case "substring" -> {
                Object from = evalExpr(node(expr.get("from")), ctx);
                Object to = evalExpr(node(expr.get("to")), ctx);
                if (!(from instanceof Number f) || !(to instanceof Number t)) yield null;
                yield mapText(evalExpr(node(expr.get("target")), ctx),
                        s -> substringOf(s, f.doubleValue(), t.doubleValue()));
            }
            case "firstChars" -> {
                Object count = evalExpr(node(expr.get("count")), ctx);
                if (!(count instanceof Number c)) yield null;
                yield mapText(evalExpr(node(expr.get("target")), ctx),
                        s -> substringOf(s, 1, c.doubleValue()));
            }
            case "lastChars" -> {
                Object count = evalExpr(node(expr.get("count")), ctx);
                if (!(count instanceof Number c)) yield null;
                yield mapText(evalExpr(node(expr.get("target")), ctx),
                        s -> substringOf(s, (double) s.length() - c.doubleValue() + 1, s.length()));
            }
            case "charAt" -> {
                Object index = evalExpr(node(expr.get("index")), ctx);
                if (!(index instanceof Number n)) yield null;
                long i = (long) n.doubleValue();
                yield mapText(evalExpr(node(expr.get("target")), ctx),
                        s -> i >= 1 && i <= s.length() ? s.substring((int) i - 1, (int) i) : null);
            }
            case "upperCase" -> mapText(evalExpr(node(expr.get("target")), ctx),
                    s -> s.toUpperCase(Locale.ROOT));
            case "lowerCase" -> mapText(evalExpr(node(expr.get("target")), ctx),
                    s -> s.toLowerCase(Locale.ROOT));
            case "splitText" -> {
                Object delim = evalExpr(node(expr.get("delimiter")), ctx);
                if (!(delim instanceof String d)) yield null;
                boolean sensitive = Boolean.TRUE.equals(expr.get("caseSensitive"));
                Object target = evalExpr(node(expr.get("target")), ctx);
                if (target instanceof String s) yield splitString(s, d, sensitive);
                if (target instanceof List<?> list) {
                    List<Object> out = new ArrayList<>();
                    for (Object el : list) {
                        if (el instanceof String s) out.addAll(splitString(s, d, sensitive));
                    }
                    yield out.isEmpty() ? null : out;
                }
                yield null;
            }
            case "joinText" -> {
                Object source = evalExpr(node(expr.get("source")), ctx);
                String delim = "";
                if (expr.get("delimiter") != null) {
                    Object d = evalExpr(node(expr.get("delimiter")), ctx);
                    if (!(d instanceof String ds)) yield null;
                    delim = ds;
                }
                List<?> elements = source instanceof List<?> l ? l
                        : source == null ? List.of() : List.of(source);
                List<String> parts = new ArrayList<>();
                for (Object el : elements) {
                    if (el instanceof String s) parts.add(s);
                    else if (el instanceof Player p) parts.add(p.getName());
                }
                yield parts.isEmpty() ? null : String.join(delim, parts);
            }
            case "coloredText", "formattedText" ->
                mapText(evalExpr(node(expr.get("target")), ctx), Engine::colorize);
            case "uncoloredText", "unformattedText" ->
                mapText(evalExpr(node(expr.get("target")), ctx), Engine::stripColors);
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
     *
     * <p>A MISSING operand is not a wrong-typed one (phase-13
     * probes): for the four infix operators, a missing operand
     * with a number on the other side counts as 0 — unset + 100
     * is 100, unset * 2 is 0, 5 / unset is Infinity. With a text
     * or boolean partner, or with both sides missing, the result
     * has no value. mod() does not substitute: a missing operand
     * makes it valueless.
     */
    private static Object evalArith(String op, Object a, Object b) {
        if (!"mod".equals(op)) {
            if (a == null && b instanceof Number) a = 0.0;
            else if (b == null && a instanceof Number) b = 0.0;
        }
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
    // Text operations (phase 15)
    // ------------------------------------------------------------------

    /**
     * Apply a text function to a value: a text maps directly; a
     * list maps its text elements element-wise, dropping elements
     * that are not texts and results that have no value (an
     * all-empty mapping has no value) — the plural %texts%
     * behavior of the original. Anything else has no value.
     */
    private static Object mapText(Object value, Function<String, Object> f) {
        if (value instanceof String s) return f.apply(s);
        if (value instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object el : list) {
                if (el instanceof String s) {
                    Object r = f.apply(s);
                    if (r != null) out.add(r);
                }
            }
            return out.isEmpty() ? null : out;
        }
        return null;
    }

    /**
     * The fitted substring (probed): `from` is clamped UP to 1 and
     * `to` DOWN to the length; when the fitted from exceeds the
     * fitted to there is no value. Indices count UTF-16 code
     * units, like Java strings — an emoji is 2. Arguments are
     * truncated toward zero, the engine's usual numeric coercion.
     */
    private static String substringOf(String s, double from, double to) {
        long f = Math.max((long) from, 1L);
        long t = Math.min((long) to, (long) s.length());
        if (f > t) return null;
        return s.substring((int) f - 1, (int) t);
    }

    /** Index of a literal (never regex) match at or after `from`, or -1. */
    private static int indexOfLiteral(String text, String delim, int from, boolean caseSensitive) {
        int max = text.length() - delim.length();
        for (int i = Math.max(from, 0); i <= max; i++) {
            if (text.regionMatches(!caseSensitive, i, delim, 0, delim.length())) return i;
        }
        return -1;
    }

    /**
     * Split with the probed semantics: the delimiter matches
     * literally and case-insensitively unless caseSensitive; the
     * trailing empty part is kept (so "a,b,,c," is 5 parts); a
     * text without the delimiter is one part; an empty text is one
     * empty part; an empty delimiter yields one part per character
     * plus a trailing empty part.
     */
    private static List<Object> splitString(String text, String delim, boolean caseSensitive) {
        List<Object> out = new ArrayList<>();
        if (delim.isEmpty()) {
            for (int i = 0; i < text.length(); i++) out.add(text.substring(i, i + 1));
            out.add("");
            return out;
        }
        int pos = 0;
        while (true) {
            int hit = indexOfLiteral(text, delim, pos, caseSensitive);
            if (hit < 0) break;
            out.add(text.substring(pos, hit));
            pos = hit + delim.length();
        }
        out.add(text.substring(pos));
        return out;
    }

    /**
     * Literal replace with the probed semantics: matching is
     * case-insensitive unless caseSensitive, the replacement is
     * used verbatim ("$1" and "\" stay literal), and an empty
     * search text inserts the replacement at every gap (all) or
     * only at the start (first).
     */
    private static String replaceText(String text, String find, String repl,
                                      boolean firstOnly, boolean caseSensitive) {
        if (find.isEmpty()) {
            if (firstOnly) return repl + text;
            StringBuilder sb = new StringBuilder();
            sb.append(repl);
            for (int i = 0; i < text.length(); i++) sb.append(text.charAt(i)).append(repl);
            return sb.toString();
        }
        StringBuilder sb = new StringBuilder();
        int pos = 0;
        while (true) {
            int hit = indexOfLiteral(text, find, pos, caseSensitive);
            if (hit < 0) break;
            sb.append(text, pos, hit).append(repl);
            pos = hit + find.length();
            if (firstOnly) break;
        }
        sb.append(text, pos, text.length());
        return sb.toString();
    }

    // ------------------------------------------------------------------
    // Color parsing (phase 15)
    //
    // Skript 2.17 texts are components: literals, `colored` and
    // `formatted` all parse & codes and MiniMessage-style tags.
    // This engine's values are legacy-coded strings, so parsing
    // converts to § codes: & + a valid code char becomes § + the
    // lowercased code (the &x hex sequence falls out of the same
    // rule), and tags map through the tables below with a style
    // stack, so a closing tag restores the formatting that was
    // active outside it (a §r plus the surviving codes — the
    // legacy encoding of the component tree). Unknown tags,
    // stray closing tags and the &#RRGGBB form stay literal
    // text (all probed). Formatting codes at the very end of a
    // text format no characters and are dropped, which keeps a
    // parsed value equal to the equivalent hand-written § literal.
    // ------------------------------------------------------------------

    /** The sixteen named colors as legacy code chars. */
    private static final Map<String, Character> COLOR_TAGS = Map.ofEntries(
            Map.entry("black", '0'), Map.entry("dark_blue", '1'),
            Map.entry("dark_green", '2'), Map.entry("dark_aqua", '3'),
            Map.entry("dark_red", '4'), Map.entry("dark_purple", '5'),
            Map.entry("gold", '6'), Map.entry("gray", '7'),
            Map.entry("dark_gray", '8'), Map.entry("blue", '9'),
            Map.entry("green", 'a'), Map.entry("aqua", 'b'),
            Map.entry("red", 'c'), Map.entry("light_purple", 'd'),
            Map.entry("yellow", 'e'), Map.entry("white", 'f'));

    /** The named styles (and their MiniMessage aliases) as legacy code chars. */
    private static final Map<String, Character> STYLE_TAGS = Map.ofEntries(
            Map.entry("bold", 'l'), Map.entry("b", 'l'),
            Map.entry("italic", 'o'), Map.entry("i", 'o'), Map.entry("em", 'o'),
            Map.entry("underlined", 'n'), Map.entry("u", 'n'),
            Map.entry("strikethrough", 'm'), Map.entry("st", 'm'),
            Map.entry("obfuscated", 'k'), Map.entry("obf", 'k'));

    private static boolean isCodeChar(char c) {
        return "0123456789abcdefklmnorx".indexOf(Character.toLowerCase(c)) >= 0;
    }

    /** One open tag on the color parser's stack. */
    private record TagFrame(String name, boolean color, char code) {}

    /** Mutable style state for one colorize pass. */
    private static final class ColorState {
        Character color = null;
        final LinkedHashSet<Character> styles = new LinkedHashSet<>();
        final List<TagFrame> stack = new ArrayList<>();

        /** Recompute color/styles from the surviving stack frames. */
        void recompute() {
            color = null;
            styles.clear();
            for (TagFrame f : stack) {
                if (f.color()) color = f.code();
                else styles.add(f.code());
            }
        }

        /** Append the legacy encoding of the full state: §r, then the color, then the styles. */
        void emitState(StringBuilder out) {
            out.append('§').append('r');
            if (color != null) out.append('§').append(color.charValue());
            for (char s : styles) out.append('§').append(s);
        }
    }

    /** Parse & codes and named tags in a text into § formatting codes. */
    static String colorize(String s) {
        StringBuilder out = new StringBuilder();
        ColorState state = new ColorState();
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == '&' && i + 1 < s.length() && isCodeChar(s.charAt(i + 1))) {
                out.append('§').append(Character.toLowerCase(s.charAt(i + 1)));
                i += 2;
                continue;
            }
            if (c == '<') {
                int end = s.indexOf('>', i);
                if (end > i + 1 && applyTag(s.substring(i + 1, end), state, out)) {
                    i = end + 1;
                    continue;
                }
            }
            out.append(c);
            i++;
        }
        return stripTrailingCodes(out.toString());
    }

    /**
     * Apply one tag (the text between < and >) to the parser
     * state, appending any § codes to out. Returns false when the
     * tag is not one this parser handles — the caller then keeps
     * it as literal text, as the original does for unknown tags
     * and stray closing tags.
     */
    private static boolean applyTag(String tag, ColorState state, StringBuilder out) {
        String name = tag.toLowerCase(Locale.ROOT);
        if (name.startsWith("/")) {
            String base = name.substring(1);
            int colon = base.indexOf(':');
            if (colon >= 0) base = base.substring(0, colon);
            int at = -1;
            for (int j = state.stack.size() - 1; j >= 0; j--) {
                if (state.stack.get(j).name().equals(base)) {
                    at = j;
                    break;
                }
            }
            if (at < 0) return false; // stray closing tag: literal text
            Character oldColor = state.color;
            Set<Character> oldStyles = new LinkedHashSet<>(state.styles);
            state.stack.subList(at, state.stack.size()).clear();
            state.recompute();
            if (!java.util.Objects.equals(oldColor, state.color) || !oldStyles.equals(state.styles)) {
                state.emitState(out);
            }
            return true;
        }
        if (name.equals("reset")) {
            state.stack.clear();
            state.color = null;
            state.styles.clear();
            out.append('§').append('r');
            return true;
        }
        int colon = name.indexOf(':');
        if (colon >= 0) {
            // Only <color:name> / <colour:name> are handled;
            // richer tags (gradient, click, ...) stay literal.
            String head = name.substring(0, colon);
            if (!head.equals("color") && !head.equals("colour")) return false;
            Character code = COLOR_TAGS.get(name.substring(colon + 1));
            if (code == null) return false;
            openTag(state, out, head, true, code);
            return true;
        }
        Character color = COLOR_TAGS.get(name);
        if (color != null) {
            openTag(state, out, name, true, color);
            return true;
        }
        Character style = STYLE_TAGS.get(name);
        if (style != null) {
            openTag(state, out, name, false, style);
            return true;
        }
        return false;
    }

    /** Open a color or style tag: update the state and emit what changed. */
    private static void openTag(ColorState state, StringBuilder out, String name, boolean isColor, char code) {
        state.stack.add(new TagFrame(name, isColor, code));
        if (isColor) {
            if (state.color == null || state.color.charValue() != code) {
                state.color = code;
                out.append('§').append(code);
                // A legacy color code clears styles on the client;
                // re-assert the active ones so the tag's meaning
                // (color ADDED to the current styles) survives.
                for (char s : state.styles) out.append('§').append(s);
            }
        } else if (state.styles.add(code)) {
            out.append('§').append(code);
        }
    }

    /** Drop the § codes at the very end of a text: they format no characters. */
    private static String stripTrailingCodes(String s) {
        int end = s.length();
        while (end >= 2 && s.charAt(end - 2) == '§' && isCodeChar(s.charAt(end - 1))) end -= 2;
        if (end == s.length()) return s;
        return s.substring(0, end);
    }

    /** Remove every § formatting code (a § plus a valid code char, Bukkit's stripColor rule). */
    static String stripColors(String s) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '§' && i + 1 < s.length() && isCodeChar(s.charAt(i + 1))) {
                i++;
                continue;
            }
            out.append(c);
        }
        return out.toString();
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
            case "string" -> {
                // A literal in text position is color-parsed,
                // like any other string literal (see evalExpr).
                String v = str(text.get("value"));
                yield v == null ? null : colorize(v);
            }
            case "format" -> renderParts(list(text.get("parts")), ctx);
            default -> stringify(evalExpr(text, ctx));
        };
    }

    private String renderParts(List<Object> parts, Ctx ctx) {
        StringBuilder sb = new StringBuilder();
        for (Object part : parts) {
            if (part instanceof String s) {
                // Literal parts of a format are string literals:
                // color-parsed like any other (see evalExpr).
                sb.append(colorize(s));
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
        if (value instanceof Block block) return materialName(block.getType());
        if (value instanceof ItemStack stack) return materialName(stack.getType());
        if (value instanceof Entity entity) return typeNameOf(entity);
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
    private List<Map.Entry<Object, Object>> listEntries(Store store, String rawName) {
        String prefix = listBase(rawName) + "::";
        List<Map.Entry<Object, Object>> out = new ArrayList<>();
        for (String key : store.keysWithPrefix(prefix)) {
            Object index = decodeIndex(key.substring(prefix.length()));
            out.add(new AbstractMap.SimpleEntry<>(index, store.get(key)));
        }
        out.sort((a, b) -> compareIndices(a.getKey(), b.getKey()));
        return out;
    }

    /**
     * A whole list as a value: its entries' values in iteration
     * order, snapshotted; an empty (or unset) list has no value,
     * like any other missing value in Skript.
     */
    private Object listValue(Store store, String rawName) {
        List<Object> values = new ArrayList<>();
        for (Map.Entry<Object, Object> entry : listEntries(store, rawName)) {
            values.add(entry.getValue());
        }
        return values.isEmpty() ? null : values;
    }

    /**
     * Replace a whole list with a value (whole-list assignment and
     * plural-parameter binding): the old entries are cleared and
     * the new values land at indices 1..n in iteration order — a
     * scalar becomes a one-element list and no value just clears
     * (all verified against the real Skript 2.17.1, including for
     * list-valued function results, whose holes are renumbered).
     */
    private void assignList(Store store, String rawName, Object value) {
        store.removePrefix(listBase(rawName) + "::");
        if (value == null) return;
        List<?> values = value instanceof List<?> l ? l : List.of(value);
        int i = 1;
        for (Object v : values) {
            if (v != null) store.set(listBase(rawName) + "::" + i, v);
            i++;
        }
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
    private int nextListIndex(Store store, String rawName) {
        Set<Double> used = new HashSet<>();
        for (Map.Entry<Object, Object> entry : listEntries(store, rawName)) {
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
