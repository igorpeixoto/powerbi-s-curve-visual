// Draws the chart: gridlines, both value axes, columns, lines, line points, data labels and x-axis labels.
// Every x position comes from scene.layout.geometry; nothing here computes bucket positions itself.
import { curveLinear, curveMonotoneX, line as d3line, scaleLinear, type Selection } from "d3";

import { clusterSlots, labelStep } from "../model/geometry";
import { ptToPx, type LineStyle } from "./options";
import type { Scene } from "./scene";

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>;
type GSelection = Selection<SVGGElement, unknown, null, undefined>;

interface Box {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

function overlaps(a: Box, placed: Box[]): boolean {
    return placed.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
}

export function dashArray(style: LineStyle, width: number): string | null {
    switch (style) {
        case "solid":
            return null;
        case "dashed":
            return `${4 * width},${2.5 * width}`;
        case "dotted":
            return `${0.1},${2.5 * width}`;
    }
}

export interface ChartHandles {
    /** Groups translated by the horizontal scroll offset. */
    scrolled: GSelection[];
}

export function drawChart(svg: SvgSelection, scene: Scene, clipId: string, scrollX: number): ChartHandles {
    const { layout, options, theme, model } = scene;
    const geometry = layout.geometry;
    const width = layout.block.width;
    const height = layout.chartHeight;
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height).style("left", `${layout.block.x}px`).style("top", `${layout.block.y}px`);

    const plotRight = geometry.plotLeft + geometry.plotWidth;
    const yLeft = scene.left ? scaleLinear().domain(scene.left.domain).range([layout.plotBottom, layout.plotTop]) : null;
    const yRight = scene.right ? scaleLinear().domain(scene.right.domain).range([layout.plotBottom, layout.plotTop]) : null;

    svg.append("defs").append("clipPath").attr("id", clipId)
        .append("rect").attr("x", geometry.plotLeft).attr("y", 0).attr("width", geometry.plotWidth).attr("height", height);

    const clipped = svg.append("g").attr("clip-path", `url(#${clipId})`);
    const content = clipped.append("g").attr("class", "s-curve__plot").attr("transform", `translate(${geometry.plotLeft - scrollX},0)`);

    // Gridlines follow the left axis, or the right one when there are no columns.
    const gridAxis = yLeft && scene.left && options.leftAxis.gridlines ? { scale: yLeft, ticks: scene.left.ticks } : null;
    const rightGrid = yRight && scene.right && (options.rightAxis.gridlines || (!yLeft && options.leftAxis.gridlines)) ? { scale: yRight, ticks: scene.right.ticks } : null;
    for (const grid of [gridAxis, rightGrid]) {
        if (!grid) continue;
        content.append("g").attr("class", "s-curve__grid").selectAll("line").data(grid.ticks).join("line")
            .attr("x1", 0).attr("x2", geometry.contentWidth)
            .attr("y1", (t) => grid.scale(t)).attr("y2", (t) => grid.scale(t))
            .attr("stroke", theme.gridline).attr("stroke-width", options.gridlines.width)
            .attr("stroke-dasharray", dashArray(options.gridlines.style, options.gridlines.width));
    }

    // Value axes, pinned in the gutters.
    const axisText = (g: GSelection, labels: string[], ticks: number[], scale: (v: number) => number, x: number, anchor: string, fontSize: number) => {
        g.selectAll("text").data(ticks).join("text")
            .attr("x", x).attr("y", (t) => scale(t)).attr("dy", "0.32em")
            .attr("text-anchor", anchor).attr("fill", theme.secondaryText).style("font-size", `${ptToPx(fontSize)}px`)
            .text((_, i) => labels[i]);
    };
    if (yLeft && scene.left?.labels.length) {
        axisText(svg.append("g").attr("class", "s-curve__axis-left"), scene.left.labels, scene.left.ticks, yLeft, geometry.plotLeft - 6, "end", options.leftAxis.fontSize);
    }
    if (yRight && scene.right?.labels.length) {
        axisText(svg.append("g").attr("class", "s-curve__axis-right"), scene.right.labels, scene.right.ticks, yRight, plotRight + 6, "start", options.rightAxis.fontSize);
    }

