package net.krz.skriptts;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandMap;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.EntityDropItemEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.Material;
import org.bukkit.event.inventory.ClickType;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.player.PlayerBedEnterEvent;
import org.bukkit.event.player.PlayerBedLeaveEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.player.PlayerItemConsumeEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;
import org.bukkit.event.player.PlayerToggleSneakEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
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
    private Urls urls;
    private Cloudflare cloudflare;
    private Timers timers;
    private Placeholders placeholders;
    private Database database;
    // Fully qualified: this class imports java.nio.file.Files for
    // script loading, which shadows the engine's own Files helper.
    private net.krz.skriptts.Files files;
    private final List<Command> registeredCommands = new ArrayList<>();
    // Repeating scheduler tasks of the loaded program's periodical
    // triggers (phase 18); replaced wholesale on every (re)load.
    private final List<BukkitTask> periodicalTasks = new ArrayList<>();
    // Watch-trigger polling task (phase 25): watches the data folder
    // for a `reload.request` marker file written by the CLI's watch
    // loop after it deploys new IR, and answers with `reload.status`.
    private BukkitTask reloadPollTask;

    /**
     * Carry name-keyed variable entries over to UUID keys after
     * the store loads (UUID keying is the default). The name →
     * UUID map comes from the server's own offline-player records
     * and only keeps names that belong to exactly one UUID: a
     * name that changed hands is ambiguous in the old store
     * format, so its entries are left name-keyed rather than
     * handed to the wrong player. Unresolvable names likewise
     * stay untouched. Nothing is deleted; the outcome is logged.
     */
    private void migrateVariableKeysToUuid() {
        Map<String, String> nameToUuid = new HashMap<>();
        Set<String> ambiguous = new HashSet<>();
        for (OfflinePlayer offline : getServer().getOfflinePlayers()) {
            String name = offline.getName();
            if (name == null) continue;
            String key = name.toLowerCase(Locale.ROOT);
            String uuid = offline.getUniqueId().toString();
            if (ambiguous.contains(key)) continue;
            String previous = nameToUuid.putIfAbsent(key, uuid);
            if (previous != null && !previous.equals(uuid)) {
                nameToUuid.remove(key);
                ambiguous.add(key);
            }
        }
        int[] result = variables.migratePlayerNameKeys(nameToUuid);
        if (result[0] > 0 || result[1] > 0 || !ambiguous.isEmpty()) {
            getLogger().info("skript-ts: variable key migration (player name -> UUID): moved "
                    + result[0] + " entries; " + result[1]
                    + " left name-keyed (a UUID entry already exists); "
                    + ambiguous.size() + " player name(s) shared by more than one UUID left unmapped."
                    + " Entries whose player could not be resolved stay name-keyed and remain"
                    + " reachable with variables.playerKeysUseUuid=false.");
        }
    }

    @Override
    public void onEnable() {
        Path dataDir = getDataFolder().toPath();
        // config.json is read once, up front: the variables
        // section decides the variable key form before the store
        // loads and migrates, and the http section feeds the
        // client setup further down.
        Map<?, ?> configMap = null;
        Path configPath = dataDir.resolve("config.json");
        if (Files.exists(configPath)) {
            try {
                Object parsed = Json.parse(Files.readString(configPath, StandardCharsets.UTF_8));
                if (parsed instanceof Map<?, ?> map) configMap = map;
            } catch (Exception e) {
                getLogger().warning("skript-ts: could not read config.json: " + e.getMessage());
            }
        }
        // Player variable keys use UUIDs by default (a rename
        // keeps the player's data). variables.playerKeysUseUuid=
        // false in config.json selects the legacy name form.
        boolean playerKeysUseUuid = true;
        if (configMap != null
                && configMap.get("variables") instanceof Map<?, ?> variablesConfig
                && variablesConfig.get("playerKeysUseUuid") instanceof Boolean useUuid) {
            playerKeysUseUuid = useUuid;
        }
        boolean allowPrivateAddresses = false;
        if (configMap != null
                && configMap.get("http") instanceof Map<?, ?> httpConfig
                && httpConfig.get("allowPrivateAddresses") instanceof Boolean allow) {
            allowPrivateAddresses = allow;
        }
        variables = new Variables(dataDir.resolve("variables.json"), getLogger());
        variables.load();
        if (playerKeysUseUuid) {
            migrateVariableKeysToUuid();
        } else {
            getLogger().info("skript-ts: variables.playerKeysUseUuid is false in config.json —"
                    + " player variable keys use player NAMES (legacy form)."
                    + " A player who renames will not reach data stored under their old name.");
        }
        engine = new Engine(variables, getLogger());
        engine.setPlayerKeysUseUuid(playerKeysUseUuid);
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
        // HTTP client (phase 26): config.json's http section (read
        // at the top of onEnable) may opt in to private / loopback
        // targets (for trusted local services only).
        if (allowPrivateAddresses) {
            getLogger().warning("skript-ts: WARNING http.allowPrivateAddresses is ON in config.json — private/loopback HTTP targets and all ports are allowed. Do not use this setting on a production server.");
        }
        urls = new Urls(result -> getServer().getScheduler().runTask(this, () -> fireHttpEvent(result)),
                dataDir.resolve("files"), allowPrivateAddresses, getLogger());
        engine.setHttpHost(new Engine.HttpHost() {
            @Override
            public void fetchText(String id, String url, double timeoutSeconds) {
                urls.fetchText(id, url, timeoutSeconds);
            }

            @Override
            public void download(String id, String url, String path, double timeoutSeconds) {
                urls.download(id, url, path, timeoutSeconds);
            }
        });
        // Cloudflare client (M4 CF-1): the destination is fixed to
        // api.cloudflare.com; SKRIPTTS_CF_API_BASE_URL overrides it
        // so verification can run against a local stub — never set
        // it on a production server.
        String cfBaseUrl = System.getenv("SKRIPTTS_CF_API_BASE_URL");
        if (cfBaseUrl != null && !cfBaseUrl.isBlank()) {
            getLogger().warning("skript-ts: WARNING SKRIPTTS_CF_API_BASE_URL is set — Cloudflare API traffic goes to that base URL instead of api.cloudflare.com. This override exists for verification stubs only; do not set it on a production server.");
        }
        cloudflare = new Cloudflare(
                result -> getServer().getScheduler().runTask(this, () -> engine.completeCf(result)),
                getLogger());
        engine.setCfHost(new Engine.CfHost() {
            @Override
            public void d1Query(String id, String handle, String sql, List<Object> params, String storeVar, double timeoutSeconds) {
                cloudflare.d1Query(id, handle, sql, params, storeVar, timeoutSeconds);
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
        // The wait statement's continuations run on the main thread
        // through the Bukkit scheduler (phase 12).
        engine.setDelayHost((ticks, task) ->
                getServer().getScheduler().runTaskLater(this, task, ticks));
        // PlaceholderAPI is an optional external plugin (softdepend).
        // The bridge class is the only one touching its API, and it
        // is instantiated only when the plugin is actually present,
        // so a server without PlaceholderAPI runs the engine
        // unchanged (placeholder expressions yield no value and
        // request events never fire).
        if (getServer().getPluginManager().getPlugin("PlaceholderAPI") != null) {
            try {
                placeholders = new Placeholders(this, this::handlePlaceholderRequest, getLogger());
                engine.setPlaceholderHost(placeholders::parse);
                getLogger().info("skript-ts: PlaceholderAPI bridge active");
            } catch (NoClassDefFoundError e) {
                placeholders = null;
                getLogger().warning("skript-ts: PlaceholderAPI is present but its API could not be linked; placeholder features are inactive");
            }
        }
        database = new Database(variables, dataDir, getLogger());
        engine.setDatabase(database);
        files = new net.krz.skriptts.Files(dataDir.resolve("files"), getLogger());
        engine.setFiles(files);
        loadScripts();
        getServer().getPluginManager().registerEvents(this, this);
        // Watch trigger (phase 25): poll for the CLI watch loop's
        // reload.request marker every 10 ticks (0.5 s). The marker is
        // written only after a deploy completes, so a poll can never
        // observe a half-copied script set.
        reloadPollTask = getServer().getScheduler().runTaskTimer(this, this::pollReloadRequest, 10L, 10L);
        getLogger().info("skript-ts engine enabled");
    }

    @Override
    public void onDisable() {
        if (reloadPollTask != null) {
            reloadPollTask.cancel();
            reloadPollTask = null;
        }
        cancelPeriodicals();
        unregisterScriptCommands();
        if (engine != null) engine.clearGuiRegistries();
        if (placeholders != null) placeholders.shutdown();
        if (timers != null) timers.shutdown();
        if (urls != null) urls.shutdown();
        if (cloudflare != null) cloudflare.shutdown();
        if (websockets != null) websockets.closeAll();
        if (variables != null) variables.save();
    }

    /**
     * PlaceholderAPI may call from asynchronous threads (its parse
     * entry points are used from async chat and the like), but script
     * bodies belong on the main thread. Serve directly when already
     * there — the engine's own placeholder reads run on the main
     * thread and must not deadlock waiting for it — and hop through
     * the scheduler otherwise, with a bounded wait.
     */
    private String handlePlaceholderRequest(String prefix, String identifier, Player player) {
        if (Bukkit.isPrimaryThread()) {
            return engine.firePlaceholderRequest(prefix, identifier, player);
        }
        try {
            return getServer().getScheduler()
                    .callSyncMethod(this, () -> engine.firePlaceholderRequest(prefix, identifier, player))
                    .get(2, TimeUnit.SECONDS);
        } catch (Exception e) {
            getLogger().warning("skript-ts: placeholder request for prefix '" + prefix + "' could not be served: " + e.getMessage());
            return null;
        }
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
    /**
     * HTTP completions arrive on the Urls worker threads; the plugin's
     * Completion hops them to the main thread before this runs, so
     * script bodies execute where they belong. The script-visible
     * error is the kind only — details stay in the server log.
     */
    private void fireHttpEvent(Urls.Result r) {
        Engine.Ctx ctx = new Engine.Ctx();
        ctx.httpId = r.id();
        ctx.httpStatus = r.status();
        ctx.httpBody = r.body();
        ctx.httpError = r.ok() ? null : r.errorKind();
        ctx.httpSavedPath = r.savedPath();
        engine.fireEvent("httpResponse", ctx, false);
    }

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

    /**
     * Outcome of one script-load pass. {@code failedFiles} holds the
     * failed scripts' identifiers — paths relative to the scripts
     * folder with '/' separators (the plain file name for top-level
     * files, matching the historical log lines).
     */
    record LoadResult(int scripts, int structures, List<String> failedFiles) {
    }

    synchronized LoadResult loadScripts() {
        // A reload replaces the program; timers created by the old
        // program would fire into handlers that may no longer exist,
        // so they are dropped (documented phase 7 semantics).
        if (timers != null) timers.clearAll();
        Path dir = getDataFolder().toPath().resolve("scripts");
        List<Map<String, Object>> tops = new ArrayList<>();
        List<String> failedFiles = new ArrayList<>();
        int scripts = 0;
        int structures = 0;
        try {
            Files.createDirectories(dir);
            List<Path> files;
            // Recursive discovery (phase 25): the build/deploy side
            // lays scripts out by their source-relative path, so the
            // loader walks subfolders too. Sorted by the relative
            // identifier for a deterministic load order.
            try (Stream<Path> stream = Files.walk(dir)) {
                files = stream
                        .filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().endsWith(".ir.json"))
                        .sorted(Comparator.comparing(p -> relativeScriptId(dir, p)))
                        .toList();
            }
            for (Path file : files) {
                String name = relativeScriptId(dir, file);
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
                    failedFiles.add(name);
                }
            }
        } catch (IOException e) {
            getLogger().severe("Failed to read scripts folder " + dir + ": " + e.getMessage());
        }
        engine.setProgram(tops);
        reschedulePeriodicals();
        // The placeholder expansions mirror the loaded program:
        // prefixes the new program no longer serves are unregistered.
        if (placeholders != null) placeholders.sync(engine.placeholderPrefixes());
        reregisterScriptCommands(tops);
        getLogger().info("Loaded " + scripts + " script(s), " + structures + " top-level structure(s)");
        return new LoadResult(scripts, structures, failedFiles);
    }

    /** A script file's identifier: its path relative to the scripts folder, '/'-separated on every OS. */
    private static String relativeScriptId(Path scriptsDir, Path file) {
        return scriptsDir.relativize(file).toString().replace('\\', '/');
    }

    // ------------------------------------------------------------------
    // Watch trigger (phase 25): marker-file reload requests.
    //
    // The CLI watch loop deploys new IR into the scripts folder and
    // only then writes `reload.request` ({"buildId": "..."}) into
    // the data folder root. The poll task picks the marker up, runs
    // the same loadScripts() as `/skript-ts reload`, and answers
    // with `reload.status`, written atomically (temp file + rename)
    // so the CLI never reads a half-written status. Because the
    // marker lands after the deploy completes, the load can never
    // observe a partially copied script set — the structural
    // advantage over watching the scripts folder itself.
    // ------------------------------------------------------------------

    private Path reloadRequestPath() {
        return getDataFolder().toPath().resolve("reload.request");
    }

    private Path reloadStatusPath() {
        return getDataFolder().toPath().resolve("reload.status");
    }

    /** One poll cycle; runs on the main thread via the scheduler and never throws. */
    private void pollReloadRequest() {
        Path request = reloadRequestPath();
        if (!Files.exists(request)) return;
        try {
            String buildId = "";
            try {
                Object parsed = Json.parse(Files.readString(request, StandardCharsets.UTF_8));
                if (parsed instanceof Map<?, ?> map && map.get("buildId") instanceof String id) {
                    buildId = id;
                }
            } catch (Exception e) {
                getLogger().warning("skript-ts: ignoring malformed reload.request: " + e.getMessage());
            }
            // Delete BEFORE loading: a request written while this
            // load runs must survive and trigger the next cycle.
            Files.deleteIfExists(request);
            LoadResult result = loadScripts();
            writeReloadStatus(buildId, result);
        } catch (Exception e) {
            getLogger().warning("skript-ts: reload request handling failed: " + e.getMessage());
        }
    }

    private void writeReloadStatus(String buildId, LoadResult result) {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("buildId", buildId);
        status.put("ok", result.failedFiles().isEmpty());
        status.put("scripts", result.scripts());
        status.put("structures", result.structures());
        status.put("failed", result.failedFiles());
        status.put("completedAt", System.currentTimeMillis());
        Path statusPath = reloadStatusPath();
        Path tmp = statusPath.resolveSibling("reload.status.tmp");
        try {
            Files.writeString(tmp, Json.write(status), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, statusPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException e) {
                // Filesystem cannot rename atomically: a plain
                // replace is the documented fallback.
                Files.move(tmp, statusPath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            getLogger().warning("skript-ts: failed to write reload.status: " + e.getMessage());
        }
    }

    /**
     * (Re)schedule the loaded program's periodical triggers
     * (phase 18). A reload replaces the schedule wholesale — the
     * old tasks are cancelled and each trigger's first firing
     * comes one full period after the load — mirroring the real
     * Skript, whose periodical re-anchors on reload (probed).
     * Periods are literal amounts in the IR; sub-tick periods
     * clamp to one tick.
     */
    private void reschedulePeriodicals() {
        cancelPeriodicals();
        for (Map<String, Object> top : engine.periodicals()) {
            long ticks = periodicalTicks(top);
            if (ticks <= 0) continue;
            periodicalTasks.add(getServer().getScheduler().runTaskTimer(
                    this, () -> engine.runPeriodical(top), ticks, ticks));
        }
    }

    private void cancelPeriodicals() {
        for (BukkitTask task : periodicalTasks) task.cancel();
        periodicalTasks.clear();
    }

    /** A periodical IR node's period in ticks: amount times the unit's ticks-per-unit, rounded, at least 1. */
    private static long periodicalTicks(Map<String, Object> top) {
        if (!(top.get("amount") instanceof Number amount)) return 0;
        double perUnit = switch (String.valueOf(top.get("unit"))) {
            case "seconds" -> 20.0;
            case "minutes" -> 1200.0;
            default -> 1.0; // ticks
        };
        return Math.max(1, Math.round(amount.doubleValue() * perUnit));
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

    /**
     * The attacker of a by-entity damage event, in the original's
     * semantics: a projectile damager resolves to its shooter when
     * the shooter is an entity — verified live against the real
     * Skript 2.17.1 (a snow golem's snowballs and a skeleton's
     * arrows both read the shooter as the attacker, the damage
     * "by" filter matches the shooter, and a death by projectile
     * credits the shooter). A projectile from a non-entity source
     * (a dispenser) keeps the projectile itself as the attacker,
     * and any other damager stands as itself.
     */
    private static Entity resolveAttacker(Entity damager) {
        if (damager instanceof Projectile projectile
                && projectile.getShooter() instanceof Entity shooter) {
            return shooter;
        }
        return damager;
    }

    @EventHandler
    public void onDeath(EntityDeathEvent event) {
        // Generalized in phase 22: Skript's death event covers
        // EVERY living entity (the v0 listener took only player
        // deaths). PlayerDeathEvent extends EntityDeathEvent,
        // so this one handler receives both. The victim is the
        // dead entity; the attacker is the damager of its last
        // damage cause when that cause was an entity attack —
        // any entity, matching the original (verified live: a
        // zombie killed by an iron golem read attacker "iron
        // golem"; a command kill read no attacker). A projectile
        // killing blow resolves to the shooter via
        // resolveAttacker (a snow golem shot dead by a skeleton
        // read attacker "skeleton"). The event
        // is not cancellable in Bukkit, so no cancellable is
        // packed (a cancel in a handler is the established
        // no-op, as in the original). For a player victim the
        // player values are set as well, so handlers written
        // against the v0 form keep working.
        org.bukkit.entity.LivingEntity entity = event.getEntity();
        Engine.Ctx ctx = entity instanceof Player player ? baseCtx(player) : new Engine.Ctx();
        ctx.victim = entity;
        if (entity.getLastDamageCause() instanceof EntityDamageByEntityEvent byEntity) {
            ctx.attacker = resolveAttacker(byEntity.getDamager());
        }
        engine.fireEvent("death", ctx, false);
    }

    // ------------------------------------------------------------------
    // Gameplay events (phase 14): Bukkit events -> engine events.
    // Each listener packs the event's values into the context; the
    // engine reads them back through its event-value expressions,
    // and cancellation / damage rewrites land on the live Bukkit
    // event, so the vanilla outcome follows the script.
    // ------------------------------------------------------------------

    @EventHandler
    public void onBlockBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventBlock = event.getBlock();
        // Skript's break event-item is the broken block in item
        // form, not the tool in hand (verified live against the
        // real Skript: digging grass while holding a sword still
        // reported the block, "grass block").
        ctx.eventItem = new ItemStack(event.getBlock().getType());
        ctx.cancellable = event;
        engine.fireEvent("blockBreak", ctx, false);
    }

    @EventHandler
    public void onBlockPlace(BlockPlaceEvent event) {
        Player player = event.getPlayer();
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventBlock = event.getBlockPlaced();
        ctx.eventItem = normalizeItem(event.getItemInHand());
        ctx.cancellable = event;
        engine.fireEvent("blockPlace", ctx, false);
    }

    @EventHandler
    public void onInteract(PlayerInteractEvent event) {
        // The event fires once per hand; only the main hand counts,
        // or every click would run its handlers twice.
        if (event.getHand() != EquipmentSlot.HAND) return;
        String kind = switch (event.getAction()) {
            case LEFT_CLICK_BLOCK, LEFT_CLICK_AIR -> "leftClick";
            case RIGHT_CLICK_BLOCK, RIGHT_CLICK_AIR -> "rightClick";
            default -> null; // PHYSICAL (pressure plates and the like) is not a click
        };
        if (kind == null) return;
        Engine.Ctx ctx = baseCtx(event.getPlayer());
        ctx.eventBlock = event.getClickedBlock();
        ctx.eventItem = normalizeItem(event.getItem());
        ctx.cancellable = event;
        engine.fireEvent(kind, ctx, false);
    }

    @EventHandler
    public void onInteractEntity(PlayerInteractEntityEvent event) {
        // Right-clicking an entity has no clicked block; the
        // target travels as the clicked-entity value instead. The
        // event fires once per hand like the block interact
        // event, and only the main hand counts. (The "at entity"
        // variant for armor stands is a subclass and lands here
        // too.)
        if (event.getHand() != EquipmentSlot.HAND) return;
        Player player = event.getPlayer();
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventItem = normalizeItem(player.getInventory().getItemInMainHand());
        ctx.clickedEntity = event.getRightClicked();
        ctx.cancellable = event;
        engine.fireEvent("rightClick", ctx, false);
    }

    // ------------------------------------------------------------------
    // More events (phase 16): pickup, drop, respawn, bed enter /
    // leave — the player forms, matching Skript's bare headers.
    // ------------------------------------------------------------------

    @EventHandler
    public void onPickup(EntityPickupItemEvent event) {
        // Generalized in phase 22: the explicit entity form
        // fires for EVERY picker — mobs and players alike
        // (verified live against the original: a player picking
        // up wheat fired both forms; a zombie fired only the
        // entity form). The bare form stays player-only. The
        // picker travels as the event-entity value; the player
        // values are set when the picker is a player (the
        // original reads player as no value for a mob picker).
        org.bukkit.entity.LivingEntity entity = event.getEntity();
        Engine.Ctx ctx = entity instanceof Player player ? baseCtx(player) : new Engine.Ctx();
        ctx.eventEntity = entity;
        ctx.eventItem = event.getItem().getItemStack();
        ctx.cancellable = event;
        if (entity instanceof Player) engine.fireEvent("pickup", ctx, false);
        engine.fireEvent("entityPickup", ctx, false);
    }

    @EventHandler
    public void onDrop(PlayerDropItemEvent event) {
        Player player = event.getPlayer();
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventItem = event.getItemDrop().getItemStack();
        ctx.cancellable = event;
        engine.fireEvent("drop", ctx, false);
    }

    @EventHandler
    public void onEntityDrop(EntityDropItemEvent event) {
        // The entity drop form (phase 22): a NON-player entity
        // drops an item — a chicken laying an egg is the
        // canonical case. Player drops never reach this event
        // (they are PlayerDropItemEvent, the bare form above),
        // matching the original, where the entity form stays
        // silent for a player's toss (verified live). The
        // dropper is the event-entity; the dropped Item entity
        // itself travels as the dropped-item value, and its
        // stack as the event-item.
        Engine.Ctx ctx = new Engine.Ctx();
        ctx.eventEntity = event.getEntity();
        ctx.droppedItem = event.getItemDrop();
        ctx.eventItem = event.getItemDrop().getItemStack();
        ctx.cancellable = event;
        engine.fireEvent("entityDrop", ctx, false);
    }

    // ------------------------------------------------------------------
    // Fishing (phase 22): PlayerFishEvent states dispatch to the
    // state sub-events, and every state also fires the generic
    // state-change event with the state name the original prints
    // (all mapping pairs verified live against the real Skript).
    // The caught value exists only for the two catch states:
    // an Item entity for a fish (the event-entity and the
    // dropped-item values both), the hooked entity for an
    // entity catch. Fishing events have no event-item.
    // ------------------------------------------------------------------

    @EventHandler
    public void onFish(PlayerFishEvent event) {
        String kind = switch (event.getState()) {
            case FISHING -> "fishCast";
            case LURED -> "fishApproach";
            case BITE -> "fishBite";
            case CAUGHT_FISH -> "fishCaught";
            case CAUGHT_ENTITY -> "entityHooked";
            case IN_GROUND -> "hookInGround";
            case FAILED_ATTEMPT -> "fishEscape";
            case REEL_IN -> "fishReelIn";
        };
        String stateName = switch (event.getState()) {
            case FISHING -> "fishing line cast";
            case LURED -> "lured";
            case BITE -> "bite";
            case CAUGHT_FISH -> "fish caught";
            case CAUGHT_ENTITY -> "entity caught";
            case IN_GROUND -> "bobber in ground";
            case FAILED_ATTEMPT -> "fish escape";
            case REEL_IN -> "reel in";
        };
        Engine.Ctx ctx = baseCtx(event.getPlayer());
        ctx.fishingState = stateName;
        ctx.fishingHook = event.getHook();
        ctx.cancellable = event;
        if (event.getCaught() != null) {
            ctx.eventEntity = event.getCaught();
            if (event.getCaught() instanceof org.bukkit.entity.Item item) {
                ctx.droppedItem = item;
            }
        }
        engine.fireEvent(kind, ctx, false);
        engine.fireEvent("fishingStateChange", ctx, false);
    }

    @EventHandler
    public void onRespawn(PlayerRespawnEvent event) {
        // No cancellable is packed: Skript rejects "cancel event"
        // inside an on-respawn handler at parse time ("An on
        // respawn event cannot be cancelled"), and Bukkit's
        // respawn event is not cancellable either — a cancel in
        // an engine handler is the established no-op.
        engine.fireEvent("respawn", baseCtx(event.getPlayer()), false);
    }

    @EventHandler
    public void onBedEnter(PlayerBedEnterEvent event) {
        Engine.Ctx ctx = baseCtx(event.getPlayer());
        ctx.eventBlock = event.getBed();
        ctx.cancellable = event;
        engine.fireEvent("bedEnter", ctx, false);
    }

    @EventHandler
    public void onBedLeave(PlayerBedLeaveEvent event) {
        // PlayerBedLeaveEvent is not cancellable in Bukkit.
        Engine.Ctx ctx = baseCtx(event.getPlayer());
        ctx.eventBlock = event.getBed();
        engine.fireEvent("bedLeave", ctx, false);
    }

    @EventHandler
    public void onDamage(EntityDamageEvent event) {
        // The bare player / event-player stay unset on purpose:
        // Skript has no player value in a damage event ("There's
        // no player in an on damage event" is a parse error there),
        // so scripts address the participants through the victim
        // and attacker expressions instead.
        Engine.Ctx ctx = new Engine.Ctx();
        ctx.victim = event.getEntity();
        if (event instanceof EntityDamageByEntityEvent byEntity) {
            ctx.attacker = resolveAttacker(byEntity.getDamager());
        }
        ctx.damageEvent = event;
        ctx.cancellable = event;
        engine.fireEvent("damage", ctx, false);
    }

    // ------------------------------------------------------------------
    // Inventory events (phase 17): clicks and closes. The click
    // listener fires for every inventory click, in script GUIs
    // and vanilla containers alike, mirroring Skript's event; the
    // context carries the view's top inventory, the clicked
    // slot's item (no value for an empty slot), and both slot
    // indices (within the clicked inventory, and raw within the
    // whole view). Cancellation writes through to the Bukkit
    // event, so a cancelled click moves nothing. Click and close
    // contexts also carry the top inventory's registered GUI id
    // (feedback B3), read from the engine's registry — never
    // from the inventory's title, which anyone can copy.
    // ------------------------------------------------------------------

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventInventory = event.getInventory();
        ctx.guiEventId = engine.guiIdOf(event.getInventory());
        ctx.eventItem = normalizeItem(event.getCurrentItem());
        ctx.cursorItem = normalizeItem(event.getCursor());
        ctx.clickType = clickTypeName(event.getClick());
        ctx.clickedSlot = (double) event.getSlot();
        ctx.clickedRawSlot = (double) event.getRawSlot();
        ctx.cancellable = event;
        engine.fireEvent("inventoryClick", ctx, false);
    }

    @EventHandler
    public void onInventoryClose(InventoryCloseEvent event) {
        if (!(event.getPlayer() instanceof Player player)) return;
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventInventory = event.getInventory();
        ctx.guiEventId = engine.guiIdOf(event.getInventory());
        engine.fireEvent("inventoryClose", ctx, false);
    }

    /** The original's print form of a Bukkit click type (probed against the real Skript 2.17.1). */
    private static String clickTypeName(ClickType clickType) {
        return switch (clickType) {
            case LEFT -> "left mouse button";
            case RIGHT -> "right mouse button";
            case SHIFT_LEFT -> "left mouse button with shift";
            case SHIFT_RIGHT -> "right mouse button with shift";
            case MIDDLE -> "middle mouse button";
            case DROP -> "drop key";
            case NUMBER_KEY -> "number key";
            // Unprobed forms (DOUBLE_CLICK, CONTROL_DROP, CREATIVE,
            // SWAP_OFFHAND, WINDOW_BORDER_*, UNKNOWN): the enum name
            // in words, as a best-effort fallback.
            default -> clickType.name().toLowerCase(java.util.Locale.ROOT).replace('_', ' ');
        };
    }

    // ------------------------------------------------------------------
    // Inventory drags (phase 28): the event-item is the POST-drag
    // cursor and stays an item value even when empty (an air stack
    // of amount 0 — the original prints "0 airs"), unlike clicks,
    // where an empty event-item is no value. The affected slots are
    // the new-items map's keys, so slots the drag skips (an
    // incompatible item already sitting there) never appear.
    // Cancelling the drag stops the distribution; cancelling
    // clicks does NOT stop drags (probed live), so a GUI guard
    // has to cancel both events.
    // ------------------------------------------------------------------

    @EventHandler
    public void onInventoryDrag(InventoryDragEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventInventory = event.getInventory();
        ItemStack cursor = event.getCursor();
        ctx.eventItem = cursor == null ? new ItemStack(Material.AIR, 0) : cursor.clone();
        ctx.cursorItem = normalizeItem(event.getOldCursor());
        List<Object> draggedSlots = new ArrayList<>();
        int topSize = event.getView().getTopInventory().getSize();
        for (int rawSlot : event.getNewItems().keySet()) {
            Inventory inv = rawSlot < topSize
                    ? event.getView().getTopInventory()
                    : event.getView().getBottomInventory();
            draggedSlots.add(new Engine.SlotRef(inv, event.getView().convertSlot(rawSlot)));
        }
        ctx.draggedSlots = draggedSlots;
        ctx.cancellable = event;
        engine.fireEvent("inventoryDrag", ctx, false);
    }

    // ------------------------------------------------------------------
    // More events (feedback batch D): consume, craft, projectile
    // hit, toggle sneak — core language, fired from the Bukkit
    // events the task spec names — plus the swap-hand event,
    // which is engine-only (Skript has no header for it under
    // any spelling, so Skript-mode deployment skips scripts
    // that use it; see ENGINE_ONLY_EVENTS on the TS side).
    // ------------------------------------------------------------------

    @EventHandler
    public void onConsume(PlayerItemConsumeEvent event) {
        Engine.Ctx ctx = baseCtx(event.getPlayer());
        ctx.eventItem = normalizeItem(event.getItem());
        ctx.cancellable = event;
        engine.fireEvent("consume", ctx, false);
    }

    @EventHandler
    public void onCraft(CraftItemEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventItem = normalizeItem(event.getRecipe().getResult());
        ctx.eventInventory = event.getInventory();
        ctx.cancellable = event;
        engine.fireEvent("craft", ctx, false);
    }

    @EventHandler
    public void onProjectileHit(ProjectileHitEvent event) {
        // Like the damage listener, the bare player values stay
        // unset: the participants travel as attacker (the
        // shooter, when it is an entity) and victim (the hit
        // entity), and the hit block as the event-block. A block
        // hit has no victim; an entity hit has no block. The
        // Bukkit event is NOT cancellable, so no cancellable is
        // packed — a cancel in a handler is the established
        // no-op, as with respawn.
        Engine.Ctx ctx = new Engine.Ctx();
        if (event.getEntity().getShooter() instanceof Entity shooter) {
            ctx.attacker = shooter;
        }
        ctx.victim = event.getHitEntity();
        ctx.eventBlock = event.getHitBlock();
        engine.fireEvent("projectileHit", ctx, false);
    }

    @EventHandler
    public void onToggleSneak(PlayerToggleSneakEvent event) {
        Engine.Ctx ctx = baseCtx(event.getPlayer());
        ctx.cancellable = event;
        engine.fireEvent("toggleSneak", ctx, false);
    }

    @EventHandler
    public void onSwapHand(PlayerSwapHandItemsEvent event) {
        // The event-item is the item moving INTO the main hand
        // (the event's main-hand item is the post-swap one).
        Engine.Ctx ctx = baseCtx(event.getPlayer());
        ctx.eventItem = normalizeItem(event.getMainHandItem());
        ctx.cancellable = event;
        engine.fireEvent("swapHand", ctx, false);
    }

    /**
     * Normalize an event's item value. Bukkit is inconsistent about
     * empty hands: the inventory reports an air stack while the
     * interact event reports null. Scripts see one rule — an empty
     * hand means the event has no item value at all, matching the
     * real Skript (verified live: a click with an empty hand reads
     * its event-item as <none>, not "air").
     */
    private static ItemStack normalizeItem(ItemStack item) {
        return item == null || item.getType().isAir() ? null : item;
    }
}
