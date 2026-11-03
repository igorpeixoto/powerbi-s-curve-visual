// Draws the aligned matrix: a pinned header row, then the rows in a body that scrolls vertically.
// Cells are absolutely positioned from the shared geometry, never laid out by a table algorithm.
import type { Selection } from "d3";

import { matrixGridLineWidth, ptToPx } from "./options";
import type { Scene } from "./scene";
import { applyFont, truncate } from "./measure";

type DivSelection = Selection<HTMLDivElement, unknown, null, undefined>;
type GSelection = Selection<SVGGElement, unknown, null, undefined>;

export interface MatrixHandles {
    scrolled: GSelection[];
}

export function drawMatrix(container: DivSelection, scene: Scene, clipId: string, scrollX: number, scrollbarSize: number): MatrixHandles {
    container.selectAll("*").remove();
    const matrix = scene.layout.matrix;
    if (!matrix) {
        container.style("display", "none");
        return { scrolled: [] };
    }
    const { options, theme, layout } = scene;
    const geometry = layout.geometry;
    const rowHeight = options.matrix.rowHeight;
    const fontPt = options.matrix.fontSize;
    const fontPx = ptToPx(fontPt);
    const bodyWidth = matrix.rect.width - (matrix.verticalScroll ? scrollbarSize : 0);
    const plotRight = geometry.plotLeft + geometry.plotWidth;
    const totalsWidth = Math.max(0, bodyWidth - plotRight);

    container
        .style("display", null)
        .style("left", `${matrix.rect.x}px`).style("top", `${matrix.rect.y}px`)
        .style("width", `${matrix.rect.width}px`).style("height", `${matrix.rect.height}px`);

    // Header row: only the totals column has a heading; the x-axis labels above name the buckets.
    const header = container.append("svg").attr("class", "s-curve__matrix-header")
        .attr("width", matrix.rect.width).attr("height", matrix.headerHeight);
    if (options.matrix.showTotals && totalsWidth > 0) {
        header.append("text")
            .attr("data-role", "totals-header")
            .attr("x", plotRight + totalsWidth / 2).attr("y", matrix.headerHeight / 2).attr("dy", "0.35em")
            .attr("text-anchor", "middle").attr("fill", scene.ink.matrixHeader)
            .style("font-size", `${fontPx}px`)
            .call(applyFont, scene.totalsHeaderFont)
            .text(truncate(scene.totalsLabel, totalsWidth - 8, (t) => scene.measure(t, fontPt, scene.totalsHeaderFont)));
    }
    const gridLine = matrixGridLineWidth(options.matrix.showBorders);
    const headerLine = options.matrix.headerLineWidth ?? gridLine;
    if (headerLine > 0) {
        header.append("line")
            .attr("data-role", "header-line")
            .attr("x1", 0).attr("x2", bodyWidth).attr("y1", matrix.headerHeight - headerLine / 2).attr("y2", matrix.headerHeight - headerLine / 2)
            .attr("stroke", scene.ink.matrixBorder).attr("stroke-width", headerLine);
    }

    const body = container.append("div").attr("class", "s-curve__matrix-body")
        .style("height", `${matrix.bodyHeight}px`)
        .style("overflow-y", matrix.verticalScroll ? "auto" : "hidden");
    const svg = body.append("svg").attr("width", bodyWidth).attr("height", matrix.contentHeight);
    svg.append("defs").append("clipPath").attr("id", clipId)
        .append("rect").attr("x", geometry.plotLeft).attr("y", 0).attr("width", geometry.plotWidth).attr("height", matrix.contentHeight);

    const rows = scene.matrixRows;
    if (options.matrix.banding) {
        svg.append("g").selectAll("rect").data(rows.filter((_, i) => i % 2 === 1)).join("rect")
            .attr("x", 0).attr("width", bodyWidth).attr("y", (r) => rows.indexOf(r) * rowHeight).attr("height", rowHeight)
            .attr("fill", theme.banding);
    }

    // Row headers, pinned in the left gutter.
    svg.append("g").attr("class", "s-curve__row-headers").selectAll("text").data(rows).join("text")
        .attr("data-role", "row-header")
        .attr("data-row", (_, i) => i)
        .attr("x", (r) => 12 + (r.level ? 12 : 0))
        .attr("y", (_, i) => i * rowHeight + rowHeight / 2).attr("dy", "0.35em")
        .attr("fill", scene.ink.matrixHeader)
        .style("font-size", `${fontPx}px`)
        .call(applyFont, options.matrix.font)
        .style("font-weight", (r) => (scene.matrixRowFont(r).bold ? 600 : null))
        .text((r) => truncate(r.label, geometry.plotLeft - 18 - (r.level ? 12 : 0), (t) => scene.measure(t, fontPt, scene.matrixRowFont(r))));

    // Cells, in the scrolled plot range.
    const cells = svg.append("g").attr("clip-path", `url(#${clipId})`)
        .append("g").attr("class", "s-curve__cells").attr("transform", `translate(${geometry.plotLeft - scrollX},0)`);
    rows.forEach((row, rowIndex) => {
        const y = rowIndex * rowHeight;
        const group = cells.append("g").attr("data-row", rowIndex);
        group.selectAll("rect").data(geometry.buckets).join("rect")
            .attr("data-role", "cell")
            .attr("data-bucket", (b) => b.index)
            .attr("data-row", rowIndex)
            .attr("x", (b) => b.x0).attr("width", (b) => b.x1 - b.x0)
            .attr("y", y).attr("height", rowHeight)
            .attr("fill", "transparent");
        group.selectAll("text").data(geometry.buckets).join("text")
            .attr("data-role", "cell-text")
            .attr("data-bucket", (b) => b.index)
            .attr("data-row", rowIndex)
            .attr("x", (b) => b.center)
            .attr("y", y + rowHeight / 2).attr("dy", "0.35em")
            .attr("text-anchor", "middle").attr("fill", scene.ink.matrixText)
            .style("font-size", `${fontPx}px`)
            .call(applyFont, options.matrix.font)
            .text((b) => scene.cellText(row, row.values[b.index] ?? null, b.x1 - b.x0 - 4));
    });

    // Column lines only: the rows' horizontal lines are drawn below, because each one can have its own width.
    if (options.matrix.showBorders) {
        const edges = geometry.buckets.length ? [...geometry.buckets.map((b) => b.x0), geometry.buckets[geometry.buckets.length - 1].x1] : [];
        cells.append("g").selectAll("line").data(edges).join("line")
            .attr("data-role", "column-line")
            .attr("x1", (x) => x).attr("x2", (x) => x)
            .attr("y1", 0).attr("y2", matrix.contentHeight)
            .attr("stroke", scene.ink.matrixBorder).attr("stroke-width", 0.5);
    }

    // Totals column, pinned in the right gutter.
    if (options.matrix.showTotals && totalsWidth > 0) {
        svg.append("g").attr("class", "s-curve__totals").selectAll("text").data(rows).join("text")
            .attr("data-role", "total")
            .attr("data-row", (_, i) => i)
            .attr("x", plotRight + totalsWidth / 2)
            .attr("y", (_, i) => i * rowHeight + rowHeight / 2).attr("dy", "0.35em")
            .attr("text-anchor", "middle").attr("fill", scene.ink.matrixText)
            .style("font-size", `${fontPx}px`)
            .call(applyFont, options.matrix.font)
            .style("font-weight", (r) => (scene.matrixRowFont(r).bold ? 600 : null))
            .text((r) => scene.cellText(r, r.total, totalsWidth - 8));
    }

    // Row lines. A saved width draws even with Borders off, so a matrix can have group separators and no grid; a saved 0 removes the line.
    const rowLines = rows
        .map((row, index) => ({ index, width: row.lineBelow ?? gridLine }))
        .filter((line) => line.width > 0);
    // Wide lines straddle the row boundary, except the last, which would be clipped by the bottom of the matrix.
    const rowLineY = (line: { index: number; width: number }): number => {
        const boundary = (line.index + 1) * rowHeight;
        if (line.width <= 1) return boundary - 0.5;
        return line.index === rows.length - 1 ? boundary - line.width / 2 : boundary;
    };
    svg.append("g").selectAll("line").data(rowLines).join("line")
        .attr("data-role", "row-line")
        .attr("data-row", (line) => line.index)
        .attr("x1", 0).attr("x2", bodyWidth)
        .attr("y1", rowLineY).attr("y2", rowLineY)
        .attr("stroke", scene.ink.matrixBorder).attr("stroke-width", (line) => line.width);

    return { scrolled: [cells] };
}
