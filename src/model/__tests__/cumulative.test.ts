import { describe, expect, it } from "vitest";

import { asProvided, baselineOf, runningTotal, toPercent } from "../cumulative";

describe("runningTotal", () => {
    it("accumulates in bucket order", () => {
        expect(runningTotal([10, 20, 30], "lastValue")).toEqual([10, 30, 60]);
    });

    it("carries the previous total across null (unreported) buckets", () => {
        expect(runningTotal([10, null, 5, 0], "lastValue")).toEqual([10, 10, 15, 15]);
    });

    it("stops after the last reported bucket by default (actuals end at the last reported week)", () => {
        expect(runningTotal([8, 12, null, null], "lastValue")).toEqual([8, 20, null, null]);
    });

    it("treats zero as reported, so the line continues through it", () => {
        expect(runningTotal([8, 12, 0, null], "lastValue")).toEqual([8, 20, 20, null]);
    });

    it("carries the last total to the final bucket with lastBucket", () => {
        expect(runningTotal([8, 12, null, null], "lastBucket")).toEqual([8, 20, 20, 20]);
    });

    it("starts at the first reported bucket", () => {
        expect(runningTotal([null, null, 5, 5], "lastBucket")).toEqual([null, null, 5, 10]);
    });

    it("handles negative values, a single bucket and no values", () => {
        expect(runningTotal([10, -4, 2], "lastValue")).toEqual([10, 6, 8]);
        expect(runningTotal([7], "lastValue")).toEqual([7]);
        expect(runningTotal([null, null], "lastBucket")).toEqual([null, null]);
        expect(runningTotal([], "lastValue")).toEqual([]);
    });
});

describe("asProvided", () => {
    it("plots values as they arrive, leaving gaps for nulls inside the range", () => {
        expect(asProvided([5, null, 15, null], "lastValue")).toEqual([5, null, 15, null]);
    });

    it("carries the last provided value to the end with lastBucket", () => {
        expect(asProvided([5, 10, null, null], "lastBucket")).toEqual([5, 10, 10, 10]);
    });
});

describe("baselineOf and toPercent", () => {
    it("uses the sum for running totals and the last value for cumulative inputs", () => {
        expect(baselineOf([10, null, 30], "runningTotal")).toBe(40);
        expect(baselineOf([10, 25, null], "asProvided")).toBe(25);
        expect(baselineOf([null], "runningTotal")).toBeNull();
    });

    it("divides by the baseline and keeps nulls", () => {
        expect(toPercent([10, 20, null, 50], 40)).toEqual([0.25, 0.5, null, 1.25]);
    });

    it("refuses a zero or missing baseline instead of dividing by zero", () => {
        expect(toPercent([1, 2], 0)).toBeNull();
        expect(toPercent([1, 2], null)).toBeNull();
    });
});
