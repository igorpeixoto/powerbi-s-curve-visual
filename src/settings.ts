"use strict";

// The Format pane (SPEC §9.3). Card and property names are the public contract: they are stored in every report
// that uses the visual, so they never change (CLAUDE.md Hard Rule #5). Group names are never stored, but the
// formatting library derives each group's uid from its name alone, so they must be unique across all cards. Defaults here are the Base (= Classic)
// values; src/format/applySettings.ts resolves saved values and presets on top of them.
import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import { resourceKey, type StringKey } from "./render/strings";

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

/**
 * [min, max] of each kind of number box (SPEC §9.1). The Format pane enforces them on input, and toRenderOptions
 * clamps saved values to them. Axis minimum and maximum have no limits: negative values are valid there.
 */
export const LIMITS = {
    minBucketWidth: [0, 400],
    bucketGap: [0, 90],
    percent: [0, 100],
    cornerRadius: [0, 40],
    strokeWidth: [0.5, 12],
    markerSize: [1, 20],
    fontSize: [6, 40],
    precision: [0, 9],
    gridlineWidth: [0.5, 6],
    rowHeight: [12, 60],
    maxHeightPercent: [10, 90],
    // Wider than this, a line would cover the text of a row at the minimum row height (SPEC §5.6).
    matrixLineWidth: [0, 6],
} as const;

export type Limit = readonly [number, number];

/** Limits the Format pane enforces on a number. The numbers are ValidatorType.Min and .Max: a const enum, which the unit tests' transpiler can't inline. */
function range([min, max]: Limit): powerbi.visuals.NumUpDownFormat {
    return {
        minValue: { type: 0 as powerbi.visuals.ValidatorType.Min, value: min },
        maxValue: { type: 1 as powerbi.visuals.ValidatorType.Max, value: max },
    };
}
const DEFAULT_FONT = "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif";

/** displayName holds the string key: the formatting library doesn't translate items, so applySettings does. */
function items(entries: [string, StringKey][]): powerbi.IEnumMember[] {
    return entries.map(([value, displayName]) => ({ value, displayName }));
}

export const ITEMS = {
    stylePreset: items([["classic", "enumClassic"], ["weeklyProgress", "enumWeeklyProgress"], ["minimal", "enumMinimal"]]),
    seriesLayout: items([["stacked", "enumStacked"], ["clustered", "enumClustered"]]),
    lineSeriesMode: items([["total", "enumTotalLine"], ["perSeries", "enumPerSeriesLine"]]),
    interpolation: items([["linear", "enumStraight"], ["monotone", "enumSmooth"]]),
    valueMode: items([["runningTotal", "enumRunningTotal"], ["asProvided", "enumAsProvided"]]),
    lineEnd: items([["lastValue", "enumLastValue"], ["lastBucket", "enumLastBucket"]]),
    displayAs: items([["value", "enumValues"], ["percentOfBaseline", "enumPercentOfBaseline"]]),
    lineStyle: items([["solid", "enumSolid"], ["dashed", "enumDashed"], ["dotted", "enumDotted"]]),
    weekLabelFormat: items([["weekStart", "enumWeekStart"], ["isoWeek", "enumIsoWeek"], ["projectWeek", "enumProjectWeek"]]),
    weekLabelSecondLine: items([["none", "enumNoSecondLine"], ["weekStart", "enumWeekStart"], ["isoWeek", "enumIsoWeek"], ["projectWeek", "enumProjectWeek"]]),
    weekStartDay: items([["monday", "enumMonday"], ["sunday", "enumSunday"]]),
    labelPosition: items([["outsideEnd", "enumOutsideEnd"], ["insideEnd", "enumInsideEnd"]]),
    labelPoints: items([["last", "enumLastPoint"], ["all", "enumAllPoints"]]),
    legendPosition: items([["top", "enumTop"], ["bottom", "enumBottom"], ["left", "enumLeft"], ["right", "enumRight"]]),
    aggregation: items([["sum", "enumSum"], ["last", "enumLast"], ["average", "enumAverage"], ["none", "enumNoTotal"]]),
};

export function item(list: powerbi.IEnumMember[], value: unknown): powerbi.IEnumMember {
    return list.find((i) => i.value === value) ?? list[0];
}

// ----- General -----

class PresetGroup extends Group {
    stylePreset = new formattingSettings.ItemDropdown({ name: "stylePreset", displayNameKey: resourceKey("paneStylePreset"), items: ITEMS.stylePreset, value: ITEMS.stylePreset[0] });

    constructor() {
        super({ name: "generalPreset", displayNameKey: resourceKey("panePreset") });
        this.slices = [this.stylePreset];
    }
}

