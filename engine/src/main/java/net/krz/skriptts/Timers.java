package net.krz.skriptts;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Manages named countdown timers driven by the Bukkit scheduler. Each timer decrements
 * once per tick pass, firing {@link Events#onTick} while it still has time remaining and
 * {@link Events#onComplete} once when its countdown reaches zero. Paused timers are skipped
 * entirely, handlers may create or stop timers during callbacks without affecting the
 * current pass, and {@link #shutdown()} cancels the repeating task and removes every timer
 * without firing completion events.
 */
final class Timers {

    interface Events {
        void onTick(String id, double timeLeft);
        void onComplete(String id);
    }

    private static final class State {
        double remaining;
        boolean paused;

        State(double remaining) {
            this.remaining = remaining;
        }
    }

    private final Plugin plugin;
    private final Events events;
    private final Logger logger;
    private final ConcurrentHashMap<String, State> timers = new ConcurrentHashMap<>();

    private BukkitTask task;

    Timers(Plugin plugin, Events events, Logger logger) {
        this.plugin = plugin;
        this.events = events;
        this.logger = logger;
    }

    void start() {
        if (task != null) {
            return;
        }
        task = plugin.getServer().getScheduler().runTaskTimer(plugin, this::tick, 20L, 20L);
    }

    void shutdown() {
        if (task != null) {
            task.cancel();
            task = null;
        }
        timers.clear();
    }

    void create(String id, double seconds) {
        timers.put(id, new State(seconds));
    }

    void stop(String id) {
        timers.remove(id);
    }

    void pause(String id) {
        State state = timers.get(id);
        if (state != null) {
            state.paused = true;
        }
    }

    void resume(String id) {
        State state = timers.get(id);
        if (state != null) {
            state.paused = false;
        }
    }

    boolean isActive(String id) {
        return timers.containsKey(id);
    }

    Double timeLeft(String id) {
        State state = timers.get(id);
        return state == null ? null : state.remaining;
    }

    void clearAll() {
        timers.clear();
    }

    private void tick() {
        List<Map.Entry<String, State>> snapshot = new ArrayList<>(timers.entrySet());
        for (Map.Entry<String, State> entry : snapshot) {
            String id = entry.getKey();
            State state = entry.getValue();

            State current = timers.get(id);
            if (current != state) {
                continue;
            }
            if (state.paused) {
                continue;
            }

            state.remaining -= 1.0;
            if (state.remaining <= 0.0) {
                timers.remove(id, state);
                events.onComplete(id);
            } else {
                events.onTick(id, state.remaining);
            }
        }
    }
}