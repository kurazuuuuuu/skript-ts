package net.krz.skriptts;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Registry;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.boss.BossBar;
import org.bukkit.boss.KeyedBossBar;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.components.CustomModelDataComponent;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

/**
 * Persistent variable store: the engine's equivalent of a scripting
 * runtime's global variables. Keys are "name" or "name::index" (the
 * index already stringified by the engine). Values use the engine
 * value model: Double, Boolean, String, or Location.
 *
 * The store is written to variables.json in the plugin data folder on
 * every mutation (the scale here is small; durability beats batching).
 * Locations are encoded as tagged objects so they survive restarts.
 * Item stacks (phase 17) are encoded as tagged objects too —
 * material, amount, and the display name / lore in §-coded legacy
 * form, plus the item model and CustomModelData floats (RP-2),
 * the enchantments as a key-to-level map (phase 28), and the
 * hidden item tags (feedback D) as a raw-key-to-value map —
 * while inventories are runtime-only values and are never
 * written (like data sources).
 */
final class Variables {
    private static final String LOCATION_TAG = "__location";
    private static final String ITEM_TAG = "__item";
    private static final String TIMESPAN_TAG = "__timespan";
    private static final String DATE_TAG = "__date";
    private static final String KEYED_BOSS_BAR_TAG = "__keyedbossbar";

    private final Map<String, Object> values = new LinkedHashMap<>();
    private final Path file;
    private final Logger logger;

    Variables(Path file, Logger logger) {
        this.file = file;
        this.logger = logger;
    }

    synchronized Object get(String key) {
        return values.get(key);
    }

    synchronized void set(String key, Object value) {
        if (value == null) {
            values.remove(key);
        } else {
            values.put(key, value);
        }
        save();
    }

    /** Numeric add: a missing or non-numeric current value counts as 0. Returns the new value. */
    synchronized double add(String key, double delta) {
        Object cur = values.get(key);
        double base = cur instanceof Number n ? n.doubleValue() : 0.0;
        double next = base + delta;
        values.put(key, next);
        save();
        return next;
    }

    /** Put all entries and save once (used for database result cells). */
    synchronized void setAll(Map<String, Object> entries) {
        for (Map.Entry<String, Object> e : entries.entrySet()) {
            Object value = e.getValue();
            if (value == null) {
                values.remove(e.getKey());
            } else {
                values.put(e.getKey(), value);
            }
        }
        save();
    }

    /** Snapshot of the raw keys starting with the given prefix (used for list enumeration). */
    synchronized List<String> keysWithPrefix(String prefix) {
        List<String> out = new ArrayList<>();
        for (String key : values.keySet()) {
            if (key.startsWith(prefix)) out.add(key);
        }
        return out;
    }

    /** Remove every key starting with the given prefix and save once. */
    synchronized void removePrefix(String prefix) {
        values.keySet().removeIf(k -> k.startsWith(prefix));
        save();
    }

    synchronized void load() {
        values.clear();
        if (!Files.exists(file)) return;
        try {
            String text = Files.readString(file, StandardCharsets.UTF_8);
            Object parsed = Json.parse(text);
            if (parsed instanceof Map<?, ?> map) {
                for (Map.Entry<?, ?> e : map.entrySet()) {
                    values.put(String.valueOf(e.getKey()), decode(e.getValue()));
                }
            }
        } catch (Exception e) {
            logger.warning("skript-ts: could not load variables from " + file + ": " + e.getMessage());
        }
    }

