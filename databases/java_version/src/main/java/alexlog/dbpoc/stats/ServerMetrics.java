package alexlog.dbpoc.stats;

import java.time.Duration;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import alexlog.dbpoc.work.WorkerStats;

/**
 * The server's counters are cumulative. Most of them only mean something next to the previous poll.
 * This holds both samples. It turns a counter into a rate.
 */
public final class ServerMetrics {

    private final Sample sample;
    private final Map<String, String> statusBefore;
    private final Map<String, WorkerStats> workersBefore;
    private final double windowSeconds;

    ServerMetrics(Sample sample, Sample previous) {
        this.sample = sample;
        this.statusBefore = previous == null ? Map.of() : previous.status();
        this.workersBefore = previous == null
                ? Map.of()
                : previous.workers().stream().collect(Collectors.toMap(WorkerStats::label, Function.identity()));
        this.windowSeconds = previous == null ? 0 : Duration.between(previous.at(), sample.at()).toNanos() / 1e9;
    }

    public Sample sample() {
        return sample;
    }

    public double windowSeconds() {
        return windowSeconds;
    }

    public long status(String key) {
        return asLong(sample.status().get(key));
    }

    /** Per second since the previous poll. This is zero on the first one. */
    public double rate(String key) {
        return windowSeconds <= 0 ? 0 : (status(key) - asLong(statusBefore.get(key))) / windowSeconds;
    }

    public String variable(String key) {
        return sample.variables().getOrDefault(key, "");
    }

    public long variableAsLong(String key) {
        return asLong(variable(key));
    }

    /** How fast one client is going right now. Not how fast it has gone since it started. */
    public double opsPerSecond(WorkerStats worker) {
        var before = workersBefore.get(worker.label());
        return windowSeconds <= 0 || before == null ? 0 : (worker.ops() - before.ops()) / windowSeconds;
    }

    /** Our own connections are part of every server counter here. The page says how many are ours. */
    public long ourConnections() {
        return sample.processes().stream().filter(sample::ours).count();
    }

    public long ourRunningConnections() {
        return sample.processes().stream().filter(sample::ours).filter(process -> !"Sleep".equals(process.command())).count();
    }

    public double connectionUsage() {
        return ratio(status("Threads_connected"), variableAsLong("max_connections"));
    }

    public double bufferPoolHitRate() {
        long requests = status("Innodb_buffer_pool_read_requests");
        return requests == 0 ? 0 : 1 - ratio(status("Innodb_buffer_pool_reads"), requests);
    }

    public double tmpTablesOnDiskRatio() {
        return ratio(status("Created_tmp_disk_tables"), status("Created_tmp_tables"));
    }

    /** The short version. It is for anything reading the json instead of the page. */
    public Summary summary() {
        return new Summary(
                windowSeconds,
                status("Threads_connected"),
                ourConnections(),
                variableAsLong("max_connections"),
                connectionUsage(),
                rate("Questions"),
                rate("Com_insert"),
                rate("Com_select"),
                bufferPoolHitRate(),
                status("Slow_queries"),
                status("Uptime"));
    }

    public record Summary(
            double windowSeconds,
            long threadsConnected,
            long ourConnections,
            long maxConnections,
            double connectionUsage,
            double queriesPerSecond,
            double insertsPerSecond,
            double selectsPerSecond,
            double bufferPoolHitRate,
            long slowQueries,
            long uptimeSeconds) {}

    private static double ratio(long part, long whole) {
        return whole == 0 ? 0 : (double) part / whole;
    }

    /** Plenty of status values are words rather than numbers. None of those are asked for here. */
    private static long asLong(String value) {
        try {
            return value == null ? 0 : Long.parseLong(value.trim());
        } catch (NumberFormatException notANumber) {
            return 0;
        }
    }
}
