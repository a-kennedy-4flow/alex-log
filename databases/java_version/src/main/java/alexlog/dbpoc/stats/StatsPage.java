package alexlog.dbpoc.stats;

import java.util.List;
import java.util.function.ToIntFunction;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import alexlog.dbpoc.AppProperties;
import alexlog.dbpoc.stats.Html.Column;
import alexlog.dbpoc.stats.Html.Stat;
import alexlog.dbpoc.work.Kind;
import alexlog.dbpoc.work.WorkerStats;

/** The one page. Every number on it comes from the latest sample and the one before it. */
@Component
class StatsPage {

    private final AppProperties properties;

    StatsPage(AppProperties properties) {
        this.properties = properties;
    }

    String render(ServerMetrics metrics, StatsService.Poll poll) {
        var sample = metrics.sample();
        var body = String.join("\n",
                Html.grid(
                        fleet(metrics),
                        connections(metrics),
                        throughput(metrics),
                        queryMix(metrics),
                        innodb(metrics),
                        tablesAndMemory(metrics),
                        thisPage(poll, metrics)),
                Html.heading("clients"),
                clients(metrics),
                Html.heading("languages"),
                languages(sample),
                Html.heading("databases"),
                databases(sample),
                Html.heading("processlist (%d connections, %d ours)".formatted(sample.processes().size(), metrics.ourConnections())),
                processes(sample),
                "<p><a href=/api/stats>json</a></p>");
        return Html.page("mysql stats", subtitle(metrics, poll), body,
                properties.stats().refresh().toSeconds(), sample.at().toEpochMilli());
    }

    private String subtitle(ServerMetrics metrics, StatsService.Poll poll) {
        return "%s · mysql %s · polled every %s · this sample took %sms · graphs hold the last %d polls of this tab".formatted(
                Html.escape(properties.db().describe()),
                Html.escape(metrics.variable("version")),
                Fmt.interval(poll.interval()),
                Fmt.decimal(metrics.sample().pollMs()),
                Html.HISTORY);
    }

    private String fleet(ServerMetrics metrics) {
        var workers = metrics.sample().workers();
        var writers = of(workers, Kind.WRITER);
        var readers = of(workers, Kind.READER);
        long busy = sum(workers, WorkerStats::busyConnections);
        return Html.section("fleet", List.of(
                new Stat("writers", Fmt.count(writers.size())),
                new Stat("readers", Fmt.count(readers.size())),
                rate("inserts / s", fleetRate(metrics, writers)),
                rate("reads / s", fleetRate(metrics, readers)),
                new Stat("inserts", Fmt.count(ops(writers))),
                new Stat("reads", Fmt.count(ops(readers))),
                new Stat("client connections", "%s busy / %s".formatted(
                        Fmt.count(busy), Fmt.count(sum(workers, WorkerStats::connections))), (double) busy),
                count("rows stored", metrics.sample().rows()),
                new Stat("client errors", Fmt.count(workers.stream().mapToLong(WorkerStats::errors).sum()))));
    }

    private String connections(ServerMetrics metrics) {
        long max = metrics.variableAsLong("max_connections");
        return Html.section("connections", List.of(
                count("threads connected", metrics.status("Threads_connected")),
                count("of which ours", metrics.ourConnections()),
                count("threads running", metrics.status("Threads_running")),
                count("ours running", metrics.ourRunningConnections()),
                new Stat("max connections", Fmt.count(max)),
                percent("connection usage", metrics.connectionUsage()),
                new Stat("max ever used", Fmt.count(metrics.status("Max_used_connections"))),
                rate("new connections / s", metrics.rate("Connections")),
                new Stat("aborted connects", Fmt.count(metrics.status("Aborted_connects"))),
                new Stat("aborted clients", Fmt.count(metrics.status("Aborted_clients"))),
                new Stat("threads created", Fmt.count(metrics.status("Threads_created"))),
                new Stat("threads cached", Fmt.count(metrics.status("Threads_cached")))));
    }

