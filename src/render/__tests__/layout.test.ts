import { describe, expect, it } from "vitest";

import { computeLayout, MIN_CHART_HEIGHT, type LayoutInput } from "../layout";

const base = (): LayoutInput => ({
    width: 800,
    height: 500,
    legend: { show: true, position: "top", itemWidths: [100, 100, 100], itemHeight: 20 },
    axes: { leftWidth: 40, rightWidth: 45, xLabelHeight: 20 },
    matrix: { show: true, rowCount: 4, rowHeight: 20, headerWidth: 120, totalsWidth: 60, maxHeightPercent: 50 },
    bucketCount: 20,
    bucketGap: 0.2,
    minBucketWidth: 0,
    scrollbarSize: 15,
});

describe("computeLayout", () => {
    it("stacks legend, chart and matrix, and shares gutters between chart and matrix", () => {
        const layout = computeLayout(base());
        expect(layout.legend?.rect).toEqual({ x: 0, y: 0, width: 800, height: 20 });
        expect(layout.block).toEqual({ x: 0, y: 20, width: 800, height: 480 });
        expect(layout.matrix?.rect.height).toBe(100); // header + 4 rows
        expect(layout.chartHeight).toBe(380);
        expect(layout.matrix?.rect.y).toBe(400);
        expect(layout.geometry.plotLeft).toBe(120); // the wider of the axis (40) and the row headers (120)
        expect(layout.geometry.plotWidth).toBe(800 - 120 - 60);
        expect(layout.plotBottom).toBe(360);
        expect(layout.xScrollbar).toBeNull();
    });

    it("caps the matrix height, scrolls it vertically and reserves the scrollbar in the right gutter", () => {
        const layout = computeLayout({ ...base(), matrix: { ...base().matrix, rowCount: 30 } });
        expect(layout.matrix?.verticalScroll).toBe(true);
        expect(layout.matrix?.bodyHeight).toBe(480 * 0.5 - 20);
        expect(layout.geometry.plotWidth).toBe(800 - 120 - (60 + 15));
    });

    it("hides the matrix when the chart would get too short", () => {
        const layout = computeLayout({ ...base(), height: 250, matrix: { ...base().matrix, rowCount: 6 } });
        expect(layout.matrix).toBeNull();
        expect(layout.matrixHiddenForSpace).toBe(true);
        expect(layout.geometry.plotLeft).toBe(40); // row headers no longer widen the gutter
    });

    it("keeps the matrix at 400 × 500, the smallest size the harness checks", () => {
        const layout = computeLayout({ ...base(), width: 400 });
        expect(layout.matrix).not.toBeNull();
        expect(layout.chartHeight).toBeGreaterThanOrEqual(MIN_CHART_HEIGHT);
        expect(layout.tooSmall).toBe(false);
    });

    it("adds a horizontal scrollbar under the plot range when buckets can't fit", () => {
        const layout = computeLayout({ ...base(), bucketCount: 100, minBucketWidth: 30 });
        expect(layout.geometry.scrollable).toBe(true);
        expect(layout.xScrollbar).toEqual({ x: 120, y: 20 + layout.chartHeight + 100, width: layout.geometry.plotWidth, height: 15 });
    });

    it("wraps a top legend into rows and moves a side legend beside the block", () => {
        const wrapped = computeLayout({ ...base(), width: 300, legend: { ...base().legend, itemWidths: [120, 120, 120] } });
        expect(wrapped.legend?.items).toEqual([{ x: 0, y: 0 }, { x: 132, y: 0 }, { x: 0, y: 20 }]);
        expect(wrapped.legend?.rect.height).toBe(40);

        const left = computeLayout({ ...base(), legend: { ...base().legend, position: "left" } });
        expect(left.legend?.rect).toEqual({ x: 0, y: 0, width: 100, height: 500 });
        expect(left.block.x).toBe(112);
        expect(left.block.width).toBe(800 - 112);
    });

    it("flags a viewport too small for any chart", () => {
        expect(computeLayout({ ...base(), width: 100, height: 60 }).tooSmall).toBe(true);
    });
});