class LayoutGroup extends Group {
    minBucketWidth = new formattingSettings.NumUpDown({ name: "minBucketWidth", displayNameKey: resourceKey("paneMinBucketWidth"), value: 0, options: range(LIMITS.minBucketWidth) });
    bucketGap = new formattingSettings.NumUpDown({ name: "bucketGap", displayNameKey: resourceKey("paneBucketGap"), value: 20, options: range(LIMITS.bucketGap) });
    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });

    constructor() {
        super({ name: "generalLayout", displayNameKey: resourceKey("paneLayout") });
        this.slices = [this.minBucketWidth, this.bucketGap, this.fontFamily];
    }
}

class GeneralCard extends Card {
    name = "general";
    displayNameKey = resourceKey("paneGeneral");
    preset = new PresetGroup();
    layout = new LayoutGroup();
    groups = [this.preset, this.layout];
}

// ----- Columns -----

class ColumnOptionsGroup extends Group {
    seriesLayout = new formattingSettings.ItemDropdown({ name: "seriesLayout", displayNameKey: resourceKey("paneSeriesLayout"), items: ITEMS.seriesLayout, value: ITEMS.seriesLayout[0] });
    clusterGap = new formattingSettings.NumUpDown({ name: "clusterGap", displayNameKey: resourceKey("paneClusterGap"), value: 10, options: range(LIMITS.percent) });
    columnOpacity = new formattingSettings.NumUpDown({ name: "columnOpacity", displayNameKey: resourceKey("paneOpacity"), value: 100, options: range(LIMITS.percent) });
    cornerRadius = new formattingSettings.NumUpDown({ name: "cornerRadius", displayNameKey: resourceKey("paneCornerRadius"), value: 0, options: range(LIMITS.cornerRadius) });

    constructor() {
        super({ name: "columnsOptions", displayNameKey: resourceKey("paneOptions") });
        this.slices = [this.seriesLayout, this.clusterGap, this.columnOpacity, this.cornerRadius];
    }
}

class ColumnColorsGroup extends Group {
    constructor() {
        super({ name: "columnsColors", displayNameKey: resourceKey("paneColors") });
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
    displayNameKey = resourceKey("paneColumns");
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showColumns", displayNameKey: resourceKey("paneShowColumns"), value: true });
    options = new ColumnOptionsGroup();
    colors = new ColumnColorsGroup();
    groups = [this.options, this.colors];
}

// ----- Lines -----

class LineOptionsGroup extends Group {
    lineSeriesMode = new formattingSettings.ItemDropdown({ name: "lineSeriesMode", displayNameKey: resourceKey("paneWithSeries"), items: ITEMS.lineSeriesMode, value: ITEMS.lineSeriesMode[0] });
    strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayNameKey: resourceKey("paneStrokeWidth"), value: 2, options: range(LIMITS.strokeWidth) });
    lineOpacity = new formattingSettings.NumUpDown({ name: "lineOpacity", displayNameKey: resourceKey("paneOpacity"), value: 100, options: range(LIMITS.percent) });
    interpolation = new formattingSettings.ItemDropdown({ name: "interpolation", displayNameKey: resourceKey("paneInterpolation"), items: ITEMS.interpolation, value: ITEMS.interpolation[0] });
    showMarkers = new formattingSettings.ToggleSwitch({ name: "showMarkers", displayNameKey: resourceKey("paneMarkers"), value: false });
    markerSize = new formattingSettings.NumUpDown({ name: "markerSize", displayNameKey: resourceKey("paneMarkerSize"), value: 4, options: range(LIMITS.markerSize) });

    constructor() {
        super({ name: "linesOptions", displayNameKey: resourceKey("paneOptions") });
        this.slices = [this.lineSeriesMode, this.strokeWidth, this.lineOpacity, this.interpolation, this.showMarkers, this.markerSize];
    }
}

class LineValuesGroup extends Group {
    displayAs = new formattingSettings.ItemDropdown({ name: "displayAs", displayNameKey: resourceKey("paneDisplayAs"), items: ITEMS.displayAs, value: ITEMS.displayAs[0] });
    cumulativeSuffix = new formattingSettings.TextInput({ name: "cumulativeSuffix", displayNameKey: resourceKey("paneCumulativeSuffix"), value: "", placeholder: "" });
    private readonly staticSlices = [this.displayAs, this.cumulativeSuffix];

