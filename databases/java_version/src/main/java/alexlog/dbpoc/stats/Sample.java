package alexlog.dbpoc.stats;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import alexlog.dbpoc.Language;
import alexlog.dbpoc.work.WorkerStats;

/** One poll of the server. It also holds what the fleet had done at that moment. */
public record Sample(
        Instant at,
        double pollMs,
        Map<String, String> status,
        Map<String, String> variables,
        List<Process> processes,
        List<Database> databases,
        List<Dataset> datasets,
        List<WorkerStats> workers,
        Set<Long> ourConnectionIds) {

    /** A connection on the server. It may belong to this app or to anything else. */
    public record Process(long id, String user, String host, String db, String command, long seconds, String state) {}

    /** What information_schema estimates a database costs. */
    public record Database(String name, int tables, long rows, long bytes) {}

    /** The exact contents of one language's table. */
    public record Dataset(Language language, String database, long rows, Row latest, double queryMs) {

        public record Row(String words, int number) {}
    }

    public boolean ours(Process process) {
        return ourConnectionIds.contains(process.id());
    }

    public long rows() {
        return datasets.stream().mapToLong(Dataset::rows).sum();
    }
}
