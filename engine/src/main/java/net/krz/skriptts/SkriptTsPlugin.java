package net.krz.skriptts;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandMap;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * skript-ts engine plugin: loads IR programs (`.ir.json`, produced by
 * the TypeScript build) from `plugins/skript-ts/scripts/` and executes
 * them directly on Paper. The Skript plugin is not involved.
 *
 * Load summary lines are part of the verify contract with the CLI:
 *   Loaded N script(s), M top-level structure(s)
 * and per-file failures are logged as "Failed to load <file>: ...".
 */
public final class SkriptTsPlugin extends JavaPlugin implements Listener {

    private Variables variables;
    private Engine engine;
    private WebSockets websockets;
    private Timers timers;
    private Database database;
    private final List<Command> registeredCommands = new ArrayList<>();

    @Override
    public void onEnable() {
        Path dataDir = getDataFolder().toPath();
        variables = new Variables(dataDir.resolve("variables.json"), getLogger());
        variables.load();
        engine = new Engine(variables, getLogger());
        websockets = new WebSockets(new WebSockets.Events() {
            @Override
            public void onOpen(String id) {
                fireWsEvent("wsOpen", id, null);
            }

            @Override
            public void onMessage(String id, String text) {
                fireWsEvent("wsMessage", id, text);
            }

            @Override
            public void onClose(String id) {
                fireWsEvent("wsClose", id, null);
            }

            @Override
            public void onError(String id, String message) {
                getLogger().warning("websocket '" + id + "' error: " + message);
            }
        }, getLogger());
        engine.setWsHost(new Engine.WsHost() {
            @Override
            public void connect(String id, String url) {
                websockets.connect(id, url);
            }

            @Override
            public void send(String id, String text) {
                websockets.send(id, text);
            }

            @Override
            public void disconnect(String id) {
                websockets.disconnect(id);
            }
        });
        timers = new Timers(this, new Timers.Events() {
            @Override
            public void onTick(String id, double timeLeft) {
                fireTimerEvent("timerTick", id);
            }

            @Override
            public void onComplete(String id) {
                fireTimerEvent("timerComplete", id);
            }
        }, getLogger());
        engine.setTimerHost(new Engine.TimerHost() {
            @Override
            public void create(String id, double seconds) {
                timers.create(id, seconds);
            }

            @Override
            public void stop(String id) {
                timers.stop(id);
            }

            @Override
            public void pause(String id) {
                timers.pause(id);
            }

            @Override
            public void resume(String id) {
                timers.resume(id);
            }

            @Override
            public boolean isActive(String id) {
                return timers.isActive(id);
            }

            @Override
            public Double timeLeft(String id) {
                return timers.timeLeft(id);
            }
        });
        timers.start();
        database = new Database(variables, dataDir, getLogger());
        engine.setDatabase(database);
        loadScripts();
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("skript-ts engine enabled");
    }

    @Override
    public void onDisable() {
        unregisterScriptCommands();
        if (timers != null) timers.shutdown();
        if (websockets != null) websockets.closeAll();
        if (variables != null) variables.save();
    }

    /**
     * Timer callbacks arrive on the server main thread (the manager is
     * driven by the Bukkit scheduler), so unlike websocket events they
     * need no thread hop before running script bodies.
     */
    private void fireTimerEvent(String event, String id) {
        Engine.Ctx ctx = new Engine.Ctx();
        ctx.timerId = id;
        engine.fireEvent(event, ctx, false);
    }

    /**
     * WebSocket callbacks arrive on IO threads; script bodies belong on
     * the main thread (same discipline as the chat handler).
     */
    private void fireWsEvent(String event, String id, String text) {
        getServer().getScheduler().runTask(this, () -> {
            Engine.Ctx ctx = new Engine.Ctx();
            ctx.wsId = id;
            ctx.wsText = text;
            engine.fireEvent(event, ctx, false);
        });
    }

