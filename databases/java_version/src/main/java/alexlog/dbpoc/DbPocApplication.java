package alexlog.dbpoc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.SimpleAsyncTaskScheduler;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class DbPocApplication {

    public static void main(String[] args) {
        SpringApplication.run(DbPocApplication.class, args);
    }

    /** Every client ticks here. The stats poll ticks here too. One virtual thread per tick. */
    @Bean
    TaskScheduler ticker() {
        var ticker = new SimpleAsyncTaskScheduler();
        ticker.setVirtualThreads(true);
        ticker.setThreadNamePrefix("tick-");
        return ticker;
    }
}
