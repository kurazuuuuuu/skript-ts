package net.krz.skriptts;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * WebSocket client connection manager for the skript-ts engine,
 * implemented only on the JDK standard library
 * ({@code java.net.http.WebSocket}). Connections are keyed by a
 * script-chosen id; messages sent before the socket finishes opening
 * are queued and flushed in order. Events fire on the WebSocket's own
 * threads — the plugin hops them to the server main thread.
 */
final class WebSockets {

    interface Events {
        void onOpen(String id);
        void onMessage(String id, String text);
        void onClose(String id);
        void onError(String id, String message);
    }

    private final Events events;
    private final Logger logger;
    private final HttpClient client = HttpClient.newHttpClient();
    private final ConcurrentHashMap<String, Conn> registry = new ConcurrentHashMap<>();

    WebSockets(Events events, Logger logger) {
        this.events = events;
        this.logger = logger;
    }

    void connect(String id, String url) {
        Conn conn = new Conn();
        Conn old = registry.put(id, conn);
        if (old != null) {
            closeSocket(old);
        }

        Listener listener = new Listener(id, conn);
        client.newWebSocketBuilder().buildAsync(URI.create(url), listener)
                .whenComplete((socket, failure) -> {
                    if (failure != null) {
                        String message = failure.getMessage();
                        if (message == null) {
                            message = String.valueOf(failure);
                        }
                        logger.warning("WebSocket connection failed for " + id + ": " + message);
                        if (registry.remove(id, conn)) {
                            events.onError(id, message);
                        }
                    } else {
                        synchronized (conn) {
                            if (conn.socket == null) {
                                conn.socket = socket;
                            }
                        }
                    }
                });
    }

    void send(String id, String text) {
        Conn conn = registry.get(id);
        if (conn == null) {
            logger.warning("No WebSocket connection registered for " + id);
            return;
        }
        synchronized (conn) {
            if (conn.socket != null && conn.open) {
                conn.socket.sendText(text, true);
            } else {
                conn.pending.add(text);
            }
        }
    }

    void disconnect(String id) {
        Conn conn = registry.remove(id);
        if (conn != null) {
            closeSocket(conn);
            // The socket's own onClose will not report this close (the
            // entry is already removed), so report it here: the close
            // event means "this connection is gone", whoever closed it.
            events.onClose(id);
        }
    }

    void closeAll() {
        for (String id : List.copyOf(registry.keySet())) {
            disconnect(id);
        }
        registry.clear();
    }

    private void closeSocket(Conn conn) {
        WebSocket socket;
        synchronized (conn) {
            socket = conn.socket;
        }
        if (socket != null) {
            try {
                socket.sendClose(WebSocket.NORMAL_CLOSURE, "closed by script");
            } catch (Throwable thrown) {
                try {
                    socket.abort();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    private static final class Conn {
        private WebSocket socket;
        private boolean open;
        private final Deque<String> pending = new ArrayDeque<>();
    }

    private final class Listener implements WebSocket.Listener {
        private final String id;
        private final Conn conn;
        private final StringBuffer buffer = new StringBuffer();

        Listener(String id, Conn conn) {
            this.id = id;
            this.conn = conn;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            if (registry.get(id) != conn) {
                // Disconnected or replaced while the handshake was in
                // flight: do not surface this socket at all.
                webSocket.abort();
                return;
            }
            synchronized (conn) {
                conn.open = true;
                if (conn.socket == null) {
                    conn.socket = webSocket;
                }
                while (!conn.pending.isEmpty()) {
                    webSocket.sendText(conn.pending.poll(), true);
                }
            }
            events.onOpen(id);
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            String message = null;
            synchronized (buffer) {
                buffer.append(data);
                if (last) {
                    message = buffer.toString();
                    buffer.setLength(0);
                }
            }
            if (message != null && registry.get(id) == conn) {
                events.onMessage(id, message);
            }
            webSocket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            if (registry.remove(id, conn)) {
                events.onClose(id);
            }
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            String message = String.valueOf(error);
            logger.warning("WebSocket error for " + id + ": " + message);
            if (registry.remove(id, conn)) {
                events.onError(id, message);
            }
        }
    }
}