import { describe, expect, it } from "vitest";

import { columnExtent, lineExtent, niceDomain, percentDomain } from "../scales";

describe("columnExtent", () => {
    // measure → series → bucket
    const planned = [[10, 20], [5, 15]];
    const actual = [[8, null], [4, null]];

    it("stacks series per measure and bucket", () => {
        expect(columnExtent([planned, actual], "stacked")).toEqual([0, 35]);
    });

    it("compares single bars when clustered", () => {
        expect(columnExtent([planned, actual], "clustered")).toEqual([0, 20]);
    });

    it("stacks negatives separately from positives", () => {
        expect(columnExtent([[[10, -5], [3, -2]]], "stacked")).toEqual([-7, 13]);
    });

    it("returns null when there is nothing to draw", () => {
        expect(columnExtent([], "stacked")).toBeNull();
        expect(columnExtent([[[null, null]]], "stacked")).toBeNull();
    });
});

describe("lineExtent", () => {
    it("spans every plotted point and includes zero", () => {
        expect(lineExtent([[10, 30, null], [5, 60]])).toEqual([0, 60]);
        expect(lineExtent([[null]])).toBeNull();
    });
});

describe("niceDomain", () => {
    it("rounds outward to nice ticks", () => {
        const result = niceDomain([0, 93], {});
        expect(result?.domain).toEqual([0, 100]);
        expect(result?.ticks[0]).toBe(0);
        expect(result?.ticks.at(-1)).toBe(100);
    });

    it("lets fixed min and max override either end", () => {
        expect(niceDomain([0, 93], { max: 120 })?.domain).toEqual([0, 120]);
        expect(niceDomain([-12, 93], { min: -50 })?.domain).toEqual([-50, 100]);
    });

    it("returns null for an empty side and widens a flat extent", () => {
        expect(niceDomain(null, {})).toBeNull();
        const flat = niceDomain([0, 0], {});
        expect(flat?.domain[0]).toBe(0);
        expect(flat?.domain[1]).toBeGreaterThan(0);
    });
});

describe("percentDomain", () => {
    it("runs from 0 to at least 100 % and extends above it when needed", () => {
        expect(percentDomain([0, 0.6])?.domain).toEqual([0, 1]);
        expect(percentDomain([0, 1.13])?.domain[1]).toBeGreaterThanOrEqual(1.13);
        expect(percentDomain(null)?.domain).toEqual([0, 1]);
    });
});
