import { describe, expect, it } from "vitest";

import { buildModel } from "../buildModel";
import { buildMatrixRows, orderByPosition, type MatrixOptions } from "../matrix";
import { makeDataView } from "./fixtures";

const options: MatrixOptions = {
    expandSeries: false,
    cumulativeSuffix: " (cumulative)",
    aggregations: { column: "sum", line: "last", table: "sum" },
    measureAggregations: {},
    rowPositions: {},
    rowLineWidths: {},
    seriesName: (seriesIndex) => ["Civil", "Electrical"][seriesIndex],
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

describe("orderByPosition", () => {
    const keys = ["A", "B", "C", "D"];

    it("keeps the default order when nothing is set", () => {
        expect(orderByPosition(keys, {})).toEqual(keys);
    });

    it("puts a row exactly in the slot the author typed", () => {
        expect(orderByPosition(keys, { D: 1 })).toEqual(["D", "A", "B", "C"]);
        expect(orderByPosition(keys, { A: 3 })).toEqual(["B", "C", "A", "D"]);
        expect(orderByPosition(keys, { A: 4, B: 3, C: 2, D: 1 })).toEqual(["D", "C", "B", "A"]);
    });

    it("resolves ties by default order, and sends positions past the end to the end", () => {
        expect(orderByPosition(keys, { C: 1, D: 1 })).toEqual(["C", "D", "A", "B"]);
        expect(orderByPosition(keys, { A: 99 })).toEqual(["B", "C", "D", "A"]);
    });

    it("tolerates fractional, zero, negative and non-finite positions", () => {
        expect(orderByPosition(keys, { D: 0 })).toEqual(["D", "A", "B", "C"]);
        expect(orderByPosition(keys, { D: -3 })).toEqual(["D", "A", "B", "C"]);
        expect(orderByPosition(keys, { A: 1.6 })).toEqual(["B", "A", "C", "D"]);
        expect(orderByPosition(keys, { A: Number.NaN })).toEqual(keys);
    });
});

describe("buildMatrixRows", () => {
    it("labels series rows with the name it's given", () => {
        const rows = buildMatrixRows(buildModel(dataView(), {}), { ...options, expandSeries: true, seriesName: (seriesIndex) => `S${seriesIndex}` });
        expect(rows.filter((row) => row.seriesIndex !== null).map((row) => row.label)).toContain("S1");
    });

    it("moves a row to the position set for its kind, leaving the same measure's other row alone", () => {
        const rows = buildMatrixRows(buildModel(dataView(), { lineSeriesMode: "perSeries" }), {
            ...options,
            rowPositions: { "table:Sum(Progress.Manpower)": 1, "line:Sum(Progress.Planned)": 4 },
        });
        expect(rows.map((r) => r.label)).toEqual(["Manpower", "Planned", "Actual (cumulative)", "Planned (cumulative)"]);
    });

    it("moves a measure's series rows and total as one block, and puts its line below the total", () => {
        const rows = buildMatrixRows(buildModel(dataView(), { lineSeriesMode: "perSeries" }), {
            ...options,
            expandSeries: true,
            rowPositions: { "table:Sum(Progress.Manpower)": 1 },
            rowLineWidths: { "table:Sum(Progress.Manpower)": 3 },
        });
        expect(rows.slice(0, 3).map((r) => [r.label, r.level, r.lineBelow])).toEqual([
            ["Civil", 1, null],
            ["Electrical", 1, null],
            ["Manpower", 0, 3],
        ]);
        expect(rows.slice(3).every((r) => r.lineBelow === null)).toBe(true);
    });

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

    it("shows highlighted values in cells and totals when another visual highlights a subset", () => {
        const highlighted = makeDataView({
            bucketRole: "category",
            buckets: ["W01", "W02"],
            measures: [
                { name: "Planned", roles: ["columnValues", "lineValues"], values: [10, 20], highlights: [4, null] },
                { name: "Manpower", roles: ["tableOnlyValues"], values: [3, 4], highlights: [1, 2] },
            ],
        });
        const rows = buildMatrixRows(buildModel(highlighted, {}), options);
        // The highlighted running total follows the line-end rule, like the plotted highlight line.
        expect(rows.map((r) => r.values)).toEqual([[4, null], [4, null], [1, 2]]);
        expect(rows.map((r) => r.total)).toEqual([4, 4, 3]);
    });

    it("drops the suffix for lines plotted as provided and flags percent rows", () => {
        const model = buildModel(dataView(), { valueModes: { "Sum(Progress.Actual)": "asProvided" }, displayAs: "percentOfBaseline" });
        const rows = buildMatrixRows(model, options);
        expect(rows[2].label).toBe("Actual");
        expect(rows.map((r) => r.percent)).toEqual([false, true, true, false]);
        expect(rows[1].values).toEqual([15 / 80, 0.5, 1]);
    });
});