    /** Control command from plugin.yml: `/skript-ts reload` re-reads the IR scripts folder. */
    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length >= 1 && args[0].equalsIgnoreCase("reload")) {
            loadScripts();
            sender.sendMessage("skript-ts: scripts reloaded");
            return true;
        }
        sender.sendMessage("usage: /skript-ts reload");
        return true;
    }

    // ------------------------------------------------------------------
    // Script loading
    // ------------------------------------------------------------------

    synchronized void loadScripts() {
        // A reload replaces the program; timers created by the old
        // program would fire into handlers that may no longer exist,
        // so they are dropped (documented phase 7 semantics).
        if (timers != null) timers.clearAll();
        Path dir = getDataFolder().toPath().resolve("scripts");
        List<Map<String, Object>> tops = new ArrayList<>();
        int scripts = 0;
        int structures = 0;
        try {
            Files.createDirectories(dir);
            List<Path> files;
            try (Stream<Path> stream = Files.list(dir)) {
                files = stream
                        .filter(p -> p.getFileName().toString().endsWith(".ir.json"))
                        .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                        .toList();
            }
            for (Path file : files) {
                String name = file.getFileName().toString();
                try {
                    Object parsed = Json.parse(Files.readString(file, StandardCharsets.UTF_8));
                    if (!(parsed instanceof Map<?, ?> root) || !"script".equals(root.get("kind"))) {
                        throw new IllegalArgumentException("root node is not a script");
                    }
                    Object body = root.get("body");
                    if (!(body instanceof List<?> bodyList)) {
                        throw new IllegalArgumentException("script body is not a list");
                    }
                    for (Object top : bodyList) {
                        if (top instanceof Map<?, ?>) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> topNode = (Map<String, Object>) top;
                            tops.add(topNode);
                            structures++;
                        }
                    }
                    scripts++;
                } catch (Exception e) {
                    getLogger().severe("Failed to load " + name + ": " + e.getMessage());
                }
            }
        } catch (IOException e) {
            getLogger().severe("Failed to read scripts folder " + dir + ": " + e.getMessage());
        }
        engine.setProgram(tops);
        reregisterScriptCommands(tops);
        getLogger().info("Loaded " + scripts + " script(s), " + structures + " top-level structure(s)");
    }

    private void reregisterScriptCommands(List<Map<String, Object>> tops) {
        unregisterScriptCommands();
        CommandMap commandMap = getServer().getCommandMap();
        for (Map<String, Object> top : tops) {
            if (!"command".equals(top.get("kind"))) continue;
            ScriptCommand cmd = new ScriptCommand(engine, top);
            commandMap.register("skript-ts", cmd);
            registeredCommands.add(cmd);
        }
    }

    private void unregisterScriptCommands() {
        if (registeredCommands.isEmpty()) return;
        CommandMap commandMap = getServer().getCommandMap();
        Map<String, Command> known = commandMap.getKnownCommands();
        for (Command cmd : registeredCommands) {
            known.values().removeIf(v -> v == cmd);
            cmd.unregister(commandMap);
        }
        registeredCommands.clear();
    }

    // ------------------------------------------------------------------
    // Bukkit events -> engine events
    // ------------------------------------------------------------------

    private static Engine.Ctx baseCtx(Player player) {
        Engine.Ctx ctx = new Engine.Ctx();
        ctx.player = player;
        ctx.eventPlayer = player;
        return ctx;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        engine.fireEvent("join", baseCtx(player), !player.hasPlayedBefore());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        engine.fireEvent("quit", baseCtx(event.getPlayer()), false);
    }

    @EventHandler
    public void onChat(AsyncChatEvent event) {
        // Chat is async; script effects (messages, inventory, teleports)
        // belong on the main thread, so capture the plain data and hop.
        Player player = event.getPlayer();
        String message = PlainTextComponentSerializer.plainText().serialize(event.message());
        getServer().getScheduler().runTask(this, () -> {
            Engine.Ctx ctx = baseCtx(player);
            ctx.chatMessage = message;
            engine.fireEvent("chat", ctx, false);
        });
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();
        Engine.Ctx ctx = baseCtx(player);
        ctx.victim = player;
        engine.fireEvent("death", ctx, false);
    }
}
