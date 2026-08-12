package alexlog.dbpoc.stats;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import alexlog.dbpoc.AppProperties;
import alexlog.dbpoc.Language;
import alexlog.dbpoc.db.ConnectionPool;
import alexlog.dbpoc.db.Mysql;
import alexlog.dbpoc.db.Schema;
import alexlog.dbpoc.stats.Sample.Database;
import alexlog.dbpoc.stats.Sample.Dataset;
import alexlog.dbpoc.stats.Sample.Process;
import alexlog.dbpoc.work.Fleet;

/** Polls the server on its own interval. It keeps the last two samples. That is all a rate needs. */
@Component
public class StatsService implements InitializingBean, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(StatsService.class);
    private static final String SYSTEM_DATABASES = "'mysql','information_schema','performance_schema','sys'";
    private static final double NANOS_PER_MILLI = 1_000_000.0;

    /** One mapped row of a result set. */
    private interface RowMapper<T> {
        T map(ResultSet rows) throws SQLException;
    }

    private final AppProperties properties;
    private final Schema schema;
    private final Fleet fleet;
    private final TaskScheduler ticker;
    private final ConnectionPool pool;
    private final Instant started = Instant.now();
    private final AtomicLong polls = new AtomicLong();
    private final AtomicLong failures = new AtomicLong();
    private volatile String lastError;
    private volatile Sample latest;
    private volatile Sample previous;
    private ScheduledFuture<?> tick;

    StatsService(AppProperties properties, Mysql mysql, Schema schema, Fleet fleet, TaskScheduler ticker) {
        this.properties = properties;
        this.schema = schema;
        this.fleet = fleet;
        this.ticker = ticker;
        this.pool = new ConnectionPool(mysql, Math.max(1, properties.stats().connections()));
    }

    @Override
    public void afterPropertiesSet() {
        tick = ticker.scheduleWithFixedDelay(this::poll, properties.stats().interval());
    }

    /** Empty until the first poll has finished. */
    public Optional<ServerMetrics> reading() {
        var sample = latest;
        return sample == null ? Optional.empty() : Optional.of(new ServerMetrics(sample, previous));
    }

    public Poll pollMeta() {
        return new Poll(
                polls.get(),
                failures.get(),
                lastError,
                properties.stats().interval(),
                pool.size(),
                Duration.between(started, Instant.now()).toSeconds());
    }

    @Override
    public void destroy() {
        if (tick != null) {
            tick.cancel(true);
        }
        pool.close();
    }

    /** How the page itself is doing. The page is a client like any other. */
    public record Poll(long count, long errors, String lastError, Duration interval, int connections, long uptimeSeconds) {}

    private void poll() {
        long start = System.nanoTime();
        try {
            var sample = pool.call(connection -> read(connection, start));
            previous = latest;
            latest = sample;
            polls.incrementAndGet();
        } catch (SQLException failed) {
            failures.incrementAndGet();
            lastError = failed.getMessage();
            log.debug("poll failed", failed);
        }
    }

    private Sample read(Connection connection, long startNanos) throws SQLException {
        var status = keyValues(connection, "SHOW GLOBAL STATUS");
        var variables = keyValues(connection, "SHOW GLOBAL VARIABLES");
        var processes = processes(connection);
        var databases = databases(connection);
        var datasets = datasets(connection);
        return new Sample(
                Instant.now(),
                (System.nanoTime() - startNanos) / NANOS_PER_MILLI,
                status,
                variables,
                processes,
                databases,
                datasets,
                fleet.stats(),
                ourConnectionIds());
    }

    private Set<Long> ourConnectionIds() {
        var ids = new HashSet<>(fleet.connectionIds());
        ids.addAll(pool.connectionIds());
        return Set.copyOf(ids);
    }

    private static Map<String, String> keyValues(Connection connection, String sql) throws SQLException {
        var values = new LinkedHashMap<String, String>();
        for (var pair : query(connection, sql, rows -> Map.entry(rows.getString(1), String.valueOf(rows.getString(2))))) {
            values.put(pair.getKey(), pair.getValue());
        }
        return values;
    }

    private static List<Process> processes(Connection connection) throws SQLException {
        return query(connection, """
                SELECT id, user, host, db, command, time, state
                FROM information_schema.processlist
                ORDER BY time DESC""",
                rows -> new Process(
                        rows.getLong("id"),
                        rows.getString("user"),
                        rows.getString("host"),
                        rows.getString("db"),
                        rows.getString("command"),
                        rows.getLong("time"),
                        rows.getString("state")));
    }

    private static List<Database> databases(Connection connection) throws SQLException {
        return query(connection, """
                SELECT table_schema AS name, COUNT(*) AS tables, SUM(table_rows) AS est_rows,
                       SUM(data_length + index_length) AS total_bytes
                FROM information_schema.tables
                WHERE table_schema NOT IN (%s)
                GROUP BY table_schema
                ORDER BY total_bytes DESC""".formatted(SYSTEM_DATABASES),
                rows -> new Database(rows.getString("name"), rows.getInt("tables"), rows.getLong("est_rows"), rows.getLong("total_bytes")));
    }

    /** The exact contents of every language. The estimates above should be compared to this. */
    private List<Dataset> datasets(Connection connection) throws SQLException {
        var datasets = new ArrayList<Dataset>();
        for (var language : Language.values()) {
            long start = System.nanoTime();
            var table = schema.table(language);
            long rows = query(connection, "SELECT COUNT(*) FROM " + table, result -> result.getLong(1)).getFirst();
            var latestRow = query(connection,
                    "SELECT `words`, `number` FROM " + table + " ORDER BY `id` DESC LIMIT 1",
                    result -> new Dataset.Row(result.getString("words"), result.getInt("number")));
            datasets.add(new Dataset(
                    language,
                    schema.database(language),
                    rows,
                    latestRow.isEmpty() ? null : latestRow.getFirst(),
                    (System.nanoTime() - start) / NANOS_PER_MILLI));
        }
        return datasets;
    }

    private static <T> List<T> query(Connection connection, String sql, RowMapper<T> mapper) throws SQLException {
        var results = new ArrayList<T>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                results.add(mapper.map(rows));
            }
        }
        return results;
    }
}
