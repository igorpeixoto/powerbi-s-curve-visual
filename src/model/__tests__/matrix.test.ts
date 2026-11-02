import { describe, expect, it } from "vitest";

import { buildModel } from "../buildModel";
import { buildMatrixRows, type MatrixOptions } from "../matrix";
import { makeDataView } from "./fixtures";

const options: MatrixOptions = {
    expandSeries: false,
    cumulativeSuffix: " (cumulative)",
    aggregations: { column: "sum", line: "last", table: "sum" },
    measureAggregations: {},
};

const dataView = () => makeDataView({
    bucketRole: "category",
    buckets: ["W01", "W02", "W03"],
    series: ["Civil", "Electrical"],
    measures: [
        { name: "Planned", roles: ["columnValues", "lineValues"], format: "#,0", values: [[10, 20, 30], [5, 5, 10]] },
        { name: "Actual", roles: ["lineValues"], values: [[8, 15, null], [4, null, null]] },
        { name: "Manpower", roles: ["tableOnlyValues"], values: [[3, 4, 5], [1, 1, null]] },
        { name: "Comment", roles: ["tooltips"], values: [["a", "b", "c"], ["d", "e", "f"]] },
    ],
});

describe("buildMatrixRows", () => {
    it("lists column, line and table-only rows in that order, without tooltips", () => {
        const rows = buildMatrixRows(buildModel(dataView(), { lineSeriesMode: "perSeries" }), options);
        expect(rows.map((r) => [r.kind, r.label])).toEqual([
            ["column", "Planned"],
            ["line", "Planned (cumulative)"],
            ["line", "Actual (cumulative)"],
            ["table", "Manpower"],
        ]);
    });

    it("shows per-bucket sums for column rows and the plotted total line for line rows", () => {
        const rows = buildMatrixRows(buildModel(dataView(), { lineSeriesMode: "perSeries" }), options);
        expect(rows[0].values).toEqual([15, 25, 40]);
        expect(rows[1].values).toEqual([15, 40, 80]); // total line, even though the chart draws per series
        expect(rows[2].values).toEqual([12, 27, null]);
        expect(rows[3].values).toEqual([4, 5, 5]);
        expect(rows[0].format).toBe("#,0");
    });

    it("totals each row by its kind's aggregation, with per-measure overrides", () => {
        const rows = buildMatrixRows(buildModel(dataView(), {}), {
            ...options,
            measureAggregations: { "table:Sum(Progress.Manpower)": "average" },
        });
        expect(rows.map((r) => r.total)).toEqual([80, 80, 27, 14 / 3]);
    });

    it("expands series into one row each, followed by the measure total", () => {
        const rows = buildMatrixRows(buildModel(dataView(), {}), { ...options, expandSeries: true });
        expect(rows.slice(0, 3).map((r) => [r.label, r.level, r.values])).toEqual([
            ["Civil", 1, [10, 20, 30]],
            ["Electrical", 1, [5, 5, 10]],
            ["Planned", 0, [15, 25, 40]],
        ]);
        expect(rows[4].values).toEqual([5, 10, 20]); // Planned cumulative, Electrical
    });

    it("drops the suffix for lines plotted as provided and flags percent rows", () => {
        const model = buildModel(dataView(), { valueModes: { "Sum(Progress.Actual)": "asProvided" }, displayAs: "percentOfBaseline" });
        const rows = buildMatrixRows(model, options);
        expect(rows[2].label).toBe("Actual");
        expect(rows.map((r) => r.percent)).toEqual([false, true, true, false]);
        expect(rows[1].values).toEqual([15 / 80, 0.5, 1]);
    });
});
