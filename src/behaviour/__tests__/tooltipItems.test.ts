import { describe, expect, it } from "vitest";

import { buildModel } from "../../model/buildModel";
import { buildMatrixRows } from "../../model/matrix";
import { makeDataView } from "../../model/__tests__/fixtures";
import { tooltipItems, type TooltipContext } from "../tooltipItems";

const dataView = (withHighlights = false) => makeDataView({
    bucketRole: "category",
    buckets: ["W01", "W02"],
    series: ["Civil", "Electrical"],
    measures: [
        { name: "Planned", roles: ["columnValues", "lineValues"], values: [[10, 20], [5, 5]], ...(withHighlights ? { highlights: [[10, 20], [null, null]] } : {}) },
        { name: "Comment", roles: ["tooltips"], values: [["on track", "late"], ["ok", "ok"]] },
        { name: "Crew", roles: ["tooltips"], values: [[3, 4], [2, 2]] },
    ],
});

const context = (withHighlights = false): TooltipContext => {
    const model = buildModel(dataView(withHighlights), {});
    return {
        model,
        bucketLabels: ["Week 1", "Week 2"],
        cumulativeSuffix: " (cumulative)",
        highlightedSuffix: " (highlighted)",
        seriesName: (seriesIndex: number) => ["Civil", "Electrical"][seriesIndex],
        formatValue: (_format, value, percent) => (value === null ? "-" : percent ? `${value * 100}%` : String(value)),
        formatRaw: (value) => String(value),
    };
};

describe("tooltipItems", () => {
    it("names the series with the name it's given", () => {
        const items = tooltipItems({ ...context(), seriesName: () => "25%" }, { kind: "bar", bucket: 1, measureKey: "columnValues:Sum(Progress.Planned)", seriesIndex: 0 });
        expect(items.map((item) => item.value)).toContain("25%");
    });

    it("shows bucket, series, the bar's value and the Tooltips fields for that series", () => {
        const items = tooltipItems(context(), { kind: "bar", bucket: 1, measureKey: "columnValues:Sum(Progress.Planned)", seriesIndex: 0 });
        expect(items).toEqual([
            { displayName: "Discipline", value: "Civil", header: "Week 2" },
            { displayName: "Planned", value: "20", color: undefined },
            { displayName: "Comment", value: "late" },
            { displayName: "Crew", value: "4" },
        ]);
    });

    it("shows the cumulative value and the per-bucket value for a total line point, summing numeric fields", () => {
        const items = tooltipItems(context(), { kind: "point", bucket: 1, measureKey: "lineValues:Sum(Progress.Planned)", seriesIndex: null });
        expect(items.map((i) => [i.displayName, i.value])).toEqual([
            ["Planned (cumulative)", "40"],
            ["Planned", "25"],
            ["Comment", "late"],
            ["Crew", "6"],
        ]);
        expect(items[0].header).toBe("Week 2");
    });

    it("adds the highlighted value when another visual highlights a subset", () => {
        const items = tooltipItems(context(true), { kind: "bar", bucket: 0, measureKey: "columnValues:Sum(Progress.Planned)", seriesIndex: null });
        expect(items.slice(0, 2).map((i) => [i.displayName, i.value])).toEqual([["Planned", "15"], ["Planned (highlighted)", "10"]]);
    });

    it("shows a matrix cell's row label and value", () => {
        const ctx = context();
        const rows = buildMatrixRows(ctx.model, { seriesName: ctx.seriesName, expandSeries: false, cumulativeSuffix: " (cumulative)", aggregations: { column: "sum", line: "last", table: "sum" }, measureAggregations: {}, rowPositions: {}, rowLineWidths: {} });
        const items = tooltipItems(ctx, { kind: "cell", bucket: 0, row: rows[1] });
        expect(items[0]).toMatchObject({ header: "Week 1", displayName: "Planned (cumulative)", value: "15" });
    });
});
