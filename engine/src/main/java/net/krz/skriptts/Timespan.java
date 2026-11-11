package net.krz.skriptts;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Immutable duration value used by the skript-ts engine.
 *
 * <p>A finite timespan stores a non-negative whole number of milliseconds in {@link #ms}.
 * Months are treated as 30 days and years as 365 days. {@link #ETERNAL} is the infinite
 * "forever" value; its {@link #eternal} flag is authoritative and its {@link #ms} field is
 * always {@code 0}.</p>
 *
 * <p>Literals round to the nearest millisecond. Addition saturates to eternity on overflow;
 * subtraction saturates at zero. Multiplication and division truncate toward zero in
 * milliseconds, return no value for negative/NaN factors or divisors, and saturate to
 * eternity on overflow. Eternity propagates through arithmetic as described by the methods
 * below. Ordering places eternity above every finite value.</p>
 *
 * <p>All semantics, including the formatting quirks in {@link #toString()}, were probed
 * against the real Skript 2.17.1 implementation.</p>
 */
public final class Timespan implements Comparable<Timespan> {

    private static final long MILLIS_PER_TICK = 50L;
    private static final long MILLIS_PER_SECOND = 1_000L;
    private static final long MILLIS_PER_MINUTE = 60_000L;
    private static final long MILLIS_PER_HOUR = 3_600_000L;
    private static final long MILLIS_PER_DAY = 86_400_000L;
    private static final long MILLIS_PER_WEEK = 604_800_000L;
    private static final long MILLIS_PER_MONTH = 2_592_000_000L;
    private static final long MILLIS_PER_YEAR = 31_536_000_000L;

    private static final long[] DECOMPOSITION_UNITS = {
            MILLIS_PER_YEAR,
            MILLIS_PER_MONTH,
            MILLIS_PER_WEEK,
            MILLIS_PER_DAY,
            MILLIS_PER_HOUR,
            MILLIS_PER_MINUTE
    };

    private static final String[] UNIT_SINGULAR = {
            "year",
            "month",
            "week",
            "day",
            "hour",
            "minute"
    };

    private static final String[] UNIT_PLURAL = {
            "years",
            "months",
            "weeks",
            "days",
            "hours",
            "minutes"
    };

    /** The zero timespan. */
    public static final Timespan ZERO = new Timespan(0L, false);

    /** The infinite "forever" timespan. */
    public static final Timespan ETERNAL = new Timespan(0L, true);

    /** Millisecond count for finite values; always {@code 0} for {@link #ETERNAL}. */
    public final long ms;

    /** Whether this value is the infinite "forever" timespan; authoritative over {@link #ms}. */
    public final boolean eternal;

    private Timespan(long ms, boolean eternal) {
        this.eternal = eternal;
        this.ms = eternal ? 0L : ms;
    }

    /**
     * Creates a finite timespan from milliseconds. Negative values clamp to zero.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public static Timespan ofMs(long ms) {
        return ms <= 0L ? ZERO : new Timespan(ms, false);
    }

    /**
     * Returns the millisecond length of the given unit.
     *
     * <p>Probed against Skript 2.17.1.</p>
     *
     * @throws IllegalArgumentException if the unit is unknown
     */
    public static long unitMs(String unit) {
        if (unit == null) {
            throw new IllegalArgumentException("Unknown time unit: null");
        }

        return switch (unit) {
            case "ticks" -> MILLIS_PER_TICK;
            case "seconds" -> MILLIS_PER_SECOND;
            case "minutes" -> MILLIS_PER_MINUTE;
            case "hours" -> MILLIS_PER_HOUR;
            case "days" -> MILLIS_PER_DAY;
            case "weeks" -> MILLIS_PER_WEEK;
            case "months" -> MILLIS_PER_MONTH;
            case "years" -> MILLIS_PER_YEAR;
            default -> throw new IllegalArgumentException("Unknown time unit: " + unit);
        };
    }

    /**
     * Creates a timespan from a literal amount and unit. The amount is rounded to the
     * nearest millisecond. NaN and negative amounts yield {@link #ZERO}. Infinite or
     * overflowing products yield {@link #ETERNAL}.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public static Timespan literal(double amount, String unit) {
        if (Double.isNaN(amount) || amount < 0.0) {
            return ZERO;
        }

        long unitMillis = unitMs(unit);
        double product = amount * (double) unitMillis;

        if (Double.isInfinite(product) || product >= (double) Long.MAX_VALUE) {
            return ETERNAL;
        }

        return ofMs(Math.round(product));
    }

    /**
     * Adds another timespan. Eternity plus anything is eternity; finite overflow saturates
     * to eternity.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public Timespan plus(Timespan o) {
        if (eternal || o.eternal) {
            return ETERNAL;
        }

        if (ms > Long.MAX_VALUE - o.ms) {
            return ETERNAL;
        }

        return ofMs(ms + o.ms);
    }

    /**
     * Subtracts another timespan. The result saturates at zero. If either operand is
     * eternity, the result is eternity, including eternity minus eternity.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public Timespan minus(Timespan o) {
        if (eternal || o.eternal) {
            return ETERNAL;
        }

        if (ms <= o.ms) {
            return ZERO;
        }

        return new Timespan(ms - o.ms, false);
    }

    /**
     * Multiplies this timespan by a number. Negative or NaN factors yield {@code null}.
     * A factor of zero yields zero, even for eternity. Eternity times a positive factor is
     * eternity. Finite overflow saturates to eternity, and finite results truncate toward
     * zero in milliseconds.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public Timespan times(double factor) {
        if (Double.isNaN(factor) || factor < 0.0) {
            return null;
        }

        if (factor == 0.0) {
            return ZERO;
        }

        if (eternal) {
            return ETERNAL;
        }

        if (ms == 0L) {
            return ZERO;
        }

        if (factor == 1.0) {
            return this;
        }

        double product = (double) ms * factor;

        if (Double.isInfinite(product) || product >= (double) Long.MAX_VALUE) {
            return ETERNAL;
        }

        return ofMs((long) product);
    }

    /**
     * Divides this timespan by a number. Negative or NaN divisors yield {@code null}.
     * Dividing by zero yields eternity for a nonzero dividend and zero for a zero
     * dividend. Eternity divided by any valid positive divisor is eternity. Finite results
     * truncate toward zero in milliseconds.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public Timespan dividedBy(double divisor) {
        if (Double.isNaN(divisor) || divisor < 0.0) {
            return null;
        }

        if (divisor == 0.0) {
            return (eternal || ms != 0L) ? ETERNAL : ZERO;
        }

        if (eternal) {
            return ETERNAL;
        }

        if (ms == 0L) {
            return ZERO;
        }

        if (divisor == 1.0) {
            return this;
        }

        double quotient = (double) ms / divisor;

        if (Double.isInfinite(quotient) || quotient >= (double) Long.MAX_VALUE) {
            return ETERNAL;
        }

        return ofMs((long) quotient);
    }

    /**
     * Returns this timespan divided by another as a double. Eternity/eternity is NaN,
     * eternity/finite is positive infinity, finite/eternity is zero, and finite/finite uses
     * plain double division of the millisecond counts.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public double ratio(Timespan o) {
        if (eternal && o.eternal) {
            return Double.NaN;
        }

        if (eternal) {
            return Double.POSITIVE_INFINITY;
        }

        if (o.eternal) {
            return 0.0;
        }

        return (double) ms / (double) o.ms;
    }

    /**
     * Compares this timespan with another. Eternity is greater than every finite value.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    @Override
    public int compareTo(Timespan o) {
        if (eternal) {
            return o.eternal ? 0 : 1;
        }

        if (o.eternal) {
            return -1;
        }

        return Long.compare(ms, o.ms);
    }

    /**
     * Equality is consistent with {@link #compareTo(Timespan)}: eternity equals eternity,
     * and finite values are equal exactly when their millisecond counts are equal.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }

        if (!(obj instanceof Timespan other)) {
            return false;
        }

        return eternal == other.eternal && ms == other.ms;
    }

    /**
     * Hash code consistent with {@link #equals(Object)} and {@link #compareTo(Timespan)}.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    @Override
    public int hashCode() {
        int result = Boolean.hashCode(eternal);
        result = 31 * result + Long.hashCode(ms);
        return result;
    }

    /**
     * Converts to game ticks at 50 milliseconds per tick, rounded to the nearest tick.
     * Eternity yields {@code Long.MAX_VALUE / 4}.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public long toTicks() {
        if (eternal) {
            return Long.MAX_VALUE / 4L;
        }

        long ticks = ms / MILLIS_PER_TICK;
        long remainder = ms % MILLIS_PER_TICK;

        if (remainder >= MILLIS_PER_TICK / 2L) {
            ticks++;
        }

        return ticks;
    }

    /**
     * Converts {@link #toTicks()} to an int, clamping to the int range for Bukkit's
     * int-tick APIs.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public int toTicksInt() {
        long ticks = toTicks();

        if (ticks > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }

        if (ticks < Integer.MIN_VALUE) {
            return Integer.MIN_VALUE;
        }

        return (int) ticks;
    }

    /**
     * Creates a finite timespan from game ticks at 50 milliseconds per tick. Multiplication
     * overflow saturates to {@link #ETERNAL}.
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    public static Timespan ofTicks(long ticks) {
        if (ticks <= 0L) {
            return ZERO;
        }

        if (ticks > Long.MAX_VALUE / MILLIS_PER_TICK) {
            return ETERNAL;
        }

        return new Timespan(ticks * MILLIS_PER_TICK, false);
    }

    /**
     * Formats this timespan. Eternity prints {@code "forever"}. Finite values decompose
     * greedily into years, months, weeks, days, hours, and minutes, followed by the
     * sub-minute remainder as seconds with up to two decimals. Nonzero parts are joined by
     * {@code " and "}. A unit is singular exactly when its count is 1; seconds are singular
     * exactly when the remainder is 1000 milliseconds, even if the rounded display reads
     * "1". There is no carry (for example, 59999 ms prints as "60 seconds").
     *
     * <p>Probed against Skript 2.17.1.</p>
     */
    @Override
    public String toString() {
        if (eternal) {
            return "forever";
        }

        List<String> parts = new ArrayList<>(7);
        long remaining = ms;

        for (int i = 0; i < DECOMPOSITION_UNITS.length; i++) {
            long unit = DECOMPOSITION_UNITS[i];
            long count = remaining / unit;
            remaining %= unit;

            if (count > 0L) {
                parts.add(count + " " + (count == 1L ? UNIT_SINGULAR[i] : UNIT_PLURAL[i]));
            }
        }

        if (remaining != 0L || parts.isEmpty()) {
            double seconds = remaining / (double) MILLIS_PER_SECOND;
            String secondsText = stripTrailingZeros(
                    String.format(Locale.ROOT, "%.2f", seconds)
            );
            boolean singularSecond = remaining == MILLIS_PER_SECOND;

            parts.add(secondsText + (singularSecond ? " second" : " seconds"));
        }

        return String.join(" and ", parts);
    }

    private static String stripTrailingZeros(String value) {
        int dot = value.indexOf('.');
        if (dot < 0) {
            return value;
        }

        int end = value.length();

        while (end > dot + 1 && value.charAt(end - 1) == '0') {
            end--;
        }

        if (end > dot && value.charAt(end - 1) == '.') {
            end--;
        }

        return value.substring(0, end);
    }
}
