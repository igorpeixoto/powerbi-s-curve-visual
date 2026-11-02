import { describe, expect, it } from "vitest";

import { aggregateTotal, combine, combineTooltip, isIsolated, sumAcross, toNumber } from "../values";

describe("toNumber", () => {
    it("keeps finite numbers and maps everything else to null", () => {
        expect(toNumber(12.5)).toBe(12.5);
        expect(toNumber(0)).toBe(0);
        expect(toNumber(-3)).toBe(-3);
        expect(toNumber(null)).toBeNull();
        expect(toNumber(undefined)).toBeNull();
        expect(toNumber(Number.NaN)).toBeNull();
        expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull();
        expect(toNumber("12")).toBeNull();
    });
});

describe("combine (values falling into one bucket)", () => {
    it("sums non-null values and keeps zero distinct from null", () => {
        expect(combine([1, null, 2], "sum")).toBe(3);
        expect(combine([0, null], "sum")).toBe(0);
        expect(combine([null, null], "sum")).toBeNull();
        expect(combine([], "sum")).toBeNull();
    });

    it("takes the last non-null value for cumulative inputs", () => {
        expect(combine([10, 15, null], "last")).toBe(15);
        expect(combine([null, null], "last")).toBeNull();
    });
});

describe("aggregateTotal (matrix totals column)", () => {
    const row = [10, null, 20, 0];

    it("supports sum, last, average and none", () => {
        expect(aggregateTotal(row, "sum")).toBe(30);
        expect(aggregateTotal(row, "last")).toBe(0);
        expect(aggregateTotal(row, "average")).toBe(10);
        expect(aggregateTotal(row, "none")).toBeNull();
    });

    it("returns null for a row with no values", () => {
        expect(aggregateTotal([null, null], "sum")).toBeNull();
        expect(aggregateTotal([null, null], "average")).toBeNull();
    });
});

describe("sumAcross (total across series)", () => {
    it("sums per bucket and keeps buckets where every series is null as null", () => {
        expect(sumAcross([[1, null, null], [2, 3, null]])).toEqual([3, 3, null]);
    });

    it("returns an empty row for no series", () => {
        expect(sumAcross([])).toEqual([]);
    });
});

describe("combineTooltip", () => {
    it("adds up numbers and ignores blanks", () => {
        expect(combineTooltip([2, null, 3, undefined])).toBe(5);
        expect(combineTooltip([0])).toBe(0);
    });

    it("shows the latest value of anything else", () => {
        expect(combineTooltip(["fine", null, "late", null])).toBe("late");
        expect(combineTooltip([1, "late", 2])).toBe(2);
    });

    it("is null with nothing to show", () => {
        expect(combineTooltip([])).toBeNull();
        expect(combineTooltip([null, undefined])).toBeNull();
    });
});

describe("isIsolated", () => {
    it("finds reported points with no reported neighbour", () => {
        const values = [1, null, 2, 3, null, null, 4];
        expect(values.map((_, i) => isIsolated(values, i))).toEqual([true, false, false, false, false, false, true]);
        expect(isIsolated([5], 0)).toBe(true);
    });
});