    constructor() {
        super({ name: "linesValues", displayNameKey: resourceKey("paneValues") });
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
        super({ name: "linesColors", displayNameKey: resourceKey("paneColorsAndStyle") });
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
    displayNameKey = resourceKey("paneLines");
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showLines", displayNameKey: resourceKey("paneShowLines"), value: true });
    options = new LineOptionsGroup();
    values = new LineValuesGroup();
    colors = new LineColorsGroup();
    groups = [this.options, this.values, this.colors];
}

// ----- Y-axis (columns) -----

class LeftRangeGroup extends Group {
    leftMin = new formattingSettings.NumUpDown({ name: "leftMin", displayNameKey: resourceKey("paneMinimum"), value: AUTO });
    leftMax = new formattingSettings.NumUpDown({ name: "leftMax", displayNameKey: resourceKey("paneMaximum"), value: AUTO });

    constructor() {
        super({ name: "leftAxisRange", displayNameKey: resourceKey("paneRange") });
        this.slices = [this.leftMin, this.leftMax];
    }
}

class LeftLabelsGroup extends Group {
    leftLabelFontSize = new formattingSettings.NumUpDown({ name: "leftLabelFontSize", displayNameKey: resourceKey("paneTextSize"), value: 9, options: range(LIMITS.fontSize) });
    leftLabelFontFamily = new formattingSettings.FontPicker({ name: "leftLabelFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    leftLabelBold = new formattingSettings.ToggleSwitch({ name: "leftLabelBold", displayNameKey: resourceKey("paneBold"), value: false });
    leftLabelItalic = new formattingSettings.ToggleSwitch({ name: "leftLabelItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    leftLabelUnderline = new formattingSettings.ToggleSwitch({ name: "leftLabelUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    leftLabelFont = new formattingSettings.FontControl({ name: "leftLabelFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.leftLabelFontFamily, fontSize: this.leftLabelFontSize, bold: this.leftLabelBold, italic: this.leftLabelItalic, underline: this.leftLabelUnderline });
    leftLabelColor = new formattingSettings.ColorPicker({ name: "leftLabelColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });
    leftDisplayUnits = new formattingSettings.AutoDropdown({ name: "leftDisplayUnits", displayNameKey: resourceKey("paneDisplayUnits"), value: 0 });
    leftPrecision = new formattingSettings.NumUpDown({ name: "leftPrecision", displayNameKey: resourceKey("panePrecision"), value: AUTO, options: range(LIMITS.precision) });

    constructor() {
        super({ name: "leftAxisLabels", displayNameKey: resourceKey("paneLabels") });
        this.slices = [this.leftLabelFont, this.leftLabelColor, this.leftDisplayUnits, this.leftPrecision];
    }
}

class LeftTitleGroup extends Group {
    leftTitleShow = new formattingSettings.ToggleSwitch({ name: "leftTitleShow", displayNameKey: resourceKey("paneTitle"), value: false });
    leftTitleText = new formattingSettings.TextInput({ name: "leftTitleText", displayNameKey: resourceKey("paneTitleText"), value: "", placeholder: "placeholderMeasureName" });
    leftTitleFontSize = new formattingSettings.NumUpDown({ name: "leftTitleFontSize", displayNameKey: resourceKey("paneTextSize"), value: 11, options: range(LIMITS.fontSize) });
    leftTitleFontFamily = new formattingSettings.FontPicker({ name: "leftTitleFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    leftTitleBold = new formattingSettings.ToggleSwitch({ name: "leftTitleBold", displayNameKey: resourceKey("paneBold"), value: true });
    leftTitleItalic = new formattingSettings.ToggleSwitch({ name: "leftTitleItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    leftTitleUnderline = new formattingSettings.ToggleSwitch({ name: "leftTitleUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    leftTitleFont = new formattingSettings.FontControl({ name: "leftTitleFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.leftTitleFontFamily, fontSize: this.leftTitleFontSize, bold: this.leftTitleBold, italic: this.leftTitleItalic, underline: this.leftTitleUnderline });
    leftTitleColor = new formattingSettings.ColorPicker({ name: "leftTitleColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });

    constructor() {
        super({ name: "leftAxisTitle", displayNameKey: resourceKey("paneTitle") });
        this.topLevelSlice = this.leftTitleShow;
        this.slices = [this.leftTitleText, this.leftTitleFont, this.leftTitleColor];
    }
}

class LeftGridlinesGroup extends Group {
    gridlinesShow = new formattingSettings.ToggleSwitch({ name: "gridlinesShow", displayNameKey: resourceKey("paneGridlines"), value: true });
    gridlineColor = new formattingSettings.ColorPicker({ name: "gridlineColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });
    gridlineWidth = new formattingSettings.NumUpDown({ name: "gridlineWidth", displayNameKey: resourceKey("paneWidth"), value: 1, options: range(LIMITS.gridlineWidth) });
    gridlineStyle = new formattingSettings.ItemDropdown({ name: "gridlineStyle", displayNameKey: resourceKey("paneStyle"), items: ITEMS.lineStyle, value: item(ITEMS.lineStyle, "dashed") });

    constructor() {
        super({ name: "leftAxisGridlines", displayNameKey: resourceKey("paneGridlines") });
        this.topLevelSlice = this.gridlinesShow;
        this.slices = [this.gridlineColor, this.gridlineWidth, this.gridlineStyle];
    }
}

class LeftAxisCard extends Card {
    name = "leftAxis";
    displayNameKey = resourceKey("paneLeftAxis");
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showLeftAxis", displayNameKey: resourceKey("paneShowAxis"), value: true });
    range = new LeftRangeGroup();
    labels = new LeftLabelsGroup();
    title = new LeftTitleGroup();
    gridlines = new LeftGridlinesGroup();
    groups = [this.range, this.labels, this.title, this.gridlines];
}

// ----- Y-axis (lines) -----

class RightRangeGroup extends Group {
    rightMin = new formattingSettings.NumUpDown({ name: "rightMin", displayNameKey: resourceKey("paneMinimum"), value: AUTO });
    rightMax = new formattingSettings.NumUpDown({ name: "rightMax", displayNameKey: resourceKey("paneMaximum"), value: AUTO });

    constructor() {
        super({ name: "rightAxisRange", displayNameKey: resourceKey("paneRange") });
        this.slices = [this.rightMin, this.rightMax];
    }
}

class RightLabelsGroup extends Group {
    rightLabelFontSize = new formattingSettings.NumUpDown({ name: "rightLabelFontSize", displayNameKey: resourceKey("paneTextSize"), value: 9, options: range(LIMITS.fontSize) });
    rightLabelFontFamily = new formattingSettings.FontPicker({ name: "rightLabelFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    rightLabelBold = new formattingSettings.ToggleSwitch({ name: "rightLabelBold", displayNameKey: resourceKey("paneBold"), value: false });
    rightLabelItalic = new formattingSettings.ToggleSwitch({ name: "rightLabelItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    rightLabelUnderline = new formattingSettings.ToggleSwitch({ name: "rightLabelUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    rightLabelFont = new formattingSettings.FontControl({ name: "rightLabelFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.rightLabelFontFamily, fontSize: this.rightLabelFontSize, bold: this.rightLabelBold, italic: this.rightLabelItalic, underline: this.rightLabelUnderline });
    rightLabelColor = new formattingSettings.ColorPicker({ name: "rightLabelColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });
    rightDisplayUnits = new formattingSettings.AutoDropdown({ name: "rightDisplayUnits", displayNameKey: resourceKey("paneDisplayUnits"), value: 0 });
    rightPrecision = new formattingSettings.NumUpDown({ name: "rightPrecision", displayNameKey: resourceKey("panePrecision"), value: AUTO, options: range(LIMITS.precision) });

    constructor() {
        super({ name: "rightAxisLabels", displayNameKey: resourceKey("paneLabels") });
        this.slices = [this.rightLabelFont, this.rightLabelColor, this.rightDisplayUnits, this.rightPrecision];
    }
}

class RightTitleGroup extends Group {
    rightTitleShow = new formattingSettings.ToggleSwitch({ name: "rightTitleShow", displayNameKey: resourceKey("paneTitle"), value: false });
    rightTitleText = new formattingSettings.TextInput({ name: "rightTitleText", displayNameKey: resourceKey("paneTitleText"), value: "", placeholder: "placeholderMeasureName" });
    rightTitleFontSize = new formattingSettings.NumUpDown({ name: "rightTitleFontSize", displayNameKey: resourceKey("paneTextSize"), value: 11, options: range(LIMITS.fontSize) });
    rightTitleFontFamily = new formattingSettings.FontPicker({ name: "rightTitleFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    rightTitleBold = new formattingSettings.ToggleSwitch({ name: "rightTitleBold", displayNameKey: resourceKey("paneBold"), value: true });
    rightTitleItalic = new formattingSettings.ToggleSwitch({ name: "rightTitleItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    rightTitleUnderline = new formattingSettings.ToggleSwitch({ name: "rightTitleUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    rightTitleFont = new formattingSettings.FontControl({ name: "rightTitleFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.rightTitleFontFamily, fontSize: this.rightTitleFontSize, bold: this.rightTitleBold, italic: this.rightTitleItalic, underline: this.rightTitleUnderline });
    rightTitleColor = new formattingSettings.ColorPicker({ name: "rightTitleColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });

    constructor() {
        super({ name: "rightAxisTitle", displayNameKey: resourceKey("paneTitle") });
        this.topLevelSlice = this.rightTitleShow;
        this.slices = [this.rightTitleText, this.rightTitleFont, this.rightTitleColor];
    }
}

class RightGridlinesGroup extends Group {
    rightGridlinesShow = new formattingSettings.ToggleSwitch({ name: "rightGridlinesShow", displayNameKey: resourceKey("paneGridlines"), value: false });

    constructor() {
        super({ name: "rightAxisGridlines", displayNameKey: resourceKey("paneGridlines") });
        this.slices = [this.rightGridlinesShow];
    }
}

class RightAxisCard extends Card {
    name = "rightAxis";
    displayNameKey = resourceKey("paneRightAxis");
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showRightAxis", displayNameKey: resourceKey("paneShowAxis"), value: true });
    range = new RightRangeGroup();
    labels = new RightLabelsGroup();
    title = new RightTitleGroup();
    gridlines = new RightGridlinesGroup();
    groups = [this.range, this.labels, this.title, this.gridlines];
}

// ----- X-axis -----

class XLabelsGroup extends Group {
    xLabelFontSize = new formattingSettings.NumUpDown({ name: "xLabelFontSize", displayNameKey: resourceKey("paneTextSize"), value: 9, options: range(LIMITS.fontSize) });
    xLabelFontFamily = new formattingSettings.FontPicker({ name: "xLabelFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    xLabelBold = new formattingSettings.ToggleSwitch({ name: "xLabelBold", displayNameKey: resourceKey("paneBold"), value: false });
    xLabelItalic = new formattingSettings.ToggleSwitch({ name: "xLabelItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    xLabelUnderline = new formattingSettings.ToggleSwitch({ name: "xLabelUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    xLabelFont = new formattingSettings.FontControl({ name: "xLabelFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.xLabelFontFamily, fontSize: this.xLabelFontSize, bold: this.xLabelBold, italic: this.xLabelItalic, underline: this.xLabelUnderline });
    xLabelColor = new formattingSettings.ColorPicker({ name: "xLabelColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });
    weekLabelFormat = new formattingSettings.ItemDropdown({ name: "weekLabelFormat", displayNameKey: resourceKey("paneWeekLabels"), items: ITEMS.weekLabelFormat, value: ITEMS.weekLabelFormat[0] });
    weekLabelSecondLine = new formattingSettings.ItemDropdown({ name: "weekLabelSecondLine", displayNameKey: resourceKey("paneSecondLine"), items: ITEMS.weekLabelSecondLine, value: ITEMS.weekLabelSecondLine[0] });
    weekStartDay = new formattingSettings.ItemDropdown({ name: "weekStartDay", displayNameKey: resourceKey("paneWeekStartsOn"), items: ITEMS.weekStartDay, value: ITEMS.weekStartDay[0] });
    showEmptyWeeks = new formattingSettings.ToggleSwitch({ name: "showEmptyWeeks", displayNameKey: resourceKey("paneShowEmptyWeeks"), value: true });

    constructor() {
        super({ name: "xAxisLabels", displayNameKey: resourceKey("paneLabels") });
        this.slices = [this.xLabelFont, this.xLabelColor, this.weekLabelFormat, this.weekLabelSecondLine, this.weekStartDay, this.showEmptyWeeks];
    }
}

class XTitleGroup extends Group {
    xTitleShow = new formattingSettings.ToggleSwitch({ name: "xTitleShow", displayNameKey: resourceKey("paneTitle"), value: false });
    xTitleText = new formattingSettings.TextInput({ name: "xTitleText", displayNameKey: resourceKey("paneTitleText"), value: "", placeholder: "placeholderFieldName" });
    xTitleFontSize = new formattingSettings.NumUpDown({ name: "xTitleFontSize", displayNameKey: resourceKey("paneTextSize"), value: 10, options: range(LIMITS.fontSize) });
    xTitleFontFamily = new formattingSettings.FontPicker({ name: "xTitleFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    xTitleBold = new formattingSettings.ToggleSwitch({ name: "xTitleBold", displayNameKey: resourceKey("paneBold"), value: true });
    xTitleItalic = new formattingSettings.ToggleSwitch({ name: "xTitleItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    xTitleUnderline = new formattingSettings.ToggleSwitch({ name: "xTitleUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    xTitleFont = new formattingSettings.FontControl({ name: "xTitleFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.xTitleFontFamily, fontSize: this.xTitleFontSize, bold: this.xTitleBold, italic: this.xTitleItalic, underline: this.xTitleUnderline });
    xTitleColor = new formattingSettings.ColorPicker({ name: "xTitleColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });

    constructor() {
        super({ name: "xAxisTitle", displayNameKey: resourceKey("paneTitle") });
        this.topLevelSlice = this.xTitleShow;
        this.slices = [this.xTitleText, this.xTitleFont, this.xTitleColor];
    }
}

class XAxisCard extends Card {
    name = "xAxis";
    displayNameKey = resourceKey("paneXAxis");
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showXAxis", displayNameKey: resourceKey("paneShowAxis"), value: true });
    labels = new XLabelsGroup();
    title = new XTitleGroup();
    groups = [this.labels, this.title];
}

// ----- Data labels -----

class ColumnLabelsGroup extends Group {
    columnLabelsShow = new formattingSettings.ToggleSwitch({ name: "columnLabelsShow", displayNameKey: resourceKey("paneColumnLabels"), value: false });
    columnLabelPosition = new formattingSettings.ItemDropdown({ name: "columnLabelPosition", displayNameKey: resourceKey("panePosition"), items: ITEMS.labelPosition, value: ITEMS.labelPosition[0] });
    columnLabelFontSize = new formattingSettings.NumUpDown({ name: "columnLabelFontSize", displayNameKey: resourceKey("paneTextSize"), value: 9, options: range(LIMITS.fontSize) });
    columnLabelFontFamily = new formattingSettings.FontPicker({ name: "columnLabelFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    columnLabelBold = new formattingSettings.ToggleSwitch({ name: "columnLabelBold", displayNameKey: resourceKey("paneBold"), value: false });
    columnLabelItalic = new formattingSettings.ToggleSwitch({ name: "columnLabelItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    columnLabelUnderline = new formattingSettings.ToggleSwitch({ name: "columnLabelUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    columnLabelFont = new formattingSettings.FontControl({ name: "columnLabelFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.columnLabelFontFamily, fontSize: this.columnLabelFontSize, bold: this.columnLabelBold, italic: this.columnLabelItalic, underline: this.columnLabelUnderline });
    columnLabelColor = new formattingSettings.ColorPicker({ name: "columnLabelColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });
    columnLabelBackgroundShow = new formattingSettings.ToggleSwitch({ name: "columnLabelBackgroundShow", displayNameKey: resourceKey("paneBackground"), value: false });
    columnLabelBackgroundColor = new formattingSettings.ColorPicker({ name: "columnLabelBackgroundColor", displayNameKey: resourceKey("paneBackgroundColor"), value: THEME_COLOR });
    columnLabelBackgroundOpacity = new formattingSettings.Slider({ name: "columnLabelBackgroundOpacity", displayNameKey: resourceKey("paneBackgroundOpacity"), value: 100, options: range(LIMITS.percent) });
    columnLabelDisplayUnits = new formattingSettings.AutoDropdown({ name: "columnLabelDisplayUnits", displayNameKey: resourceKey("paneDisplayUnits"), value: 0 });
    columnLabelPrecision = new formattingSettings.NumUpDown({ name: "columnLabelPrecision", displayNameKey: resourceKey("panePrecision"), value: AUTO, options: range(LIMITS.precision) });

    constructor() {
        super({ name: "dataLabelsColumns", displayNameKey: resourceKey("paneColumns") });
        this.topLevelSlice = this.columnLabelsShow;
        this.slices = [this.columnLabelPosition, this.columnLabelFont, this.columnLabelColor, this.columnLabelBackgroundShow, this.columnLabelBackgroundColor, this.columnLabelBackgroundOpacity, this.columnLabelDisplayUnits, this.columnLabelPrecision];
    }
}

class LineLabelsGroup extends Group {
    lineLabelsShow = new formattingSettings.ToggleSwitch({ name: "lineLabelsShow", displayNameKey: resourceKey("paneLineLabels"), value: true });
    lineLabelPoints = new formattingSettings.ItemDropdown({ name: "lineLabelPoints", displayNameKey: resourceKey("panePoints"), items: ITEMS.labelPoints, value: ITEMS.labelPoints[0] });
    lineLabelFontSize = new formattingSettings.NumUpDown({ name: "lineLabelFontSize", displayNameKey: resourceKey("paneTextSize"), value: 9, options: range(LIMITS.fontSize) });
    lineLabelFontFamily = new formattingSettings.FontPicker({ name: "lineLabelFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    lineLabelBold = new formattingSettings.ToggleSwitch({ name: "lineLabelBold", displayNameKey: resourceKey("paneBold"), value: false });
    lineLabelItalic = new formattingSettings.ToggleSwitch({ name: "lineLabelItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    lineLabelUnderline = new formattingSettings.ToggleSwitch({ name: "lineLabelUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    lineLabelFont = new formattingSettings.FontControl({ name: "lineLabelFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.lineLabelFontFamily, fontSize: this.lineLabelFontSize, bold: this.lineLabelBold, italic: this.lineLabelItalic, underline: this.lineLabelUnderline });
    lineLabelColor = new formattingSettings.ColorPicker({ name: "lineLabelColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });
    lineLabelBackgroundShow = new formattingSettings.ToggleSwitch({ name: "lineLabelBackgroundShow", displayNameKey: resourceKey("paneBackground"), value: false });
    lineLabelBackgroundColor = new formattingSettings.ColorPicker({ name: "lineLabelBackgroundColor", displayNameKey: resourceKey("paneBackgroundColor"), value: THEME_COLOR });
    lineLabelBackgroundOpacity = new formattingSettings.Slider({ name: "lineLabelBackgroundOpacity", displayNameKey: resourceKey("paneBackgroundOpacity"), value: 100, options: range(LIMITS.percent) });
    lineLabelDisplayUnits = new formattingSettings.AutoDropdown({ name: "lineLabelDisplayUnits", displayNameKey: resourceKey("paneDisplayUnits"), value: 0 });
    lineLabelPrecision = new formattingSettings.NumUpDown({ name: "lineLabelPrecision", displayNameKey: resourceKey("panePrecision"), value: AUTO, options: range(LIMITS.precision) });

    constructor() {
        super({ name: "dataLabelsLines", displayNameKey: resourceKey("paneLines") });
        this.topLevelSlice = this.lineLabelsShow;
        this.slices = [this.lineLabelPoints, this.lineLabelFont, this.lineLabelColor, this.lineLabelBackgroundShow, this.lineLabelBackgroundColor, this.lineLabelBackgroundOpacity, this.lineLabelDisplayUnits, this.lineLabelPrecision];
    }
}

class DataLabelsCard extends Card {
    name = "dataLabels";
    displayNameKey = resourceKey("paneDataLabels");
    columnLabels = new ColumnLabelsGroup();
    lineLabels = new LineLabelsGroup();
    groups = [this.columnLabels, this.lineLabels];
}

// ----- Legend -----

class LegendOptionsGroup extends Group {
    legendPosition = new formattingSettings.ItemDropdown({ name: "legendPosition", displayNameKey: resourceKey("panePosition"), items: ITEMS.legendPosition, value: ITEMS.legendPosition[0] });
    legendShowTitle = new formattingSettings.ToggleSwitch({ name: "legendShowTitle", displayNameKey: resourceKey("paneTitle"), value: false });
    legendTitleText = new formattingSettings.TextInput({ name: "legendTitleText", displayNameKey: resourceKey("paneTitleText"), value: "", placeholder: "placeholderSeriesFieldName" });

    constructor() {
        super({ name: "legendOptions", displayNameKey: resourceKey("paneOptions") });
        this.slices = [this.legendPosition, this.legendShowTitle, this.legendTitleText];
    }
}

class LegendTextGroup extends Group {
    legendFontSize = new formattingSettings.NumUpDown({ name: "legendFontSize", displayNameKey: resourceKey("paneTextSize"), value: 9, options: range(LIMITS.fontSize) });
    legendFontFamily = new formattingSettings.FontPicker({ name: "legendFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    legendBold = new formattingSettings.ToggleSwitch({ name: "legendBold", displayNameKey: resourceKey("paneBold"), value: false });
    legendItalic = new formattingSettings.ToggleSwitch({ name: "legendItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    legendUnderline = new formattingSettings.ToggleSwitch({ name: "legendUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    legendFont = new formattingSettings.FontControl({ name: "legendFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.legendFontFamily, fontSize: this.legendFontSize, bold: this.legendBold, italic: this.legendItalic, underline: this.legendUnderline });
    legendColor = new formattingSettings.ColorPicker({ name: "legendColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });

    constructor() {
        super({ name: "legendText", displayNameKey: resourceKey("paneText") });
        this.slices = [this.legendFont, this.legendColor];
    }
}

class LegendCard extends Card {
    name = "legend";
    displayNameKey = resourceKey("paneLegend");
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showLegend", displayNameKey: resourceKey("paneShowLegend"), value: true });
    options = new LegendOptionsGroup();
    text = new LegendTextGroup();
    groups = [this.options, this.text];
}

// ----- Matrix -----

class MatrixOptionsGroup extends Group {
    showTotals = new formattingSettings.ToggleSwitch({ name: "showTotals", displayNameKey: resourceKey("paneTotalsColumn"), value: true });
    totalsLabel = new formattingSettings.TextInput({ name: "totalsLabel", displayNameKey: resourceKey("paneTotalsLabel"), value: "", placeholder: "totalsLabel" });
    expandSeries = new formattingSettings.ToggleSwitch({ name: "expandSeries", displayNameKey: resourceKey("paneExpandSeries"), value: false });

    constructor() {
        super({ name: "matrixOptions", displayNameKey: resourceKey("paneOptions") });
        this.slices = [this.showTotals, this.totalsLabel, this.expandSeries];
    }
}

class MatrixValuesGroup extends Group {
    matrixDisplayUnits = new formattingSettings.AutoDropdown({ name: "matrixDisplayUnits", displayNameKey: resourceKey("paneDisplayUnits"), value: 0 });
    matrixPrecision = new formattingSettings.NumUpDown({ name: "matrixPrecision", displayNameKey: resourceKey("panePrecision"), value: AUTO, options: range(LIMITS.precision) });
    private readonly staticSlices = [this.matrixDisplayUnits, this.matrixPrecision];

    constructor() {
        super({ name: "matrixValues", displayNameKey: resourceKey("paneValues") });
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
        super({ name: "matrixRows", displayNameKey: resourceKey("paneRowOrderAndLines") });
        this.slices = [];
        this.visible = false;
    }

    /** Per measure and row kind: where its row goes and how wide the line below it is. */
    setInstances(instances: { kind: "column" | "line" | "table"; position: InstanceSpec<number>; lineWidth: InstanceSpec<number> }[]): void {
        const positionRange = range([1, Math.max(1, instances.length)]);
        const widthRange = range(LIMITS.matrixLineWidth);
        this.slices = instances.flatMap(({ kind, position: spec, lineWidth }) => {
            const position = { ...spec, options: positionRange };
            const width = { ...lineWidth, options: widthRange };
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
    matrixFontSize = new formattingSettings.NumUpDown({ name: "matrixFontSize", displayNameKey: resourceKey("paneTextSize"), value: 9, options: range(LIMITS.fontSize) });
    matrixFontFamily = new formattingSettings.FontPicker({ name: "matrixFontFamily", displayNameKey: resourceKey("paneFont"), value: DEFAULT_FONT });
    matrixBold = new formattingSettings.ToggleSwitch({ name: "matrixBold", displayNameKey: resourceKey("paneBold"), value: false });
    matrixItalic = new formattingSettings.ToggleSwitch({ name: "matrixItalic", displayNameKey: resourceKey("paneItalic"), value: false });
    matrixUnderline = new formattingSettings.ToggleSwitch({ name: "matrixUnderline", displayNameKey: resourceKey("paneUnderline"), value: false });
    matrixFont = new formattingSettings.FontControl({ name: "matrixFont", displayNameKey: resourceKey("paneFont"), fontFamily: this.matrixFontFamily, fontSize: this.matrixFontSize, bold: this.matrixBold, italic: this.matrixItalic, underline: this.matrixUnderline });
    matrixFontColor = new formattingSettings.ColorPicker({ name: "matrixFontColor", displayNameKey: resourceKey("paneColor"), value: THEME_COLOR });
    headerFontColor = new formattingSettings.ColorPicker({ name: "headerFontColor", displayNameKey: resourceKey("paneHeaderFontColor"), value: THEME_COLOR });
    headerBold = new formattingSettings.ToggleSwitch({ name: "headerBold", displayNameKey: resourceKey("paneHeaderBold"), value: true });

    constructor() {
        super({ name: "matrixText", displayNameKey: resourceKey("paneText") });
        this.slices = [this.matrixFont, this.matrixFontColor, this.headerFontColor, this.headerBold];
    }
}

class MatrixGridGroup extends Group {
    rowHeight = new formattingSettings.NumUpDown({ name: "rowHeight", displayNameKey: resourceKey("paneRowHeight"), value: 20, options: range(LIMITS.rowHeight) });
    showBorders = new formattingSettings.ToggleSwitch({ name: "showBorders", displayNameKey: resourceKey("paneBorders"), value: true });
    borderColor = new formattingSettings.ColorPicker({ name: "borderColor", displayNameKey: resourceKey("paneBorderColor"), value: THEME_COLOR });
    headerLineWidth = new formattingSettings.NumUpDown({ name: "headerLineWidth", displayNameKey: resourceKey("paneHeaderLine"), value: 1, options: range(LIMITS.matrixLineWidth) });
    banding = new formattingSettings.ToggleSwitch({ name: "banding", displayNameKey: resourceKey("paneBanding"), value: false });
    maxHeightPercent = new formattingSettings.NumUpDown({ name: "maxHeightPercent", displayNameKey: resourceKey("paneMaxHeight"), value: 50, options: range(LIMITS.maxHeightPercent) });

    constructor() {
        super({ name: "matrixGrid", displayNameKey: resourceKey("paneGrid") });
        this.slices = [this.rowHeight, this.showBorders, this.borderColor, this.headerLineWidth, this.banding, this.maxHeightPercent];
    }
}

class MatrixCard extends Card {
    name = "matrix";
    displayNameKey = resourceKey("paneMatrix");
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "showMatrix", displayNameKey: resourceKey("paneShowMatrix"), value: true });
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
