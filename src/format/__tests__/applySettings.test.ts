import { describe, expect, it } from "vitest";
import type powerbi from "powerbi-visuals-api";

import { applySettings, type ApplyContext } from "../applySettings";
import { THEME_LIGHT_TINT } from "../presets";
import { toRenderOptions } from "../toRenderOptions";

const palette = {
    getColor: (key: string) => ({ value: key === "Civil" ? "#118dff" : "#12239e" }),
    foreground: { value: "#252423" },
    foregroundNeutralTertiary: { value: "#b3b0ad" },
    background: { value: "#ffffff" },
};

const context = (extra: Partial<ApplyContext> = {}): ApplyContext => ({ palette, measures: [], series: [], ...extra });
const view = (objects: Record<string, Record<string, unknown>>) => ({ metadata: { columns: [], objects } }) as unknown as powerbi.DataView;

describe("Format pane model", () => {
    it("gives every group a name unique across all cards (the library builds group uids from the name alone)", () => {
        const { model } = applySettings(undefined, context());
        const names = model.cards.flatMap((card) => ("groups" in card ? card.groups.map((g) => g.name) : []));
        expect(names.length).toBe(25);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe("applySettings", () => {
    it("keeps the Base (Classic) defaults when nothing is saved", () => {
        const applied = applySettings(undefined, context());
        expect(applied.preset).toBe("classic");
        expect(applied.model.matrix.topLevelSlice.value).toBe(true);
        expect(applied.model.lines.options.strokeWidth.value).toBe(2);
        expect(applied.explicit.size).toBe(0);
    });

    it("shows preset values in the pane and marks nothing explicit", () => {
        const applied = applySettings(view({ general: { stylePreset: "minimal" } }), context());
        expect(applied.model.columns.topLevelSlice.value).toBe(false);
        expect(applied.model.legend.options.legendPosition.value.value).toBe("bottom");
        expect(applied.explicit).toEqual(new Set(["general.stylePreset"]));
    });

    it("lets saved values (including false and 0) beat the preset", () => {
        const applied = applySettings(view({ general: { stylePreset: "weeklyProgress", bucketGap: 0 }, matrix: { showMatrix: true }, dataLabels: { columnLabelsShow: false } }), context());
        expect(applied.model.matrix.topLevelSlice.value).toBe(true);
        expect(applied.model.general.layout.bucketGap.value).toBe(0);
        expect(applied.model.dataLabels.columnLabels.columnLabelsShow.value).toBe(false);
        expect(applied.model.lines.options.strokeWidth.value).toBe(1); // still from the preset
    });

    it("shows theme colours in untouched colour pickers, including the Minimal gridline tint", () => {
        const classic = applySettings(undefined, context());
        expect(classic.model.leftAxis.gridlines.gridlineColor.value.value).toBe("#b3b0ad");
        const minimal = applySettings(view({ general: { stylePreset: "minimal" } }), context());
        expect(minimal.model.leftAxis.gridlines.gridlineColor.value.value).toMatch(/^#[0-9a-f]{6}$/);
        expect(minimal.model.leftAxis.gridlines.gridlineColor.value.value).not.toBe(THEME_LIGHT_TINT);
    });

    it("creates per-measure and per-series slices with selectors, fresh on every call", () => {
        const ctx = context({
            measures: [
                { queryName: "Sum(p.Planned)", displayName: "Planned", role: "columnValues", objects: undefined },
                { queryName: "Sum(p.Planned)", displayName: "Planned", role: "lineValues", objects: { lines: { lineStyle: "dashed", percentBaseline: true } } },
                { queryName: "Sum(p.Crew)", displayName: "Crew", role: "tableOnlyValues", objects: { matrix: { tableTotalAggregation: "average" } } },
            ],
            series: [{ key: "Civil", displayName: "Civil", objects: { columns: { columnFill: { solid: { color: "#ff0000" } } } }, selector: { data: [] } as unknown as powerbi.data.Selector }],
        });
        const first = applySettings(undefined, ctx);
        const second = applySettings(undefined, ctx);
        expect(first.model.columns.colors.slices).toHaveLength(1);
        expect(second.model.columns.colors.slices).toHaveLength(1);
        expect(first.model.columns.colors.slices![0]).toMatchObject({ name: "columnFill", value: { value: "#ff0000" } });
        expect(first.model.lines.colors.slices!.map((s) => s.name)).toEqual(["lineColor", "lineStyle"]);
        expect((first.model.lines.colors.slices![0] as { selector?: unknown }).selector).toEqual({ metadata: "Sum(p.Planned)" });
        expect(first.model.lines.values.slices!.map((s) => s.name)).toEqual(["displayAs", "cumulativeSuffix", "valueMode", "lineEnd", "percentBaseline"]);
        expect(first.model.matrix.values.slices!.map((s) => s.name)).toEqual(["columnTotalAggregation", "lineTotalAggregation", "tableTotalAggregation", "matrixDisplayUnits", "matrixPrecision"]);
        expect(first.instances).toMatchObject({
            columnFills: { Civil: "#ff0000" },
            lineStyles: { "Sum(p.Planned)": "dashed" },
            percentBaselines: ["Sum(p.Planned)"],
            aggregations: { "column:Sum(p.Planned)": "sum", "line:Sum(p.Planned)": "last", "table:Sum(p.Crew)": "average" },
        });
    });
});

describe("toRenderOptions", () => {
    it("converts units, clamps saved values and treats empty numbers as auto", () => {
        const options = toRenderOptions(applySettings(view({
            general: { bucketGap: 250, minBucketWidth: -5 },
            columns: { columnOpacity: 40 },
            leftAxis: { leftMin: Number.NaN, leftPrecision: 2.6 },
        }), context()));
        expect(options.bucketGap).toBe(0.9);
        expect(options.minBucketWidth).toBe(0);
        expect(options.columns.opacity).toBe(0.4);
        expect(options.leftAxis.min).toBeUndefined();
        expect(options.leftAxis.max).toBeUndefined();
        expect(options.leftAxis.precision).toBe(3);
    });

    it("passes colours only when set explicitly, and the Minimal tint as a token", () => {
        const classic = toRenderOptions(applySettings(undefined, context()));
        expect(classic.leftAxis.labelColor).toBeNull();
        expect(classic.gridlines.color).toBeNull();
        const minimal = toRenderOptions(applySettings(view({ general: { stylePreset: "minimal" } }), context()));
        expect(minimal.gridlines.color).toBe(THEME_LIGHT_TINT);
        const explicit = toRenderOptions(applySettings(view({ leftAxis: { leftLabelColor: { solid: { color: "#123456" } } } }), context()));
        expect(explicit.leftAxis.labelColor).toBe("#123456");
    });

    it("maps presets onto the renderer", () => {
        const weekly = toRenderOptions(applySettings(view({ general: { stylePreset: "weeklyProgress" } }), context()));
        expect(weekly).toMatchObject({ bucketGap: 0.1, lines: { strokeWidth: 1, opacity: 0.5 }, matrix: { show: false }, dataLabels: { columns: { show: true }, lines: { show: false } } });
        const minimal = toRenderOptions(applySettings(view({ general: { stylePreset: "minimal" } }), context()));
        expect(minimal).toMatchObject({ columns: { show: false }, matrix: { show: false }, legend: { position: "bottom" }, gridlines: { style: "solid" } });
    });

    it("maps the optional second x-axis label line, off by default", () => {
        expect(toRenderOptions(applySettings(undefined, context())).xAxis.secondLine).toBeNull();
        const options = toRenderOptions(applySettings(view({ xAxis: { weekLabelFormat: "weekStart", weekLabelSecondLine: "isoWeek" } }), context()));
        expect(options.xAxis).toMatchObject({ weekLabelFormat: "weekStart", secondLine: "isoWeek" });
        expect(toRenderOptions(applySettings(view({ xAxis: { weekLabelSecondLine: "retired" } }), context())).xAxis.secondLine).toBeNull();
    });

    it("uses the first measure marked as % baseline", () => {
        const options = toRenderOptions(applySettings(undefined, context({
            measures: [
                { queryName: "A", displayName: "A", role: "lineValues", objects: { lines: { percentBaseline: true } } },
                { queryName: "B", displayName: "B", role: "lineValues", objects: { lines: { percentBaseline: true } } },
            ],
        })));
        expect(options.model.percentBaseline).toBe("A");
    });
});
