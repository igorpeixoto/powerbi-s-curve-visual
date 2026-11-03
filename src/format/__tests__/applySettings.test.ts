import { describe, expect, it } from "vitest";
import type powerbi from "powerbi-visuals-api";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import { applySettings, readInstances, type ApplyContext } from "../applySettings";
import { createStrings } from "../../render/strings";
import { THEME_LIGHT_TINT } from "../presets";
import { toRenderOptions } from "../toRenderOptions";

const palette = {
    getColor: (key: string) => ({ value: key === "Civil" ? "#118dff" : "#12239e" }),
    foreground: { value: "#252423" },
    foregroundNeutralTertiary: { value: "#b3b0ad" },
    background: { value: "#ffffff" },
};

const context = (extra: Partial<ApplyContext> = {}): ApplyContext => ({ palette, measures: [], series: [], strings: createStrings(), ...extra });
const view = (objects: Record<string, Record<string, unknown>>) => ({ metadata: { columns: [], objects } }) as unknown as powerbi.DataView;

describe("Format pane model", () => {
    it("gives every group a name unique across all cards (the library builds group uids from the name alone)", () => {
        const { model } = applySettings(undefined, context());
        const names = model.cards.flatMap((card) => ("groups" in card ? card.groups.map((g) => g.name) : []));
        expect(names.length).toBe(26);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe("Format pane language", () => {
    const portuguese = createStrings({ getDisplayName: (key) => ({ Visual_enumMinimal: "Mínimo", Visual_placeholderMeasureName: "Nome da medida", Visual_cumulativeSuffix: " (acumulado)", Visual_instanceValueMode: "{0} · Modo de valor" })[key] ?? key });

    it("gives every card, group and static control a key, not a literal", () => {
        const { model } = applySettings(undefined, context());
        const named = model.cards.flatMap((card) => [
            card,
            ...("topLevelSlice" in card && card.topLevelSlice ? [card.topLevelSlice] : []),
            ...("groups" in card ? card.groups.flatMap((g) => [g, ...(g.topLevelSlice ? [g.topLevelSlice] : []), ...(g.slices ?? [])]) : []),
        ]);
        expect(named.length).toBeGreaterThan(100);
        for (const entity of named) {
            expect(entity.displayNameKey, entity.name).toMatch(/^Visual_/);
            expect(entity.displayName, entity.name).toBeUndefined();
        }
    });

    it("translates dropdown items, keeping their stored values", () => {
        const { model } = applySettings(view({ general: { stylePreset: "minimal" } }), context({ strings: portuguese }));
        expect(model.general.preset.stylePreset.value).toEqual({ value: "minimal", displayName: "Mínimo" });
        expect(model.general.preset.stylePreset.items.map((i) => i.value)).toEqual(["classic", "weeklyProgress", "minimal"]);
        expect(model.general.preset.stylePreset.items[2].displayName).toBe("Mínimo");
    });

    it("shows English item names without a translation, and never a key", () => {
        const { model } = applySettings(undefined, context());
        const dropdowns = model.cards.flatMap((card) => ("groups" in card ? card.groups.flatMap((g) => g.slices ?? []) : []))
            .filter((slice): slice is formattingSettings.ItemDropdown => slice instanceof formattingSettings.ItemDropdown);
        expect(dropdowns.length).toBeGreaterThan(10);
        expect(dropdowns.flatMap((d) => d.items.map((i) => String(i.displayName))).filter((name) => /^enum[A-Z]/.test(name))).toEqual([]);
        expect(model.general.preset.stylePreset.value.displayName).toBe("Classic S-curve");
    });

    it("translates placeholders, default texts and per-measure labels", () => {
        const { model } = applySettings(undefined, context({
            strings: portuguese,
            measures: [{ queryName: "P", displayName: "Planned", role: "lineValues", objects: undefined }],
        }));
        expect(model.leftAxis.title.leftTitleText.placeholder).toBe("Nome da medida");
        expect(model.lines.values.cumulativeSuffix.value).toBe(" (acumulado)");
        expect((model.lines.values.slices as { name: string; displayName: string }[]).find((s) => s.name === "valueMode")?.displayName).toBe("Planned · Modo de valor");
    });

    it("keeps a saved text as typed", () => {
        const { model } = applySettings(view({ matrix: { totalsLabel: "Sum" }, lines: { cumulativeSuffix: "" } }), context({ strings: portuguese }));
        expect(model.matrix.options.totalsLabel.value).toBe("Sum");
        expect(model.lines.values.cumulativeSuffix.value).toBe("");
    });
});

describe("Format pane number limits", () => {
    const numberBoxes = () => {
        const { model } = applySettings(undefined, context({
            measures: [
                { queryName: "A", displayName: "A", role: "columnValues", objects: undefined },
                { queryName: "B", displayName: "B", role: "columnValues", objects: undefined },
            ],
        }));
        return model.cards.flatMap((card) => ("groups" in card ? card.groups.flatMap((g) => g.slices ?? []) : []))
            .map((slice) => (slice instanceof formattingSettings.FontControl ? slice.fontSize : slice))
            .filter((slice): slice is formattingSettings.NumUpDown => slice instanceof formattingSettings.NumUpDown);
    };

    it("gives every number box limits that exclude negatives, except the axis ranges", () => {
        const boxes = numberBoxes();
        const unlimited = boxes.filter((box) => !box.options).map((box) => box.name);
        expect(unlimited.sort()).toEqual(["leftMax", "leftMin", "rightMax", "rightMin"]);
        const limited = boxes.filter((box) => box.options);
        expect(limited.length).toBeGreaterThan(25);
        for (const box of limited) {
            expect(box.options?.minValue?.value, box.name).toBeGreaterThanOrEqual(0);
            expect(box.options?.maxValue?.value, box.name).toBeGreaterThan(box.options?.minValue?.value ?? 0);
        }
    });

    it("allows 0 only where 0 means something", () => {
        const min = (name: string) => numberBoxes().find((box) => box.name === name)?.options?.minValue?.value;
        for (const name of ["matrixFontSize", "legendFontSize", "leftTitleFontSize", "markerSize", "strokeWidth", "gridlineWidth", "rowHeight", "maxHeightPercent", "columnRowPosition"]) {
            expect(min(name), name).toBeGreaterThan(0);
        }
        for (const name of ["minBucketWidth", "bucketGap", "columnOpacity", "cornerRadius", "leftPrecision", "headerLineWidth", "columnRowLineWidth"]) {
            expect(min(name), name).toBe(0);
        }
    });

    it("clamps saved values to the same limits the pane enforces", () => {
        const options = toRenderOptions(applySettings(view({
            lines: { strokeWidth: -2, markerSize: 0 },
            matrix: { rowHeight: 1, matrixFontSize: 0, maxHeightPercent: -10 },
            leftAxis: { leftPrecision: -1, gridlineWidth: 0 },
        }), context()));
        expect(options.lines.strokeWidth).toBe(0.5);
        expect(options.lines.markerSize).toBe(1);
        expect(options.matrix.rowHeight).toBe(12);
        expect(options.matrix.fontSize).toBe(6);
        expect(options.matrix.maxHeightPercent).toBe(10);
        expect(options.leftAxis.precision).toBe(0);
        expect(options.gridlines.width).toBe(0.5);
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

describe("text options", () => {
    it("reads a section's font, and leaves the family to the General card until the author sets one", () => {
        const options = toRenderOptions(applySettings(view({
            leftAxis: { leftLabelFontFamily: "Georgia", leftLabelBold: true, leftLabelItalic: true, leftLabelUnderline: true },
        }), context()));
        expect(options.leftAxis.font).toEqual({ family: "Georgia", bold: true, italic: true, underline: true });
        expect(options.rightAxis.font).toEqual({ family: null, bold: false, italic: false, underline: false });
    });

    it("keeps axis titles bold by default, and lets the author turn that off", () => {
        const untouched = toRenderOptions(applySettings(undefined, context()));
        expect([untouched.leftAxis.title.font.bold, untouched.rightAxis.title.font.bold, untouched.xAxis.title.font.bold]).toEqual([true, true, true]);
        expect(toRenderOptions(applySettings(view({ xAxis: { xTitleBold: false } }), context())).xAxis.title.font.bold).toBe(false);
    });

    it("shows the General card's font in a section with none of its own", () => {
        const { model } = applySettings(view({ general: { fontFamily: "Verdana" }, legend: { legendFontFamily: "Georgia" } }), context());
        expect(model.matrix.text.matrixFontFamily.value).toBe("Verdana");
        expect(model.legend.text.legendFontFamily.value).toBe("Georgia");
    });

    it("makes the x-axis title one point larger than its labels until the author sizes it", () => {
        const options = (objects: Record<string, unknown>) => toRenderOptions(applySettings(view({ xAxis: objects }), context())).xAxis.title.fontSize;
        expect(options({ xLabelFontSize: 12 })).toBe(13);
        expect(options({ xLabelFontSize: 40 })).toBe(40);
        expect(options({ xLabelFontSize: 12, xTitleFontSize: 20 })).toBe(20);
    });

    it("reads a data label's background, keeping the theme's colour until the author sets one", () => {
        const options = toRenderOptions(applySettings(view({
            dataLabels: { columnLabelBackgroundShow: true, columnLabelBackgroundOpacity: 40, lineLabelBackgroundShow: true, lineLabelBackgroundColor: { solid: { color: "#ff0000" } }, lineLabelBackgroundOpacity: 500 },
        }), context()));
        expect(options.dataLabels.columns.background).toEqual({ show: true, color: null, opacity: 0.4 });
        expect(options.dataLabels.lines.background).toEqual({ show: true, color: "#ff0000", opacity: 1 });
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

    it("offers position and line width per matrix row, showing effective positions", () => {
        const applied = applySettings(undefined, context({
            measures: [
                { queryName: "Planned", displayName: "Planned", role: "columnValues", objects: undefined },
                { queryName: "Planned", displayName: "Planned", role: "lineValues", objects: { matrix: { lineRowPosition: 1, lineRowLineWidth: 2 } } },
                { queryName: "Crew", displayName: "Crew", role: "tableOnlyValues", objects: { matrix: { tableRowLineWidth: 99, tableRowPosition: "first" } } },
            ],
        }));
        const slices = applied.model.matrix.rows.slices as { name: string; displayName: string; value: unknown }[];
        expect(slices.map((s) => [s.name, s.displayName, s.value])).toEqual([
            ["columnRowPosition", "Planned (column) · Position", 2],
            ["columnRowLineWidth", "Planned (column) · Line below (px)", 1],
            ["lineRowPosition", "Planned (line) · Position", 1],
            ["lineRowLineWidth", "Planned (line) · Line below (px)", 2],
            ["tableRowPosition", "Crew · Position", 3],
            ["tableRowLineWidth", "Crew · Line below (px)", 99],
        ]);
        const options = toRenderOptions(applied);
        expect(options.matrix.rowPositions).toEqual({ "line:Planned": 1 });
        expect(options.matrix.rowLineWidths).toEqual({ "line:Planned": 2, "table:Crew": 6 });
    });

    it("hides the row group without measures, and maps the header line, empty by default", () => {
        const applied = applySettings(undefined, context());
        expect(applied.model.matrix.rows.visible).toBe(false);
        expect(applied.model.matrix.grid.headerLineWidth.value).toBe(1);
        expect(toRenderOptions(applied).matrix.headerLineWidth).toBeNull();
        expect(toRenderOptions(applySettings(view({ matrix: { headerLineWidth: 0 } }), context())).matrix.headerLineWidth).toBe(0);
        expect(toRenderOptions(applySettings(view({ matrix: { headerLineWidth: 40 } }), context())).matrix.headerLineWidth).toBe(6);
    });

    it("shows 0 for unset lines with Borders off, and limits both numbers in the pane", () => {
        const applied = applySettings(view({ matrix: { showBorders: false } }), context({
            measures: [
                { queryName: "A", displayName: "A", role: "columnValues", objects: undefined },
                { queryName: "B", displayName: "B", role: "tableOnlyValues", objects: { matrix: { tableRowLineWidth: 2 } } },
            ],
        }));
        const slices = applied.model.matrix.rows.slices as { name: string; value: unknown; options?: { minValue?: { value: number }; maxValue?: { value: number } } }[];
        const byName = (name: string) => slices.find((s) => s.name === name);
        expect(applied.model.matrix.grid.headerLineWidth.value).toBe(0);
        expect(toRenderOptions(applied).matrix.headerLineWidth).toBeNull();
        expect(byName("columnRowLineWidth")?.value).toBe(0);
        expect(byName("tableRowLineWidth")?.value).toBe(2);
        expect(byName("columnRowPosition")?.options).toMatchObject({ minValue: { value: 1 }, maxValue: { value: 2 } });
        expect(byName("columnRowLineWidth")?.options).toMatchObject({ minValue: { value: 0 }, maxValue: { value: 6 } });
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

describe("readInstances", () => {
    const column = (queryName: string | undefined, displayName: string, role: string) =>
        ({ queryName, displayName, roles: { [role]: true } }) as powerbi.DataViewMetadataColumn;
    const read = (columns: powerbi.DataViewMetadataColumn[]) =>
        readInstances({ metadata: { columns } } as powerbi.DataView, () => null, String).measures.map((m) => `${m.role}:${m.queryName}`);

    it("lists measures by role, then in well order, however the host interleaves the columns", () => {
        const colB = { ...column("B", "B", "columnValues"), rolesIndex: { columnValues: [1] } } as powerbi.DataViewMetadataColumn;
        const colA = { ...column("A", "A", "columnValues"), rolesIndex: { columnValues: [0] } } as powerbi.DataViewMetadataColumn;
        expect(read([colB, column("X", "X", "lineValues"), colA])).toEqual(["columnValues:A", "columnValues:B", "lineValues:X"]);
        // Without rolesIndex, column order is the well order, as parseDataView reads it.
        expect(read([column("A", "A", "columnValues"), column("X", "X", "lineValues"), column("B", "B", "columnValues")]))
            .toEqual(["columnValues:A", "columnValues:B", "lineValues:X"]);
    });

    it("gives a column without a queryName its settings under its display name, as the chart draws it", () => {
        expect(read([column(undefined, "Planned", "columnValues")])).toEqual(["columnValues:Planned"]);
    });
});
