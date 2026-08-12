package alexlog.dbpoc;

import java.time.Duration;
import java.util.List;
import java.util.stream.IntStream;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Every tunable setting lives in application.yml. This is that file as Java types. */
@ConfigurationProperties("app")
public record AppProperties(Db db, Group readers, Group writers, Stats stats) {

    /** Which databases a client may access. */
    public enum Scope {
        ONE,
        ALL
    }

    /** Where the server is. How the databases and the one table are named. */
    public record Db(String host, int port, String user, String password, String databasePrefix, String table) {

        /** The url selects no database. Every statement names its own. One connection reaches them all. */
        public String url() {
            return "jdbc:mysql://%s:%d/?useUnicode=true&characterEncoding=UTF-8&allowPublicKeyRetrieval=true".formatted(host, port);
        }

        public String describe() {
            return host + ":" + port;
        }
    }

    /** A group of identical clients. They are readers or writers. */
    public record Group(int count, int connections, Scope scope, Duration interval, List<ClientOverride> clients) {

        public Group {
            clients = clients == null ? List.of() : List.copyOf(clients);
        }

        /** The group settings become one entry per client. Overrides are applied. */
        public List<Client> resolve() {
            return IntStream.range(0, Math.max(0, count)).mapToObj(this::resolve).toList();
        }

        private Client resolve(int index) {
            var override = clients.stream().filter(client -> client.index() == index).findFirst();
            var databases = override.map(ClientOverride::scope).orElse(scope) == Scope.ALL
                    ? List.of(Language.values())
                    : List.of(override.map(ClientOverride::language).orElseGet(() -> Language.byIndex(index)));
            // a client with no connection can do no work. one is the minimum.
            return new Client(index, databases, Math.max(1, override.map(ClientOverride::connections).orElse(connections)));
        }
    }

    /** Group settings changed for one client. The index picks the client. This never adds a client. Only count does that. */
    public record ClientOverride(int index, Scope scope, Language language, Integer connections) {}

    /** One client of a group. It is ready to be built. */
    public record Client(int index, List<Language> databases, int connections) {}

    /** The one page. The connections it uses to sample the server. */
    public record Stats(Duration interval, int connections, Duration refresh) {}
}
