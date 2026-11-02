import { describe, expect, it } from "vitest";

import { emphasisOf, isLocalOnly, matches, nextSelection, pruneSelection, type Selector } from "../selectionState";

const sel = (bucket: string | null, series: string | null, measure: string | null): Selector => ({ bucket, series, measure });
const bar = sel("2026-02-02", "Civil", "columnValues:P");

describe("matches", () => {
    it("requires every field the selector names", () => {
        expect(matches(sel("2026-02-02", null, null), bar)).toBe(true);
        expect(matches(sel("2026-02-09", null, null), bar)).toBe(false);
        expect(matches(sel(null, "Civil", null), bar)).toBe(true);
        expect(matches(sel(null, "Electrical", null), bar)).toBe(false);
        expect(matches(sel("2026-02-02", "Civil", "columnValues:P"), bar)).toBe(true);
        expect(matches(sel(null, null, "lineValues:P"), bar)).toBe(false);
    });

    it("doesn't let a series selection match a total-across-series mark", () => {
        expect(matches(sel(null, "Civil", null), sel("2026-02-02", null, "lineValues:P"))).toBe(false);
    });

    it("lets line paths ignore the bucket", () => {
        expect(matches(sel("2026-02-02", null, null), sel(null, null, "lineValues:P"), { ignoreBucket: true })).toBe(true);
    });
});

describe("emphasisOf", () => {
    it("is normal without a selection, otherwise selected or dimmed", () => {
        expect(emphasisOf([], bar)).toBe("normal");
        expect(emphasisOf([sel(null, "Civil", null)], bar)).toBe("selected");
        expect(emphasisOf([sel(null, "Electrical", null)], bar)).toBe("dimmed");
    });
});

describe("nextSelection", () => {
    const a = sel("2026-02-02", null, null);
    const b = sel("2026-02-09", null, null);

    it("selects only the clicked mark, and clears when it was the only one", () => {
        expect(nextSelection([], a, false)).toEqual([a]);
        expect(nextSelection([b], a, false)).toEqual([a]);
        expect(nextSelection([a], a, false)).toEqual([]);
        expect(nextSelection([a, b], a, false)).toEqual([a]);
    });

    it("toggles membership with Ctrl/Cmd", () => {
        expect(nextSelection([a], b, true)).toEqual([a, b]);
        expect(nextSelection([a, b], a, true)).toEqual([b]);
    });
});

describe("pruneSelection", () => {
    it("drops selectors naming data that no longer exists", () => {
        const available = { buckets: new Set(["2026-02-02"]), series: new Set(["Civil"]), measures: new Set(["columnValues:P"]) };
        expect(pruneSelection([bar, sel("2026-02-09", null, null), sel(null, "Electrical", null), sel(null, null, "columnValues:P")], available))
            .toEqual([bar, sel(null, null, "columnValues:P")]);
    });
});

describe("isLocalOnly", () => {
    it("keeps measure-only selections inside the visual", () => {
        expect(isLocalOnly(sel(null, null, "lineValues:P"))).toBe(true);
        expect(isLocalOnly(sel(null, "Civil", "columnValues:P"))).toBe(false);
        expect(isLocalOnly(sel("2026-02-02", null, null))).toBe(false);
    });
});
