package alexlog.dbpoc.db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import org.springframework.stereotype.Component;

import alexlog.dbpoc.AppProperties;

/** The server. Connections come straight from the driver. There is no pool library. */
@Component
public class Mysql {

    private final AppProperties.Db db;

    Mysql(AppProperties properties) {
        this.db = properties.db();
    }

    public Connection open() throws SQLException {
        return DriverManager.getConnection(db.url(), db.user(), db.password());
    }

    public String describe() {
        return db.describe();
    }
}
