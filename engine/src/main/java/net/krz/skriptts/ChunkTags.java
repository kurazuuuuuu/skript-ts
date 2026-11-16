package net.krz.skriptts;

import org.bukkit.Chunk;
import org.bukkit.Location;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.entity.Entity;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

/**
 * Chunk tags (ext-console U2): hidden markers stored in a
 * chunk's PersistentDataContainer, mirroring {@link ItemTags}
 * exactly — same plugin namespace, same build-time key rule
 * (lowercase [a-z0-9._-]), and the same type mapping
 * (text -&gt; STRING, number -&gt; DOUBLE, boolean -&gt; BYTE
 * 1/0, read back as a boolean). Any other value type is not
 * storable and the write is a no-op.
 *
 * <p>The subset has no chunk value type: a tag's target is a
 * location or a block (an entity resolves via its location),
 * and the chunk containing it is the tag's home. Bukkit
 * persists a loaded chunk's PDC with the chunk in the world
 * data, so tags survive restarts without touching the
 * engine's variable store.
 *
 * <p>Access never force-loads a chunk: {@link #chunkOf}
 * checks {@code World.isChunkLoaded} before touching the
 * chunk, and an unloaded chunk reads as no value / false and
 * swallows writes — Bukkit's chunk PDC is only available on
 * loaded chunks.
 */
final class ChunkTags {
    /** The plugin's own namespace (the `name` in plugin.yml), shared with ItemTags. */
    static final String NAMESPACE = ItemTags.NAMESPACE;

    private ChunkTags() {}

    /** The plugin-owned NamespacedKey for a raw tag key, or null when the key is invalid. */
    static NamespacedKey namespacedKey(String key) {
        return ItemTags.namespacedKey(key);
    }

    /**
     * Resolve a target value to its loaded chunk, or null when
     * the target is not location-like or its chunk is not
     * loaded. The loaded check runs BEFORE any chunk access,
     * so resolving a target never loads a chunk.
     */
    static Chunk chunkOf(Object target) {
        Location loc = null;
        if (target instanceof Block b) loc = b.getLocation();
        else if (target instanceof Location l) loc = l;
        else if (target instanceof Entity e) loc = e.getLocation();
        if (loc == null || loc.getWorld() == null) return null;
        World world = loc.getWorld();
        int chunkX = loc.getBlockX() >> 4;
        int chunkZ = loc.getBlockZ() >> 4;
        if (!world.isChunkLoaded(chunkX, chunkZ)) return null;
        return world.getChunkAt(chunkX, chunkZ);
    }

    /** The tag value on a chunk (String / Double / Boolean), or null when absent. */
    static Object get(Chunk chunk, String key) {
        if (chunk == null) return null;
        PersistentDataContainer pdc = chunk.getPersistentDataContainer();
        NamespacedKey nk = namespacedKey(key);
        if (nk == null) return null;
        if (pdc.has(nk, PersistentDataType.STRING)) return pdc.get(nk, PersistentDataType.STRING);
        if (pdc.has(nk, PersistentDataType.DOUBLE)) return pdc.get(nk, PersistentDataType.DOUBLE);
        if (pdc.has(nk, PersistentDataType.BYTE)) {
            Byte b = pdc.get(nk, PersistentDataType.BYTE);
            return b == null ? null : Boolean.valueOf(b.byteValue() != 0);
        }
        return null;
    }

    /** True when the chunk carries a tag under the key (any of the three mapped types). */
    static boolean has(Chunk chunk, String key) {
        if (chunk == null) return false;
        PersistentDataContainer pdc = chunk.getPersistentDataContainer();
        NamespacedKey nk = namespacedKey(key);
        if (nk == null) return false;
        return pdc.has(nk, PersistentDataType.STRING)
                || pdc.has(nk, PersistentDataType.DOUBLE)
                || pdc.has(nk, PersistentDataType.BYTE);
    }

    /**
     * Write a tag onto a chunk. Returns false — leaving the
     * chunk untouched — when the key is invalid or the value
     * is not a text / number / boolean.
     */
    static boolean set(Chunk chunk, String key, Object value) {
        if (chunk == null) return false;
        NamespacedKey nk = namespacedKey(key);
        if (nk == null) return false;
        PersistentDataContainer pdc = chunk.getPersistentDataContainer();
        if (value instanceof String s) {
            pdc.set(nk, PersistentDataType.STRING, s);
        } else if (value instanceof Number n) {
            pdc.set(nk, PersistentDataType.DOUBLE, n.doubleValue());
        } else if (value instanceof Boolean b) {
            pdc.set(nk, PersistentDataType.BYTE, (byte) (b.booleanValue() ? 1 : 0));
        } else {
            return false;
        }
        return true;
    }

    /** Remove a tag from a chunk; a missing tag or invalid key is a no-op. */
    static void remove(Chunk chunk, String key) {
        if (chunk == null) return;
        NamespacedKey nk = namespacedKey(key);
        if (nk == null) return;
        chunk.getPersistentDataContainer().remove(nk);
    }
}
