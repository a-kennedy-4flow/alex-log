package alexlog.dbpoc.db;

import java.sql.SQLException;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.stereotype.Component;

import alexlog.dbpoc.AppProperties;
import alexlog.dbpoc.Language;

/**
 * The names every statement is built from. This is also the one place that creates them.
 * One database per language. Each holds one table of three columns.
 */
@Component
public class Schema implements InitializingBean {

    private static final Logger log = LoggerFactory.getLogger(Schema.class);
    private static final Duration RETRY_DELAY = Duration.ofSeconds(1);
    private static final int RETRIES = 30;

    private final Mysql mysql;
    private final String prefix;
    private final String table;

    Schema(AppProperties properties, Mysql mysql) {
        this.mysql = mysql;
        this.prefix = properties.db().databasePrefix();
        this.table = properties.db().table();
    }

    public String database(Language language) {
        return prefix + language.key();
    }

    /** Always fully qualified. The same statement then works from any connection. */
    public String table(Language language) {
        return "`%s`.`%s`".formatted(database(language), table);
    }

    /** This runs before any client is built. No reader queries a table that is missing. */
    @Override
    public void afterPropertiesSet() throws SQLException {
        awaitServer();
        try (var connection = mysql.open(); var statement = connection.createStatement()) {
            for (var language : Language.values()) {
                statement.executeUpdate("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4".formatted(database(language)));
                statement.executeUpdate("""
                        CREATE TABLE IF NOT EXISTS %s (
                          `id` INT AUTO_INCREMENT PRIMARY KEY,
                          `words` VARCHAR(255) NOT NULL,
                          `number` INT NOT NULL
                        )""".formatted(table(language)));
            }
        }
        log.info("{} databases ready on {}", Language.values().length, mysql.describe());
    }

    /** The server is usually a container that has only just been started. */
    private void awaitServer() throws SQLException {
        for (int attempt = 1; ; attempt++) {
            try (var connection = mysql.open()) {
                return;
            } catch (SQLException unreachable) {
                if (attempt == RETRIES) {
                    throw unreachable;
                }
                log.info("waiting for mysql on {}: {}", mysql.describe(), unreachable.getMessage());
                sleep();
            }
        }
    }

    private void sleep() throws SQLException {
        try {
            Thread.sleep(RETRY_DELAY);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new SQLException("interrupted while waiting for mysql", interrupted);
        }
    }
}
