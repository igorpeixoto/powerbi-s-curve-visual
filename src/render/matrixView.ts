// Draws the aligned matrix: a pinned header row, then the rows in a body that scrolls vertically.
// Cells are absolutely positioned from the shared geometry, never laid out by a table algorithm.
import type { Selection } from "d3";

import { ptToPx } from "./options";
import type { Scene } from "./scene";
import { truncate } from "./measure";

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
            .attr("text-anchor", "middle").attr("fill", theme.text)
            .style("font-size", `${fontPx}px`).style("font-weight", options.matrix.headerBold ? "600" : "normal")
            .text(truncate(scene.totalsLabel, totalsWidth - 8, (t) => scene.measure(t, fontPt, options.matrix.headerBold)));
    }
    if (options.matrix.showBorders) {
        header.append("line").attr("x1", 0).attr("x2", bodyWidth).attr("y1", matrix.headerHeight - 0.5).attr("y2", matrix.headerHeight - 0.5)
            .attr("stroke", theme.border).attr("stroke-width", 1);
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
        .attr("fill", theme.text)
        .style("font-size", `${fontPx}px`)
        .style("font-weight", (r) => (options.matrix.headerBold && r.level === 0 ? 600 : null))
        .text((r) => truncate(r.label, geometry.plotLeft - 18 - (r.level ? 12 : 0), (t) => scene.measure(t, fontPt, options.matrix.headerBold && r.level === 0)));

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
            .attr("fill", "transparent")
            .attr("stroke", options.matrix.showBorders ? theme.border : null)
            .attr("stroke-width", options.matrix.showBorders ? 0.5 : null);
        group.selectAll("text").data(geometry.buckets).join("text")
            .attr("data-role", "cell-text")
            .attr("data-bucket", (b) => b.index)
            .attr("x", (b) => b.center)
            .attr("y", y + rowHeight / 2).attr("dy", "0.35em")
            .attr("text-anchor", "middle").attr("fill", theme.text)
            .style("font-size", `${fontPx}px`)
            .text((b) => scene.cellText(row, row.values[b.index] ?? null, b.x1 - b.x0 - 4));
    });

    // Totals column, pinned in the right gutter.
    if (options.matrix.showTotals && totalsWidth > 0) {
        svg.append("g").attr("class", "s-curve__totals").selectAll("text").data(rows).join("text")
            .attr("data-role", "total")
            .attr("data-row", (_, i) => i)
            .attr("x", plotRight + totalsWidth / 2)
            .attr("y", (_, i) => i * rowHeight + rowHeight / 2).attr("dy", "0.35em")
            .attr("text-anchor", "middle").attr("fill", theme.text)
            .style("font-size", `${fontPx}px`)
            .style("font-weight", (r) => (options.matrix.headerBold && r.level === 0 ? 600 : null))
            .text((r) => scene.cellText(r, r.total, totalsWidth - 8));
    }
    if (options.matrix.showBorders) {
        svg.append("g").selectAll("line").data(rows).join("line")
            .attr("x1", 0).attr("x2", bodyWidth)
            .attr("y1", (_, i) => (i + 1) * rowHeight - 0.5).attr("y2", (_, i) => (i + 1) * rowHeight - 0.5)
            .attr("stroke", theme.border).attr("stroke-width", 0.5);
    }

    return { scrolled: [cells] };
}
