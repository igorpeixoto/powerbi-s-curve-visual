import { describe, expect, it } from "vitest";

import { parseDataView } from "../parseDataView";
import { defaultModelOptions } from "../types";
import { d, makeDataView } from "./fixtures";

const parse = (dataView: Parameters<typeof parseDataView>[0], options = defaultModelOptions) => parseDataView(dataView, options);

describe("parseDataView", () => {
    it("returns an empty model for a missing or empty dataView", () => {
        for (const dataView of [undefined, makeDataView({})]) {
            const parsed = parse(dataView);
            expect(parsed.bucketRole).toBeNull();
            expect(parsed.buckets).toEqual([]);
            expect(parsed.measures).toEqual([]);
            expect(parsed.hasSeries).toBe(false);
        }
    });

    it("reads text buckets in data order with their values", () => {
        const parsed = parse(makeDataView({
            bucketRole: "category",
            buckets: ["W03", "W01", "W02"],
            measures: [{ name: "Planned", roles: ["columnValues"], format: "#,0", values: [30, 10, 20] }],
        }));
        expect(parsed.bucketRole).toBe("category");
        expect(parsed.buckets.map((b) => b.key)).toEqual(["W03", "W01", "W02"]);
        expect(parsed.buckets[1]).toMatchObject({ kind: "text", value: "W01", rowIndices: [1], inserted: false });
        expect(parsed.measures).toEqual([expect.objectContaining({
            key: "columnValues:Sum(Progress.Planned)", role: "columnValues", displayName: "Planned", format: "#,0", roleIndex: 0,
        })]);
        expect(parsed.values["columnValues:Sum(Progress.Planned)"]).toEqual([[30, 10, 20]]);
    });

    it("splits every measure by series", () => {
        const parsed = parse(makeDataView({
            bucketRole: "category",
            buckets: ["W01", "W02"],
            series: ["Civil", "Electrical"],
            measures: [{ name: "Planned", roles: ["columnValues"], values: [[10, 20], [1, 2]] }],
        }));
        expect(parsed.hasSeries).toBe(true);
        expect(parsed.series.map((s) => [s.key, s.groupIndex])).toEqual([["Civil", 0], ["Electrical", 1]]);
        expect(parsed.seriesFieldName).toBe("Discipline");
        expect(parsed.values["columnValues:Sum(Progress.Planned)"]).toEqual([[10, 20], [1, 2]]);
    });

    it("creates one entry per role when one column is flagged with two roles", () => {
        const parsed = parse(makeDataView({
            bucketRole: "category",
            buckets: ["W01", "W02"],
            measures: [{ name: "Planned", roles: ["columnValues", "lineValues"], values: [10, 20] }],
        }));
        expect(parsed.measures.map((m) => [m.key, m.columnIndexInGroup])).toEqual([
            ["columnValues:Sum(Progress.Planned)", 0],
            ["lineValues:Sum(Progress.Planned)", 0],
        ]);
        expect(parsed.values["lineValues:Sum(Progress.Planned)"]).toEqual([[10, 20]]);
    });

    it("handles the same measure arriving as one column per role", () => {
        const parsed = parse(makeDataView({
            bucketRole: "category",
            buckets: ["W01"],
            measures: [
                { name: "Planned", queryName: "Sum(Progress.Planned)", roles: ["columnValues"], values: [10] },
                { name: "Planned", queryName: "Sum(Progress.Planned)", roles: ["lineValues"], values: [10] },
            ],
        }));
        expect(parsed.measures.map((m) => [m.key, m.columnIndexInGroup])).toEqual([
            ["columnValues:Sum(Progress.Planned)", 0],
            ["lineValues:Sum(Progress.Planned)", 1],
        ]);
    });

    it("orders measures by role, then by well order", () => {
        const parsed = parse(makeDataView({
            bucketRole: "category",
            buckets: ["W01"],
            measures: [
                { name: "Remarks", roles: ["tableOnlyValues"], values: [1] },
                { name: "Actual", roles: ["lineValues"], values: [1] },
                { name: "Planned", roles: ["columnValues"], values: [1] },
                { name: "Forecast", roles: ["columnValues"], values: [1] },
            ],
        }));
        expect(parsed.measures.map((m) => `${m.role}/${m.displayName}/${m.roleIndex}`)).toEqual([
            "columnValues/Planned/0", "columnValues/Forecast/1", "lineValues/Actual/0", "tableOnlyValues/Remarks/0",
        ]);
    });

    it("uses the host's rolesIndex for well order when a shared measure isn't first in its second well", () => {
        const parsed = parse(makeDataView({
            bucketRole: "category",
            buckets: ["W01"],
            measures: [
                { name: "Planned", roles: ["columnValues", "lineValues"], rolesIndex: { columnValues: [0], lineValues: [1] }, values: [1] },
                { name: "Actual", roles: ["lineValues"], rolesIndex: { lineValues: [0] }, values: [1] },
            ],
        }));
        expect(parsed.measures.filter((m) => m.role === "lineValues").map((m) => m.displayName)).toEqual(["Actual", "Planned"]);
    });

    it("combines daily rows into weeks: sums per-bucket values, takes the last value of cumulative inputs", () => {
        const dataView = makeDataView({
            bucketRole: "categoryDate",
            buckets: [d(2026, 2, 2), d(2026, 2, 4), d(2026, 2, 10)],
            measures: [
                { name: "Planned", roles: ["columnValues", "lineValues"], values: [5, 7, 3] },
                { name: "PlannedCum", roles: ["lineValues"], values: [5, 12, 15] },
            ],
        });
        const parsed = parse(dataView, { ...defaultModelOptions, valueModes: { "Sum(Progress.PlannedCum)": "asProvided" } });
        expect(parsed.buckets.map((b) => b.key)).toEqual(["2026-02-02", "2026-02-09"]);
        expect(parsed.values["columnValues:Sum(Progress.Planned)"]).toEqual([[12, 3]]);
        expect(parsed.values["lineValues:Sum(Progress.Planned)"]).toEqual([[12, 3]]);
        expect(parsed.values["lineValues:Sum(Progress.PlannedCum)"]).toEqual([[12, 15]]);
    });

    it("parses highlights when the host sends them, and only then", () => {
        const spec = {
            bucketRole: "category" as const,
            buckets: ["W01", "W02"],
            measures: [{ name: "Planned", roles: ["columnValues" as const], values: [10, 20], highlights: [4, null] }],
        };
        expect(parse(makeDataView(spec)).highlights?.["columnValues:Sum(Progress.Planned)"]).toEqual([[4, null]]);
        const { highlights, ...withoutHighlights } = spec.measures[0];
        expect(highlights).toBeDefined();
        expect(parse(makeDataView({ ...spec, measures: [withoutHighlights] })).highlights).toBeNull();
    });

    it("reports excluded date rows and reduced data", () => {
        const parsed = parse(makeDataView({
            bucketRole: "categoryDate",
            buckets: [d(2026, 2, 2), null],
            measures: [{ name: "Planned", roles: ["columnValues"], values: [1, 2] }],
            reduced: true,
        }));
        expect(parsed.warnings).toEqual({ excludedDateRows: 1, dataReduced: true, emptyWeeksSkipped: false, dateHierarchy: false });
        expect(parsed.values["columnValues:Sum(Progress.Planned)"]).toEqual([[1]]);
    });

    it("recognises a date hierarchy in the Date well and builds no buckets from it", () => {
        const dataView = makeDataView({
            bucketRole: "categoryDate",
            buckets: [2026, 2026],
            measures: [{ name: "Planned", roles: ["columnValues"], values: [1, 2] }],
        });
        // As observed in Desktop: one category column per level, queryNames through the Variation.
        const categories = dataView.categorical?.categories ?? [];
        categories[0].source.queryName = "progress.Date.Variation.Date Hierarchy.Year";
        categories.push({ ...categories[0], source: { ...categories[0].source, queryName: "progress.Date.Variation.Date Hierarchy.Quarter" } });
        const parsed = parse(dataView);
        expect(parsed.warnings.dateHierarchy).toBe(true);
        expect(parsed.bucketRole).toBe("categoryDate");
        expect(parsed.buckets).toEqual([]);
    });

    it("keeps raw tooltip values per bucket", () => {
        const parsed = parse(makeDataView({
            bucketRole: "category",
            buckets: ["W01", "W02"],
            measures: [{ name: "Comment", roles: ["tooltips"], values: ["on track", "late"] }],
        }));
        expect(parsed.tooltipValues["tooltips:Sum(Progress.Comment)"]).toEqual([["on track", "late"]]);
    });
});
