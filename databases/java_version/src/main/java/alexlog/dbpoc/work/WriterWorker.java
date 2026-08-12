package alexlog.dbpoc.work;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadLocalRandom;

import alexlog.dbpoc.Language;
import alexlog.dbpoc.db.ConnectionPool;
import alexlog.dbpoc.db.Schema;

/** Inserts one row of that language's words per database per tick. */
public final class WriterWorker extends Worker {

    private static final int NUMBER_BOUND = 1_000_000;

    private final Schema schema;

    WriterWorker(int index, List<Language> databases, ConnectionPool pool, ExecutorService fanOut, Schema schema) {
        super(Kind.WRITER, index, databases, pool, fanOut);
        this.schema = schema;
    }

    @Override
    protected void work(Connection connection, Language language) throws SQLException {
        var sql = "INSERT INTO %s (`words`, `number`) VALUES (?, ?)".formatted(schema.table(language));
        try (var insert = connection.prepareStatement(sql)) {
            insert.setString(1, language.randomWords());
            insert.setInt(2, ThreadLocalRandom.current().nextInt(NUMBER_BOUND));
            insert.executeUpdate();
        }
    }
}
