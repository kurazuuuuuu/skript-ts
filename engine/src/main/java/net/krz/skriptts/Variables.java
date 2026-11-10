package net.krz.skriptts;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
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
 */
final class Variables {
    private static final String LOCATION_TAG = "__location";

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
                out.put(e.getKey(), encode(e.getValue()));
            }
            Files.createDirectories(file.getParent());
            Files.writeString(file, Json.write(out) + "\n", StandardCharsets.UTF_8);
        } catch (IOException e) {
            logger.warning("skript-ts: could not save variables to " + file + ": " + e.getMessage());
        }
    }

    private static Object encode(Object value) {
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
        return value;
    }

    private static Object decode(Object value) {
        if (value instanceof Map<?, ?> map && Boolean.TRUE.equals(map.get(LOCATION_TAG))) {
            String worldName = String.valueOf(map.get("world"));
            World world = Bukkit.getWorld(worldName);
            if (world == null) return null;
            return new Location(
                    world,
                    num(map.get("x")), num(map.get("y")), num(map.get("z")),
                    (float) num(map.get("yaw")), (float) num(map.get("pitch")));
        }
        return value;
    }

    private static double num(Object v) {
        return v instanceof Number n ? n.doubleValue() : 0.0;
    }
}
