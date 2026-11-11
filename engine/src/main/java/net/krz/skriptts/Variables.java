package net.krz.skriptts;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.boss.BossBar;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

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
 * form — while inventories are runtime-only values and are never
 * written (like data sources).
 */
final class Variables {
    private static final String LOCATION_TAG = "__location";
    private static final String ITEM_TAG = "__item";
    private static final String TIMESPAN_TAG = "__timespan";

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
        return value;
    }

    private static double num(Object v) {
        return v instanceof Number n ? n.doubleValue() : 0.0;
    }
}
