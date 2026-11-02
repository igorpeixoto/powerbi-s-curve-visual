import type powerbi from "powerbi-visuals-api";

import type { Bucket, BucketRole, MeasureInfo, ModelOptions, ParsedDataView, SeriesInfo, ValueRole, Values } from "./types";
import { combine, toNumber } from "./values";
import { buildWeekBuckets, type WeekBucketing } from "./weeks";

type DataView = powerbi.DataView;
type ValueColumn = powerbi.DataViewValueColumn;

const VALUE_ROLES: readonly ValueRole[] = ["columnValues", "lineValues", "tableOnlyValues", "tooltips"];

export function emptyParsedDataView(): ParsedDataView {
    return {
        bucketRole: null,
        buckets: [],
        series: [],
        hasSeries: false,
        seriesFieldName: null,
        bucketFieldName: null,
        measures: [],
        values: {},
        highlights: null,
        tooltipValues: {},
        warnings: { excludedDateRows: 0, dataReduced: false, emptyWeeksSkipped: false, dateHierarchy: false },
    };
}

/** Series groups as Power BI delivers them; a dataView without series is one group. */
export function valueGroups(values: powerbi.DataViewValueColumns | undefined): powerbi.DataViewValueColumnGroup[] {
    if (!values) return [];
    return typeof values.grouped === "function" ? values.grouped() : [{ values } as powerbi.DataViewValueColumnGroup];
}

/**
 * Position of a column within a role's well. API 5.11's typings don't declare `rolesIndex` and Power BI Desktop
 * (Oct 2026) doesn't send it, so it's read defensively; otherwise column order is the well order, which is
 * wrong in the second well of a measure bound to two wells (SPEC §4).
 */
function roleIndexOf(source: powerbi.DataViewMetadataColumn, role: ValueRole): number | undefined {
    const rolesIndex = (source as { rolesIndex?: Record<string, number[] | undefined> }).rolesIndex;
    const index = rolesIndex?.[role]?.[0];
    return typeof index === "number" ? index : undefined;
}

/**
 * One entry per (role, measure). A column flagged with two roles yields two entries, and so does the
 * same measure arriving as two columns: SPEC §4 requires both dataView shapes to work.
 */
function readMeasures(columns: readonly ValueColumn[]): MeasureInfo[] {
    const measures: MeasureInfo[] = [];
    const seen = new Set<string>();
    columns.forEach((column, columnIndexInGroup) => {
        const source = column.source;
        const queryName = source.queryName ?? source.displayName;
        for (const role of VALUE_ROLES) {
            if (!source.roles?.[role]) continue;
            const key = `${role}:${queryName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            measures.push({
                key,
                role,
                queryName,
                displayName: source.displayName,
                format: source.format,
                roleIndex: roleIndexOf(source, role) ?? measures.filter((m) => m.role === role).length,
                columnIndexInGroup,
            });
        }
    });
    return measures.sort((a, b) => VALUE_ROLES.indexOf(a.role) - VALUE_ROLES.indexOf(b.role) || a.roleIndex - b.roleIndex);
}

function readBuckets(category: powerbi.DataViewCategoryColumn, role: BucketRole, options: ModelOptions): WeekBucketing {
    if (role === "categoryDate") {
        return buildWeekBuckets(category.values, options);
    }
    const buckets = category.values.map((value, rowIndex): Bucket => ({
        key: String(value),
        kind: "text",
        value,
        rowIndices: [rowIndex],
        inserted: false,
    }));
    return { buckets, excludedRows: 0, emptyWeeksSkipped: false };
}

/**
 * A date dropped with its auto date hierarchy arrives as several category columns (Year, Quarter, Month, Day)
 * whose queryNames go through the column's `Variation`, observed in Power BI Desktop (Oct 2026).
 */
function isDateHierarchy(categories: readonly powerbi.DataViewCategoryColumn[]): boolean {
    return categories.length > 1 || categories.some((c) => (c.source.queryName ?? "").includes(".Variation."));
}

/** Week buckets combine several rows: sums for per-bucket values, the last value for cumulative inputs. */
function combineHow(measure: MeasureInfo, options: ModelOptions): "sum" | "last" {
    return measure.role === "lineValues" && options.valueModes[measure.queryName] === "asProvided" ? "last" : "sum";
}

function bucketize(raw: readonly unknown[], buckets: readonly Bucket[], how: "sum" | "last"): Values {
    return buckets.map((bucket) => combine(bucket.rowIndices.map((row) => toNumber(raw[row])), how));
}

export function parseDataView(dataView: DataView | undefined, options: ModelOptions): ParsedDataView {
    const parsed = emptyParsedDataView();
    const categorical = dataView?.categorical;
    parsed.warnings.dataReduced = Boolean(dataView?.metadata?.segment);

    const category = categorical?.categories?.[0];
    parsed.bucketFieldName = category?.source.displayName ?? null;
    if (category?.source.roles?.categoryDate && isDateHierarchy(categorical?.categories ?? [])) {
        // Year/Quarter/Month/Day levels instead of a date: nothing to bucket (SPEC §8).
        parsed.bucketRole = "categoryDate";
        parsed.warnings.dateHierarchy = true;
        return parsed;
    }
    const bucketRole: BucketRole | null = category?.source.roles?.categoryDate ? "categoryDate" : category ? "category" : null;
    if (category && bucketRole) {
        const { buckets, excludedRows, emptyWeeksSkipped } = readBuckets(category, bucketRole, options);
        parsed.bucketRole = bucketRole;
        parsed.buckets = buckets;
        parsed.warnings.excludedDateRows = excludedRows;
        parsed.warnings.emptyWeeksSkipped = emptyWeeksSkipped;
    }

    const groups = valueGroups(categorical?.values);
    if (groups.length === 0) return parsed;

    parsed.hasSeries = Boolean(categorical?.values?.source);
    parsed.seriesFieldName = categorical?.values?.source?.displayName ?? null;
    parsed.series = parsed.hasSeries
        ? groups.map((group, groupIndex): SeriesInfo => ({ key: String(group.name), value: group.name ?? null, groupIndex }))
        : [];
    parsed.measures = readMeasures(groups[0].values);

    const anyHighlights = groups.some((g) => g.values.some((c) => Array.isArray(c.highlights)));
    const highlights: Record<string, Values[]> = {};

    for (const measure of parsed.measures) {
        const columns = groups.map((g) => g.values[measure.columnIndexInGroup]);
        if (measure.role === "tooltips") {
            parsed.tooltipValues[measure.key] = columns.map((c) => parsed.buckets.map((b) => (b.rowIndices.length ? c.values[b.rowIndices[0]] : null)));
            continue;
        }
        const how = combineHow(measure, options);
        parsed.values[measure.key] = columns.map((c) => bucketize(c.values, parsed.buckets, how));
        if (anyHighlights) {
            highlights[measure.key] = columns.map((c) => bucketize(c.highlights ?? [], parsed.buckets, how));
        }
    }
    parsed.highlights = anyHighlights ? highlights : null;
    return parsed;
}
