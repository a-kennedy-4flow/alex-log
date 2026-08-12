package alexlog.dbpoc.stats;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import alexlog.dbpoc.AppProperties;

/** The page. The same numbers are also available as json. */
@RestController
class StatsController {

    private final AppProperties properties;
    private final StatsService stats;
    private final StatsPage page;

    StatsController(AppProperties properties, StatsService stats, StatsPage page) {
        this.properties = properties;
        this.stats = stats;
        this.page = page;
    }

    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE + ";charset=UTF-8")
    ResponseEntity<String> index() {
        return stats.reading()
                .map(metrics -> ResponseEntity.ok(page.render(metrics, stats.pollMeta())))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(waiting()));
    }

    @GetMapping("/api/stats")
    ResponseEntity<Object> json() {
        return stats.reading()
                .<ResponseEntity<Object>>map(metrics -> ResponseEntity.ok(
                        new Payload(properties.db().describe(), stats.pollMeta(), metrics.summary(), metrics.sample())))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(stats.pollMeta()));
    }

    private record Payload(String server, StatsService.Poll poll, ServerMetrics.Summary summary, Sample sample) {}

    private String waiting() {
        var poll = stats.pollMeta();
        return "<p>no sample yet from %s%s".formatted(
                Html.escape(properties.db().describe()),
                poll.lastError() == null ? "" : ": " + Html.escape(poll.lastError()));
    }
}
