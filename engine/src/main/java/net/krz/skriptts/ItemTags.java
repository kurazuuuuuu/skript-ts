package net.krz.skriptts;

import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Hidden item tags (feedback D): unforgeable markers stored in an
 * item's PersistentDataContainer. Display data (names, lore) can
 * be faked by a modified client, so authenticity checks need a
 * channel display data cannot reach — the PDC is that channel,
 * and Skript has no access to it, which is why this feature is
 * engine-only.
 *
 * Every key is namespaced with the plugin's own NamespacedKey
 * (the namespace is the plugin name from plugin.yml), so script
 * tags can neither collide with nor read another plugin's tags.
 * Keys are validated at build time by the TypeScript API
 * (lowercase [a-z0-9._-]); the checks here repeat that rule so a
 * hand-written IR file cannot smuggle an invalid key past Bukkit.
 *
 * Type mapping (the value's runtime type decides the stored PDC
 * type): text -> STRING, number -> DOUBLE, boolean -> BYTE
 * (1/0, read back as a boolean). Any other value type is not
 * storable and the write is a no-op.
 */
final class ItemTags {
    /** The plugin's own namespace (the `name` in plugin.yml). */
    static final String NAMESPACE = "skript-ts";

    private ItemTags() {}

    /** True when the raw key obeys the build-time rule: lowercase [a-z0-9._-], non-empty. */
    static boolean isValidKey(String key) {
        if (key == null || key.isEmpty()) return false;
        for (int i = 0; i < key.length(); i++) {
            char c = key.charAt(i);
            if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || c == '.' || c == '_' || c == '-')) return false;
        }
        return true;
    }

    /** The plugin-owned NamespacedKey for a raw tag key, or null when the key is invalid. */
    static NamespacedKey namespacedKey(String key) {
        if (!isValidKey(key)) return null;
        try {
            return new NamespacedKey(NAMESPACE, key);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** The tag value on a stack (String / Double / Boolean), or null when absent. */
    static Object get(ItemStack stack, String key) {
        PersistentDataContainer pdc = pdcOf(stack);
        NamespacedKey nk = namespacedKey(key);
        if (pdc == null || nk == null) return null;
        if (pdc.has(nk, PersistentDataType.STRING)) return pdc.get(nk, PersistentDataType.STRING);
        if (pdc.has(nk, PersistentDataType.DOUBLE)) return pdc.get(nk, PersistentDataType.DOUBLE);
        if (pdc.has(nk, PersistentDataType.BYTE)) {
            Byte b = pdc.get(nk, PersistentDataType.BYTE);
            return b == null ? null : Boolean.valueOf(b.byteValue() != 0);
        }
        return null;
    }

    /** True when the stack carries a tag under the key (any of the three mapped types). */
    static boolean has(ItemStack stack, String key) {
        PersistentDataContainer pdc = pdcOf(stack);
        NamespacedKey nk = namespacedKey(key);
        if (pdc == null || nk == null) return false;
        return pdc.has(nk, PersistentDataType.STRING)
                || pdc.has(nk, PersistentDataType.DOUBLE)
                || pdc.has(nk, PersistentDataType.BYTE);
    }

    /**
     * Write a tag onto a stack in place. Returns false — leaving
     * the stack untouched — when the stack has no meta, the key
     * is invalid, or the value is not a text / number / boolean.
     */
    static boolean set(ItemStack stack, String key, Object value) {
        if (stack == null) return false;
        NamespacedKey nk = namespacedKey(key);
        if (nk == null) return false;
        ItemMeta meta = stack.getItemMeta();
        if (meta == null) return false;
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        if (value instanceof String s) {
            pdc.set(nk, PersistentDataType.STRING, s);
        } else if (value instanceof Number n) {
            pdc.set(nk, PersistentDataType.DOUBLE, n.doubleValue());
        } else if (value instanceof Boolean b) {
            pdc.set(nk, PersistentDataType.BYTE, (byte) (b.booleanValue() ? 1 : 0));
        } else {
            return false;
        }
        stack.setItemMeta(meta);
        return true;
    }

    /**
     * All of this plugin's tags on a stack, as raw key -> value
     * (String / Double / Boolean), in key order. Used by the
     * variable store's {@code __item} encoding so tags survive a
     * save / load round-trip. An untagged stack yields an empty
     * map (the encoding omits the field entirely then, keeping
     * old-format entries byte-identical in shape).
     */
    static Map<String, Object> encode(ItemStack stack) {
        Map<String, Object> out = new LinkedHashMap<>();
        PersistentDataContainer pdc = pdcOf(stack);
        if (pdc == null) return out;
        List<String> keys = new ArrayList<>();
        for (NamespacedKey nk : pdc.getKeys()) {
            if (NAMESPACE.equals(nk.getNamespace())) keys.add(nk.getKey());
        }
        Collections.sort(keys);
        for (String key : keys) {
            Object value = get(stack, key);
            if (value != null) out.put(key, value);
        }
        return out;
    }

    /**
     * Apply an encoded tag map (as produced by {@link #encode})
     * onto a stack's meta. Entries with an invalid key or an
     * unmappable value are skipped. Returns true when at least
     * one tag was applied (the caller then sets the meta back).
     */
    static boolean apply(ItemMeta meta, Map<?, ?> tags) {
        if (meta == null || tags == null) return false;
        boolean touched = false;
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        for (Map.Entry<?, ?> entry : tags.entrySet()) {
            String key = String.valueOf(entry.getKey());
            NamespacedKey nk = namespacedKey(key);
            if (nk == null) continue;
            Object value = entry.getValue();
            if (value instanceof String s) {
                pdc.set(nk, PersistentDataType.STRING, s);
                touched = true;
            } else if (value instanceof Number n) {
                pdc.set(nk, PersistentDataType.DOUBLE, n.doubleValue());
                touched = true;
            } else if (value instanceof Boolean b) {
                pdc.set(nk, PersistentDataType.BYTE, (byte) (b.booleanValue() ? 1 : 0));
                touched = true;
            }
        }
        return touched;
    }

    private static PersistentDataContainer pdcOf(ItemStack stack) {
        if (stack == null) return null;
        ItemMeta meta = stack.getItemMeta();
        return meta == null ? null : meta.getPersistentDataContainer();
    }
}
