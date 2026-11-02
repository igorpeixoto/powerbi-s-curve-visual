import type { Selection } from "d3";

import { dashArray } from "./chart";
import { ptToPx } from "./options";
import { LEGEND_LAYOUT, type Scene } from "./scene";

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>;

export function drawLegend(svg: SvgSelection, scene: Scene): void {
    svg.selectAll("*").remove();
    const legend = scene.layout.legend;
    if (!legend) {
        svg.style("display", "none");
        return;
    }
    const fontPx = ptToPx(scene.options.legend.fontSize);
    const itemHeight = Math.ceil(fontPx * 1.6);
    svg.style("display", null)
        .style("left", `${legend.rect.x}px`).style("top", `${legend.rect.y}px`)
        .attr("width", legend.rect.width).attr("height", legend.rect.height);

    scene.legendItems.forEach((item, i) => {
        const position = legend.items[i];
        if (!position) return;
        const g = svg.append("g")
            .attr("data-role", "legend-item")
            .attr("transform", `translate(${position.x},${position.y})`);
        const middle = itemHeight / 2;
        if (item.kind === "bar") {
            g.append("rect").attr("x", 3).attr("y", middle - 5).attr("width", 10).attr("height", 10).attr("fill", item.color);
        } else {
            const width = Math.max(2, scene.options.lines.strokeWidth);
            g.append("line").attr("x1", 0).attr("x2", LEGEND_LAYOUT.swatch).attr("y1", middle).attr("y2", middle)
                .attr("stroke", item.color).attr("stroke-width", width)
                .attr("stroke-dasharray", dashArray(item.lineStyle, width))
                .attr("stroke-linecap", item.lineStyle === "dotted" ? "round" : "butt");
        }
        g.append("text")
            .attr("x", LEGEND_LAYOUT.swatch + LEGEND_LAYOUT.gap).attr("y", middle).attr("dy", "0.35em")
            .attr("fill", scene.theme.text).style("font-size", `${fontPx}px`)
            .text(item.label);
    });
}
