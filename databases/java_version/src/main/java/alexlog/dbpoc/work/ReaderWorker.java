package alexlog.dbpoc.work;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.concurrent.ExecutorService;

import alexlog.dbpoc.Language;
import alexlog.dbpoc.db.ConnectionPool;
import alexlog.dbpoc.db.Schema;

/**
 * Counts the rows per database per tick. Also reads the newest row. The rows are then discarded.
 * This client only creates load. The page reads the data itself.
 */
public final class ReaderWorker extends Worker {

    private final Schema schema;

    ReaderWorker(int index, List<Language> databases, ConnectionPool pool, ExecutorService fanOut, Schema schema) {
        super(Kind.READER, index, databases, pool, fanOut);
        this.schema = schema;
    }

    @Override
    protected void work(Connection connection, Language language) throws SQLException {
        var table = schema.table(language);
        try (var statement = connection.createStatement()) {
            try (var rows = statement.executeQuery("SELECT COUNT(*) FROM " + table)) {
                while (rows.next()) {
                    rows.getLong(1);
                }
            }
            try (var rows = statement.executeQuery("SELECT `id`, `words`, `number` FROM " + table + " ORDER BY `id` DESC LIMIT 1")) {
                while (rows.next()) {
                    rows.getString("words");
                }
            }
        }
    }
}
