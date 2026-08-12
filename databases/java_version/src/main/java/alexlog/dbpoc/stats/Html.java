package alexlog.dbpoc.stats;

import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * All of the markup. Nothing here escapes a value. A value is often markup on purpose.
 * Any value from the server goes through {@link #escape} at the call site.
 */
final class Html {

    /** How many polls one graph holds. */
    static final int HISTORY = 60;

    private static final String STYLE = """
            body{background:#111;color:#ddd;font:14px system-ui;margin:2rem}h1{margin-bottom:.25rem}
            h2{font-size:13px;color:#7dd3a0;text-transform:uppercase;letter-spacing:.05em;margin-top:1.5rem}
            table{border-collapse:collapse;width:100%;margin-top:.5rem}
            th,td{text-align:left;padding:.45rem .7rem;border-bottom:1px solid #333}th{color:#888;font-weight:500}
            dl{display:grid;grid-template-columns:1fr auto auto;gap:.3rem 1rem;margin:0;align-items:center}dt{color:#888}
            dd,.n{margin:0;text-align:right;font-variant-numeric:tabular-nums}
            .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:1rem 2rem}
            section{border:1px solid #333;border-radius:6px;padding:.5rem 1rem}section h2{margin-top:.5rem}
            code{color:#7dd3a0;word-break:break-all}.dim{color:#666}.err{color:#e08c8c}a{color:#7dd3a0}
            .ours{color:#7dd3a0}tr:has(.ours) td{background:#181f1b}
            .g{line-height:0}.g svg{display:inline-block;vertical-align:middle}.n .g{margin-right:.6rem}
            .g .l{fill:none;stroke:#4c8465;stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
            .g .f{fill:#7dd3a0;fill-opacity:.09}.g .p{fill:#7dd3a0}""";

    /**
     * Every graph is drawn here and nowhere else. The server sends one number per poll. The browser
     * keeps the history in sessionStorage so it survives the refresh below. It dies with the tab.
     */
    private static final String SCRIPT = """
            const CAP = %d, W = 72, H = 18, PAD = 1.5;
            const sample = document.documentElement.dataset.sample;
            const saved = JSON.parse(sessionStorage.getItem('sparks') || '{}');
            const fresh = saved.sample !== sample;
            const series = {};
            const fmt = value => value.toLocaleString(undefined, {maximumFractionDigits: 1});
            for (const mark of document.querySelectorAll('[data-series]')) {
              const past = (saved.series || {})[mark.dataset.series] || [];
              const value = Number(mark.dataset.value);
              const points = fresh && Number.isFinite(value) ? past.concat(value).slice(-CAP) : past;
              series[mark.dataset.series] = points;
              draw(mark, points);
            }
            sessionStorage.setItem('sparks', JSON.stringify({sample, series}));

            function draw(mark, points) {
              const last = points.length - 1;
              if (last < 1) return label(mark, 'collecting');
              const top = Math.max(...points, 0);
              const x = i => PAD + i * (W - 2 * PAD) / last;
              const y = v => top <= 0 ? H - PAD : H - PAD - v / top * (H - 2 * PAD);
              const line = points.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
              label(mark, 'min ' + fmt(Math.min(...points)) + ' · max ' + fmt(top)
                + ' · now ' + fmt(points[last]) + ' · ' + points.length + ' samples');
              mark.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">'
                + '<polygon class="f" points="' + PAD + ',' + H + ' ' + line + ' ' + (W - PAD) + ',' + H + '"/>'
                + '<polyline class="l" points="' + line + '"/>'
                + '<circle class="p" cx="' + x(last).toFixed(1) + '" cy="' + y(points[last]).toFixed(1) + '" r="1.7"/></svg>';
            }

            function label(mark, text) {
              mark.title = text;
              mark.setAttribute('aria-label', text);
            }""".formatted(HISTORY);

    private Html() {}

    /** A stat with a number is graphed. A stat without one is only ever text. */
    record Stat(String label, String value, Double number) {

        Stat(String label, String value) {
            this(label, value, null);
        }
    }

    record Column(String name, boolean numeric) {

        static Column text(String name) {
            return new Column(name, false);
        }

        static Column num(String name) {
            return new Column(name, true);
        }
    }

    static String escape(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** The sample id tells the script whether the page is showing a poll it has already graphed. */
    static String page(String title, String subtitle, String body, long refreshSeconds, long sampleId) {
        return """
                <!doctype html><html lang=en data-sample=%d><meta charset=utf-8>
                <meta http-equiv=refresh content=%d><title>%s</title>
                <style>%s</style>
                <h1>%s</h1>
                <p class=dim>%s</p>
                %s
                <script>%s</script>
                """.formatted(sampleId, refreshSeconds, escape(title), STYLE, escape(title), subtitle, body, SCRIPT);
    }

    static String grid(String... sections) {
        return "<div class=grid>%s</div>".formatted(String.join("\n", List.of(sections)));
    }

    static String section(String title, List<Stat> stats) {
        var rows = stats.stream()
                .map(stat -> "<dt>%s<dd class=g%s><dd>%s".formatted(
                        escape(stat.label()), marker(slug(title) + "." + slug(stat.label()), stat.number()), stat.value()))
                .collect(Collectors.joining());
        return "<section><h2>%s</h2><dl>%s</dl></section>".formatted(escape(title), rows);
    }

    /** An empty cell the script draws a graph into. Its history is keyed by the series name. */
    static String spark(String series, double value) {
        return "<span class=g%s></span>".formatted(marker(series, value));
    }

    static String heading(String title) {
        return "<h2>%s</h2>".formatted(escape(title));
    }

    static String table(List<Column> columns, List<List<String>> rows, String whenEmpty) {
        var head = columns.stream()
                .map(column -> "<th%s>%s".formatted(align(column), escape(column.name())))
                .collect(Collectors.joining());
        var body = rows.isEmpty()
                ? "<tr><td colspan=%d class=dim>%s</tr>".formatted(columns.size(), escape(whenEmpty))
                : rows.stream().map(cells -> "<tr>" + cells(columns, cells)).collect(Collectors.joining("\n"));
        return "<table><tr>%s</tr>\n%s</table>".formatted(head, body);
    }

    static String code(String value) {
        return "<code>%s</code>".formatted(escape(value));
    }

    static String dim(String value) {
        return "<span class=dim>%s</span>".formatted(escape(value));
    }

    static String error(String value) {
        return value == null ? dash() : "<span class=err>%s</span>".formatted(escape(value));
    }

    static String dash() {
        return "<span class=dim>—</span>";
    }

    private static String cells(List<Column> columns, List<String> cells) {
        return IntStream.range(0, cells.size())
                .mapToObj(cell -> "<td%s>%s".formatted(align(columns.get(cell)), cells.get(cell)))
                .collect(Collectors.joining());
    }

    private static String align(Column column) {
        return column.numeric() ? " class=n" : "";
    }

    private static String marker(String series, Double number) {
        return number == null ? "" : " data-series=\"%s\" data-value=\"%s\"".formatted(series, number(number));
    }

    /** The script parses this. A grouped or rounded number would not survive the trip. */
    private static String number(double value) {
        if (!Double.isFinite(value)) {
            return "0";
        }
        return value == Math.rint(value) && Math.abs(value) < 1e15
                ? String.valueOf((long) value)
                : String.format(Locale.ROOT, "%.3f", value);
    }

    private static String slug(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
    }
}
