// The one boundary between saved formatting and the renderer: converts Format pane units (%, pt), clamps
// out-of-range or legacy values, maps empty numbers to "auto", and passes colours only when the author set them.
import type { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import type { DisplayAs, LineEnd, LineSeriesMode, TotalAggregation, ValueMode, WeekStartDay } from "../model/types";
import type { WeekLabelFormat } from "../model/labels";
import type { SeriesLayout } from "../model/columns";
import { defaultRenderOptions, type GridlineStyle, type LabelBackground, type LegendPosition, type LineStyle, type RenderOptions, type TextFont } from "../render/options";
import { LIMITS, type Limit } from "../settings";
import type { AppliedSettings } from "./applySettings";
import { THEME_LIGHT_TINT } from "./presets";

function finite(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: unknown, [min, max]: Limit, fallback: number): number {
    const n = finite(value);
    return n === undefined ? fallback : Math.min(max, Math.max(min, n));
}

function precision(value: unknown): number | undefined {
    const n = finite(value);
    return n === undefined ? undefined : clamp(Math.round(n), LIMITS.precision, 0);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

const dropdown = (slice: formattingSettings.ItemDropdown): unknown => slice.value?.value;

export function toRenderOptions(applied: AppliedSettings): RenderOptions {
    const { model: m, explicit, fromPreset, instances } = applied;
    const color = (card: string, slice: formattingSettings.ColorPicker): string | null =>
        explicit.has(`${card}.${slice.name}`) && slice.value?.value ? slice.value.value : null;
    const font = (card: string, control: formattingSettings.FontControl): TextFont => ({
        // Only a font the author set: otherwise the section follows the General card's.
        family: explicit.has(`${card}.${control.fontFamily.name}`) && control.fontFamily.value ? String(control.fontFamily.value) : null,
        bold: control.bold?.value === true,
        italic: control.italic?.value === true,
        underline: control.underline?.value === true,
    });
    const background = (show: formattingSettings.ToggleSwitch, fill: formattingSettings.ColorPicker, opacity: formattingSettings.Slider): LabelBackground => ({
        show: show.value === true,
        color: color("dataLabels", fill),
        opacity: clamp(opacity.value, LIMITS.percent, 100) / 100,
    });
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
    for (const [key, width] of Object.entries(instances.rowLineWidths)) rowLineWidths[key] = clamp(width, LIMITS.matrixLineWidth, 0);

    const general = m.general;
    const columns = m.columns;
    const lines = m.lines;
    const left = m.leftAxis;
    const right = m.rightAxis;
    const x = m.xAxis;
    const labels = m.dataLabels;
    const legend = m.legend;
    const matrix = m.matrix;
    const fontSize = (value: unknown, fallback: number) => clamp(value, LIMITS.fontSize, fallback);
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
        bucketGap: clamp(general.layout.bucketGap.value, LIMITS.bucketGap, 20) / 100,
        minBucketWidth: clamp(general.layout.minBucketWidth.value, LIMITS.minBucketWidth, 0),
        columns: {
            show: columns.topLevelSlice.value !== false,
            layout: oneOf<SeriesLayout>(dropdown(columns.options.seriesLayout), ["stacked", "clustered"], "stacked"),
            clusterGap: clamp(columns.options.clusterGap.value, LIMITS.percent, 10) / 100,
            opacity: clamp(columns.options.columnOpacity.value, LIMITS.percent, 100) / 100,
            cornerRadius: clamp(columns.options.cornerRadius.value, LIMITS.cornerRadius, 0),
            colors: { ...instances.columnFills },
        },
        lines: {
            show: lines.topLevelSlice.value !== false,
            strokeWidth: clamp(lines.options.strokeWidth.value, LIMITS.strokeWidth, 2),
            opacity: clamp(lines.options.lineOpacity.value, LIMITS.percent, 100) / 100,
            interpolation: oneOf(dropdown(lines.options.interpolation), ["linear", "monotone"] as const, "linear"),
            showMarkers: lines.options.showMarkers.value === true,
            markerSize: clamp(lines.options.markerSize.value, LIMITS.markerSize, 4),
            styles: lineStyles,
            colors: { ...instances.lineColors },
            cumulativeSuffix: explicit.has("lines.cumulativeSuffix") ? String(lines.values.cumulativeSuffix.value ?? "") : null,
        },
        leftAxis: {
            show: left.topLevelSlice.value !== false,
            min: finite(left.range.leftMin.value),
            max: finite(left.range.leftMax.value),
            fontSize: fontSize(left.labels.leftLabelFontSize.value, 9),
            font: font("leftAxis", left.labels.leftLabelFont),
            displayUnits: finite(left.labels.leftDisplayUnits.value) ?? 0,
            precision: precision(left.labels.leftPrecision.value),
            gridlines: left.gridlines.gridlinesShow.value !== false,
            labelColor: color("leftAxis", left.labels.leftLabelColor),
            title: {
                show: left.title.leftTitleShow.value === true,
                text: String(left.title.leftTitleText.value ?? ""),
                fontSize: fontSize(left.title.leftTitleFontSize.value, 11),
                font: font("leftAxis", left.title.leftTitleFont),
                color: color("leftAxis", left.title.leftTitleColor),
            },
        },
        rightAxis: {
            show: right.topLevelSlice.value !== false,
            min: finite(right.range.rightMin.value),
            max: finite(right.range.rightMax.value),
            fontSize: fontSize(right.labels.rightLabelFontSize.value, 9),
            font: font("rightAxis", right.labels.rightLabelFont),
            displayUnits: finite(right.labels.rightDisplayUnits.value) ?? 0,
            precision: precision(right.labels.rightPrecision.value),
            gridlines: right.gridlines.rightGridlinesShow.value === true,
            labelColor: color("rightAxis", right.labels.rightLabelColor),
            title: {
                show: right.title.rightTitleShow.value === true,
                text: String(right.title.rightTitleText.value ?? ""),
                fontSize: fontSize(right.title.rightTitleFontSize.value, 11),
                font: font("rightAxis", right.title.rightTitleFont),
                color: color("rightAxis", right.title.rightTitleColor),
            },
        },
        gridlines: {
            style: oneOf<GridlineStyle>(dropdown(left.gridlines.gridlineStyle), ["solid", "dashed", "dotted"], "dashed"),
            width: clamp(left.gridlines.gridlineWidth.value, LIMITS.gridlineWidth, 1),
            color: gridlineColor,
        },
        xAxis: {
            show: x.topLevelSlice.value !== false,
            fontSize: fontSize(x.labels.xLabelFontSize.value, 9),
            font: font("xAxis", x.labels.xLabelFont),
            weekLabelFormat: oneOf<WeekLabelFormat>(dropdown(x.labels.weekLabelFormat), ["weekStart", "isoWeek", "projectWeek"], "weekStart"),
            secondLine: secondLine === "none" ? null : secondLine,
            labelColor: color("xAxis", x.labels.xLabelColor),
            title: {
                show: x.title.xTitleShow.value === true,
                text: String(x.title.xTitleText.value ?? ""),
                fontSize: fontSize(x.title.xTitleFontSize.value, 10),
                color: color("xAxis", x.title.xTitleColor),
                font: font("xAxis", x.title.xTitleFont),
            },
        },
        dataLabels: {
            columns: {
                show: labels.columnLabels.columnLabelsShow.value === true,
                position: oneOf(dropdown(labels.columnLabels.columnLabelPosition), ["outsideEnd", "insideEnd"] as const, "outsideEnd"),
                fontSize: fontSize(labels.columnLabels.columnLabelFontSize.value, 9),
                font: font("dataLabels", labels.columnLabels.columnLabelFont),
                color: color("dataLabels", labels.columnLabels.columnLabelColor),
                background: background(labels.columnLabels.columnLabelBackgroundShow, labels.columnLabels.columnLabelBackgroundColor, labels.columnLabels.columnLabelBackgroundOpacity),
                displayUnits: finite(labels.columnLabels.columnLabelDisplayUnits.value) ?? 0,
                precision: precision(labels.columnLabels.columnLabelPrecision.value),
            },
            lines: {
                show: labels.lineLabels.lineLabelsShow.value !== false,
                points: oneOf(dropdown(labels.lineLabels.lineLabelPoints), ["last", "all"] as const, "last"),
                fontSize: fontSize(labels.lineLabels.lineLabelFontSize.value, 9),
                font: font("dataLabels", labels.lineLabels.lineLabelFont),
                color: color("dataLabels", labels.lineLabels.lineLabelColor),
                background: background(labels.lineLabels.lineLabelBackgroundShow, labels.lineLabels.lineLabelBackgroundColor, labels.lineLabels.lineLabelBackgroundOpacity),
                displayUnits: finite(labels.lineLabels.lineLabelDisplayUnits.value) ?? 0,
                precision: precision(labels.lineLabels.lineLabelPrecision.value),
            },
        },
        legend: {
            show: legend.topLevelSlice.value !== false,
            position: oneOf<LegendPosition>(dropdown(legend.options.legendPosition), ["top", "bottom", "left", "right"], "top"),
            fontSize: fontSize(legend.text.legendFontSize.value, 9),
            font: font("legend", legend.text.legendFont),
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
            font: font("matrix", matrix.text.matrixFont),
            headerBold: matrix.text.headerBold.value !== false,
            rowHeight: clamp(matrix.grid.rowHeight.value, LIMITS.rowHeight, 20),
            showBorders: matrix.grid.showBorders.value !== false,
            banding: matrix.grid.banding.value === true,
            maxHeightPercent: clamp(matrix.grid.maxHeightPercent.value, LIMITS.maxHeightPercent, 50),
            aggregations: base.matrix.aggregations,
            measureAggregations: aggregations,
            rowPositions: { ...instances.rowPositions },
            rowLineWidths,
            headerLineWidth: explicit.has("matrix.headerLineWidth") ? clamp(matrix.grid.headerLineWidth.value, LIMITS.matrixLineWidth, 0) : null,
            displayUnits: finite(matrix.values.matrixDisplayUnits.value) ?? 0,
            precision: precision(matrix.values.matrixPrecision.value),
            fontColor: color("matrix", matrix.text.matrixFontColor),
            headerColor: color("matrix", matrix.text.headerFontColor),
            borderColor: color("matrix", matrix.grid.borderColor),
        },
    };
}
