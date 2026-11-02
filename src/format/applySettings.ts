// Builds the Format pane model for one update: saved values where the author set them, preset values where the
// preset overrides, Base defaults otherwise (SPEC §9.2). The pane shows these effective values; the renderer gets
// them through toRenderOptions, with colours passed on only when the author set them, so theme changes still apply.
import type powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import { mix, themeColors, type PaletteLike } from "../render/colors";
import { item, VisualFormattingSettingsModel, type InstanceSpec } from "../settings";
import { presetOverrides, THEME_LIGHT_TINT, type StylePreset } from "./presets";
import { isExplicit, presetOf, type ObjectsLike } from "./resolve";

type Selector = powerbi.data.Selector;
type AnySlice = formattingSettings.SimpleSlice;

export interface MeasureInstance {
    queryName: string;
    displayName: string;
    role: "columnValues" | "lineValues" | "tableOnlyValues";
    objects: ObjectsLike;
}

export interface SeriesInstance {
    key: string;
    displayName: string;
    objects: ObjectsLike;
    selector: Selector;
}

/** Per-instance values the renderer needs, keyed by measure queryName (or series key for column fills). */
export interface InstanceValues {
    columnFills: Record<string, string>;
    lineColors: Record<string, string>;
    lineStyles: Record<string, string>;
    valueModes: Record<string, string>;
    lineEnds: Record<string, string>;
    percentBaselines: string[];
    aggregations: Record<string, string>;
}

export interface AppliedSettings {
    model: VisualFormattingSettingsModel;
    preset: StylePreset;
    /** `card.property` keys the author set explicitly. */
    explicit: Set<string>;
    /** Values that came from the preset (e.g. the Minimal gridline tint token). */
    fromPreset: Map<string, unknown>;
    instances: InstanceValues;
}

export interface ApplyContext {
    palette: PaletteLike;
    measures: MeasureInstance[];
    series: SeriesInstance[];
}

function savedColor(objects: ObjectsLike, card: string, property: string): string | null {
    const value = objects?.[card]?.[property] as { solid?: { color?: unknown } } | undefined;
    const color = value?.solid?.color;
    return typeof color === "string" && color !== "" ? color : null;
}

function savedValue(objects: ObjectsLike, card: string, property: string): unknown {
    return isExplicit(objects, card, property) ? objects?.[card]?.[property] : undefined;
}

function staticSlices(card: formattingSettings.CompositeCard): AnySlice[] {
    const slices: AnySlice[] = [];
    if (card.topLevelSlice) slices.push(card.topLevelSlice as AnySlice);
    for (const group of card.groups) {
        if (group.topLevelSlice) slices.push(group.topLevelSlice as AnySlice);
        slices.push(...(group.slices as AnySlice[]));
    }
    return slices;
}

/** Theme colour an untouched colour picker shows (display only; never passed to the renderer). */
function displayColor(property: string, palette: PaletteLike, presetValue: unknown): string {
    const theme = themeColors(palette);
    if (presetValue === THEME_LIGHT_TINT) return mix(theme.gridline, theme.background, 0.6);
    if (property === "gridlineColor") return theme.gridline;
    if (property === "borderColor") return theme.border;
    if (/LabelColor$/.test(property) && !/^(column|line)/.test(property)) return theme.secondaryText;
    return theme.text;
}

const measureSelector = (queryName: string): Selector => ({ metadata: queryName });

