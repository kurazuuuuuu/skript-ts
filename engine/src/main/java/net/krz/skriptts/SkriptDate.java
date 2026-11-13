package net.krz.skriptts;

import java.text.DateFormat;
import java.util.Date;

/**
 * Immutable date value used by the skript-ts engine (feedback C3).
 *
 * <p>A date is an instant in time stored as epoch milliseconds
 * ({@link #epochMs}); two dates are equal exactly when their
 * millisecond counts are equal, and they order by that count.
 * The unix timestamp of a date is the count read as seconds —
 * a fractional number, the milliseconds riding along as the
 * fraction — and {@link #fromUnixSeconds(double)} builds a date
 * back from it, rounding to the nearest millisecond, so the
 * pair round-trips at millisecond precision.</p>
 *
 * <p>A date plus or minus a {@link Timespan} is the shifted
 * date; an eternal timespan has no shift (the operation yields
 * no value, signalled here by {@code null}). The difference
 * between two dates is the absolute gap as a finite
 * {@link Timespan}.</p>
 *
 * <p>The printed form is the JVM's default date-time format
 * ({@link DateFormat#getInstance()}, the SHORT/SHORT styles in
 * the default locale and time zone) — the form the original
 * prints under its default {@code date format: default}
 * configuration, which the sandbox carries.</p>
 *
 * <p>All semantics were probed against the real Skript 2.17.1
 * implementation.</p>
 */
public final class SkriptDate implements Comparable<SkriptDate> {

    /** Milliseconds since the unix epoch. */
    public final long epochMs;

    private SkriptDate(long epochMs) {
        this.epochMs = epochMs;
    }

    /** The current date and time. */
    public static SkriptDate now() {
        return new SkriptDate(System.currentTimeMillis());
    }

    /** Creates a date from epoch milliseconds. */
    public static SkriptDate ofEpochMs(long epochMs) {
        return new SkriptDate(epochMs);
    }

    /** This instant as seconds since the unix epoch, fractional at millisecond precision. */
    public double unixSeconds() {
        return epochMs / 1000.0;
    }

    /**
     * Creates a date from seconds since the unix epoch, rounding
     * to the nearest millisecond.
     */
    public static SkriptDate fromUnixSeconds(double seconds) {
        return new SkriptDate(Math.round(seconds * 1000.0));
    }

    /** The absolute gap between this date and another, as a timespan. */
    public Timespan differenceTo(SkriptDate other) {
        return Timespan.ofMs(Math.abs(epochMs - other.epochMs));
    }

    /**
     * This date shifted later by a timespan, or {@code null}
     * (no value) for an eternal timespan.
     */
    public SkriptDate plus(Timespan timespan) {
        return timespan.eternal ? null : new SkriptDate(epochMs + timespan.ms);
    }

    /**
     * This date shifted earlier by a timespan, or {@code null}
     * (no value) for an eternal timespan.
     */
    public SkriptDate minus(Timespan timespan) {
        return timespan.eternal ? null : new SkriptDate(epochMs - timespan.ms);
    }

    /** Orders by epoch milliseconds. */
    @Override
    public int compareTo(SkriptDate other) {
        return Long.compare(epochMs, other.epochMs);
    }

    /** Equality is exact millisecond equality (probed: dates 150 ms apart are unequal). */
    @Override
    public boolean equals(Object obj) {
        return obj instanceof SkriptDate other && epochMs == other.epochMs;
    }

    @Override
    public int hashCode() {
        return Long.hashCode(epochMs);
    }

    /**
     * The JVM default date-time form (SHORT/SHORT, default
     * locale and zone) — the original's printed form under its
     * default date-format configuration.
     */
    @Override
    public String toString() {
        return DateFormat.getInstance().format(new Date(epochMs));
    }
}
