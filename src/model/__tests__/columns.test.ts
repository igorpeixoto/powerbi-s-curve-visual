import { describe, expect, it } from "vitest";

import { buildBarLayout, buildHighlightLayout } from "../columns";

const pick = (layout: ReturnType<typeof buildBarLayout>, bucketIndex: number) =>
    layout.segments.filter((s) => s.bucketIndex === bucketIndex).map((s) => [s.measureKey, s.seriesIndex, s.slot, s.base, s.top]);

describe("buildBarLayout", () => {
    it("gives each measure its own slot without series", () => {
        const layout = buildBarLayout([
            { measureKey: "planned", rows: [[10, 20]] },
            { measureKey: "actual", rows: [[8, null]] },
        ], false, "stacked", 2);
        expect(layout.slotCount).toBe(2);
        expect(pick(layout, 0)).toEqual([["planned", null, 0, 0, 10], ["actual", null, 1, 0, 8]]);
        expect(pick(layout, 1)).toEqual([["planned", null, 0, 0, 20]]); // null draws nothing
    });

    it("stacks series within a measure's slot, positives and negatives separately", () => {
        const layout = buildBarLayout([{ measureKey: "planned", rows: [[10], [-4], [5], [-2]] }], true, "stacked", 1);
        expect(layout.slotCount).toBe(1);
        expect(pick(layout, 0)).toEqual([
            ["planned", 0, 0, 0, 10],
            ["planned", 1, 0, 0, -4],
            ["planned", 2, 0, 10, 15],
            ["planned", 3, 0, -4, -6],
        ]);
    });

    it("gives every measure × series its own slot when clustered", () => {
        const layout = buildBarLayout([
            { measureKey: "planned", rows: [[10], [5]] },
            { measureKey: "actual", rows: [[8], [4]] },
        ], true, "clustered", 1);
        expect(layout.slotCount).toBe(4);
        expect(pick(layout, 0).map((s) => s[2])).toEqual([0, 1, 2, 3]);
        expect(pick(layout, 0).every((s) => s[3] === 0)).toBe(true);
    });

    it("keeps zero as a zero-height bar", () => {
        const layout = buildBarLayout([{ measureKey: "planned", rows: [[0]] }], false, "stacked", 1);
        expect(pick(layout, 0)).toEqual([["planned", null, 0, 0, 0]]);
    });
});

describe("buildHighlightLayout", () => {
    const parts = (layout: ReturnType<typeof buildBarLayout>) => layout.segments.map((s) => [s.seriesIndex, s.base, s.top, s.value]);

    it("keeps each highlight inside its own series' stacked segment", () => {
        const full = buildBarLayout([{ measureKey: "planned", rows: [[10], [10], [-4], [-6]] }], true, "stacked", 1);
        const highlight = buildHighlightLayout(full, [{ measureKey: "planned", rows: [[2], [5], [-1], [-3]] }]);
        expect(parts(highlight)).toEqual([[0, 0, 2, 2], [1, 10, 15, 5], [2, 0, -1, -1], [3, -4, -7, -3]]);
        expect(highlight.slotCount).toBe(full.slotCount);
    });

    it("starts from zero when clustered and without series", () => {
        const clustered = buildBarLayout([{ measureKey: "planned", rows: [[10], [10]] }], true, "clustered", 1);
        expect(parts(buildHighlightLayout(clustered, [{ measureKey: "planned", rows: [[2], [5]] }]))).toEqual([[0, 0, 2, 2], [1, 0, 5, 5]]);
        const single = buildBarLayout([{ measureKey: "planned", rows: [[10]] }], false, "stacked", 1);
        expect(parts(buildHighlightLayout(single, [{ measureKey: "planned", rows: [[4]] }]))).toEqual([[null, 0, 4, 4]]);
    });

    it("draws nothing for a null highlight, or for one with no full bar to sit in", () => {
        const full = buildBarLayout([{ measureKey: "planned", rows: [[10, null]] }], false, "stacked", 2);
        expect(buildHighlightLayout(full, [{ measureKey: "planned", rows: [[null, 3]] }]).segments).toEqual([]);
    });
});
