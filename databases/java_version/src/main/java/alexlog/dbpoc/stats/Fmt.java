package alexlog.dbpoc.stats;

import java.time.Duration;
import java.util.Locale;

/** Number formatting for the page. */
final class Fmt {

    private static final String[] UNITS = {"B", "KB", "MB", "GB", "TB"};

    private Fmt() {}

    /** PT1S reads badly on a page. 1s does not. */
    static String interval(Duration interval) {
        return interval.toString().substring(2).toLowerCase(Locale.ROOT);
    }

    static String count(long value) {
        return String.format(Locale.ROOT, "%,d", value);
    }

    static String rate(double perSecond) {
        return String.format(Locale.ROOT, "%,.1f/s", perSecond);
    }

    static String decimal(double value) {
        return String.format(Locale.ROOT, "%,.1f", value);
    }

    static String percent(double fraction) {
        return String.format(Locale.ROOT, "%.1f%%", 100 * fraction);
    }

    static String bytes(long value) {
        double size = value;
        int unit = 0;
        while (size >= 1024 && unit < UNITS.length - 1) {
            size /= 1024;
            unit++;
        }
        return String.format(Locale.ROOT, unit == 0 ? "%.0f %s" : "%.1f %s", size, UNITS[unit]);
    }

    static String duration(long totalSeconds) {
        long days = totalSeconds / 86400;
        long hours = totalSeconds % 86400 / 3600;
        long minutes = totalSeconds % 3600 / 60;
        if (days > 0) {
            return days + "d " + hours + "h";
        }
        return hours > 0 ? hours + "h " + minutes + "m" : minutes + "m " + totalSeconds % 60 + "s";
    }
}