    /**
     * One-time migration of player-name key segments to UUID
     * segments, run by the plugin after load while UUID keying is
     * in effect. Every index segment (the segments after the
     * variable name — a player only ever appears as an index,
     * never as the variable name itself) that exactly equals a
     * known player's name (the map's keys are lowercased names,
     * like all store segments; the plugin only maps names that
     * belong to exactly one UUID) is replaced by that player's
     * UUID. Nothing is deleted: an entry whose migrated key
     * already exists stays under its name key and is counted as a
     * conflict, and segments matching no known player stay as
     * they are — such data remains reachable by selecting the
     * legacy name-keying option.
     *
     * Safety warning (feedback B6-2): the store format records no
     * provenance for a key segment — a segment written from a
     * player value and one written from a plain text value that
     * happens to spell the player's name (for example a name
     * string produced by formatting the player) are the same
     * bytes, so the migration cannot limit itself to
     * player-derived keys: for a store written before provenance
     * could exist, "player-derived only" would mean migrating
     * nothing at all. The safeguard is therefore a warning, not
     * a filter: before anything moves, every candidate key is
     * counted and a warning naming example keys is logged, so an
     * operator who keys data by player-name strings can switch
     * to the legacy name-keying option instead. The migration
     * itself stays non-destructive either way.
     *
     * Returns {moved, conflicts, candidates}; saves once if
     * anything moved.
     */
    synchronized int[] migratePlayerNameKeys(Map<String, String> nameToUuid) {
        // First pass: the candidate keys — every entry with an
        // index segment that a known player's name would rewrite.
        List<String> candidates = new ArrayList<>();
        for (String key : values.keySet()) {
            String[] segments = key.split("::", -1);
            for (int i = 1; i < segments.length; i++) {
                String uuid = nameToUuid.get(segments[i]);
                if (uuid != null && !uuid.equals(segments[i])) {
                    candidates.add(key);
                    break;
                }
            }
        }
        if (!candidates.isEmpty()) {
            int shown = Math.min(candidates.size(), 5);
            logger.warning("skript-ts: variable key migration (player name -> UUID): "
                    + candidates.size() + " stored "
                    + (candidates.size() == 1 ? "entry has" : "entries have")
                    + " an index segment equal to a known player name and will be migrated"
                    + " to UUID keys (for example: "
                    + String.join(", ", candidates.subList(0, shown)) + ")."
                    + " The store format cannot tell a player index apart from a plain text"
                    + " index, so a text key that merely spells a player's name (for example"
                    + " one written through the player's name as a string) migrates too and"
                    + " will no longer be reachable by that name string. Nothing is deleted;"
                    + " to keep name keys instead, stop the server and set"
                    + " variables.playerKeysUseUuid=false in config.json.");
        }
        int moved = 0;
        int conflicts = 0;
        for (String key : new ArrayList<>(values.keySet())) {
            String[] segments = key.split("::", -1);
            boolean changed = false;
            for (int i = 1; i < segments.length; i++) {
                String uuid = nameToUuid.get(segments[i]);
                if (uuid != null && !uuid.equals(segments[i])) {
                    segments[i] = uuid;
                    changed = true;
                }
            }
            if (!changed) continue;
            String newKey = String.join("::", segments);
            if (values.containsKey(newKey)) {
                conflicts++;
                continue;
            }
            values.put(newKey, values.remove(key));
            moved++;
        }
        if (moved > 0) save();
        return new int[] {moved, conflicts, candidates.size()};
    }

