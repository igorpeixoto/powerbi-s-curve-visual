// Pure layout: splits the viewport into legend, chart, matrix and scrollbar, and computes the shared x
// geometry from the resolved gutters (SPEC §3). Text sizes are measured by the caller and passed in.
import { computeGeometry, type XGeometry } from "../model/geometry";
import type { LegendPosition } from "./options";

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LayoutInput {
    width: number;
    height: number;
    legend: { show: boolean; position: LegendPosition; itemWidths: number[]; itemHeight: number };
    /** Widths are 0 when the axis is hidden. */
    axes: { leftWidth: number; rightWidth: number; xLabelHeight: number };
    /** totalsWidth is 0 when the totals column is off. */
    matrix: { show: boolean; rowCount: number; rowHeight: number; headerWidth: number; totalsWidth: number; maxHeightPercent: number };
    bucketCount: number;
    bucketGap: number;
    minBucketWidth: number;
    /** Width of a native scrollbar in this environment (0 for overlay scrollbars). */
    scrollbarSize: number;
}

export interface LegendLayout {
    rect: Rect;
    /** Item positions relative to the legend; null for items that don't fit. */
    items: ({ x: number; y: number } | null)[];
}

export interface MatrixLayout {
    /** The header row (pinned) plus the scrolling body. */
    rect: Rect;
    headerHeight: number;
    bodyHeight: number;
    contentHeight: number;
    verticalScroll: boolean;
}

export interface Layout {
    tooSmall: boolean;
    legend: LegendLayout | null;
    /** Chart + matrix + scrollbar, in visual coordinates. */
    block: Rect;
    /** Chart height; the chart starts at block.y. */
    chartHeight: number;
    /** Plot top and bottom, relative to the chart. */
    plotTop: number;
    plotBottom: number;
    matrix: MatrixLayout | null;
    matrixHiddenForSpace: boolean;
    /** Horizontal scrollbar under the plot range, in visual coordinates; null when everything fits. */
    xScrollbar: Rect | null;
    /** Shared x geometry; plotLeft is relative to block.x. */
    geometry: XGeometry;
}

export const MIN_VISUAL_WIDTH = 120;
export const MIN_VISUAL_HEIGHT = 80;
export const MIN_CHART_HEIGHT = 120;
export const PLOT_TOP_PADDING = 14;
const MIN_GUTTER = 8;
const LEGEND_GAP = 12;
const LEGEND_MAX_SHARE = 0.3;
/** Widest a left or right legend gets, as a share of the visual's width. */
export const LEGEND_SIDE_SHARE = 0.25;

function layoutLegend(input: LayoutInput): LegendLayout | null {
    const { legend, width, height } = input;
    if (!legend.show || legend.itemWidths.length === 0) return null;
    const vertical = legend.position === "left" || legend.position === "right";
    const items: ({ x: number; y: number } | null)[] = [];

    if (vertical) {
        const legendWidth = Math.min(Math.max(...legend.itemWidths), width * LEGEND_SIDE_SHARE);
        const maxItems = Math.max(0, Math.floor(height / legend.itemHeight));
        legend.itemWidths.forEach((_, i) => items.push(i < maxItems ? { x: 0, y: i * legend.itemHeight } : null));
        const x = legend.position === "left" ? 0 : width - legendWidth;
        return { rect: { x, y: 0, width: legendWidth, height }, items };
    }

    const maxRows = Math.max(1, Math.floor((height * LEGEND_MAX_SHARE) / legend.itemHeight));
    let row = 0;
    let x = 0;
    for (const itemWidth of legend.itemWidths) {
        if (x > 0 && x + itemWidth > width) {
            row += 1;
            x = 0;
        }
        items.push(row < maxRows ? { x, y: row * legend.itemHeight } : null);
        x += itemWidth + LEGEND_GAP;
    }
    const legendHeight = (Math.min(row, maxRows - 1) + 1) * legend.itemHeight;
    const y = legend.position === "top" ? 0 : height - legendHeight;
    return { rect: { x: 0, y, width, height: legendHeight }, items };
}

export function computeLayout(input: LayoutInput): Layout {
    const legend = layoutLegend(input);
    const block = legendBlock(input, legend);
    const tooSmall = input.width < MIN_VISUAL_WIDTH || input.height < MIN_VISUAL_HEIGHT;

    const resolve = (withMatrix: boolean): Layout => {
        const m = input.matrix;
        const showMatrix = withMatrix && m.show && m.rowCount > 0;
        const headerHeight = showMatrix ? m.rowHeight : 0;
        const contentHeight = showMatrix ? m.rowCount * m.rowHeight : 0;
        const maxMatrixHeight = Math.max(0, (block.height * m.maxHeightPercent) / 100 - headerHeight);
        const bodyHeight = Math.min(contentHeight, maxMatrixHeight);
        const verticalScroll = showMatrix && contentHeight > bodyHeight + 0.5;

        const leftGutter = Math.max(MIN_GUTTER, input.axes.leftWidth, showMatrix ? m.headerWidth : 0);
        const rightGutter = Math.max(MIN_GUTTER, input.axes.rightWidth, showMatrix ? m.totalsWidth + (verticalScroll ? input.scrollbarSize : 0) : 0);
        const geometry = computeGeometry({
            width: block.width,
            bucketCount: input.bucketCount,
            leftGutter,
            rightGutter,
            bucketGap: input.bucketGap,
            minBucketWidth: input.minBucketWidth,
        });

        const scrollbarHeight = geometry.scrollable ? Math.max(input.scrollbarSize, 8) : 0;
        const matrixHeight = showMatrix ? headerHeight + bodyHeight : 0;
        const chartHeight = Math.max(0, block.height - matrixHeight - scrollbarHeight);
        const plotBottom = chartHeight - input.axes.xLabelHeight;

        return {
            tooSmall: tooSmall || plotBottom - PLOT_TOP_PADDING < 20,
            legend,
            block,
            chartHeight,
            plotTop: PLOT_TOP_PADDING,
            plotBottom,
            matrix: showMatrix
                ? { rect: { x: block.x, y: block.y + chartHeight, width: block.width, height: matrixHeight }, headerHeight, bodyHeight, contentHeight, verticalScroll }
                : null,
            matrixHiddenForSpace: false,
            xScrollbar: geometry.scrollable
                ? { x: block.x + geometry.plotLeft, y: block.y + chartHeight + matrixHeight, width: geometry.plotWidth, height: scrollbarHeight }
                : null,
            geometry,
        };
    };

    const withMatrix = resolve(true);
    if (withMatrix.matrix && withMatrix.chartHeight < MIN_CHART_HEIGHT) {
        return { ...resolve(false), matrixHiddenForSpace: true };
    }
    return withMatrix;
}

function legendBlock(input: LayoutInput, legend: LegendLayout | null): Rect {
    if (!legend) return { x: 0, y: 0, width: input.width, height: input.height };
    switch (input.legend.position) {
        case "top":
            return { x: 0, y: legend.rect.height, width: input.width, height: input.height - legend.rect.height };
        case "bottom":
            return { x: 0, y: 0, width: input.width, height: input.height - legend.rect.height };
        case "left":
            return { x: legend.rect.width + LEGEND_GAP, y: 0, width: input.width - legend.rect.width - LEGEND_GAP, height: input.height };
        case "right":
            return { x: 0, y: 0, width: input.width - legend.rect.width - LEGEND_GAP, height: input.height };
    }
}
