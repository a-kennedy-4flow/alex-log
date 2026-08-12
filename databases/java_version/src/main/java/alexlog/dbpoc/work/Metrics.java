package alexlog.dbpoc.work;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import alexlog.dbpoc.Language;

/**
 * The counters behind one client's row. Every key exists before the client reaches its thread.
 * The map is only read after that. It needs no locking.
 */
final class Metrics {

    private static final double NANOS_PER_MILLI = 1_000_000.0;

    private final Map<Language, AtomicLong> perDatabase = new EnumMap<>(Language.class);
    private final AtomicLong ops = new AtomicLong();
    private final AtomicLong errors = new AtomicLong();
    private final AtomicLong totalNanos = new AtomicLong();
    private final AtomicLong maxNanos = new AtomicLong();
    private final AtomicLong minNanos = new AtomicLong(Long.MAX_VALUE);
    private volatile String lastError;

    Metrics() {
        for (var language : Language.values()) {
            perDatabase.put(language, new AtomicLong());
        }
    }

    void success(Language language, long elapsedNanos) {
        ops.incrementAndGet();
        perDatabase.get(language).incrementAndGet();
        totalNanos.addAndGet(elapsedNanos);
        maxNanos.accumulateAndGet(elapsedNanos, Math::max);
        minNanos.accumulateAndGet(elapsedNanos, Math::min);
    }

    void failure(Throwable cause) {
        errors.incrementAndGet();
        lastError = cause.getMessage() == null ? cause.toString() : cause.getMessage();
    }

    WorkerStats snapshot(String label, Kind kind, List<Language> databases, int connections, int busyConnections) {
        long done = ops.get();
        var spread = new EnumMap<Language, Long>(Language.class);
        perDatabase.forEach((language, count) -> spread.put(language, count.get()));
        return new WorkerStats(
                label,
                kind,
                databases,
                connections,
                busyConnections,
                done,
                errors.get(),
                done == 0 ? 0 : totalNanos.get() / done / NANOS_PER_MILLI,
                done == 0 ? 0 : minNanos.get() / NANOS_PER_MILLI,
                maxNanos.get() / NANOS_PER_MILLI,
                lastError,
                spread);
    }
}
