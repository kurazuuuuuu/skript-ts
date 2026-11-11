package net.krz.skriptts;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Properties;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * Clean-room reimplementation of the documented behavior of the
 * skript-db addon (SQL support: data source values stored in
 * variables, an execute statement that optionally stores its result
 * into a variable, and a last-error expression). Written from the
 * addons' documented behavior only; no addon code is used.
 *
 * Semantics, per the documentation: storing a query result into a
 * variable maps each cell to {@code <var>::<column name>::<row number>}
 * (rows are 1-based) after clearing the variable's previous entries;
 * the variable itself is set to the number of rows. When a statement
 * produces no result set, the variable is set to the number of
 * affected rows instead.
 *
 * Injection safety: query text is assembled by the engine from the
 * script's format parts, and every embedded expression value is bound
 * as a {@link PreparedStatement} parameter. Values are never inlined
 * into the SQL text, so a value cannot change the statement's meaning.
 * (skript-db escaped inlined values; parameter binding is stronger,
 * and it is why this engine has no equivalent of skript-db's
 * {@code unsafe} opt-out expression.)
 *
 * Execution model: statements run synchronously on the calling
 * thread and connections are opened per execution and closed
 * afterwards — no pooling. This differs from skript-db's asynchronous
 * default on purpose: the engine has no async continuation model, and
 * local (SQLite) work is fast; a slow network database would block
 * the calling thread, which scripts should keep in mind.
 *
 * JDBC drivers come from the server: Paper ships SQLite and MySQL
 * drivers in its own library set (the sandbox carries
 * org.xerial:sqlite-jdbc and com.mysql:mysql-connector-j), so this
 * jar deliberately bundles none. Before connecting, {@link #execute}
 * also tries to initialize the well-known driver class of the URL's
 * scheme through this plugin's own class loader: a driver jar placed
 * in the plugin jar or supplied through the plugin {@code libraries}
 * mechanism only registers with {@link DriverManager} once its class
 * is initialized, and nothing else loads it. A data source whose
 * driver is not visible either way fails cleanly through
 * {@link #lastError()}.
 */
final class Database {

    private static final Pattern PASSWORD_MASK = Pattern.compile("(?i)([?&]password=)[^&]*");

    private final Variables variables;
    private final Path dataDir;
    private final Logger logger;
    private volatile String lastError;

    Database(Variables variables, Path dataDir, Logger logger) {
        this.variables = variables;
        this.dataDir = dataDir;
        this.logger = logger;
    }

    /** Message of the last failed execution, or null when the last execution succeeded (or none ran). */
    String lastError() {
        return lastError;
    }

    /**
     * Parse a documented data source URL ({@code sqlite:<path>},
     * {@code mysql://...}, {@code mariadb://...},
     * {@code postgresql://...}) into a data source value. Credentials
     * travel as query parameters ({@code ?user=..&password=<redacted>}) and
     * are extracted into connection properties; the remaining
     * parameters stay in the JDBC URL.
     */
    DataSource parseDataSource(String rawUrl) {
        if (rawUrl == null) {
            throw new IllegalArgumentException("unsupported data source url: null");
        }

        // SQLite uses the sqlite:<path> form.
        if (rawUrl.startsWith("sqlite:")) {
            String path = rawUrl.substring("sqlite:".length());
            String jdbcUrl;
            if (path.startsWith(":")) {
                // Covers values such as :memory: and other SQLite special names.
                jdbcUrl = "jdbc:sqlite:" + path;
            } else {
                Path resolved = Paths.get(path);
                if (!resolved.isAbsolute()) {
                    resolved = dataDir.resolve("data").resolve(resolved);
                }
                jdbcUrl = "jdbc:sqlite:" + resolved.toString();
            }
            return new DataSource(rawUrl, jdbcUrl, null, null, maskPassword(rawUrl));
        }

        // Network database forms share the same query-parameter handling.
        String scheme = null;
        if (rawUrl.startsWith("mysql://")) {
            scheme = "mysql";
        } else if (rawUrl.startsWith("mariadb://")) {
            scheme = "mariadb";
        } else if (rawUrl.startsWith("postgresql://")) {
            scheme = "postgresql";
        }

        if (scheme != null) {
            String prefix = scheme + "://";
            String rest = rawUrl.substring(prefix.length());
            int queryIndex = rest.indexOf('?');
            String mainPart = queryIndex < 0 ? rest : rest.substring(0, queryIndex);
            String queryPart = queryIndex < 0 ? "" : rest.substring(queryIndex + 1);

            String user = null;
            String password = null;
            List<String> keptParams = new ArrayList<>();
            if (!queryPart.isEmpty()) {
                for (String param : queryPart.split("&", -1)) {
                    if (param.isEmpty()) {
                        continue;
                    }
                    int equalsIndex = param.indexOf('=');
                    String key = decode(equalsIndex < 0 ? param : param.substring(0, equalsIndex));
                    String value = decode(equalsIndex < 0 ? "" : param.substring(equalsIndex + 1));

                    if (key.equalsIgnoreCase("user") || key.equalsIgnoreCase("username")) {
                        user = value;
                    } else if (key.equalsIgnoreCase("password")) {
                        password = value;
                    } else {
                        keptParams.add(param);
                    }
                }
            }

            StringBuilder jdbcUrl = new StringBuilder("jdbc:").append(scheme).append("://").append(mainPart);
            if (!keptParams.isEmpty()) {
                jdbcUrl.append('?').append(String.join("&", keptParams));
            }
            return new DataSource(rawUrl, jdbcUrl.toString(), user, password, maskPassword(rawUrl));
        }

        String descriptor = rawUrl;
        int colonIndex = rawUrl.indexOf(':');
        if (colonIndex > 0) {
            descriptor = rawUrl.substring(0, colonIndex);
        }
        throw new IllegalArgumentException("unsupported data source url: " + descriptor);
    }

    /**
     * Execute one prepared statement. {@code params} are bound in
     * order and never inlined. When {@code storeKey} is non-null the
     * result (or affected-row count) is written to the variable store
     * under that key, as documented on the class. Failures never
     * throw: they set {@link #lastError()} and log a warning.
     */
    void execute(DataSource ds, String sql, List<Object> params, String storeKey) {
        lastError = null;

        try {
            // SQLite parent directories are created lazily, when the statement runs.
            if (ds.jdbcUrl.startsWith("jdbc:sqlite:")) {
                String pathPart = ds.jdbcUrl.substring("jdbc:sqlite:".length());
                if (!pathPart.startsWith(":")) {
                    Path databaseFile = Paths.get(pathPart);
                    Path parent = databaseFile.getParent();
                    if (parent != null) {
                        Files.createDirectories(parent);
                    }
                }
            }

            loadDriverClass(ds.jdbcUrl);

            Properties properties = new Properties();
            if (ds.user != null) {
                properties.setProperty("user", ds.user);
            }
            if (ds.password != null) {
                properties.setProperty("password", ds.password);
            }

            try (Connection connection = DriverManager.getConnection(ds.jdbcUrl, properties);
                 PreparedStatement statement = connection.prepareStatement(sql)) {

                bind(statement, params);
                boolean hasResultSet = statement.execute();

                if (hasResultSet) {
                    try (ResultSet resultSet = statement.getResultSet()) {
                        if (storeKey != null) {
                            ResultSetMetaData metaData = resultSet.getMetaData();
                            int columnCount = metaData.getColumnCount();
                            String[] labels = new String[columnCount];
                            for (int i = 0; i < columnCount; i++) {
                                labels[i] = metaData.getColumnLabel(i + 1);
                            }

                            LinkedHashMap<String, Object> cells = new LinkedHashMap<>();
                            int rowNumber = 1;
                            while (resultSet.next()) {
                                for (int i = 0; i < columnCount; i++) {
                                    Object value = convertCell(resultSet.getObject(i + 1));
                                    if (value != null) {
                                        cells.put(storeKey + "::" + labels[i] + "::" + rowNumber, value);
                                    }
                                }
                                rowNumber++;
                            }

                            variables.removePrefix(storeKey + "::");
                            variables.setAll(cells);
                            variables.set(storeKey, (double) (rowNumber - 1));
                        } else {
                            while (resultSet.next()) {
                                // Drain and discard the result set.
                            }
                        }
                    }
                } else if (storeKey != null) {
                    int updateCount = statement.getUpdateCount();
                    if (updateCount < 0) {
                        updateCount = 0;
                    }
                    variables.set(storeKey, (double) updateCount);
                }
            }
        } catch (Exception exception) {
            String message = exception.getMessage();
            if (message == null || message.isBlank()) {
                message = exception.getClass().getSimpleName();
            }
            lastError = message;
            logger.warning("skript-ts: database execution failed: " + message);
        }
    }

    /**
     * Initialize the well-known JDBC driver class for the URL's
     * scheme, if it is visible to this plugin's class loader. Driver
     * classes self-register with {@link DriverManager} from their
     * static initializer, so this makes drivers bundled in the plugin
     * jar (or in plugin libraries) usable; drivers the server itself
     * loaded are already registered and unaffected. A missing class
     * is not an error: the connection attempt then fails cleanly with
     * "No suitable driver" through {@link #lastError()}.
     */
    private static void loadDriverClass(String jdbcUrl) {
        String driverClass = null;
        if (jdbcUrl.startsWith("jdbc:mysql:")) {
            driverClass = "com.mysql.cj.jdbc.Driver";
        } else if (jdbcUrl.startsWith("jdbc:mariadb:")) {
            driverClass = "org.mariadb.jdbc.Driver";
        } else if (jdbcUrl.startsWith("jdbc:postgresql:")) {
            driverClass = "org.postgresql.Driver";
        } else if (jdbcUrl.startsWith("jdbc:sqlite:")) {
            driverClass = "org.sqlite.JDBC";
        }
        if (driverClass == null) {
            return;
        }
        try {
            Class.forName(driverClass);
        } catch (Throwable ignored) {
            // Not visible to this class loader; getConnection reports it.
        }
    }

    private static void bind(PreparedStatement statement, List<Object> params) throws SQLException {
        if (params == null) {
            return;
        }
        int index = 1;
        for (Object value : params) {
            if (value == null) {
                statement.setObject(index, null);
            } else if (value instanceof String text) {
                statement.setString(index, text);
            } else if (value instanceof Number number) {
                statement.setDouble(index, number.doubleValue());
            } else if (value instanceof Boolean booleanValue) {
                statement.setBoolean(index, booleanValue);
            } else {
                statement.setString(index, Engine.stringify(value));
            }
            index++;
        }
    }

    private static Object convertCell(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return Double.valueOf(number.doubleValue());
        }
        if (value instanceof Boolean booleanValue) {
            return booleanValue;
        }
        if (value instanceof String text) {
            return text;
        }
        if (value instanceof byte[] bytes) {
            return new String(bytes, StandardCharsets.UTF_8);
        }
        return String.valueOf(value);
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            return value;
        }
    }

    private static String maskPassword(String rawUrl) {
        return PASSWORD_MASK.matcher(rawUrl).replaceAll("$1****");
    }

    /**
     * Parsed representation of a supported data source URL. The
     * {@code display} form has the password masked and is the only
     * form ever shown in messages or logs.
     */
    static final class DataSource {
        final String rawUrl;
        final String jdbcUrl;
        final String user;
        final String password;
        final String display;

        private DataSource(String rawUrl, String jdbcUrl, String user, String password, String display) {
            this.rawUrl = rawUrl;
            this.jdbcUrl = jdbcUrl;
            this.user = user;
            this.password = password;
            this.display = display;
        }

        String display() {
            return display;
        }
    }
}
