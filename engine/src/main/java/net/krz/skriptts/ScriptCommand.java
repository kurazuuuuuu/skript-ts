package net.krz.skriptts;

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;

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
    }

    @Override
    public boolean execute(CommandSender sender, String label, String[] args) {
        engine.runCommand(node, sender, args);
        return true;
    }
}
