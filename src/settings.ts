"use strict";

// The Format pane (SPEC §9.3). Card and property names are the public contract: they are stored in every report
// that uses the visual, so they never change (CLAUDE.md Hard Rule #5). Group names are never stored, but the
// formatting library derives each group's uid from its name alone, so they must be unique across all cards. Defaults here are the Base (= Classic)
// values; src/format/applySettings.ts resolves saved values and presets on top of them.
import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.CompositeCard;
import Group = formattingSettings.Group;
import Model = formattingSettings.Model;

type Selector = powerbi.data.Selector;

/** A per-measure or per-series slice: label, selector and its current (effective) value. */
export interface InstanceSpec<T> {
    displayName: string;
    selector: Selector;
    value: T;
}

/** "Auto" for optional numbers: no value until the author types one. */
const AUTO = undefined as unknown as number;
const THEME_COLOR = { value: "" };
const DEFAULT_FONT = "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif";

function items(entries: [string, string][]): powerbi.IEnumMember[] {
    return entries.map(([value, displayName]) => ({ value, displayName }));
}

export const ITEMS = {
    stylePreset: items([["classic", "Classic S-curve"], ["weeklyProgress", "Weekly progress"], ["minimal", "Minimal"]]),
    seriesLayout: items([["stacked", "Stacked"], ["clustered", "Clustered"]]),
    lineSeriesMode: items([["total", "Total across series"], ["perSeries", "One line per series"]]),
    interpolation: items([["linear", "Straight"], ["monotone", "Smooth"]]),
    valueMode: items([["runningTotal", "Running total"], ["asProvided", "As provided"]]),
    lineEnd: items([["lastValue", "Stop at last value"], ["lastBucket", "Carry to the end"]]),
    displayAs: items([["value", "Values"], ["percentOfBaseline", "% of baseline"]]),
    lineStyle: items([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]),
    weekLabelFormat: items([["weekStart", "Week start date"], ["isoWeek", "ISO week"], ["projectWeek", "Project week"]]),
    weekLabelSecondLine: items([["none", "None"], ["weekStart", "Week start date"], ["isoWeek", "ISO week"], ["projectWeek", "Project week"]]),
    weekStartDay: items([["monday", "Monday"], ["sunday", "Sunday"]]),
    labelPosition: items([["outsideEnd", "Outside end"], ["insideEnd", "Inside end"]]),
    labelPoints: items([["last", "Last point"], ["all", "All points"]]),
    legendPosition: items([["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]]),
    aggregation: items([["sum", "Sum"], ["last", "Last"], ["average", "Average"], ["none", "None"]]),
};

export function item(list: powerbi.IEnumMember[], value: unknown): powerbi.IEnumMember {
    return list.find((i) => i.value === value) ?? list[0];
}

// ----- General -----

class PresetGroup extends Group {
    stylePreset = new formattingSettings.ItemDropdown({ name: "stylePreset", displayName: "Style preset", items: ITEMS.stylePreset, value: ITEMS.stylePreset[0] });

    constructor() {
        super({ name: "generalPreset", displayName: "Preset" });
        this.slices = [this.stylePreset];
    }
}

class LayoutGroup extends Group {
    minBucketWidth = new formattingSettings.NumUpDown({ name: "minBucketWidth", displayName: "Minimum bucket width (px, 0 = fit)", value: 0 });
    bucketGap = new formattingSettings.NumUpDown({ name: "bucketGap", displayName: "Gap between buckets (%)", value: 20 });
    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font", value: DEFAULT_FONT });

    constructor() {
        super({ name: "generalLayout", displayName: "Layout" });
        this.slices = [this.minBucketWidth, this.bucketGap, this.fontFamily];
    }
}

class GeneralCard extends Card {
    name = "general";
    displayName = "General";
    preset = new PresetGroup();
    layout = new LayoutGroup();
    groups = [this.preset, this.layout];
}

// ----- Columns -----

class ColumnOptionsGroup extends Group {
    seriesLayout = new formattingSettings.ItemDropdown({ name: "seriesLayout", displayName: "Series layout", items: ITEMS.seriesLayout, value: ITEMS.seriesLayout[0] });
    clusterGap = new formattingSettings.NumUpDown({ name: "clusterGap", displayName: "Gap within a bucket (%)", value: 10 });
    columnOpacity = new formattingSettings.NumUpDown({ name: "columnOpacity", displayName: "Opacity (%)", value: 100 });
    cornerRadius = new formattingSettings.NumUpDown({ name: "cornerRadius", displayName: "Corner radius (px)", value: 0 });

    constructor() {
        super({ name: "columnsOptions", displayName: "Options" });
        this.slices = [this.seriesLayout, this.clusterGap, this.columnOpacity, this.cornerRadius];
    }
}

class ColumnColorsGroup extends Group {
    constructor() {
        super({ name: "columnsColors", displayName: "Colors" });
        this.slices = [];
        this.visible = false;
    }

    /** One fill per series, or per measure without series. */
    setInstances(instances: InstanceSpec<string>[]): void {
        this.slices = instances.map((i) => new formattingSettings.ColorPicker({ name: "columnFill", displayName: i.displayName, value: { value: i.value }, selector: i.selector }));
        this.visible = this.slices.length > 0;
    }
}

class ColumnsCard extends Card {
    name = "columns";
    displayName = "Columns";
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showColumns", displayName: "Show columns", value: true });
    options = new ColumnOptionsGroup();
    colors = new ColumnColorsGroup();
    groups = [this.options, this.colors];
}

// ----- Lines -----

class LineOptionsGroup extends Group {
    lineSeriesMode = new formattingSettings.ItemDropdown({ name: "lineSeriesMode", displayName: "With series", items: ITEMS.lineSeriesMode, value: ITEMS.lineSeriesMode[0] });
    strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayName: "Stroke width (px)", value: 2 });
    lineOpacity = new formattingSettings.NumUpDown({ name: "lineOpacity", displayName: "Opacity (%)", value: 100 });
    interpolation = new formattingSettings.ItemDropdown({ name: "interpolation", displayName: "Interpolation", items: ITEMS.interpolation, value: ITEMS.interpolation[0] });
    showMarkers = new formattingSettings.ToggleSwitch({ name: "showMarkers", displayName: "Markers", value: false });
    markerSize = new formattingSettings.NumUpDown({ name: "markerSize", displayName: "Marker size (px)", value: 4 });

    constructor() {
        super({ name: "linesOptions", displayName: "Options" });
        this.slices = [this.lineSeriesMode, this.strokeWidth, this.lineOpacity, this.interpolation, this.showMarkers, this.markerSize];
    }
}

class LineValuesGroup extends Group {
    displayAs = new formattingSettings.ItemDropdown({ name: "displayAs", displayName: "Display as", items: ITEMS.displayAs, value: ITEMS.displayAs[0] });
    cumulativeSuffix = new formattingSettings.TextInput({ name: "cumulativeSuffix", displayName: "Cumulative suffix", value: " (cumulative)", placeholder: "" });
    private readonly staticSlices = [this.displayAs, this.cumulativeSuffix];

    constructor() {
        super({ name: "linesValues", displayName: "Values" });
        this.slices = [...this.staticSlices];
    }

    /** Per line measure: value mode, line end and the % baseline flag. */
    setInstances(instances: { valueMode: InstanceSpec<string>; lineEnd: InstanceSpec<string>; percentBaseline: InstanceSpec<boolean> }[]): void {
        const perMeasure = instances.flatMap((i) => [
            new formattingSettings.ItemDropdown({ name: "valueMode", displayName: i.valueMode.displayName, items: ITEMS.valueMode, value: item(ITEMS.valueMode, i.valueMode.value), selector: i.valueMode.selector }),
            new formattingSettings.ItemDropdown({ name: "lineEnd", displayName: i.lineEnd.displayName, items: ITEMS.lineEnd, value: item(ITEMS.lineEnd, i.lineEnd.value), selector: i.lineEnd.selector }),
            new formattingSettings.ToggleSwitch({ name: "percentBaseline", displayName: i.percentBaseline.displayName, value: i.percentBaseline.value, selector: i.percentBaseline.selector }),
        ]);
        this.slices = [...this.staticSlices, ...perMeasure];
    }
}

class LineColorsGroup extends Group {
    constructor() {
        super({ name: "linesColors", displayName: "Colors and style" });
        this.slices = [];
        this.visible = false;
    }

    /** Per line measure: colour (total-across-series lines) and dash style. */
    setInstances(instances: { lineColor: InstanceSpec<string>; lineStyle: InstanceSpec<string> }[]): void {
        this.slices = instances.flatMap((i) => [
            new formattingSettings.ColorPicker({ name: "lineColor", displayName: i.lineColor.displayName, value: { value: i.lineColor.value }, selector: i.lineColor.selector }),
            new formattingSettings.ItemDropdown({ name: "lineStyle", displayName: i.lineStyle.displayName, items: ITEMS.lineStyle, value: item(ITEMS.lineStyle, i.lineStyle.value), selector: i.lineStyle.selector }),
        ]);
        this.visible = this.slices.length > 0;
    }
}

class LinesCard extends Card {
    name = "lines";
    displayName = "Lines";
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showLines", displayName: "Show lines", value: true });
    options = new LineOptionsGroup();
    values = new LineValuesGroup();
    colors = new LineColorsGroup();
    groups = [this.options, this.values, this.colors];
}

// ----- Y-axis (columns) -----

class LeftRangeGroup extends Group {
    leftMin = new formattingSettings.NumUpDown({ name: "leftMin", displayName: "Minimum", value: AUTO });
    leftMax = new formattingSettings.NumUpDown({ name: "leftMax", displayName: "Maximum", value: AUTO });

    constructor() {
        super({ name: "leftAxisRange", displayName: "Range" });
        this.slices = [this.leftMin, this.leftMax];
    }
}

class LeftLabelsGroup extends Group {
    leftLabelFontSize = new formattingSettings.NumUpDown({ name: "leftLabelFontSize", displayName: "Text size", value: 9 });
    leftLabelColor = new formattingSettings.ColorPicker({ name: "leftLabelColor", displayName: "Color", value: THEME_COLOR });
    leftDisplayUnits = new formattingSettings.AutoDropdown({ name: "leftDisplayUnits", displayName: "Display units", value: 0 });
    leftPrecision = new formattingSettings.NumUpDown({ name: "leftPrecision", displayName: "Value decimal places", value: AUTO });

    constructor() {
        super({ name: "leftAxisLabels", displayName: "Labels" });
        this.slices = [this.leftLabelFontSize, this.leftLabelColor, this.leftDisplayUnits, this.leftPrecision];
    }
}

class LeftTitleGroup extends Group {
    leftTitleShow = new formattingSettings.ToggleSwitch({ name: "leftTitleShow", displayName: "Title", value: false });
    leftTitleText = new formattingSettings.TextInput({ name: "leftTitleText", displayName: "Title text", value: "", placeholder: "Measure name" });
    leftTitleFontSize = new formattingSettings.NumUpDown({ name: "leftTitleFontSize", displayName: "Text size", value: 11 });
    leftTitleColor = new formattingSettings.ColorPicker({ name: "leftTitleColor", displayName: "Color", value: THEME_COLOR });

    constructor() {
        super({ name: "leftAxisTitle", displayName: "Title" });
        this.topLevelSlice = this.leftTitleShow;
        this.slices = [this.leftTitleText, this.leftTitleFontSize, this.leftTitleColor];
    }
}

class LeftGridlinesGroup extends Group {
    gridlinesShow = new formattingSettings.ToggleSwitch({ name: "gridlinesShow", displayName: "Gridlines", value: true });
    gridlineColor = new formattingSettings.ColorPicker({ name: "gridlineColor", displayName: "Color", value: THEME_COLOR });
    gridlineWidth = new formattingSettings.NumUpDown({ name: "gridlineWidth", displayName: "Width (px)", value: 1 });
    gridlineStyle = new formattingSettings.ItemDropdown({ name: "gridlineStyle", displayName: "Style", items: ITEMS.lineStyle, value: item(ITEMS.lineStyle, "dashed") });

    constructor() {
        super({ name: "leftAxisGridlines", displayName: "Gridlines" });
        this.topLevelSlice = this.gridlinesShow;
        this.slices = [this.gridlineColor, this.gridlineWidth, this.gridlineStyle];
    }
}

class LeftAxisCard extends Card {
    name = "leftAxis";
    displayName = "Y-axis (columns)";
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showLeftAxis", displayName: "Show axis", value: true });
    range = new LeftRangeGroup();
    labels = new LeftLabelsGroup();
    title = new LeftTitleGroup();
    gridlines = new LeftGridlinesGroup();
    groups = [this.range, this.labels, this.title, this.gridlines];
}

// ----- Y-axis (lines) -----

class RightRangeGroup extends Group {
    rightMin = new formattingSettings.NumUpDown({ name: "rightMin", displayName: "Minimum", value: AUTO });
    rightMax = new formattingSettings.NumUpDown({ name: "rightMax", displayName: "Maximum", value: AUTO });

    constructor() {
        super({ name: "rightAxisRange", displayName: "Range" });
        this.slices = [this.rightMin, this.rightMax];
    }
}

class RightLabelsGroup extends Group {
    rightLabelFontSize = new formattingSettings.NumUpDown({ name: "rightLabelFontSize", displayName: "Text size", value: 9 });
    rightLabelColor = new formattingSettings.ColorPicker({ name: "rightLabelColor", displayName: "Color", value: THEME_COLOR });
    rightDisplayUnits = new formattingSettings.AutoDropdown({ name: "rightDisplayUnits", displayName: "Display units", value: 0 });
    rightPrecision = new formattingSettings.NumUpDown({ name: "rightPrecision", displayName: "Value decimal places", value: AUTO });

    constructor() {
        super({ name: "rightAxisLabels", displayName: "Labels" });
        this.slices = [this.rightLabelFontSize, this.rightLabelColor, this.rightDisplayUnits, this.rightPrecision];
    }
}

class RightTitleGroup extends Group {
    rightTitleShow = new formattingSettings.ToggleSwitch({ name: "rightTitleShow", displayName: "Title", value: false });
    rightTitleText = new formattingSettings.TextInput({ name: "rightTitleText", displayName: "Title text", value: "", placeholder: "Measure name" });
    rightTitleFontSize = new formattingSettings.NumUpDown({ name: "rightTitleFontSize", displayName: "Text size", value: 11 });
    rightTitleColor = new formattingSettings.ColorPicker({ name: "rightTitleColor", displayName: "Color", value: THEME_COLOR });

    constructor() {
        super({ name: "rightAxisTitle", displayName: "Title" });
        this.topLevelSlice = this.rightTitleShow;
        this.slices = [this.rightTitleText, this.rightTitleFontSize, this.rightTitleColor];
    }
}

class RightGridlinesGroup extends Group {
    rightGridlinesShow = new formattingSettings.ToggleSwitch({ name: "rightGridlinesShow", displayName: "Gridlines", value: false });

    constructor() {
        super({ name: "rightAxisGridlines", displayName: "Gridlines" });
        this.slices = [this.rightGridlinesShow];
    }
}

class RightAxisCard extends Card {
    name = "rightAxis";
    displayName = "Y-axis (lines)";
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showRightAxis", displayName: "Show axis", value: true });
    range = new RightRangeGroup();
    labels = new RightLabelsGroup();
    title = new RightTitleGroup();
    gridlines = new RightGridlinesGroup();
    groups = [this.range, this.labels, this.title, this.gridlines];
}

// ----- X-axis -----

class XLabelsGroup extends Group {
    xLabelFontSize = new formattingSettings.NumUpDown({ name: "xLabelFontSize", displayName: "Text size", value: 9 });
    xLabelColor = new formattingSettings.ColorPicker({ name: "xLabelColor", displayName: "Color", value: THEME_COLOR });
    weekLabelFormat = new formattingSettings.ItemDropdown({ name: "weekLabelFormat", displayName: "Week labels", items: ITEMS.weekLabelFormat, value: ITEMS.weekLabelFormat[0] });
    weekLabelSecondLine = new formattingSettings.ItemDropdown({ name: "weekLabelSecondLine", displayName: "Second line", items: ITEMS.weekLabelSecondLine, value: ITEMS.weekLabelSecondLine[0] });
    weekStartDay = new formattingSettings.ItemDropdown({ name: "weekStartDay", displayName: "Week starts on", items: ITEMS.weekStartDay, value: ITEMS.weekStartDay[0] });
    showEmptyWeeks = new formattingSettings.ToggleSwitch({ name: "showEmptyWeeks", displayName: "Show empty weeks", value: true });

    constructor() {
        super({ name: "xAxisLabels", displayName: "Labels" });
        this.slices = [this.xLabelFontSize, this.xLabelColor, this.weekLabelFormat, this.weekLabelSecondLine, this.weekStartDay, this.showEmptyWeeks];
    }
}

class XTitleGroup extends Group {
    xTitleShow = new formattingSettings.ToggleSwitch({ name: "xTitleShow", displayName: "Title", value: false });
    xTitleText = new formattingSettings.TextInput({ name: "xTitleText", displayName: "Title text", value: "", placeholder: "Field name" });

    constructor() {
        super({ name: "xAxisTitle", displayName: "Title" });
        this.topLevelSlice = this.xTitleShow;
        this.slices = [this.xTitleText];
    }
}

class XAxisCard extends Card {
    name = "xAxis";
    displayName = "X-axis";
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showXAxis", displayName: "Show axis", value: true });
    labels = new XLabelsGroup();
    title = new XTitleGroup();
    groups = [this.labels, this.title];
}

// ----- Data labels -----

class ColumnLabelsGroup extends Group {
    columnLabelsShow = new formattingSettings.ToggleSwitch({ name: "columnLabelsShow", displayName: "Column labels", value: false });
    columnLabelPosition = new formattingSettings.ItemDropdown({ name: "columnLabelPosition", displayName: "Position", items: ITEMS.labelPosition, value: ITEMS.labelPosition[0] });
    columnLabelFontSize = new formattingSettings.NumUpDown({ name: "columnLabelFontSize", displayName: "Text size", value: 9 });
    columnLabelColor = new formattingSettings.ColorPicker({ name: "columnLabelColor", displayName: "Color", value: THEME_COLOR });
    columnLabelDisplayUnits = new formattingSettings.AutoDropdown({ name: "columnLabelDisplayUnits", displayName: "Display units", value: 0 });
    columnLabelPrecision = new formattingSettings.NumUpDown({ name: "columnLabelPrecision", displayName: "Value decimal places", value: AUTO });

    constructor() {
        super({ name: "dataLabelsColumns", displayName: "Columns" });
        this.topLevelSlice = this.columnLabelsShow;
        this.slices = [this.columnLabelPosition, this.columnLabelFontSize, this.columnLabelColor, this.columnLabelDisplayUnits, this.columnLabelPrecision];
    }
}

class LineLabelsGroup extends Group {
    lineLabelsShow = new formattingSettings.ToggleSwitch({ name: "lineLabelsShow", displayName: "Line labels", value: true });
    lineLabelPoints = new formattingSettings.ItemDropdown({ name: "lineLabelPoints", displayName: "Points", items: ITEMS.labelPoints, value: ITEMS.labelPoints[0] });
    lineLabelFontSize = new formattingSettings.NumUpDown({ name: "lineLabelFontSize", displayName: "Text size", value: 9 });
    lineLabelColor = new formattingSettings.ColorPicker({ name: "lineLabelColor", displayName: "Color", value: THEME_COLOR });
    lineLabelDisplayUnits = new formattingSettings.AutoDropdown({ name: "lineLabelDisplayUnits", displayName: "Display units", value: 0 });
    lineLabelPrecision = new formattingSettings.NumUpDown({ name: "lineLabelPrecision", displayName: "Value decimal places", value: AUTO });

    constructor() {
        super({ name: "dataLabelsLines", displayName: "Lines" });
        this.topLevelSlice = this.lineLabelsShow;
        this.slices = [this.lineLabelPoints, this.lineLabelFontSize, this.lineLabelColor, this.lineLabelDisplayUnits, this.lineLabelPrecision];
    }
}

class DataLabelsCard extends Card {
    name = "dataLabels";
    displayName = "Data labels";
    columnLabels = new ColumnLabelsGroup();
    lineLabels = new LineLabelsGroup();
    groups = [this.columnLabels, this.lineLabels];
}

// ----- Legend -----

class LegendOptionsGroup extends Group {
    legendPosition = new formattingSettings.ItemDropdown({ name: "legendPosition", displayName: "Position", items: ITEMS.legendPosition, value: ITEMS.legendPosition[0] });
    legendShowTitle = new formattingSettings.ToggleSwitch({ name: "legendShowTitle", displayName: "Title", value: false });
    legendTitleText = new formattingSettings.TextInput({ name: "legendTitleText", displayName: "Title text", value: "", placeholder: "Series field name" });

    constructor() {
        super({ name: "legendOptions", displayName: "Options" });
        this.slices = [this.legendPosition, this.legendShowTitle, this.legendTitleText];
    }
}

class LegendTextGroup extends Group {
    legendFontSize = new formattingSettings.NumUpDown({ name: "legendFontSize", displayName: "Text size", value: 9 });
    legendColor = new formattingSettings.ColorPicker({ name: "legendColor", displayName: "Color", value: THEME_COLOR });

    constructor() {
        super({ name: "legendText", displayName: "Text" });
        this.slices = [this.legendFontSize, this.legendColor];
    }
}

class LegendCard extends Card {
    name = "legend";
    displayName = "Legend";
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showLegend", displayName: "Show legend", value: true });
    options = new LegendOptionsGroup();
    text = new LegendTextGroup();
    groups = [this.options, this.text];
}

// ----- Matrix -----

class MatrixOptionsGroup extends Group {
    showTotals = new formattingSettings.ToggleSwitch({ name: "showTotals", displayName: "Totals column", value: true });
    totalsLabel = new formattingSettings.TextInput({ name: "totalsLabel", displayName: "Totals label", value: "Total", placeholder: "Total" });
    expandSeries = new formattingSettings.ToggleSwitch({ name: "expandSeries", displayName: "One row per series", value: false });

    constructor() {
        super({ name: "matrixOptions", displayName: "Options" });
        this.slices = [this.showTotals, this.totalsLabel, this.expandSeries];
    }
}

class MatrixValuesGroup extends Group {
    matrixDisplayUnits = new formattingSettings.AutoDropdown({ name: "matrixDisplayUnits", displayName: "Display units", value: 0 });
    matrixPrecision = new formattingSettings.NumUpDown({ name: "matrixPrecision", displayName: "Value decimal places", value: AUTO });
    private readonly staticSlices = [this.matrixDisplayUnits, this.matrixPrecision];

    constructor() {
        super({ name: "matrixValues", displayName: "Values" });
        this.slices = [...this.staticSlices];
    }

    /** Per measure and row kind: how its totals-column value is aggregated. */
    setInstances(instances: { kind: "column" | "line" | "table"; spec: InstanceSpec<string> }[]): void {
        const perMeasure = instances.map(({ kind, spec }) => {
            const common = { displayName: spec.displayName, items: ITEMS.aggregation, value: item(ITEMS.aggregation, spec.value), selector: spec.selector };
            switch (kind) {
                case "column":
                    return new formattingSettings.ItemDropdown({ name: "columnTotalAggregation", ...common });
                case "line":
                    return new formattingSettings.ItemDropdown({ name: "lineTotalAggregation", ...common });
                case "table":
                    return new formattingSettings.ItemDropdown({ name: "tableTotalAggregation", ...common });
            }
        });
        this.slices = [...perMeasure, ...this.staticSlices];
    }
}

class MatrixRowsGroup extends Group {
    constructor() {
        super({ name: "matrixRows", displayName: "Row order and lines" });
        this.slices = [];
        this.visible = false;
    }

    /** Per measure and row kind: where its row goes and how wide the line below it is. */
    setInstances(instances: { kind: "column" | "line" | "table"; position: InstanceSpec<number>; lineWidth: InstanceSpec<number | undefined> }[]): void {
        this.slices = instances.flatMap(({ kind, position, lineWidth }) => {
            const width = { ...lineWidth, value: lineWidth.value ?? AUTO };
            switch (kind) {
                case "column":
                    return [new formattingSettings.NumUpDown({ name: "columnRowPosition", ...position }), new formattingSettings.NumUpDown({ name: "columnRowLineWidth", ...width })];
                case "line":
                    return [new formattingSettings.NumUpDown({ name: "lineRowPosition", ...position }), new formattingSettings.NumUpDown({ name: "lineRowLineWidth", ...width })];
                case "table":
                    return [new formattingSettings.NumUpDown({ name: "tableRowPosition", ...position }), new formattingSettings.NumUpDown({ name: "tableRowLineWidth", ...width })];
            }
        });
        this.visible = this.slices.length > 0;
    }
}

class MatrixTextGroup extends Group {
    matrixFontSize = new formattingSettings.NumUpDown({ name: "matrixFontSize", displayName: "Text size", value: 9 });
    matrixFontColor = new formattingSettings.ColorPicker({ name: "matrixFontColor", displayName: "Color", value: THEME_COLOR });
    headerFontColor = new formattingSettings.ColorPicker({ name: "headerFontColor", displayName: "Row header color", value: THEME_COLOR });
    headerBold = new formattingSettings.ToggleSwitch({ name: "headerBold", displayName: "Bold row headers", value: true });

    constructor() {
        super({ name: "matrixText", displayName: "Text" });
        this.slices = [this.matrixFontSize, this.matrixFontColor, this.headerFontColor, this.headerBold];
    }
}

class MatrixGridGroup extends Group {
    rowHeight = new formattingSettings.NumUpDown({ name: "rowHeight", displayName: "Row height (px)", value: 20 });
    showBorders = new formattingSettings.ToggleSwitch({ name: "showBorders", displayName: "Borders", value: true });
    borderColor = new formattingSettings.ColorPicker({ name: "borderColor", displayName: "Border color", value: THEME_COLOR });
    headerLineWidth = new formattingSettings.NumUpDown({ name: "headerLineWidth", displayName: "Line below header (px)", value: AUTO });
    banding = new formattingSettings.ToggleSwitch({ name: "banding", displayName: "Banded rows", value: false });
    maxHeightPercent = new formattingSettings.NumUpDown({ name: "maxHeightPercent", displayName: "Maximum height (% of visual)", value: 50 });

    constructor() {
        super({ name: "matrixGrid", displayName: "Grid" });
        this.slices = [this.rowHeight, this.showBorders, this.borderColor, this.headerLineWidth, this.banding, this.maxHeightPercent];
    }
}

class MatrixCard extends Card {
    name = "matrix";
    displayName = "Matrix";
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showMatrix", displayName: "Show matrix", value: true });
    options = new MatrixOptionsGroup();
    values = new MatrixValuesGroup();
    rows = new MatrixRowsGroup();
    text = new MatrixTextGroup();
    grid = new MatrixGridGroup();
    groups = [this.options, this.values, this.rows, this.text, this.grid];
}

export class VisualFormattingSettingsModel extends Model {
    general = new GeneralCard();
    columns = new ColumnsCard();
    lines = new LinesCard();
    leftAxis = new LeftAxisCard();
    rightAxis = new RightAxisCard();
    xAxis = new XAxisCard();
    dataLabels = new DataLabelsCard();
    legend = new LegendCard();
    matrix = new MatrixCard();
    cards = [this.general, this.columns, this.lines, this.leftAxis, this.rightAxis, this.xAxis, this.dataLabels, this.legend, this.matrix];
}
