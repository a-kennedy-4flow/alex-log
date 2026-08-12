package alexlog.dbpoc.work;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledFuture;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import alexlog.dbpoc.AppProperties;
import alexlog.dbpoc.AppProperties.Group;
import alexlog.dbpoc.Language;
import alexlog.dbpoc.db.ConnectionPool;
import alexlog.dbpoc.db.Mysql;
import alexlog.dbpoc.db.Schema;

/** Builds the configured clients. Gives each one its own connections. Ticks them. */
@Component
public class Fleet implements InitializingBean, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(Fleet.class);

    /** What differs between building a reader and building a writer. Nothing more. */
    private interface Factory {
        Worker create(int index, List<Language> databases, ConnectionPool pool);
    }

    private final AppProperties properties;
    private final Mysql mysql;
    private final Schema schema;
    private final TaskScheduler ticker;
    private final ExecutorService fanOut = Executors.newVirtualThreadPerTaskExecutor();
    private final List<Worker> workers = new CopyOnWriteArrayList<>();
    private final List<ScheduledFuture<?>> ticks = new ArrayList<>();

    Fleet(AppProperties properties, Mysql mysql, Schema schema, TaskScheduler ticker) {
        this.properties = properties;
        this.mysql = mysql;
        this.schema = schema;
        this.ticker = ticker;
    }

    @Override
    public void afterPropertiesSet() {
        start(properties.readers(), (index, databases, pool) -> new ReaderWorker(index, databases, pool, fanOut, schema));
        start(properties.writers(), (index, databases, pool) -> new WriterWorker(index, databases, pool, fanOut, schema));
    }

    public List<WorkerStats> stats() {
        return workers.stream().map(Worker::stats).toList();
    }

    public Set<Long> connectionIds() {
        return workers.stream().flatMap(worker -> worker.connectionIds().stream()).collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public void destroy() {
        ticks.forEach(tick -> tick.cancel(true));
        fanOut.shutdownNow();
        workers.forEach(Worker::close);
    }

    private void start(Group group, Factory factory) {
        for (var client : group.resolve()) {
            var worker = factory.create(client.index(), client.databases(), new ConnectionPool(mysql, client.connections()));
            workers.add(worker);
            ticks.add(ticker.scheduleWithFixedDelay(worker, group.interval()));
            log.info("{} every {}ms over {} database(s) on {} connection(s)",
                    worker.label(), group.interval().toMillis(), client.databases().size(), client.connections());
        }
    }
}
