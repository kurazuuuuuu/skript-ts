package net.krz.skriptts;

import me.clip.placeholderapi.PlaceholderAPI;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

/**
 * Clean-room bridge to the external PlaceholderAPI plugin. Behavior follows
 * PlaceholderAPI's public expansion contract and the documented Ersatz model
 * (value expression + request event); this class is loaded only when
 * PlaceholderAPI is present.
 */
final class Placeholders {
    public interface RequestHandler {
        String handle(String prefix, String identifier, Player player);
    }

    private final JavaPlugin plugin;
    private final RequestHandler handler;
    private final Logger logger;
    private final Map<String, PlaceholderExpansion> expansions = new LinkedHashMap<>();

    Placeholders(JavaPlugin plugin, RequestHandler handler, Logger logger) {
        this.plugin = plugin;
        this.handler = handler;
        this.logger = logger;
    }

    String parse(OfflinePlayer player, String text) {
        if (player == null || text == null) {
            return text;
        }
        return PlaceholderAPI.setPlaceholders(player, text);
    }

    synchronized void sync(Set<String> prefixes) {
        Set<String> effectivePrefixes = prefixes == null ? Set.of() : prefixes;
        for (String identifier : new ArrayList<>(expansions.keySet())) {
            if (!effectivePrefixes.contains(identifier)) {
                expansions.get(identifier).unregister();
                expansions.remove(identifier);
            }
        }
        for (String prefix : effectivePrefixes) {
            if (expansions.containsKey(prefix)) {
                continue;
            }
            Expansion expansion = new Expansion(prefix);
            if (expansion.register()) {
                expansions.put(prefix, expansion);
            } else {
                logger.warning("skript-ts: PlaceholderAPI refused placeholder prefix '" + prefix + "'");
            }
        }
    }

    synchronized void shutdown() {
        expansions.values().forEach(PlaceholderExpansion::unregister);
        expansions.clear();
    }

    private final class Expansion extends PlaceholderExpansion {
        private final String identifier;

        Expansion(String identifier) {
            this.identifier = identifier;
        }

        @Override
        public String getIdentifier() {
            return identifier;
        }

        @Override
        public String getAuthor() {
            return "skript-ts";
        }

        @Override
        public String getVersion() {
            return plugin.getPluginMeta().getVersion();
        }

        @Override
        public boolean persist() {
            return false;
        }

        @Override
        public String onRequest(OfflinePlayer player, String params) {
            try {
                return handler.handle(
                        identifier,
                        params == null ? "" : params,
                        player == null ? null : player.getPlayer()
                );
            } catch (Throwable error) {
                logger.warning("skript-ts: placeholder handler failed for prefix '"
                        + identifier + "': " + error);
                return null;
            }
        }
    }
}
