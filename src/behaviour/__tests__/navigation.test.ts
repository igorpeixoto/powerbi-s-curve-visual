import { describe, expect, it } from "vitest";

import { buildFocusRows, clampFocus, moveFocus } from "../navigation";

describe("buildFocusRows", () => {
    it("orders bars (per series), then lines, then matrix rows", () => {
        const rows = buildFocusRows({
            columnMeasureKeys: ["columnValues:P"],
            seriesCount: 2,
            hasSeries: true,
            lines: [{ measureKey: "lineValues:P", seriesIndex: null }],
            matrixRowCount: 2,
        });
        expect(rows).toEqual([
            { kind: "bar", measureKey: "columnValues:P", seriesIndex: 0 },
            { kind: "bar", measureKey: "columnValues:P", seriesIndex: 1 },
            { kind: "point", measureKey: "lineValues:P", seriesIndex: null },
            { kind: "cell", matrixRow: 0 },
            { kind: "cell", matrixRow: 1 },
        ]);
    });
});

describe("clampFocus", () => {
    it("keeps a focus that still fits and moves one that doesn't onto the grid", () => {
        expect(clampFocus({ row: 1, bucket: 4 }, 3, 10)).toEqual({ row: 1, bucket: 4 });
        expect(clampFocus({ row: 7, bucket: 40 }, 3, 10)).toEqual({ row: 2, bucket: 9 });
    });

    it("drops the focus when nothing is left to focus", () => {
        expect(clampFocus(null, 3, 10)).toBeNull();
        expect(clampFocus({ row: 1, bucket: 4 }, 0, 10)).toBeNull();
        expect(clampFocus({ row: 1, bucket: 4 }, 3, 0)).toBeNull();
    });
});

describe("moveFocus", () => {
    it("lands on the first row and bucket on the first key press", () => {
        expect(moveFocus(null, "ArrowRight", 3, 10)).toEqual({ row: 0, bucket: 0 });
    });

    it("moves between buckets and rows, clamped to the grid", () => {
        expect(moveFocus({ row: 1, bucket: 4 }, "ArrowRight", 3, 10)).toEqual({ row: 1, bucket: 5 });
        expect(moveFocus({ row: 1, bucket: 0 }, "ArrowLeft", 3, 10)).toEqual({ row: 1, bucket: 0 });
        expect(moveFocus({ row: 2, bucket: 4 }, "ArrowDown", 3, 10)).toEqual({ row: 2, bucket: 4 });
        expect(moveFocus({ row: 2, bucket: 4 }, "ArrowUp", 3, 10)).toEqual({ row: 1, bucket: 4 });
        expect(moveFocus({ row: 1, bucket: 4 }, "End", 3, 10)).toEqual({ row: 1, bucket: 9 });
        expect(moveFocus({ row: 1, bucket: 4 }, "Home", 3, 10)).toEqual({ row: 1, bucket: 0 });
    });

    it("re-clamps a focus left over from data that shrank", () => {
        expect(moveFocus({ row: 7, bucket: 40 }, "ArrowLeft", 3, 10)).toEqual({ row: 2, bucket: 8 });
    });

    it("has nowhere to go without rows or buckets", () => {
        expect(moveFocus(null, "ArrowDown", 0, 10)).toBeNull();
        expect(moveFocus({ row: 0, bucket: 0 }, "ArrowDown", 3, 0)).toBeNull();
    });
});