    synchronized void save() {
        try {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : values.entrySet()) {
                Object encoded = encode(e.getValue());
                // A null encoding means "not persisted" (data sources:
                // they can carry credentials and are runtime-only).
                if (encoded != null) out.put(e.getKey(), encoded);
            }
            Files.createDirectories(file.getParent());
            Files.writeString(file, Json.write(out) + "\n", StandardCharsets.UTF_8);
        } catch (IOException e) {
            logger.warning("skript-ts: could not save variables to " + file + ": " + e.getMessage());
        }
    }

    private static Object encode(Object value) {
        if (value instanceof Paint.Shape || value instanceof Paint.Fill) {
            // Runtime-only values (world paint family): geometry
            // and material distributions are code, not data; they
            // are dropped on save like a data source.
            return null;
        }
        if (value instanceof Database.DataSource) {
            // Runtime-only value: never written to variables.json, so
            // credentials inside a data source URL stay out of the file.
            return null;
        }
        if (value instanceof Inventory) {
            // Runtime-only value (phase 17): an inventory is a live
            // view/container, not data; it is dropped on save like
            // a data source.
            return null;
        }
        if (value instanceof KeyedBossBar keyed) {
            // Keyed boss bars persist by key (phase 24): the bar
            // itself lives in the server's persistent boss bar
            // storage, so the variable only records its key. On
            // decode the bar is looked up again; a bar deleted
            // since decodes to no value.
            Map<String, Object> m = new LinkedHashMap<>();
            m.put(KEYED_BOSS_BAR_TAG, Boolean.TRUE);
            m.put("key", keyed.getKey().toString());
            return m;
        }
        if (value instanceof BossBar) {
            // Runtime-only value (phase 21): a boss bar is a live
            // server-registered display, not data; it is dropped
            // on save like an inventory.
            return null;
        }
        if (value instanceof ItemStack stack) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put(ITEM_TAG, Boolean.TRUE);
            m.put("material", stack.getType().name());
            m.put("amount", (double) stack.getAmount());
            ItemMeta meta = stack.getItemMeta();
            if (meta != null && meta.hasDisplayName()) {
                Component name = meta.displayName();
                if (name != null) {
                    m.put("name", LegacyComponentSerializer.legacySection().serialize(name));
                }
            }
            if (meta != null && meta.hasLore()) {
                List<Component> lore = meta.lore();
                if (lore != null && !lore.isEmpty()) {
                    List<Object> lines = new ArrayList<>();
                    for (Component line : lore) {
                        lines.add(LegacyComponentSerializer.legacySection().serialize(line));
                    }
                    m.put("lore", lines);
                }
            }
            // The RP-2 components persist too, so a stored custom
            // item keeps its model across restarts.
            if (meta != null && meta.hasItemModel()) {
                NamespacedKey itemModel = meta.getItemModel();
                if (itemModel != null) {
                    m.put("itemModel", itemModel.toString());
                }
            }
            if (meta != null) {
                CustomModelDataComponent cmdComponent = meta.getCustomModelDataComponent();
                if (cmdComponent != null) {
                    List<Float> floats = cmdComponent.getFloats();
                    if (floats != null && !floats.isEmpty()) {
                        List<Object> cmdFloats = new ArrayList<>(floats.size());
                        for (Float f : floats) {
                            cmdFloats.add(f.doubleValue());
                        }
                        m.put("cmdFloats", cmdFloats);
                    }
                }
            }
            // Enchantments (phase 28): registry key -> level.
            // Files written before this field existed simply
            // have no "ench" entry and decode as unenchanted.
            if (meta != null && meta.hasEnchants()) {
                Map<String, Object> ench = new LinkedHashMap<>();
                for (Map.Entry<Enchantment, Integer> entry : meta.getEnchants().entrySet()) {
                    ench.put(entry.getKey().getKey().getKey(), (double) entry.getValue());
                }
                m.put("ench", ench);
            }
            // Hidden item tags (feedback D): this plugin's PDC
            // entries as raw key -> value (text stays text,
            // numbers stay numbers, booleans stay booleans — the
            // PDC type is re-derived from the value on decode).
            // The field is omitted entirely for an untagged
            // stack, so entries written by older versions (which
            // simply have no "tags" field) and entries for
            // untagged stacks keep exactly their old shape.
            Map<String, Object> tags = ItemTags.encode(stack);
            if (!tags.isEmpty()) {
                m.put("tags", tags);
            }
            return m;
        }
        if (value instanceof Location loc) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put(LOCATION_TAG, Boolean.TRUE);
            m.put("world", loc.getWorld() == null ? "" : loc.getWorld().getName());
            m.put("x", loc.getX());
            m.put("y", loc.getY());
            m.put("z", loc.getZ());
            m.put("yaw", (double) loc.getYaw());
            m.put("pitch", (double) loc.getPitch());
            return m;
        }
        // Timespans are plain data and persist like numbers —
        // the original stores them in its variable store too.
        // The millisecond count is exact in a double up to 2^53.
        if (value instanceof Timespan timespan) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put(TIMESPAN_TAG, Boolean.TRUE);
            m.put("ms", (double) timespan.ms);
            m.put("eternal", timespan.eternal);
            return m;
        }
        // Dates are plain data too (feedback C3): the epoch
        // millisecond count, exact in a double up to 2^53.
        if (value instanceof SkriptDate date) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put(DATE_TAG, Boolean.TRUE);
            m.put("ms", (double) date.epochMs);
            return m;
        }
        return value;
    }

    private static Object decode(Object value) {
        if (value instanceof Map<?, ?> map && Boolean.TRUE.equals(map.get(ITEM_TAG))) {
            Material material = Material.matchMaterial(String.valueOf(map.get("material")));
            if (material == null) return null;
            ItemStack stack = new ItemStack(material, (int) num(map.get("amount")));
            ItemMeta meta = stack.getItemMeta();
            if (meta != null) {
                boolean touched = false;
                if (map.get("name") instanceof String name) {
                    meta.displayName(LegacyComponentSerializer.legacySection().deserialize(name));
                    touched = true;
                }
                if (map.get("lore") instanceof List<?> lore) {
                    List<Component> lines = new ArrayList<>();
                    for (Object line : lore) {
                        lines.add(LegacyComponentSerializer.legacySection()
                                .deserialize(String.valueOf(line)));
                    }
                    meta.lore(lines);
                    touched = true;
                }
                if (map.get("itemModel") instanceof String itemModel) {
                    NamespacedKey itemModelKey = NamespacedKey.fromString(itemModel);
                    if (itemModelKey != null) {
                        meta.setItemModel(itemModelKey);
                        touched = true;
                    }
                }
                if (map.get("cmdFloats") instanceof List<?> rawCmdFloats) {
                    List<Float> cmdFloats = new ArrayList<>(rawCmdFloats.size());
                    for (Object rawCmdFloat : rawCmdFloats) {
                        if (rawCmdFloat instanceof Number number) {
                            cmdFloats.add(number.floatValue());
                        }
                    }
                    CustomModelDataComponent cmdComponent = meta.getCustomModelDataComponent();
                    if (cmdComponent != null && !cmdFloats.isEmpty()) {
                        cmdComponent.setFloats(cmdFloats);
                        meta.setCustomModelDataComponent(cmdComponent);
                        touched = true;
                    }
                }
                // Enchantments (phase 28): applied ignoring
                // restrictions, as the original stores over-cap
                // and incompatible enchantments too. A missing
                // field (pre-phase-28 files) means unenchanted.
                if (map.get("ench") instanceof Map<?, ?> enchMap) {
                    for (Map.Entry<?, ?> entry : enchMap.entrySet()) {
                        Enchantment resolved = Registry.ENCHANTMENT.get(
                                NamespacedKey.minecraft(String.valueOf(entry.getKey())));
                        if (resolved != null && entry.getValue() instanceof Number level) {
                            meta.addEnchant(resolved, level.intValue(), true);
                            touched = true;
                        }
                    }
                }
                // Hidden item tags (feedback D): re-applied under
                // the plugin's NamespacedKey with the PDC type
                // re-derived from each value. A missing field
                // (saves written before tags existed) means the
                // stack is untagged — old saves decode unchanged.
                if (map.get("tags") instanceof Map<?, ?> tagsMap) {
                    if (ItemTags.apply(meta, tagsMap)) touched = true;
                }
                if (touched) stack.setItemMeta(meta);
            }
            return stack;
        }
        if (value instanceof Map<?, ?> map && Boolean.TRUE.equals(map.get(LOCATION_TAG))) {
            String worldName = String.valueOf(map.get("world"));
            World world = Bukkit.getWorld(worldName);
            if (world == null) return null;
            return new Location(
                    world,
                    num(map.get("x")), num(map.get("y")), num(map.get("z")),
                    (float) num(map.get("yaw")), (float) num(map.get("pitch")));
        }
        if (value instanceof Map<?, ?> map && Boolean.TRUE.equals(map.get(TIMESPAN_TAG))) {
            if (Boolean.TRUE.equals(map.get("eternal"))) {
                return Timespan.ETERNAL;
            }
            return Timespan.ofMs((long) num(map.get("ms")));
        }
        if (value instanceof Map<?, ?> map && Boolean.TRUE.equals(map.get(DATE_TAG))) {
            return SkriptDate.ofEpochMs((long) num(map.get("ms")));
        }
        if (value instanceof Map<?, ?> map && Boolean.TRUE.equals(map.get(KEYED_BOSS_BAR_TAG))) {
            NamespacedKey nk = NamespacedKey.fromString(String.valueOf(map.get("key")));
            return nk == null ? null : Bukkit.getBossBar(nk);
        }
        return value;
    }

    private static double num(Object v) {
        return v instanceof Number n ? n.doubleValue() : 0.0;
    }
}