    private String throughput(ServerMetrics metrics) {
        return Html.section("throughput", List.of(
                new Stat("queries", Fmt.count(metrics.status("Questions"))),
                rate("queries / s", metrics.rate("Questions")),
                new Stat("slow queries", Fmt.count(metrics.status("Slow_queries"))),
                new Stat("bytes sent", Fmt.bytes(metrics.status("Bytes_sent"))),
                bytes("sent / s", (long) metrics.rate("Bytes_sent")),
                new Stat("bytes received", Fmt.bytes(metrics.status("Bytes_received"))),
                bytes("received / s", (long) metrics.rate("Bytes_received")),
                new Stat("server uptime", Fmt.duration(metrics.status("Uptime")))));
    }

    private String queryMix(ServerMetrics metrics) {
        return Html.section("query mix (per second)", List.of(
                rate("select", metrics.rate("Com_select")),
                rate("insert", metrics.rate("Com_insert")),
                rate("update", metrics.rate("Com_update")),
                rate("delete", metrics.rate("Com_delete")),
                rate("commit", metrics.rate("Com_commit")),
                rate("rollback", metrics.rate("Com_rollback")),
                rate("show", metrics.rate("Com_show_status")),
                new Stat("databases created", Fmt.count(metrics.status("Com_create_db")))));
    }

    private String innodb(ServerMetrics metrics) {
        return Html.section("innodb", List.of(
                new Stat("buffer pool size", Fmt.bytes(metrics.variableAsLong("innodb_buffer_pool_size"))),
                percent("buffer pool hit rate", metrics.bufferPoolHitRate()),
                count("pages free", metrics.status("Innodb_buffer_pool_pages_free")),
                count("pages dirty", metrics.status("Innodb_buffer_pool_pages_dirty")),
                rate("rows read / s", metrics.rate("Innodb_rows_read")),
                rate("rows inserted / s", metrics.rate("Innodb_rows_inserted")),
                new Stat("row lock waits", Fmt.count(metrics.status("Innodb_row_lock_waits"))),
                count("row lock avg ms", metrics.status("Innodb_row_lock_time_avg")),
                rate("log writes / s", metrics.rate("Innodb_log_writes"))));
    }

    private String tablesAndMemory(ServerMetrics metrics) {
        long open = metrics.status("Open_tables");
        return Html.section("tables and memory", List.of(
                new Stat("open tables", "%s / %s".formatted(
                        Fmt.count(open), Fmt.count(metrics.variableAsLong("table_open_cache"))), (double) open),
                new Stat("opened tables", Fmt.count(metrics.status("Opened_tables"))),
                new Stat("table locks waited", Fmt.count(metrics.status("Table_locks_waited"))),
                new Stat("tmp tables", Fmt.count(metrics.status("Created_tmp_tables"))),
                new Stat("tmp tables on disk", "%s (%s)".formatted(
                        Fmt.count(metrics.status("Created_tmp_disk_tables")), Fmt.percent(metrics.tmpTablesOnDiskRatio()))),
                rate("handler read rnd next / s", metrics.rate("Handler_read_rnd_next")),
                count("prepared statements", metrics.status("Prepared_stmt_count"))));
    }

    private String thisPage(StatsService.Poll poll, ServerMetrics metrics) {
        return Html.section("this page", List.of(
                new Stat("polls", Fmt.count(poll.count())),
                new Stat("poll errors", Fmt.count(poll.errors())),
                new Stat("poll connections", Fmt.count(poll.connections())),
                decimal("last poll ms", metrics.sample().pollMs()),
                new Stat("rate window s", Fmt.decimal(metrics.windowSeconds())),
                new Stat("app uptime", Fmt.duration(poll.uptimeSeconds())),
                new Stat("last error", Html.error(poll.lastError()))));
    }

    private String clients(ServerMetrics metrics) {
        var columns = List.of(
                Column.text("client"), Column.text("databases"), Column.num("connections"), Column.num("ops"),
                Column.num("ops / s"), Column.num("avg ms"), Column.num("min / max ms"), Column.num("errors"),
                Column.text("per database"), Column.text("last error"));
        var rows = metrics.sample().workers().stream().map(worker -> client(metrics, worker)).toList();
        return Html.table(columns, rows, "no clients configured");
    }