    // Columns.
    const bars = content.append("g").attr("class", "s-curve__bars");
    if (yLeft) {
        const slotsByBucket = geometry.buckets.map((b) => clusterSlots(b, scene.bars.slotCount, options.columns.clusterGap));
        bars.selectAll("rect").data(scene.bars.segments).join("rect")
            .attr("data-role", "bar")
            .attr("data-bucket", (s) => s.bucketIndex)
            .attr("data-measure", (s) => s.measureKey)
            .attr("data-series", (s) => (s.seriesIndex === null ? null : s.seriesIndex))
            .attr("x", (s) => slotsByBucket[s.bucketIndex][s.slot].x)
            .attr("width", (s) => slotsByBucket[s.bucketIndex][s.slot].width)
            .attr("y", (s) => yLeft(Math.max(s.base, s.top)))
            .attr("height", (s) => Math.abs(yLeft(s.base) - yLeft(s.top)))
            .attr("rx", options.columns.cornerRadius)
            .attr("fill", (s) => scene.colors.bar(s.measureKey, s.seriesIndex))
            .attr("fill-opacity", options.columns.opacity);
    }

    // Lines and their points (points exist even with markers off: they are measured, focused and selected).
    const placedLabels: Box[] = [];
    const labelFont = ptToPx(options.dataLabels.lines.fontSize);
    if (yRight) {
        const linesGroup = content.append("g").attr("class", "s-curve__lines");
        const path = d3line<number | null>()
            .defined((v) => v !== null)
            .x((_, i) => geometry.buckets[i].center)
            .y((v) => yRight(v as number))
            .curve(options.lines.interpolation === "monotone" ? curveMonotoneX : curveLinear);
        for (const line of model.lines) {
            if (!options.lines.show) break;
            const color = scene.colors.line(line.measureKey, line.seriesIndex);
            const style = scene.lineStyle(line.measureKey);
            linesGroup.append("path")
                .attr("data-role", "line").attr("data-measure", line.measureKey)
                .attr("d", path(line.values))
                .attr("fill", "none").attr("stroke", color)
                .attr("stroke-width", options.lines.strokeWidth).attr("stroke-opacity", options.lines.opacity)
                .attr("stroke-dasharray", dashArray(style, options.lines.strokeWidth))
                .attr("stroke-linecap", style === "dotted" ? "round" : "butt")
                .attr("stroke-linejoin", "round");
            const points = line.values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
            linesGroup.append("g").selectAll("circle").data(points).join("circle")
                .attr("data-role", "point")
                .attr("data-bucket", (p) => p.i)
                .attr("data-measure", line.measureKey)
                .attr("data-series", line.seriesIndex === null ? null : line.seriesIndex)
                .attr("cx", (p) => geometry.buckets[p.i].center)
                .attr("cy", (p) => yRight(p.v))
                .attr("r", options.lines.showMarkers ? options.lines.markerSize : Math.max(3, options.lines.strokeWidth + 1))
                .attr("fill", color)
                .attr("fill-opacity", options.lines.showMarkers ? 1 : 0);

            if (options.dataLabels.lines.show && points.length) {
                const format = scene.lineLabel(line.measureKey);
                const labelled = options.dataLabels.lines.points === "last" ? [points[points.length - 1]] : points;
                for (const p of labelled) {
                    const text = format(p.v);
                    const textWidth = scene.measure(text, options.dataLabels.lines.fontSize);
                    const x = geometry.buckets[p.i].center;
                    const y = yRight(p.v) - 8;
                    let anchor = "middle";
                    let x0 = x - textWidth / 2;
                    if (x0 + textWidth > geometry.contentWidth) {
                        anchor = "end";
                        x0 = x - textWidth;
                    } else if (x0 < 0) {
                        anchor = "start";
                        x0 = x;
                    }
                    const box = { x0, x1: x0 + textWidth, y0: y - labelFont, y1: y };
                    if (box.y0 < 0 || overlaps(box, placedLabels)) continue;
                    placedLabels.push(box);
                    linesGroup.append("text")
                        .attr("data-role", "line-label").attr("data-bucket", p.i).attr("data-measure", line.measureKey)
                        .attr("x", x).attr("y", y).attr("text-anchor", anchor)
                        .attr("fill", color).style("font-size", `${labelFont}px`)
                        .text(text);
                }
            }
        }
    }

