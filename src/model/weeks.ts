import type { Bucket, WeekStartDay } from "./types";

const DAY_MS = 86_400_000;

/** Filling empty weeks stops past this many buckets (one outlier date would otherwise add thousands). */
export const MAX_FILLED_WEEKS = 1000;

/** A valid Date becomes local midnight of its calendar day; anything else is null. */
export function toLocalDate(value: unknown): Date | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function dateKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Adds calendar days at local midnight; safe across DST because it never adds raw milliseconds. */
export function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whole calendar days from a to b, computed on UTC dates so DST never shortens a day. */
function daysBetween(a: Date, b: Date): number {
    const utc = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
    return Math.round((utc(b) - utc(a)) / DAY_MS);
}

export function weekStartOf(date: Date, weekStartDay: WeekStartDay): Date {
    const firstDay = weekStartDay === "monday" ? 1 : 0;
    const offset = (date.getDay() - firstDay + 7) % 7;
    return addDays(date, -offset);
}

/** ISO 8601 week number: weeks start on Monday, week 1 contains the year's first Thursday. */
export function isoWeek(date: Date): { year: number; week: number } {
    const thursday = addDays(date, 3 - ((date.getDay() + 6) % 7));
    const year = thursday.getFullYear();
    const week = Math.floor(daysBetween(new Date(year, 0, 1), thursday) / 7) + 1;
    return { year, week };
}

export interface WeekBucketing {
    buckets: Bucket[];
    /** Rows whose value was null or not a date. */
    excludedRows: number;
    /** True when empty weeks were not filled because the range exceeded MAX_FILLED_WEEKS. */
    emptyWeeksSkipped: boolean;
}

/** Groups source rows into weekly buckets, chronologically, optionally filling empty weeks. */
export function buildWeekBuckets(
    values: readonly unknown[],
    options: { weekStartDay: WeekStartDay; showEmptyWeeks: boolean },
): WeekBucketing {
    const byKey = new Map<string, Bucket>();
    let excludedRows = 0;

    values.forEach((value, rowIndex) => {
        const date = toLocalDate(value);
        if (!date) {
            excludedRows += 1;
            return;
        }
        const weekStart = weekStartOf(date, options.weekStartDay);
        const key = dateKey(weekStart);
        let bucket = byKey.get(key);
        if (!bucket) {
            bucket = { key, kind: "week", weekStart, rowIndices: [], inserted: false };
            byKey.set(key, bucket);
        }
        bucket.rowIndices.push(rowIndex);
    });

    const sorted = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    if (!options.showEmptyWeeks || sorted.length < 2) {
        return { buckets: sorted, excludedRows, emptyWeeksSkipped: false };
    }

    const first = sorted[0].weekStart as Date;
    const last = sorted[sorted.length - 1].weekStart as Date;
    if (daysBetween(first, last) / 7 + 1 > MAX_FILLED_WEEKS) {
        return { buckets: sorted, excludedRows, emptyWeeksSkipped: true };
    }

    const filled: Bucket[] = [];
    for (let week = first; daysBetween(week, last) >= 0; week = addDays(week, 7)) {
        const key = dateKey(week);
        filled.push(byKey.get(key) ?? { key, kind: "week", weekStart: week, rowIndices: [], inserted: true });
    }
    return { buckets: filled, excludedRows, emptyWeeksSkipped: false };
}
