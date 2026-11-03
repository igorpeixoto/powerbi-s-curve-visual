// Turns the model plus options into everything the drawers need: scales, labels, colours, matrix rows,
// legend items and the layout. All positions derive from the one shared geometry in `layout.geometry`.
import { buildBarLayout, buildHighlightLayout, type BarLayout } from "../model/columns";
import { bucketLabel } from "../model/labels";
import { buildMatrixRows, type MatrixRow } from "../model/matrix";
import { columnExtent, lineExtent, niceDomain, percentDomain, type NiceDomain } from "../model/scales";
import type { MeasureInfo, SCurveModel } from "../model/types";
import { THEME_LIGHT_TINT } from "../format/presets";
import { DataColors, mix, themeColors, type PaletteLike, type ThemeColors } from "./colors";
import type { Formatters, NumberFormatter } from "./format";
import { computeLayout, LEGEND_SIDE_SHARE, type Layout } from "./layout";
import { truncate, type TextMeasurer } from "./measure";
import { ptToPx, type LineStyle, type RenderOptions, type TextFont } from "./options";
import type { Strings } from "./strings";

export interface AxisScene {
    domain: [number, number];
    ticks: number[];
    labels: string[];
}

/** Resolved text and line colours: an explicit Format pane colour, else the theme (always the theme in high contrast). */
export interface Ink {
    leftLabels: string;
    rightLabels: string;
    xLabels: string;
    leftTitle: string;
    rightTitle: string;
    xTitle: string;
    columnLabelBackground: string;
    lineLabelBackground: string;
    gridline: string;
    /** null = the theme text colour. */
    columnLabels: string | null;
    /** null = each line's own colour. */
    lineLabels: string | null;
    legend: string;
    matrixText: string;
    matrixHeader: string;
    matrixBorder: string;
}

export interface Titles {
    left: string | null;
    right: string | null;
    x: string | null;
    legend: string | null;
}

export interface LegendItem {
    label: string;
    kind: "bar" | "line";
    color: string;
    lineStyle: LineStyle;
    measureKey: string;
    seriesIndex: number | null;
}

export interface Scene {
    model: SCurveModel;
    options: RenderOptions;
    layout: Layout;
    theme: ThemeColors;
    ink: Ink;
    titles: Titles;
    colors: DataColors;
    measure: TextMeasurer;
    strings: Strings;
    bucketLabels: string[];
    /** Second x-axis label line per bucket; null when off or the buckets aren't weeks. */
    bucketSecondLabels: string[] | null;
    /** Both label lines, for tooltip headers and announcements. */
    bucketTitles: string[];
    columnMeasures: MeasureInfo[];
    bars: BarLayout;
    /** Highlighted subset as bars, when another visual highlights; drawn solid over the faded full bars. */
    barsHighlight: BarLayout | null;
    highContrast: boolean;
    /** Position of a column measure among the drawn column measures (high-contrast fill/outline). */
    columnIndex(measureKey: string): number;
    left: AxisScene | null;
    right: AxisScene | null;
    lineLabel(measureKey: string): NumberFormatter;
    columnLabel(measureKey: string): NumberFormatter;
    lineStyle(measureKey: string): LineStyle;
    matrixRows: MatrixRow[];
    /** Formatted cell text that fits maxWidth: full, then abbreviated, then empty (SPEC §3.2). */
    cellText(row: MatrixRow, value: number | null, maxWidth: number): string;
    totalsLabel: string;
    cumulativeSuffix: string;
    legendItems: LegendItem[];
    /** Full-precision value text for tooltips and accessible labels. */
    formatValue(format: string | undefined, value: number | null, percent: boolean): string;
    formatRaw(value: unknown, format: string | undefined): string;
    seriesName(seriesIndex: number): string;
    matrixRowFont(row: MatrixRow): TextFont;
    totalsHeaderFont: TextFont;
    legendTitleFont: TextFont;
}

export interface SceneInput {
    model: SCurveModel;
    options: RenderOptions;
    viewport: { width: number; height: number };
    palette: PaletteLike;
    formatters: Formatters;
    measure: TextMeasurer;
    strings: Strings;
    scrollbarSize: number;
}