    // Column data labels: one per measure stack, at its outer end.
    if (yLeft && options.dataLabels.columns.show) {
        const columnFont = ptToPx(options.dataLabels.columns.fontSize);
        const stacks = new Map<string, { bucket: number; slot: number; measureKey: string; total: number; extreme: number }>();
        for (const s of scene.bars.segments) {
            const key = `${s.bucketIndex}|${s.slot}`;
            const stack = stacks.get(key) ?? { bucket: s.bucketIndex, slot: s.slot, measureKey: s.measureKey, total: 0, extreme: 0 };
            stack.total += s.value;
            stack.extreme = Math.abs(s.top) > Math.abs(stack.extreme) ? s.top : stack.extreme;
            stacks.set(key, stack);
        }
        const labels = content.append("g").attr("class", "s-curve__column-labels");
        for (const stack of stacks.values()) {
            const slot = clusterSlots(geometry.buckets[stack.bucket], scene.bars.slotCount, options.columns.clusterGap)[stack.slot];
            const text = scene.columnLabel(stack.measureKey)(stack.total);
            const textWidth = scene.measure(text, options.dataLabels.columns.fontSize);
            const x = slot.x + slot.width / 2;
            const yEdge = yLeft(stack.extreme);
            const inside = options.dataLabels.columns.position === "insideEnd";
            const y = stack.extreme >= 0 ? (inside ? yEdge + columnFont + 2 : yEdge - 4) : (inside ? yEdge - 4 : yEdge + columnFont + 2);
            const box = { x0: x - textWidth / 2, x1: x + textWidth / 2, y0: y - columnFont, y1: y };
            if (textWidth > slot.width + 4 && scene.bars.slotCount > 1) continue;
            if (box.y0 < 0 || box.y1 > layout.plotBottom || overlaps(box, placedLabels)) continue;
            placedLabels.push(box);
            labels.append("text")
                .attr("data-role", "column-label").attr("data-bucket", stack.bucket)
                .attr("x", x).attr("y", y).attr("text-anchor", "middle")
                .attr("fill", theme.text).style("font-size", `${columnFont}px`)
                .text(text);
        }
    }

    // X-axis labels: one per bucket, thinned with visibility (they stay measurable).
    if (options.xAxis.show) {
        const fontSize = options.xAxis.fontSize;
        const widest = Math.max(0, ...scene.bucketLabels.map((l) => scene.measure(l, fontSize)));
        const step = labelStep(geometry.bucketWidth, widest);
        content.append("g").attr("class", "s-curve__x-labels").selectAll("text").data(geometry.buckets).join("text")
            .attr("data-role", "x-label")
            .attr("data-bucket", (b) => b.index)
            .attr("x", (b) => b.center)
            .attr("y", layout.plotBottom + 4 + ptToPx(fontSize))
            .attr("text-anchor", "middle")
            .attr("fill", theme.secondaryText)
            .style("font-size", `${ptToPx(fontSize)}px`)
            .style("visibility", (b) => (b.index % step === 0 ? null : "hidden"))
            .text((b) => scene.bucketLabels[b.index]);
    }

    return { scrolled: [content] };
}
