// The one boundary between saved formatting and the renderer: converts Format pane units (%, pt), clamps
// out-of-range or legacy values, maps empty numbers to "auto", and passes colours only when the author set them.
import type { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import type { DisplayAs, LineEnd, LineSeriesMode, TotalAggregation, ValueMode, WeekStartDay } from "../model/types";
import type { WeekLabelFormat } from "../model/labels";
import type { SeriesLayout } from "../model/columns";
import { defaultRenderOptions, type GridlineStyle, type LegendPosition, type LineStyle, type RenderOptions } from "../render/options";
import type { AppliedSettings } from "./applySettings";
import { THEME_LIGHT_TINT } from "./presets";

function finite(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
    const n = finite(value);
    return n === undefined ? fallback : Math.min(max, Math.max(min, n));
}

function precision(value: unknown): number | undefined {
    const n = finite(value);
    return n === undefined ? undefined : Math.min(9, Math.max(0, Math.round(n)));
}

/** Wider than this, a line would cover the text of a row at the minimum row height (SPEC §5.6). */
const MAX_MATRIX_LINE_WIDTH = 6;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

const dropdown = (slice: formattingSettings.ItemDropdown): unknown => slice.value?.value;

export function toRenderOptions(applied: AppliedSettings): RenderOptions {
    const { model: m, explicit, fromPreset, instances } = applied;
    const color = (card: string, slice: formattingSettings.ColorPicker): string | null =>
        explicit.has(`${card}.${slice.name}`) && slice.value?.value ? slice.value.value : null;
    const base = defaultRenderOptions;
    const lineStyles: Record<string, LineStyle> = {};
    for (const [queryName, style] of Object.entries(instances.lineStyles)) lineStyles[queryName] = oneOf(style, ["solid", "dashed", "dotted"], "solid");
    const valueModes: Record<string, ValueMode> = {};
    for (const [queryName, mode] of Object.entries(instances.valueModes)) valueModes[queryName] = oneOf(mode, ["runningTotal", "asProvided"], "runningTotal");
    const lineEnds: Record<string, LineEnd> = {};
    for (const [queryName, end] of Object.entries(instances.lineEnds)) lineEnds[queryName] = oneOf(end, ["lastValue", "lastBucket"], "lastValue");
    const aggregations: Record<string, TotalAggregation> = {};
    for (const [key, value] of Object.entries(instances.aggregations)) aggregations[key] = oneOf(value, ["sum", "last", "average", "none"], "sum");

    const rowLineWidths: Record<string, number> = {};
    for (const [key, width] of Object.entries(instances.rowLineWidths)) rowLineWidths[key] = clamp(width, 0, MAX_MATRIX_LINE_WIDTH, 0);
    const headerLineWidth = finite(m.matrix.grid.headerLineWidth.value);

    const general = m.general;
    const columns = m.columns;
    const lines = m.lines;
    const left = m.leftAxis;
    const right = m.rightAxis;
    const x = m.xAxis;
    const labels = m.dataLabels;
    const legend = m.legend;
    const matrix = m.matrix;
    const fontSize = (value: unknown, fallback: number) => clamp(value, 6, 40, fallback);
    const secondLine = oneOf<WeekLabelFormat | "none">(dropdown(x.labels.weekLabelSecondLine), ["none", "weekStart", "isoWeek", "projectWeek"], "none");
    const gridlineColor = color("leftAxis", left.gridlines.gridlineColor)
        ?? (fromPreset.get("leftAxis.gridlineColor") === THEME_LIGHT_TINT ? THEME_LIGHT_TINT : null);

    return {
        model: {
            weekStartDay: oneOf<WeekStartDay>(dropdown(x.labels.weekStartDay), ["monday", "sunday"], "monday"),
            showEmptyWeeks: x.labels.showEmptyWeeks.value !== false,
            lineSeriesMode: oneOf<LineSeriesMode>(dropdown(lines.options.lineSeriesMode), ["total", "perSeries"], "total"),
            displayAs: oneOf<DisplayAs>(dropdown(lines.values.displayAs), ["value", "percentOfBaseline"], "value"),
            valueModes,
            lineEnds,
            // Several measures marked as % baseline: the first one, in delivered order, wins (SPEC §6.3).
            percentBaseline: instances.percentBaselines[0] ?? null,
        },
        fontFamily: general.layout.fontFamily.value || base.fontFamily,
        bucketGap: clamp(general.layout.bucketGap.value, 0, 90, 20) / 100,
        minBucketWidth: clamp(general.layout.minBucketWidth.value, 0, 400, 0),
        columns: {
            show: columns.topLevelSlice.value !== false,
            layout: oneOf<SeriesLayout>(dropdown(columns.options.seriesLayout), ["stacked", "clustered"], "stacked"),
            clusterGap: clamp(columns.options.clusterGap.value, 0, 100, 10) / 100,
            opacity: clamp(columns.options.columnOpacity.value, 0, 100, 100) / 100,
            cornerRadius: clamp(columns.options.cornerRadius.value, 0, 40, 0),
            colors: { ...instances.columnFills },
        },
        lines: {
            show: lines.topLevelSlice.value !== false,
            strokeWidth: clamp(lines.options.strokeWidth.value, 0.5, 12, 2),
            opacity: clamp(lines.options.lineOpacity.value, 0, 100, 100) / 100,
            interpolation: oneOf(dropdown(lines.options.interpolation), ["linear", "monotone"] as const, "linear"),
            showMarkers: lines.options.showMarkers.value === true,
            markerSize: clamp(lines.options.markerSize.value, 1, 20, 4),
            styles: lineStyles,
            colors: { ...instances.lineColors },
            cumulativeSuffix: explicit.has("lines.cumulativeSuffix") ? String(lines.values.cumulativeSuffix.value ?? "") : null,
        },
        leftAxis: {
            show: left.topLevelSlice.value !== false,
            min: finite(left.range.leftMin.value),
            max: finite(left.range.leftMax.value),
            fontSize: fontSize(left.labels.leftLabelFontSize.value, 9),
            displayUnits: finite(left.labels.leftDisplayUnits.value) ?? 0,
            precision: precision(left.labels.leftPrecision.value),
            gridlines: left.gridlines.gridlinesShow.value !== false,
            labelColor: color("leftAxis", left.labels.leftLabelColor),
            title: {
                show: left.title.leftTitleShow.value === true,
                text: String(left.title.leftTitleText.value ?? ""),
                fontSize: fontSize(left.title.leftTitleFontSize.value, 11),
                color: color("leftAxis", left.title.leftTitleColor),
            },
        },
        rightAxis: {
            show: right.topLevelSlice.value !== false,
            min: finite(right.range.rightMin.value),
            max: finite(right.range.rightMax.value),
            fontSize: fontSize(right.labels.rightLabelFontSize.value, 9),
            displayUnits: finite(right.labels.rightDisplayUnits.value) ?? 0,
            precision: precision(right.labels.rightPrecision.value),
            gridlines: right.gridlines.rightGridlinesShow.value === true,
            labelColor: color("rightAxis", right.labels.rightLabelColor),
            title: {
                show: right.title.rightTitleShow.value === true,
                text: String(right.title.rightTitleText.value ?? ""),
                fontSize: fontSize(right.title.rightTitleFontSize.value, 11),
                color: color("rightAxis", right.title.rightTitleColor),
            },
        },
        gridlines: {
            style: oneOf<GridlineStyle>(dropdown(left.gridlines.gridlineStyle), ["solid", "dashed", "dotted"], "dashed"),
            width: clamp(left.gridlines.gridlineWidth.value, 0.5, 6, 1),
            color: gridlineColor,
        },
        xAxis: {
            show: x.topLevelSlice.value !== false,
            fontSize: fontSize(x.labels.xLabelFontSize.value, 9),
            weekLabelFormat: oneOf<WeekLabelFormat>(dropdown(x.labels.weekLabelFormat), ["weekStart", "isoWeek", "projectWeek"], "weekStart"),
            secondLine: secondLine === "none" ? null : secondLine,
            labelColor: color("xAxis", x.labels.xLabelColor),
            title: { show: x.title.xTitleShow.value === true, text: String(x.title.xTitleText.value ?? "") },
        },
        dataLabels: {
            columns: {
                show: labels.columnLabels.columnLabelsShow.value === true,
                position: oneOf(dropdown(labels.columnLabels.columnLabelPosition), ["outsideEnd", "insideEnd"] as const, "outsideEnd"),
                fontSize: fontSize(labels.columnLabels.columnLabelFontSize.value, 9),
                color: color("dataLabels", labels.columnLabels.columnLabelColor),
                displayUnits: finite(labels.columnLabels.columnLabelDisplayUnits.value) ?? 0,
                precision: precision(labels.columnLabels.columnLabelPrecision.value),
            },
            lines: {
                show: labels.lineLabels.lineLabelsShow.value !== false,
                points: oneOf(dropdown(labels.lineLabels.lineLabelPoints), ["last", "all"] as const, "last"),
                fontSize: fontSize(labels.lineLabels.lineLabelFontSize.value, 9),
                color: color("dataLabels", labels.lineLabels.lineLabelColor),
                displayUnits: finite(labels.lineLabels.lineLabelDisplayUnits.value) ?? 0,
                precision: precision(labels.lineLabels.lineLabelPrecision.value),
            },
        },
        legend: {
            show: legend.topLevelSlice.value !== false,
            position: oneOf<LegendPosition>(dropdown(legend.options.legendPosition), ["top", "bottom", "left", "right"], "top"),
            fontSize: fontSize(legend.text.legendFontSize.value, 9),
            color: color("legend", legend.text.legendColor),
            showTitle: legend.options.legendShowTitle.value === true,
            titleText: String(legend.options.legendTitleText.value ?? ""),
        },
        matrix: {
            show: matrix.topLevelSlice.value !== false,
            showTotals: matrix.options.showTotals.value !== false,
            totalsLabel: explicit.has("matrix.totalsLabel") ? String(matrix.options.totalsLabel.value ?? "") : null,
            expandSeries: matrix.options.expandSeries.value === true,
            fontSize: fontSize(matrix.text.matrixFontSize.value, 9),
            headerBold: matrix.text.headerBold.value !== false,
            rowHeight: clamp(matrix.grid.rowHeight.value, 12, 60, 20),
            showBorders: matrix.grid.showBorders.value !== false,
            banding: matrix.grid.banding.value === true,
            maxHeightPercent: clamp(matrix.grid.maxHeightPercent.value, 10, 90, 50),
            aggregations: base.matrix.aggregations,
            measureAggregations: aggregations,
            rowPositions: { ...instances.rowPositions },
            rowLineWidths,
            headerLineWidth: headerLineWidth === undefined ? null : clamp(headerLineWidth, 0, MAX_MATRIX_LINE_WIDTH, 0),
            displayUnits: finite(matrix.values.matrixDisplayUnits.value) ?? 0,
            precision: precision(matrix.values.matrixPrecision.value),
            fontColor: color("matrix", matrix.text.matrixFontColor),
            headerColor: color("matrix", matrix.text.headerFontColor),
            borderColor: color("matrix", matrix.grid.borderColor),
        },
    };
}