const AXIS_LABEL_PADDING = 10;
const HIGH_CONTRAST_LINE_STYLES: LineStyle[] = ["solid", "dashed", "dotted"];
const LEGEND_SWATCH = 16;
const LEGEND_SWATCH_GAP = 5;
const LEGEND_MAX_LABEL_WIDTH = 220;
const MATRIX_PADDING = 12;

function axisScene(domain: NiceDomain | null, format: NumberFormatter): AxisScene | null {
    return domain ? { domain: domain.domain, ticks: domain.ticks, labels: domain.ticks.map((t) => format(t)) } : null;
}

export function buildScene(input: SceneInput): Scene {
    const { model, options, formatters, measure, strings } = input;
    const measuresByKey = new Map(model.measures.map((m) => [m.key, m]));
    const columnMeasures = options.columns.show ? model.measures.filter((m) => m.role === "columnValues") : [];
    const lineMeasures = options.lines.show ? model.measures.filter((m) => m.role === "lineValues") : [];
    const lines = options.lines.show ? model.lines : [];
    const percent = model.displayAs === "percentOfBaseline";

    const colors = new DataColors(input.palette, {
        columnMeasures: columnMeasures.map((m) => ({ key: m.key, queryName: m.queryName })),
        lineMeasures: lineMeasures.map((m) => ({ key: m.key, queryName: m.queryName })),
        seriesKeys: model.series.map((s) => s.key),
        hasSeries: model.hasSeries,
        columnOverrides: options.columns.colors,
        lineOverrides: options.lines.colors,
    });
    const theme = themeColors(input.palette);
    const highContrast = Boolean(input.palette.isHighContrast);
    const pick = (override: string | null, fallback: string) => (highContrast ? fallback : override ?? fallback);
    const gridlineOverride = options.gridlines.color === THEME_LIGHT_TINT ? mix(theme.gridline, theme.background, 0.6) : options.gridlines.color;
    const ink: Ink = {
        leftLabels: pick(options.leftAxis.labelColor, theme.secondaryText),
        rightLabels: pick(options.rightAxis.labelColor, theme.secondaryText),
        xLabels: pick(options.xAxis.labelColor, theme.secondaryText),
        leftTitle: pick(options.leftAxis.title.color, theme.text),
        rightTitle: pick(options.rightAxis.title.color, theme.text),
        xTitle: pick(options.xAxis.title.color, theme.text),
        gridline: pick(gridlineOverride, theme.gridline),
        columnLabels: highContrast ? theme.text : options.dataLabels.columns.color,
        columnLabelBackground: pick(options.dataLabels.columns.background.color, theme.background),
        lineLabelBackground: pick(options.dataLabels.lines.background.color, theme.background),
        lineLabels: highContrast ? theme.text : options.dataLabels.lines.color,
        legend: pick(options.legend.color, theme.text),
        matrixText: pick(options.matrix.fontColor, theme.text),
        matrixHeader: pick(options.matrix.headerColor, theme.text),
        matrixBorder: pick(options.matrix.borderColor, theme.border),
    };

    // Scales and axis labels (SPEC §5.3, §6.4).
    const bars = buildBarLayout(
        columnMeasures.map((m) => ({ measureKey: m.key, rows: model.values[m.key] })),
        model.hasSeries,
        options.columns.layout,
        model.buckets.length,
    );
    const barsHighlight = model.highlights
        ? buildHighlightLayout(bars, columnMeasures.map((m) => ({ measureKey: m.key, rows: model.highlights?.[m.key] ?? [] })))
        : null;
    const leftDomain = niceDomain(columnExtent(columnMeasures.map((m) => model.values[m.key]), options.columns.layout), options.leftAxis);
    const lineValues = lines.map((l) => l.values);
    const rightDomain = percent ? (lines.length ? percentDomain(lineExtent(lineValues)) : null) : niceDomain(lineExtent(lineValues), options.rightAxis);
    const leftFormat = formatters.number(columnMeasures[0]?.format, { ...options.leftAxis, reference: leftDomain ? Math.max(...leftDomain.domain.map(Math.abs)) : 0 });
    const rightFormat = percent
        ? formatters.percent()
        : formatters.number(lineMeasures[0]?.format, { ...options.rightAxis, reference: rightDomain ? Math.max(...rightDomain.domain.map(Math.abs)) : 0 });
    const left = options.leftAxis.show ? axisScene(leftDomain, leftFormat) : null;
    const right = options.rightAxis.show ? axisScene(rightDomain, rightFormat) : null;
    // Hidden axes still scale their marks; keep the domain without labels.
    const leftScale = left ?? (leftDomain ? { domain: leftDomain.domain, ticks: leftDomain.ticks, labels: [] } : null);
    const rightScale = right ?? (rightDomain ? { domain: rightDomain.domain, ticks: rightDomain.ticks, labels: [] } : null);

    const labelContext = {
        formatDate: (date: Date) => formatters.shortDate(date),
        weekPrefix: strings("weekPrefix"),
        blankLabel: strings("blank"),
        formatText: (value: unknown) => formatters.value(value, model.bucketFormat),
    };
    const seriesName = (i: number) => formatters.value(model.series[i]?.value, model.seriesFormat, strings("blank"));
    const bucketLabels = model.buckets.map((b, i) => bucketLabel(b, i, options.xAxis.weekLabelFormat, labelContext));
    const secondLine = options.xAxis.secondLine;
    const bucketSecondLabels = secondLine && model.bucketRole === "categoryDate"
        ? model.buckets.map((b, i) => bucketLabel(b, i, secondLine, labelContext))
        : null;
    const bucketTitles = bucketLabels.map((label, i) => (bucketSecondLabels ? `${label} · ${bucketSecondLabels[i]}` : label));

    // Matrix rows and their text widths, which feed the gutters.
    const cumulativeSuffix = options.lines.cumulativeSuffix ?? strings("cumulativeSuffix");
    const matrixRows = options.matrix.show
        ? buildMatrixRows(model, {
            seriesName,
            expandSeries: options.matrix.expandSeries,
            cumulativeSuffix,
            aggregations: options.matrix.aggregations,
            measureAggregations: options.matrix.measureAggregations,
            rowPositions: options.matrix.rowPositions,
            rowLineWidths: options.matrix.rowLineWidths,
        })
        : [];
    const fontPt = options.matrix.fontSize;
    const matrixFont = options.matrix.font;
    const matrixRowFont = (row: MatrixRow): TextFont => ({ ...matrixFont, bold: matrixFont.bold || (options.matrix.headerBold && row.level === 0) });
    const totalsHeaderFont: TextFont = { ...matrixFont, bold: matrixFont.bold || options.matrix.headerBold };
    const fullFormat = (row: MatrixRow): NumberFormatter =>
        row.percent ? formatters.percent(1) : formatters.number(row.format, { displayUnits: options.matrix.displayUnits || 1, precision: options.matrix.precision });
    const shortFormat = (row: MatrixRow, value: number): NumberFormatter =>
        row.percent ? formatters.percent(0) : formatters.number(row.format, { displayUnits: 0, precision: options.matrix.precision, reference: Math.abs(value) });
    const cellText = (row: MatrixRow, value: number | null, maxWidth: number): string => {
        if (value === null) return "";
        const full = fullFormat(row)(value);
        if (measure(full, fontPt, matrixFont) <= maxWidth) return full;
        const short = shortFormat(row, value)(value);
        return measure(short, fontPt, matrixFont) <= maxWidth ? short : "";
    };
    const totalsLabel = options.matrix.totalsLabel ?? strings("totalsLabel");
    const headerWidth = matrixRows.length
        ? Math.min(Math.max(...matrixRows.map((r) => measure(r.label, fontPt, matrixRowFont(r)) + (r.level ? 12 : 0))) + 2 * MATRIX_PADDING, input.viewport.width * 0.35)
        : 0;
    const totalsWidth = matrixRows.length && options.matrix.showTotals
        ? Math.max(measure(totalsLabel, fontPt, totalsHeaderFont), ...matrixRows.map((r) => measure(fullFormat(r)(r.total), fontPt, matrixRowFont(r)))) + 2 * MATRIX_PADDING
        : 0;

    // Legend items: one per drawn mark (SPEC §5.5).
    // High contrast tells lines apart by dash style rather than colour (SPEC §7.4).
    const lineOrder = new Map(lineMeasures.map((m, i) => [m.key, i]));
    const lineStyle = (measureKey: string): LineStyle => {
        if (highContrast) return HIGH_CONTRAST_LINE_STYLES[(lineOrder.get(measureKey) ?? 0) % HIGH_CONTRAST_LINE_STYLES.length];
        return options.lines.styles[measuresByKey.get(measureKey)?.queryName ?? ""] ?? "solid";
    };
    const columnOrder = new Map(columnMeasures.map((m, i) => [m.key, i]));
    const legendItems: LegendItem[] = [];
    for (const m of columnMeasures) {
        if (model.hasSeries) {
            model.series.forEach((_, i) => legendItems.push({
                label: columnMeasures.length > 1 ? `${seriesName(i)} · ${m.displayName}` : seriesName(i),
                kind: "bar", color: colors.bar(m.key, i), lineStyle: "solid", measureKey: m.key, seriesIndex: i,
            }));
        } else {
            legendItems.push({ label: m.displayName, kind: "bar", color: colors.bar(m.key, null), lineStyle: "solid", measureKey: m.key, seriesIndex: null });
        }
    }
    for (const line of lines) {
        const m = measuresByKey.get(line.measureKey);
        if (!m) continue;
        const name = `${m.displayName}${line.accumulated ? cumulativeSuffix : ""}`;
        legendItems.push({
            label: line.seriesIndex === null ? name : `${seriesName(line.seriesIndex)} · ${name}`,
            kind: "line", color: colors.line(line.measureKey, line.seriesIndex), lineStyle: lineStyle(line.measureKey),
            measureKey: line.measureKey, seriesIndex: line.seriesIndex,
        });
    }
    // Titles: an empty title text falls back to the field's name.
    const firstLineName = lineMeasures[0] ? `${lineMeasures[0].displayName}${model.lineDetails[lineMeasures[0].key]?.total.accumulated ? cumulativeSuffix : ""}` : null;
    const titles: Titles = {
        left: options.leftAxis.show && options.leftAxis.title.show && columnMeasures.length ? options.leftAxis.title.text || columnMeasures[0].displayName : null,
        right: options.rightAxis.show && options.rightAxis.title.show && lines.length ? options.rightAxis.title.text || firstLineName : null,
        x: options.xAxis.show && options.xAxis.title.show ? options.xAxis.title.text || model.bucketFieldName : null,
        legend: options.legend.showTitle ? options.legend.titleText || model.seriesFieldName : null,
    };

    const legendFont = options.legend.fontSize;
    const legendTitleFont: TextFont = { ...options.legend.font, bold: true };
    // Each entry fits the legend it's drawn in: a side legend is capped at a share of the width, a top or bottom one
    // at the whole width. Labels are truncated to the same widths below.
    const sideLegend = options.legend.position === "left" || options.legend.position === "right";
    const legendMaxWidth = Math.max(0, input.viewport.width * (sideLegend ? LEGEND_SIDE_SHARE : 1));
    const legendTitleWidth = titles.legend ? Math.min(measure(titles.legend, legendFont, legendTitleFont), LEGEND_MAX_LABEL_WIDTH, legendMaxWidth) : 0;
    const itemWidths = [
        ...(titles.legend ? [legendTitleWidth] : []),
        ...legendItems.map((item) => Math.min(LEGEND_SWATCH + LEGEND_SWATCH_GAP + Math.min(measure(item.label, legendFont, options.legend.font), LEGEND_MAX_LABEL_WIDTH), legendMaxWidth)),
    ];

    const axisWidth = (axis: AxisScene | null, fontSize: number, font: TextFont) =>
        axis && axis.labels.length ? Math.max(...axis.labels.map((l) => measure(l, fontSize, font))) + AXIS_LABEL_PADDING : 0;
    const titleBand = (title: string | null, fontSize: number) => (title ? Math.ceil(ptToPx(fontSize) * 1.5) : 0);

    const layout = computeLayout({
        width: input.viewport.width,
        height: input.viewport.height,
        legend: { show: options.legend.show, position: options.legend.position, itemWidths, itemHeight: Math.ceil(ptToPx(legendFont) * 1.6) },
        axes: {
            leftWidth: axisWidth(left, options.leftAxis.fontSize, options.leftAxis.font) + titleBand(titles.left, options.leftAxis.title.fontSize),
            rightWidth: axisWidth(right, options.rightAxis.fontSize, options.rightAxis.font) + titleBand(titles.right, options.rightAxis.title.fontSize),
            xLabelHeight: (options.xAxis.show ? Math.ceil(ptToPx(options.xAxis.fontSize) * 1.3 * (bucketSecondLabels ? 2 : 1)) + 6 : 4) + titleBand(titles.x, options.xAxis.title.fontSize),
        },
        matrix: {
            show: options.matrix.show,
            rowCount: matrixRows.length,
            rowHeight: options.matrix.rowHeight,
            headerWidth,
            totalsWidth,
            maxHeightPercent: options.matrix.maxHeightPercent,
        },
        bucketCount: model.buckets.length,
        bucketGap: options.bucketGap,
        minBucketWidth: options.minBucketWidth,
        scrollbarSize: input.scrollbarSize,
    });

    const lineLabel = (measureKey: string): NumberFormatter => {
        if (percent) return formatters.percent();
        const m = measuresByKey.get(measureKey);
        const extent = rightScale ? Math.max(...rightScale.domain.map(Math.abs)) : 0;
        return formatters.number(m?.format, { displayUnits: options.dataLabels.lines.displayUnits, precision: options.dataLabels.lines.precision, reference: extent });
    };
    const columnLabel = (measureKey: string): NumberFormatter => {
        const m = measuresByKey.get(measureKey);
        const extent = leftScale ? Math.max(...leftScale.domain.map(Math.abs)) : 0;
        return formatters.number(m?.format, { displayUnits: options.dataLabels.columns.displayUnits, precision: options.dataLabels.columns.precision, reference: extent });
    };

    return {
        model,
        options,
        layout,
        theme,
        ink,
        titles: { ...titles, legend: titles.legend && truncate(titles.legend, legendTitleWidth, (t) => measure(t, legendFont, legendTitleFont)) },
        colors,
        measure,
        strings,
        bucketLabels,
        bucketSecondLabels,
        bucketTitles,
        columnMeasures,
        bars,
        barsHighlight,
        highContrast,
        columnIndex: (measureKey) => columnOrder.get(measureKey) ?? 0,
        left: leftScale,
        right: rightScale,
        lineLabel,
        columnLabel,
        lineStyle,
        matrixRows,
        cellText,
        totalsLabel,
        cumulativeSuffix,
        formatValue: (format, value, isPercent) => {
            if (value === null) return strings("noValue");
            return isPercent ? formatters.percent(1)(value) : formatters.number(format, { displayUnits: 1 })(value);
        },
        formatRaw: (value, format) => {
            if (value === null || value === undefined) return strings("noValue");
            if (typeof value === "number") return formatters.number(format, { displayUnits: 1 })(value);
            return formatters.value(value, format);
        },
        seriesName,
        matrixRowFont,
        totalsHeaderFont,
        legendTitleFont,
        legendItems: legendItems.map((item, i) => {
            const width = itemWidths[i + (titles.legend ? 1 : 0)];
            return { ...item, label: truncate(item.label, width - LEGEND_SWATCH - LEGEND_SWATCH_GAP, (t) => measure(t, legendFont, options.legend.font)) };
        }),
    };
}

export const LEGEND_LAYOUT = { swatch: LEGEND_SWATCH, gap: LEGEND_SWATCH_GAP };
