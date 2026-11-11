package net.krz.skriptts;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandMap;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
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
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.player.PlayerBedEnterEvent;
import org.bukkit.event.player.PlayerBedLeaveEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
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
        getLogger().info("skript-ts engine enabled");
    }

    @Override
    public void onDisable() {
        cancelPeriodicals();
        unregisterScriptCommands();
        if (placeholders != null) placeholders.shutdown();
        if (timers != null) timers.shutdown();
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
        reschedulePeriodicals();
        // The placeholder expansions mirror the loaded program:
        // prefixes the new program no longer serves are unregistered.
        if (placeholders != null) placeholders.sync(engine.placeholderPrefixes());
        reregisterScriptCommands(tops);
        getLogger().info("Loaded " + scripts + " script(s), " + structures + " top-level structure(s)");
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
        // golem"; a command kill read no attacker). The event
        // is not cancellable in Bukkit, so no cancellable is
        // packed (a cancel in a handler is the established
        // no-op, as in the original). For a player victim the
        // player values are set as well, so handlers written
        // against the v0 form keep working.
        org.bukkit.entity.LivingEntity entity = event.getEntity();
        Engine.Ctx ctx = entity instanceof Player player ? baseCtx(player) : new Engine.Ctx();
        ctx.victim = entity;
        if (entity.getLastDamageCause() instanceof EntityDamageByEntityEvent byEntity) {
            ctx.attacker = byEntity.getDamager();
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
            ctx.attacker = byEntity.getDamager();
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
    // event, so a cancelled click moves nothing.
    // ------------------------------------------------------------------

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        Engine.Ctx ctx = baseCtx(player);
        ctx.eventInventory = event.getInventory();
        ctx.eventItem = normalizeItem(event.getCurrentItem());
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
        engine.fireEvent("inventoryClose", ctx, false);
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
