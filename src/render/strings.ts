// Every string the author or viewer reads goes through one keyed lookup: the host's localization manager first
// (stringResources/<locale>/resources.resjson, with keys `Visual_<key>`), then these en-US defaults. The table and
// stringResources/en-US must match; a unit test enforces it, and that pt-BR has the same keys.

export const defaultStrings = {
    // Messages, labels and warnings on the visual.
    landingTitle: "Physical Progress S-Curve",
    landingBody: "Add a Date or Category field and at least one measure to Column values, Line values or Table-only values.",
    missingBuckets: "Add a Date or Category field to draw the time axis.",
    missingMeasures: "Add at least one measure to Column values, Line values or Table-only values.",
    noRows: "No data for the current filters.",
    dateHierarchy: "Use the date field itself, not its Date Hierarchy: in the Date well, open the field's menu and choose the field's name.",
    tooSmall: "Make the visual larger to see the chart.",
    matrixHidden: "Matrix hidden: not enough space.",
    cumulativeSuffix: " (cumulative)",
    totalsLabel: "Total",
    blank: "(Blank)",
    weekPrefix: "W",
    noValue: "(no value)",
    highlightedSuffix: " (highlighted)",
    warningTitle: "Not all data is shown as bound",
    warningReduced: "Power BI sent a reduced dataset, so not all data is shown.",
    warningExcludedDates: "{0} rows with an empty or non-date value in the Date field were excluded.",
    warningEmptyWeeks: "The date range spans more than 1000 weeks, so empty weeks were not inserted.",
    warningPercentBaseline: "The % baseline is zero or empty, so lines show values instead of percentages.",
    // Field wells (capabilities.json).
    roleCategory: "Category",
    roleCategoryDescription: "Text time buckets, shown in data order.",
    roleCategoryDate: "Date",
    roleCategoryDateDescription: "Dates, grouped into weeks by the visual.",
    roleSeries: "Series",
    roleSeriesDescription: "Splits every measure by this field (legend).",
    roleColumnValues: "Column values",
    roleColumnValuesDescription: "Per-bucket values, drawn as columns on the left axis.",
    roleLineValues: "Line values",
    roleLineValuesDescription: "Drawn as lines on the right axis; accumulated by default.",
    roleTableOnlyValues: "Table-only values",
    roleTableOnlyValuesDescription: "Rows shown only in the matrix.",
    roleTooltips: "Tooltips",
    roleTooltipsDescription: "Extra fields in the tooltip.",
    // Format pane: cards, groups and controls.
    paneGeneral: "General",
    paneColumns: "Columns",
    paneLines: "Lines",
    paneLeftAxis: "Y-axis (columns)",
    paneRightAxis: "Y-axis (lines)",
    paneXAxis: "X-axis",
    paneDataLabels: "Data labels",
    paneLegend: "Legend",
    paneMatrix: "Matrix",
    panePreset: "Preset",
    paneStylePreset: "Style preset",
    paneLayout: "Layout",
    paneMinBucketWidth: "Minimum bucket width (px, 0 = fit)",
    paneBucketGap: "Gap between buckets (%)",
    paneFont: "Font",
    paneBold: "Bold",
    paneItalic: "Italic",
    paneUnderline: "Underline",
    paneBackground: "Background",
    paneBackgroundColor: "Background color",
    paneBackgroundOpacity: "Background opacity (%)",
    paneOptions: "Options",
    paneColors: "Colors",
    paneColorsAndStyle: "Colors and style",
    paneValues: "Values",
    paneShowColumns: "Show columns",
    paneSeriesLayout: "Series layout",
    paneClusterGap: "Gap within a bucket (%)",
    paneOpacity: "Opacity (%)",
    paneCornerRadius: "Corner radius (px)",
    paneShowLines: "Show lines",
    paneWithSeries: "With series",
    paneStrokeWidth: "Stroke width (px)",
    paneInterpolation: "Interpolation",
    paneMarkers: "Markers",
    paneMarkerSize: "Marker size (px)",
    paneDisplayAs: "Display as",
    paneCumulativeSuffix: "Cumulative suffix",
    paneShowAxis: "Show axis",
    paneRange: "Range",
    paneMinimum: "Minimum",
    paneMaximum: "Maximum",
    paneLabels: "Labels",
    paneTextSize: "Text size",
    paneColor: "Color",
    paneDisplayUnits: "Display units",
    panePrecision: "Value decimal places",
    paneTitle: "Title",
    paneTitleText: "Title text",
    paneGridlines: "Gridlines",
    paneStyle: "Style",
    paneWidth: "Width (px)",
    paneWeekLabels: "Week labels",
    paneSecondLine: "Second line",
    paneWeekStartsOn: "Week starts on",
    paneShowEmptyWeeks: "Show empty weeks",
    paneColumnLabels: "Column labels",
    paneLineLabels: "Line labels",
    panePosition: "Position",
    panePoints: "Points",
    paneShowLegend: "Show legend",
    paneText: "Text",
    paneShowMatrix: "Show matrix",
    paneTotalsColumn: "Totals column",
    paneTotalsLabel: "Totals label",
    paneExpandSeries: "One row per series",
    paneRowOrderAndLines: "Row order and lines",
    paneHeaderFontColor: "Row header color",
    paneHeaderBold: "Bold row headers",
    paneGrid: "Grid",
    paneRowHeight: "Row height (px)",
    paneBorders: "Borders",
    paneBorderColor: "Border color",
    paneHeaderLine: "Line below header (px)",
    paneBanding: "Banded rows",
    paneMaxHeight: "Maximum height (% of visual)",
    placeholderMeasureName: "Measure name",
    placeholderFieldName: "Field name",
    placeholderSeriesFieldName: "Series field name",
    // Format pane: dropdown items.
    enumClassic: "Classic S-curve",
    enumWeeklyProgress: "Weekly progress",
    enumMinimal: "Minimal",
    enumStacked: "Stacked",
    enumClustered: "Clustered",
    enumTotalLine: "Total across series",
    enumPerSeriesLine: "One line per series",
    enumStraight: "Straight",
    enumSmooth: "Smooth",
    enumRunningTotal: "Running total",
    enumAsProvided: "As provided",
    enumLastValue: "Stop at last value",
    enumLastBucket: "Carry to the end",
    enumValues: "Values",
    enumPercentOfBaseline: "% of baseline",
    enumSolid: "Solid",
    enumDashed: "Dashed",
    enumDotted: "Dotted",
    enumWeekStart: "Week start date",
    enumIsoWeek: "ISO week",
    enumProjectWeek: "Project week",
    enumNoSecondLine: "None",
    enumMonday: "Monday",
    enumSunday: "Sunday",
    enumOutsideEnd: "Outside end",
    enumInsideEnd: "Inside end",
    enumLastPoint: "Last point",
    enumAllPoints: "All points",
    enumTop: "Top",
    enumBottom: "Bottom",
    enumLeft: "Left",
    enumRight: "Right",
    enumSum: "Sum",
    enumLast: "Last",
    enumAverage: "Average",
    enumNoTotal: "None",
    // Format pane: per-measure controls. {0} is the measure's name, which comes from the report.
    instanceValueMode: "{0} · Value mode",
    instanceLineEnd: "{0} · Line end",
    instancePercentBaseline: "{0} · Use as % baseline",
    instanceColor: "{0} · Color",
    instanceStyle: "{0} · Style",
    instanceTotal: "{0} · Total",
    instanceCumulativeTotal: "{0} · Cumulative total",
    instancePosition: "{0} · Position",
    instanceLineBelow: "{0} · Line below (px)",
    instanceColumnRow: "{0} (column)",
    instanceLineRow: "{0} (line)",
} as const;

export type StringKey = keyof typeof defaultStrings;
export type Strings = (key: StringKey, ...args: (string | number)[]) => string;

export interface LocalizationManagerLike {
    getDisplayName(key: string): string;
}

const RESOURCE_PREFIX = "Visual_";

/** The key in stringResources, for slices the formatting library translates itself. */
export function resourceKey(key: StringKey): string {
    return `${RESOURCE_PREFIX}${key}`;
}

export function createStrings(manager?: LocalizationManagerLike): Strings {
    return (key, ...args) => {
        const resource = resourceKey(key);
        let text: string = defaultStrings[key] ?? key;
        try {
            const localized = manager?.getDisplayName(resource);
            if (localized && localized !== resource) text = localized;
        } catch {
            // A host without localization support falls back to en-US.
        }
        // A function replacement, because arguments can be measure names, and "$&" in a name must stay literal.
        return args.reduce<string>((result, arg, i) => result.replace(`{${i}}`, () => String(arg)), text);
    };
}

/** What the formatting library calls to translate slices, with the same en-US fallback as everything else. */
export function paneLocalization(strings: Strings): { getDisplayName(key: string): string } {
    return { getDisplayName: (key) => strings(key.slice(RESOURCE_PREFIX.length) as StringKey) };
}
