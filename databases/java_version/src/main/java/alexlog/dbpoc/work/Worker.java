package alexlog.dbpoc.work;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;

import alexlog.dbpoc.Language;
import alexlog.dbpoc.db.ConnectionPool;

/**
 * One client. A reader and a writer differ only in the statement they run. Everything else belongs
 * here. That includes timing and counting and failures and connections.
 */
public abstract sealed class Worker implements Runnable, AutoCloseable permits ReaderWorker, WriterWorker {

    private final Kind kind;
    private final int index;
    private final List<Language> databases;
    private final ConnectionPool pool;
    private final ExecutorService fanOut;
    private final Metrics metrics = new Metrics();

    protected Worker(Kind kind, int index, List<Language> databases, ConnectionPool pool, ExecutorService fanOut) {
        this.kind = kind;
        this.index = index;
        this.databases = List.copyOf(databases);
        this.pool = pool;
        this.fanOut = fanOut;
    }

    /** One operation against one database. */
    protected abstract void work(Connection connection, Language language) throws SQLException;

    /**
     * One tick works on every database this client owns. All of them start at once. The pool decides
     * how many overlap. That is what the connection count changes.
     */
    @Override
    public final void run() {
        try {
            for (var done : fanOut.invokeAll(databases.stream().map(this::asTask).toList())) {
                done.get();
            }
        } catch (InterruptedException stopping) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException unexpected) {
            metrics.failure(unexpected.getCause());
        }
    }

    public final String label() {
        return kind.label(index);
    }

    public final Kind kind() {
        return kind;
    }

    public final Set<Long> connectionIds() {
        return pool.connectionIds();
    }

    public final WorkerStats stats() {
        return metrics.snapshot(label(), kind, databases, pool.size(), pool.busy());
    }

    @Override
    public final void close() {
        pool.close();
    }

    private Callable<Void> asTask(Language language) {
        return () -> {
            // timing starts before the connection is taken. waiting for a connection is part of the cost
            long start = System.nanoTime();
            try {
                pool.run(connection -> work(connection, language));
                metrics.success(language, System.nanoTime() - start);
            } catch (SQLException failed) {
                metrics.failure(failed);
            }
            return null;
        };
    }
}
