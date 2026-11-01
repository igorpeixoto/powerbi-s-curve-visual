import { describe, expect, it } from "vitest";

import { clusterSlots, computeGeometry, labelStep, resolveGutters } from "../geometry";

const base = { leftGutter: 60, rightGutter: 50, bucketGap: 0.2, minBucketWidth: 0 };

describe("resolveGutters", () => {
    it("takes the wider of the axis and the matrix column on each side", () => {
        expect(resolveGutters({ leftAxisWidth: 40, matrixHeaderWidth: 90, rightAxisWidth: 45, totalsWidth: 30 }))
            .toEqual({ left: 90, right: 45 });
    });
});

describe("computeGeometry", () => {
    it("divides the plot range between the gutters into equal buckets", () => {
        const g = computeGeometry({ ...base, width: 810, bucketCount: 10 });
        expect(g.plotLeft).toBe(60);
        expect(g.plotWidth).toBe(700);
        expect(g.bucketWidth).toBe(70);
        expect(g.scrollable).toBe(false);
        expect(g.buckets[0]).toMatchObject({ index: 0, x0: 0, x1: 70, center: 35 });
        expect(g.buckets[9]).toMatchObject({ x0: 630, x1: 700, center: 665 });
    });

    it("leaves the bucket gap around the band that bars and matrix cells use", () => {
        const g = computeGeometry({ ...base, width: 810, bucketCount: 10 });
        expect(g.buckets[0].bandStart).toBeCloseTo(7);
        expect(g.buckets[0].bandWidth).toBeCloseTo(56);
        expect(g.buckets[0].bandStart + g.buckets[0].bandWidth / 2).toBeCloseTo(g.buckets[0].center);
    });

    it("keeps every bucket centre inside the plot at any width and count", () => {
        for (const width of [400, 800, 1200, 2000]) {
            for (const bucketCount of [1, 7, 52, 300]) {
                const g = computeGeometry({ ...base, width, bucketCount });
                expect(g.buckets).toHaveLength(bucketCount);
                expect(g.buckets.at(-1)?.x1).toBeCloseTo(g.contentWidth);
                expect(g.contentWidth).toBeCloseTo(g.plotWidth);
                g.buckets.forEach((b, i) => expect(b.center).toBeCloseTo((i + 0.5) * g.bucketWidth));
            }
        }
    });

    it("scrolls when the minimum bucket width doesn't fit", () => {
        const g = computeGeometry({ ...base, width: 810, bucketCount: 50, minBucketWidth: 30 });
        expect(g.bucketWidth).toBe(30);
        expect(g.contentWidth).toBe(1500);
        expect(g.scrollable).toBe(true);
        expect(g.plotWidth).toBe(700);
    });

    it("degrades without negative sizes when there is no room or no buckets", () => {
        const tiny = computeGeometry({ ...base, width: 80, bucketCount: 5 });
        expect(tiny.plotWidth).toBe(0);
        expect(tiny.buckets.every((b) => b.bandWidth >= 0)).toBe(true);
        expect(computeGeometry({ ...base, width: 800, bucketCount: 0 }).buckets).toEqual([]);
    });
});

describe("clusterSlots", () => {
    it("splits a band into equal slots centred on the bucket", () => {
        const slots = clusterSlots({ bandStart: 10, bandWidth: 100 }, 2, 0.1);
        expect(slots).toHaveLength(2);
        expect(slots[0].width).toBeCloseTo(slots[1].width);
        const left = slots[0].x;
        const right = slots[1].x + slots[1].width;
        expect((left + right) / 2).toBeCloseTo(60);
        expect(slots[1].x).toBeGreaterThan(slots[0].x + slots[0].width);
    });

    it("gives one slot the whole band", () => {
        expect(clusterSlots({ bandStart: 10, bandWidth: 100 }, 1, 0.1)).toEqual([{ x: 10, width: 100 }]);
        expect(clusterSlots({ bandStart: 10, bandWidth: 100 }, 0, 0.1)).toEqual([]);
    });
});

describe("labelStep", () => {
    it("shows every label when they fit, otherwise every 2nd, 4th, …", () => {
        expect(labelStep(60, 40)).toBe(1);
        expect(labelStep(30, 40)).toBe(2);
        expect(labelStep(12, 40)).toBe(4);
        expect(labelStep(1, 40)).toBe(64);
    });
});