    /** The two moving numbers of a client are graphed. The rest of the row is one moment. */
    private List<String> client(ServerMetrics metrics, WorkerStats worker) {
        double opsPerSecond = metrics.opsPerSecond(worker);
        return List.of(
                Html.code(worker.label()),
                databasesOf(worker),
                "%d busy / %d".formatted(worker.busyConnections(), worker.connections()),
                Fmt.count(worker.ops()),
                Html.spark(worker.label() + ".ops", opsPerSecond) + Fmt.rate(opsPerSecond),
                Html.spark(worker.label() + ".avg-ms", worker.avgMs()) + Fmt.decimal(worker.avgMs()),
                "%s / %s".formatted(Fmt.decimal(worker.minMs()), Fmt.decimal(worker.maxMs())),
                Fmt.count(worker.errors()),
                spread(worker),
                Html.error(worker.lastError()));
    }

    private String languages(Sample sample) {
        var columns = List.of(
                Column.text("language"), Column.text("database"), Column.num("rows"),
                Column.text("newest words"), Column.num("number"), Column.num("read ms"));
        var rows = sample.datasets().stream()
                .map(dataset -> List.of(
                        dataset.language().key(),
                        Html.code(dataset.database()),
                        Fmt.count(dataset.rows()),
                        dataset.latest() == null ? Html.dash() : Html.code(dataset.latest().words()),
                        dataset.latest() == null ? Html.dash() : Fmt.count(dataset.latest().number()),
                        Fmt.decimal(dataset.queryMs())))
                .toList();
        return Html.table(columns, rows, "nothing written yet");
    }

    private String databases(Sample sample) {
        var columns = List.of(Column.text("database"), Column.num("tables"), Column.num("estimated rows"), Column.num("size"));
        var rows = sample.databases().stream()
                .map(database -> List.of(
                        Html.code(database.name()),
                        Fmt.count(database.tables()),
                        Fmt.count(database.rows()),
                        Fmt.bytes(database.bytes())))
                .toList();
        return Html.table(columns, rows, "no databases besides the server's own");
    }

    private String processes(Sample sample) {
        var columns = List.of(
                Column.num("id"), Column.text("user"), Column.text("host"), Column.text("database"),
                Column.text("command"), Column.num("time s"), Column.text("state"));
        var rows = sample.processes().stream()
                .map(process -> List.of(
                        sample.ours(process) ? "<span class=ours>%d</span>".formatted(process.id()) : String.valueOf(process.id()),
                        Html.escape(process.user()),
                        Html.escape(process.host()),
                        process.db() == null ? Html.dash() : Html.code(process.db()),
                        Html.escape(process.command()),
                        Fmt.count(process.seconds()),
                        process.state() == null || process.state().isBlank() ? Html.dash() : Html.dim(process.state())))
                .toList();
        return Html.table(columns, rows, "no connections");
    }

    // a stat built by one of these carries its number. that is what gets a graph. the rest is text only.

    private static Stat rate(String label, double perSecond) {
        return new Stat(label, Fmt.rate(perSecond), perSecond);
    }

    private static Stat count(String label, long value) {
        return new Stat(label, Fmt.count(value), (double) value);
    }

    private static Stat percent(String label, double fraction) {
        return new Stat(label, Fmt.percent(fraction), fraction);
    }

    private static Stat decimal(String label, double value) {
        return new Stat(label, Fmt.decimal(value), value);
    }

    private static Stat bytes(String label, long value) {
        return new Stat(label, Fmt.bytes(value), (double) value);
    }

    private static List<WorkerStats> of(List<WorkerStats> workers, Kind kind) {
        return workers.stream().filter(worker -> worker.kind() == kind).toList();
    }

    private static long ops(List<WorkerStats> workers) {
        return workers.stream().mapToLong(WorkerStats::ops).sum();
    }

    private static long sum(List<WorkerStats> workers, ToIntFunction<WorkerStats> value) {
        return workers.stream().mapToInt(value).sum();
    }

    private static double fleetRate(ServerMetrics metrics, List<WorkerStats> workers) {
        return workers.stream().mapToDouble(metrics::opsPerSecond).sum();
    }

    private static String databasesOf(WorkerStats worker) {
        return worker.databases().size() == 1
                ? Html.code(worker.databases().getFirst().key())
                : Html.dim("all " + worker.databases().size());
    }

    private static String spread(WorkerStats worker) {
        return worker.databases().stream()
                .map(language -> "%s %s".formatted(language.key(), Fmt.count(worker.opsPerDatabase().getOrDefault(language, 0L))))
                .collect(Collectors.joining(Html.dim(" · ")));
    }
}
