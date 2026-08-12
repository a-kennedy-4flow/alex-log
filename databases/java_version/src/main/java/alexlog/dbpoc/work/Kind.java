package alexlog.dbpoc.work;

import java.util.Locale;

/** The two things a client can be. */
public enum Kind {

    READER,
    WRITER;

    public String label(int index) {
        return name().toLowerCase(Locale.ROOT) + "-" + index;
    }
}
