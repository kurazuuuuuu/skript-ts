package net.krz.skriptts;

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * A Bukkit command registered dynamically for one IR command node.
 * Registration goes through the server CommandMap (with the
 * "skript-ts" fallback prefix), so script commands do not need to be
 * declared in plugin.yml.
 */
final class ScriptCommand extends Command {
    private final Engine engine;
    private final Map<String, Object> node;

    ScriptCommand(Engine engine, Map<String, Object> node) {
        super(String.valueOf(node.get("name")));
        this.engine = engine;
        this.node = node;
        setDescription("skript-ts command /" + getName());
        // Aliases (phase 20): registered without their leading
        // slash, like the original's own registrations — both the
        // "/ca2" and "ca3" spellings in a script mean the same
        // alias name here.
        if (node.get("aliases") instanceof List<?> rawAliases) {
            List<String> aliases = new ArrayList<>();
            for (Object raw : rawAliases) {
                if (raw instanceof String s) {
                    String alias = s.startsWith("/") ? s.substring(1) : s;
                    if (!alias.isEmpty()) aliases.add(alias);
                }
            }
            if (!aliases.isEmpty()) setAliases(aliases);
        }
    }

    @Override
    public boolean execute(CommandSender sender, String label, String[] args) {
        engine.runCommand(node, sender, label, args);
        return true;
    }
}