export function applySettings(dataView: powerbi.DataView | undefined, context: ApplyContext): AppliedSettings {
    const model = new VisualFormattingSettingsModel();
    const objects = dataView?.metadata?.objects as ObjectsLike;
    const preset = presetOf(objects);
    const overrides = presetOverrides[preset];
    const explicit = new Set<string>();
    const fromPreset = new Map<string, unknown>();

    for (const card of model.cards as formattingSettings.CompositeCard[]) {
        for (const slice of staticSlices(card)) {
            const key = `${card.name}.${slice.name}`;
            const presetValue = overrides[key];
            if (isExplicit(objects, card.name, slice.name)) {
                slice.setPropertiesValues?.(objects as powerbi.DataViewObjects, card.name);
                explicit.add(key);
            } else if (key in overrides) {
                fromPreset.set(key, presetValue);
                if (slice instanceof formattingSettings.ItemDropdown) slice.value = item(slice.items, presetValue);
                else if (!(slice instanceof formattingSettings.ColorPicker)) slice.value = presetValue;
            }
            if (slice instanceof formattingSettings.ColorPicker && !explicit.has(key)) {
                slice.value = { value: displayColor(slice.name, context.palette, presetValue) };
            }
        }
    }

    // Per-instance slices, created fresh on this model so they never accumulate across updates.
    const instances: InstanceValues = { columnFills: {}, lineColors: {}, lineStyles: {}, valueModes: {}, lineEnds: {}, percentBaselines: [], aggregations: {} };
    const byRole = (role: MeasureInstance["role"]) => context.measures.filter((m) => m.role === role);
    const columnMeasures = byRole("columnValues");
    const lineMeasures = byRole("lineValues");

    const fillTargets = context.series.length
        ? context.series.map((s) => ({ key: s.key, displayName: s.displayName, objects: s.objects, selector: s.selector }))
        : columnMeasures.map((m) => ({ key: m.queryName, displayName: m.displayName, objects: m.objects, selector: measureSelector(m.queryName) }));
    model.columns.colors.setInstances(fillTargets.map((t): InstanceSpec<string> => {
        const saved = savedColor(t.objects, "columns", "columnFill");
        if (saved) instances.columnFills[t.key] = saved;
        return { displayName: t.displayName, selector: t.selector, value: saved ?? context.palette.getColor(t.key).value };
    }));

    model.lines.values.setInstances(lineMeasures.map((m) => {
        const selector = measureSelector(m.queryName);
        const valueMode = String(savedValue(m.objects, "lines", "valueMode") ?? "runningTotal");
        const lineEnd = String(savedValue(m.objects, "lines", "lineEnd") ?? "lastValue");
        const percentBaseline = savedValue(m.objects, "lines", "percentBaseline") === true;
        instances.valueModes[m.queryName] = valueMode;
        instances.lineEnds[m.queryName] = lineEnd;
        if (percentBaseline) instances.percentBaselines.push(m.queryName);
        return {
            valueMode: { displayName: `${m.displayName} · Value mode`, selector, value: valueMode },
            lineEnd: { displayName: `${m.displayName} · Line end`, selector, value: lineEnd },
            percentBaseline: { displayName: `${m.displayName} · Use as % baseline`, selector, value: percentBaseline },
        };
    }));

    model.lines.colors.setInstances(lineMeasures.map((m) => {
        const selector = measureSelector(m.queryName);
        const saved = savedColor(m.objects, "lines", "lineColor");
        if (saved) instances.lineColors[m.queryName] = saved;
        const style = String(savedValue(m.objects, "lines", "lineStyle") ?? "solid");
        instances.lineStyles[m.queryName] = style;
        return {
            lineColor: { displayName: `${m.displayName} · Color`, selector, value: saved ?? context.palette.getColor(m.queryName).value },
            lineStyle: { displayName: `${m.displayName} · Style`, selector, value: style },
        };
    }));

    const aggregationTargets = [
        ...columnMeasures.map((m) => ({ m, kind: "column" as const, property: "columnTotalAggregation", fallback: "sum" })),
        ...lineMeasures.map((m) => ({ m, kind: "line" as const, property: "lineTotalAggregation", fallback: "last" })),
        ...byRole("tableOnlyValues").map((m) => ({ m, kind: "table" as const, property: "tableTotalAggregation", fallback: "sum" })),
    ];
    model.matrix.values.setInstances(aggregationTargets.map(({ m, kind, property, fallback }) => {
        const value = String(savedValue(m.objects, "matrix", property) ?? fallback);
        instances.aggregations[`${kind}:${m.queryName}`] = value;
        return { kind, spec: { displayName: `${m.displayName} · ${kind === "line" ? "Cumulative total" : "Total"}`, selector: measureSelector(m.queryName), value } };
    }));

    return { model, preset, explicit, fromPreset, instances };
}

/** Measures and series the Format pane offers per-instance settings for, read defensively from the dataView. */
export function readInstances(dataView: powerbi.DataView | undefined, seriesSelector: (groupIndex: number) => Selector | null): Pick<ApplyContext, "measures" | "series"> {
    const measures: MeasureInstance[] = [];
    const seen = new Set<string>();
    for (const column of dataView?.metadata?.columns ?? []) {
        for (const role of ["columnValues", "lineValues", "tableOnlyValues"] as const) {
            if (!column.roles?.[role] || !column.queryName) continue;
            const key = `${role}|${column.queryName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            measures.push({ queryName: column.queryName, displayName: column.displayName, role, objects: column.objects as ObjectsLike });
        }
    }

    const values = dataView?.categorical?.values;
    const series: SeriesInstance[] = [];
    if (values?.source && typeof values.grouped === "function") {
        values.grouped().forEach((group, index) => {
            const selector = seriesSelector(index);
            if (!selector) return;
            const key = String(group.name);
            series.push({ key, displayName: group.name === null || group.name === undefined ? "(Blank)" : key, objects: group.objects as ObjectsLike, selector });
        });
    }
    return { measures, series };
}
