package alexlog.dbpoc.work;

import java.util.List;
import java.util.Map;

import alexlog.dbpoc.Language;

/** One client's row on the stats page. It is taken at one moment. */
public record WorkerStats(
        String label,
        Kind kind,
        List<Language> databases,
        int connections,
        int busyConnections,
        long ops,
        long errors,
        double avgMs,
        double minMs,
        double maxMs,
        String lastError,
        Map<Language, Long> opsPerDatabase) {}
