package alexlog.dbpoc.db;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * A fixed set of connections. One client owns one pool. The pool hands out one connection at a time.
 * The size of the pool limits the client. A size of one allows one statement at a time.
 *
 * <p>This is not Hikari. There is no validation query. There is no growth. There is no timeout.
 */
public final class ConnectionPool implements AutoCloseable {

    /** Work that needs the connection and gives something back. */
    public interface Work<T> {
        T apply(Connection connection) throws SQLException;
    }

    /** Work that needs the connection and gives nothing back. */
    public interface Task {
        void accept(Connection connection) throws SQLException;
    }

    private final List<Slot> slots;
    private final BlockingQueue<Slot> free;

    public ConnectionPool(Mysql mysql, int size) {
        this.slots = IntStream.range(0, size).mapToObj(slot -> new Slot(mysql)).toList();
        this.free = new ArrayBlockingQueue<>(size, false, slots);
    }

    public <T> T call(Work<T> work) throws SQLException {
        var slot = take();
        try {
            return work.apply(slot.connection());
        } catch (SQLException failed) {
            slot.discard();
            throw failed;
        } finally {
            free.add(slot);
        }
    }

    public void run(Task task) throws SQLException {
        call(connection -> {
            task.accept(connection);
            return null;
        });
    }

    public int size() {
        return slots.size();
    }

    public int busy() {
        return slots.size() - free.size();
    }

    /** The server side ids of the connections this pool holds. The page marks these rows. */
    public Set<Long> connectionIds() {
        return slots.stream().map(Slot::id).filter(Objects::nonNull).collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public void close() {
        slots.forEach(Slot::discard);
    }

    private Slot take() throws SQLException {
        try {
            return free.take();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new SQLException("interrupted while waiting for a connection", interrupted);
        }
    }

    /**
     * One connection. It reopens on demand after the server drops it. Only the thread holding the slot
     * uses it. The queue publishes it safely between threads. No synchronisation is needed here.
     */
    private static final class Slot {

        private final Mysql mysql;
        private Connection connection;
        private Long id;

        private Slot(Mysql mysql) {
            this.mysql = mysql;
        }

        private Connection connection() throws SQLException {
            if (connection == null || connection.isClosed()) {
                connection = mysql.open();
                id = serverSideId(connection);
            }
            return connection;
        }

        private Long id() {
            return id;
        }

        private void discard() {
            try {
                if (connection != null) {
                    connection.close();
                }
            } catch (SQLException ignored) {
                // the connection is already gone. that is the only reason for being here
            }
            connection = null;
            id = null;
        }

        private static long serverSideId(Connection connection) throws SQLException {
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT CONNECTION_ID()")) {
                rows.next();
                return rows.getLong(1);
            }
        }
    }
}
