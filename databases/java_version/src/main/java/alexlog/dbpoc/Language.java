package alexlog.dbpoc;

import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/** One language. One database. The alphabet makes a row recognisable. */
public enum Language {

    ENGLISH("abcdefghijklmnopqrstuvwxyz"),
    GERMAN("abcdefghijklmnopqrstuvwxyzäöüß"),
    FRENCH("abcdefghijklmnopqrstuvwxyzàçéèêîôûù"),
    RUSSIAN("абвгдеёжзийклмнопрстуфхцчшщъыьэюя"),
    JAPANESE("あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん");

    private static final int MIN_WORDS = 2;
    private static final int MAX_WORDS = 5;
    private static final int MIN_LETTERS = 3;
    private static final int MAX_LETTERS = 10;

    private final int[] alphabet;

    Language(String alphabet) {
        this.alphabet = alphabet.codePoints().toArray();
    }

    /** Round robin. A group of single database clients spreads over the languages. */
    public static Language byIndex(int index) {
        var all = values();
        return all[Math.floorMod(index, all.length)];
    }

    public String key() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** The payload every writer inserts. The words could only come from this alphabet. */
    public String randomWords() {
        var random = ThreadLocalRandom.current();
        return IntStream.range(0, random.nextInt(MIN_WORDS, MAX_WORDS + 1))
                .mapToObj(word -> randomWord(random))
                .collect(Collectors.joining(" "));
    }

    private String randomWord(ThreadLocalRandom random) {
        var word = new StringBuilder();
        for (int letters = random.nextInt(MIN_LETTERS, MAX_LETTERS + 1); letters > 0; letters--) {
            word.appendCodePoint(alphabet[random.nextInt(alphabet.length)]);
        }
        return word.toString();
    }
}
