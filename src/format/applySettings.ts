// Builds the Format pane model for one update: saved values where the author set them, preset values where the
// preset overrides, Base defaults otherwise (SPEC §9.2). The pane shows these effective values; the renderer gets
// them through toRenderOptions, with colours passed on only when the author set them, so theme changes still apply.
import type powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import { orderByPosition } from "../model/matrix";
import { roleIndexOf } from "../model/parseDataView";
import { mix, themeColors, type PaletteLike } from "../render/colors";
import { matrixGridLineWidth } from "../render/options";
import type { StringKey, Strings } from "../render/strings";
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
    /** Keyed like aggregations: `${kind}:${queryName}`. Only rows the author set. */
    rowPositions: Record<string, number>;
    rowLineWidths: Record<string, number>;
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
    strings: Strings;
}

function savedColor(objects: ObjectsLike, card: string, property: string): string | null {
    const value = objects?.[card]?.[property] as { solid?: { color?: unknown } } | undefined;
    const color = value?.solid?.color;
    return typeof color === "string" && color !== "" ? color : null;
}

function savedValue(objects: ObjectsLike, card: string, property: string): unknown {
    return isExplicit(objects, card, property) ? objects?.[card]?.[property] : undefined;
}

function savedNumber(objects: ObjectsLike, card: string, property: string): number | undefined {
    const value = savedValue(objects, card, property);
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

/** The formatting library translates display names only: dropdown items and placeholders hold string keys until here. */
function translateItemsAndPlaceholders(model: VisualFormattingSettingsModel, strings: Strings): void {
    const translate = (key: unknown): string => strings(key as StringKey);
    for (const card of model.cards as formattingSettings.CompositeCard[]) {
        for (const slice of staticSlices(card)) {
            if (slice instanceof formattingSettings.ItemDropdown) {
                slice.items = slice.items.map((i) => ({ ...i, displayName: translate(i.displayName) }));
                if (slice.value) slice.value = { ...slice.value, displayName: translate(slice.value.displayName) };
            } else if (slice instanceof formattingSettings.TextInput && slice.placeholder) {
                slice.placeholder = translate(slice.placeholder);
            }
        }
    }
}

export function applySettings(dataView: powerbi.DataView | undefined, context: ApplyContext): AppliedSettings {
    const { strings } = context;
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
    const instances: InstanceValues = { columnFills: {}, lineColors: {}, lineStyles: {}, valueModes: {}, lineEnds: {}, percentBaselines: [], aggregations: {}, rowPositions: {}, rowLineWidths: {} };
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
            valueMode: { displayName: strings("instanceValueMode", m.displayName), selector, value: valueMode },
            lineEnd: { displayName: strings("instanceLineEnd", m.displayName), selector, value: lineEnd },
            percentBaseline: { displayName: strings("instancePercentBaseline", m.displayName), selector, value: percentBaseline },
        };
    }));

    model.lines.colors.setInstances(lineMeasures.map((m) => {
        const selector = measureSelector(m.queryName);
        const saved = savedColor(m.objects, "lines", "lineColor");
        if (saved) instances.lineColors[m.queryName] = saved;
        const style = String(savedValue(m.objects, "lines", "lineStyle") ?? "solid");
        instances.lineStyles[m.queryName] = style;
        return {
            lineColor: { displayName: strings("instanceColor", m.displayName), selector, value: saved ?? context.palette.getColor(m.queryName).value },
            lineStyle: { displayName: strings("instanceStyle", m.displayName), selector, value: style },
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
        return { kind, spec: { displayName: strings(kind === "line" ? "instanceCumulativeTotal" : "instanceTotal", m.displayName), selector: measureSelector(m.queryName), value } };
    }));

    // Row order and lines, per matrix row. The pane shows effective values: positions always read 1, 2, 3... and a
    // line the author hasn't set shows the grid's width, so typing that width is the way back to the default.
    const gridLine = matrixGridLineWidth(model.matrix.grid.showBorders.value !== false);
    if (!explicit.has("matrix.headerLineWidth")) model.matrix.grid.headerLineWidth.value = gridLine;
    const rowTargets = aggregationTargets.map(({ m, kind }) => {
        const key = `${kind}:${m.queryName}`;
        const position = savedNumber(m.objects, "matrix", `${kind}RowPosition`);
        const lineWidth = savedNumber(m.objects, "matrix", `${kind}RowLineWidth`);
        if (position !== undefined) instances.rowPositions[key] = position;
        if (lineWidth !== undefined) instances.rowLineWidths[key] = lineWidth;
        return { m, kind, key, lineWidth };
    });
    const rowOrder = orderByPosition(rowTargets.map((t) => t.key), instances.rowPositions);
    model.matrix.rows.setInstances(rowTargets.map(({ m, kind, key, lineWidth }) => {
        const selector = measureSelector(m.queryName);
        const row = kind === "table" ? m.displayName : strings(kind === "column" ? "instanceColumnRow" : "instanceLineRow", m.displayName);
        return {
            kind,
            position: { displayName: strings("instancePosition", row), selector, value: rowOrder.indexOf(key) + 1 },
            lineWidth: { displayName: strings("instanceLineBelow", row), selector, value: lineWidth ?? gridLine },
        };
    }));

    // Text boxes the author hasn't set show the text the visual will use, in the report's language.
    if (!explicit.has("lines.cumulativeSuffix")) model.lines.values.cumulativeSuffix.value = strings("cumulativeSuffix");
    if (!explicit.has("matrix.totalsLabel")) model.matrix.options.totalsLabel.value = strings("totalsLabel");
    translateItemsAndPlaceholders(model, strings);

    return { model, preset, explicit, fromPreset, instances };
}

/** Measures and series the Format pane offers per-instance settings for, read defensively from the dataView. */
export function readInstances(dataView: powerbi.DataView | undefined, seriesSelector: (groupIndex: number) => Selector | null, seriesName: (value: unknown, format: string | undefined) => string): Pick<ApplyContext, "measures" | "series"> {
    const measures: MeasureInstance[] = [];
    const wellIndex = new Map<MeasureInstance, number>();
    const seen = new Set<string>();
    for (const column of dataView?.metadata?.columns ?? []) {
        for (const role of ["columnValues", "lineValues", "tableOnlyValues"] as const) {
            if (!column.roles?.[role] || !column.queryName) continue;
            const key = `${role}|${column.queryName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const measure: MeasureInstance = { queryName: column.queryName, displayName: column.displayName, role, objects: column.objects as ObjectsLike };
            wellIndex.set(measure, roleIndexOf(column, role) ?? measures.filter((m) => m.role === role).length);
            measures.push(measure);
        }
    }
    // The same order the matrix uses, so the positions shown in the pane match the rows.
    measures.sort((a, b) => (a.role === b.role ? (wellIndex.get(a) ?? 0) - (wellIndex.get(b) ?? 0) : 0));

    const values = dataView?.categorical?.values;
    const series: SeriesInstance[] = [];
    if (values?.source && typeof values.grouped === "function") {
        values.grouped().forEach((group, index) => {
            const selector = seriesSelector(index);
            if (!selector) return;
            const key = String(group.name);
            series.push({ key, displayName: seriesName(group.name, values.source?.format), objects: group.objects as ObjectsLike, selector });
        });
    }
    return { measures, series };
}
