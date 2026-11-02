import { describe, expect, it } from "vitest";

import { buildWeekBuckets, dateKey, isoWeek, MAX_FILLED_WEEKS, toLocalDate, weekStartOf } from "../weeks";
import { d } from "./fixtures";

describe("time zone pin", () => {
    it("runs date tests in a zone that observes DST", () => {
        // If this fails, the TZ pin in vitest.config.mjs is not reaching the test workers.
        expect(d(2026, 1, 15).getTimezoneOffset()).not.toBe(d(2026, 7, 15).getTimezoneOffset());
    });
});

describe("toLocalDate", () => {
    it("accepts valid dates at their local calendar day and rejects everything else", () => {
        expect(dateKey(toLocalDate(new Date(2026, 1, 3, 17, 45)) as Date)).toBe("2026-02-03");
        expect(toLocalDate(null)).toBeNull();
        expect(toLocalDate("2026-02-03")).toBeNull();
        expect(toLocalDate(new Date(Number.NaN))).toBeNull();
    });
});

describe("weekStartOf", () => {
    it("finds the Monday on or before a date", () => {
        expect(dateKey(weekStartOf(d(2026, 2, 4), "monday"))).toBe("2026-02-02"); // Wednesday
        expect(dateKey(weekStartOf(d(2026, 2, 2), "monday"))).toBe("2026-02-02"); // Monday itself
        expect(dateKey(weekStartOf(d(2026, 2, 8), "monday"))).toBe("2026-02-02"); // Sunday
    });

    it("finds the Sunday on or before a date", () => {
        expect(dateKey(weekStartOf(d(2026, 2, 4), "sunday"))).toBe("2026-02-01");
        expect(dateKey(weekStartOf(d(2026, 2, 8), "sunday"))).toBe("2026-02-08");
    });

    it("crosses year boundaries", () => {
        expect(dateKey(weekStartOf(d(2027, 1, 1), "monday"))).toBe("2026-12-28");
    });

    it("is unaffected by the DST change (Berlin switches on 2026-03-29)", () => {
        expect(dateKey(weekStartOf(d(2026, 3, 29), "monday"))).toBe("2026-03-23");
        expect(dateKey(weekStartOf(d(2026, 3, 30), "monday"))).toBe("2026-03-30");
        expect(dateKey(weekStartOf(d(2026, 10, 25), "monday"))).toBe("2026-10-19");
    });
});

describe("isoWeek", () => {
    it("numbers weeks per ISO 8601, including weeks that belong to the neighbouring year", () => {
        expect(isoWeek(d(2026, 1, 1))).toEqual({ year: 2026, week: 1 });
        expect(isoWeek(d(2026, 12, 28))).toEqual({ year: 2026, week: 53 });
        expect(isoWeek(d(2027, 1, 1))).toEqual({ year: 2026, week: 53 });
        expect(isoWeek(d(2027, 1, 4))).toEqual({ year: 2027, week: 1 });
    });
});

describe("buildWeekBuckets", () => {
    const options = { weekStartDay: "monday" as const, showEmptyWeeks: true };

    it("groups rows by week in chronological order regardless of input order", () => {
        const { buckets } = buildWeekBuckets([d(2026, 2, 10), d(2026, 2, 3), d(2026, 2, 4)], options);
        expect(buckets.map((b) => b.key)).toEqual(["2026-02-02", "2026-02-09"]);
        expect(buckets[0].rowIndices).toEqual([1, 2]);
        expect(buckets[1].rowIndices).toEqual([0]);
        expect(buckets.every((b) => b.kind === "week" && !b.inserted)).toBe(true);
    });

    it("keeps a week's rows in date order, whatever order they arrive in", () => {
        const { buckets } = buildWeekBuckets([d(2026, 2, 6), d(2026, 2, 3), d(2026, 2, 5), d(2026, 2, 4)], options);
        expect(buckets[0].rowIndices).toEqual([1, 3, 2, 0]);
    });

    it("inserts empty weeks, across the DST change, only when enabled", () => {
        const dates = [d(2026, 3, 16), d(2026, 4, 6)];
        const filled = buildWeekBuckets(dates, options).buckets;
        expect(filled.map((b) => b.key)).toEqual(["2026-03-16", "2026-03-23", "2026-03-30", "2026-04-06"]);
        expect(filled.map((b) => b.inserted)).toEqual([false, true, true, false]);
        expect(filled[1].rowIndices).toEqual([]);

        const sparse = buildWeekBuckets(dates, { ...options, showEmptyWeeks: false }).buckets;
        expect(sparse.map((b) => b.key)).toEqual(["2026-03-16", "2026-04-06"]);
    });

    it("excludes and counts null and non-date values", () => {
        const { buckets, excludedRows } = buildWeekBuckets([d(2026, 2, 3), null, "W05", d(2026, 2, 4)], options);
        expect(excludedRows).toBe(2);
        expect(buckets).toHaveLength(1);
        expect(buckets[0].rowIndices).toEqual([0, 3]);
    });

    it("returns no buckets when there are no valid dates", () => {
        expect(buildWeekBuckets([null], options)).toEqual({ buckets: [], excludedRows: 1, emptyWeeksSkipped: false });
    });

    it("doesn't fill empty weeks when an outlier date stretches the range past the cap", () => {
        const { buckets, emptyWeeksSkipped } = buildWeekBuckets([d(1899, 12, 30), d(2026, 2, 3)], options);
        expect(emptyWeeksSkipped).toBe(true);
        expect(buckets).toHaveLength(2);
        expect(MAX_FILLED_WEEKS).toBe(1000);
    });
});
