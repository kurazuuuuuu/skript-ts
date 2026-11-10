package net.krz.skriptts;

import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
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
 */
final class Engine {

    /** Execution context: the entities and data the running code is attached to. */
    static final class Ctx {
        Player player;      // "player": event player, or the command executor
        Player eventPlayer; // "event-player"
        Player loopPlayer;  // "loop-player" inside loop all players
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
        for (Object stmt : body) {
            if (stmt instanceof Map<?, ?>) execStmt(node(stmt), ctx);
        }
    }

    private void execStmt(Map<String, Object> stmt, Ctx ctx) {
        switch (kind(stmt)) {
            case "send" -> {
                if (evalExpr(node(stmt.get("target")), ctx) instanceof Player target) {
                    target.sendMessage(renderText(node(stmt.get("message")), ctx));
                }
            }
            case "broadcast" ->
                Bukkit.getServer().broadcast(Component.text(renderText(node(stmt.get("message")), ctx)));
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
            }
            case "teleport" -> {
                Object target = evalExpr(node(stmt.get("target")), ctx);
                Object loc = evalExpr(node(stmt.get("location")), ctx);
                if (target instanceof Player p && loc instanceof Location l) {
                    p.teleport(l);
                }
            }
            case "setVar" ->
                variables.set(varKey(node(stmt.get("variable")), ctx), evalExpr(node(stmt.get("value")), ctx));
            case "addVar" -> {
                Object v = evalExpr(node(stmt.get("value")), ctx);
                if (v instanceof Number n) {
                    variables.add(varKey(node(stmt.get("variable")), ctx), n.doubleValue());
                }
            }
            case "if" -> {
                if (evalCond(node(stmt.get("cond")), ctx)) {
                    execBlock(list(stmt.get("then")), ctx);
                } else if (stmt.get("else") != null) {
                    execBlock(list(stmt.get("else")), ctx);
                }
            }
            case "loopPlayers" -> {
                // Snapshot: bodies may change the online set (kicks, quits).
                for (Player p : new ArrayList<>(Bukkit.getOnlinePlayers())) {
                    Ctx inner = ctx.copy();
                    inner.loopPlayer = p;
                    execBlock(list(stmt.get("body")), inner);
                }
            }
            case "wsConnect" -> {
                if (wsHost == null) {
                    logger.warning("skript-ts: wsConnect without a websocket host installed");
                } else {
                    wsHost.connect(str(stmt.get("id")), renderText(node(stmt.get("url")), ctx));
                }
            }
            case "wsSend" -> {
                if (wsHost == null) {
                    logger.warning("skript-ts: wsSend without a websocket host installed");
                } else {
                    wsHost.send(str(stmt.get("id")), renderText(node(stmt.get("message")), ctx));
                }
            }
            case "wsDisconnect" -> {
                if (wsHost == null) {
                    logger.warning("skript-ts: wsDisconnect without a websocket host installed");
                } else {
                    wsHost.disconnect(str(stmt.get("id")));
                }
            }
            case "setBorderSize" -> {
                Object w = evalExpr(node(stmt.get("world")), ctx);
                Object size = evalExpr(node(stmt.get("size")), ctx);
                if (w instanceof World world && size instanceof Number n) {
                    world.getWorldBorder().setSize(n.doubleValue());
                }
            }
            case "setBorderCenter" -> {
                Object w = evalExpr(node(stmt.get("world")), ctx);
                Object center = evalExpr(node(stmt.get("center")), ctx);
                if (w instanceof World world && center instanceof Location loc) {
                    world.getWorldBorder().setCenter(loc);
                }
            }
            case "timerCreate" -> {
                if (timerHost == null) {
                    logger.warning("skript-ts: timerCreate without a timer host installed");
                } else if (evalExpr(node(stmt.get("seconds")), ctx) instanceof Number n) {
                    timerHost.create(str(stmt.get("id")), n.doubleValue());
                }
            }
            case "timerStop" -> {
                if (timerHost == null) {
                    logger.warning("skript-ts: timerStop without a timer host installed");
                } else {
                    timerHost.stop(str(stmt.get("id")));
                }
            }
            case "timerPause" -> {
                if (timerHost == null) {
                    logger.warning("skript-ts: timerPause without a timer host installed");
                } else {
                    timerHost.pause(str(stmt.get("id")));
                }
            }
            case "timerResume" -> {
                if (timerHost == null) {
                    logger.warning("skript-ts: timerResume without a timer host installed");
                } else {
                    timerHost.resume(str(stmt.get("id")));
                }
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
            }
            case "fileCreate" -> {
                if (files == null) {
                    logger.warning("skript-ts: fileCreate without a file helper installed");
                } else {
                    files.createFile(renderText(node(stmt.get("path")), ctx));
                }
            }
            case "dirCreate" -> {
                if (files == null) {
                    logger.warning("skript-ts: dirCreate without a file helper installed");
                } else {
                    files.createDirectory(renderText(node(stmt.get("path")), ctx));
                }
            }
            case "fileDelete" -> {
                if (files == null) {
                    logger.warning("skript-ts: fileDelete without a file helper installed");
                } else {
                    files.delete(renderText(node(stmt.get("path")), ctx));
                }
            }
            case "fileWrite" -> {
                if (files == null) {
                    logger.warning("skript-ts: fileWrite without a file helper installed");
                } else {
                    files.write(renderText(node(stmt.get("path")), ctx), renderText(node(stmt.get("text")), ctx));
                }
            }
            case "fileAppend" -> {
                if (files == null) {
                    logger.warning("skript-ts: fileAppend without a file helper installed");
                } else {
                    files.appendLine(renderText(node(stmt.get("path")), ctx), renderText(node(stmt.get("text")), ctx));
                }
            }
            case "setPlaceholderResult" ->
                // Only meaningful while a placeholder request is being
                // served; anywhere else the value is simply dropped.
                ctx.papiResult = renderText(node(stmt.get("text")), ctx);
            default -> logger.warning("skript-ts: unknown statement kind '" + kind(stmt) + "'");
        }
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
            case "format" -> renderParts(list(expr.get("parts")), ctx);
            default -> {
                logger.warning("skript-ts: unknown expression kind '" + kind(expr) + "'");
                yield null;
            }
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
                sb.append(stringify(evalExpr(node(part), ctx)));
            }
        }
        return sb.toString();
    }

    /** String form of a value inside messages and variable indices. */
    static String stringify(Object value) {
        if (value == null) return "";
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

    /** Variable storage key: "name" or "name::index" with the index in its string form. */
    private String varKey(Map<String, Object> varNode, Ctx ctx) {
        String name = str(varNode.get("name"));
        Object index = varNode.get("index");
        if (index == null) return name;
        return name + "::" + stringify(evalExpr(node(index), ctx));
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
