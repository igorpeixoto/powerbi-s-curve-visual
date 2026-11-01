// Typed model of what the visual draws, built from the dataView by pure functions (no DOM).

export type ValueRole = "columnValues" | "lineValues" | "tableOnlyValues" | "tooltips";
export type BucketRole = "category" | "categoryDate";

export type WeekStartDay = "monday" | "sunday";
export type ValueMode = "runningTotal" | "asProvided";
export type LineEnd = "lastValue" | "lastBucket";
export type LineSeriesMode = "total" | "perSeries";
export type DisplayAs = "value" | "percentOfBaseline";
export type TotalAggregation = "sum" | "last" | "average" | "none";

/** A nullable numeric series indexed by bucket. `null` means "not reported", unlike 0. */
export type Values = (number | null)[];

export interface Bucket {
    /** Stable key: the text value for text buckets, the week start as YYYY-MM-DD for weeks. */
    key: string;
    kind: "text" | "week";
    /** Raw category value for text buckets. */
    value?: unknown;
    /** Local-midnight start of the week for week buckets. */
    weekStart?: Date;
    /** Source category rows that fall into this bucket (empty for inserted weeks). */
    rowIndices: number[];
    /** True for empty weeks the visual inserted to keep the axis continuous. */
    inserted: boolean;
}

export interface SeriesInfo {
    key: string;
    /** Raw series value; null for blank. */
    value: unknown;
    /** Index into `categorical.values.grouped()`. */
    groupIndex: number;
}

export interface MeasureInfo {
    /** Unique per role entry: `${role}:${queryName}`. */
    key: string;
    role: ValueRole;
    queryName: string;
    displayName: string;
    format?: string;
    /** Position within its role (well order). */
    roleIndex: number;
    /** Index of this measure's value column inside each series group. */
    columnIndexInGroup: number;
}

export interface ParsedDataView {
    bucketRole: BucketRole | null;
    buckets: Bucket[];
    series: SeriesInfo[];
    hasSeries: boolean;
    measures: MeasureInfo[];
    /** values[measureKey][seriesIndex][bucketIndex], already combined per bucket. */
    values: Record<string, Values[]>;
    /** Same shape as values, present only when the host sent highlights. */
    highlights: Record<string, Values[]> | null;
    /** Raw tooltip values per measure key, per series, per bucket (first row of the bucket). */
    tooltipValues: Record<string, unknown[][]>;
    warnings: ModelWarnings;
}

export interface ModelWarnings {
    /** Rows dropped because their Date value was null or not a date. */
    excludedDateRows: number;
    /** Power BI sent a reduced dataset (more data exists than was delivered). */
    dataReduced: boolean;
}

export interface ModelOptions {
    weekStartDay: WeekStartDay;
    showEmptyWeeks: boolean;
    lineSeriesMode: LineSeriesMode;
    displayAs: DisplayAs;
    /** Per line-measure queryName; missing entries use the defaults below. */
    valueModes: Record<string, ValueMode>;
    lineEnds: Record<string, LineEnd>;
}

export const defaultModelOptions: ModelOptions = {
    weekStartDay: "monday",
    showEmptyWeeks: true,
    lineSeriesMode: "total",
    displayAs: "value",
    valueModes: {},
    lineEnds: {},
};

export interface LineSeries {
    measureKey: string;
    /** Series index in perSeries mode; null for the total across series. */
    seriesIndex: number | null;
    /** Plotted values per bucket (cumulative or as provided; ratio in percent mode). */
    values: Values;
    /** Same computation over highlighted values, when highlights are present. */
    highlights: Values | null;
    accumulated: boolean;
}

export interface SCurveModel extends ParsedDataView {
    lines: LineSeries[];
    /** Effective display mode: falls back to "value" when the baseline is zero or missing. */
    displayAs: DisplayAs;
    baseline: number | null;
    warnings: ModelWarnings & { percentBaselineMissing: boolean };
}
