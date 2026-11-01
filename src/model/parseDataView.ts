import type powerbi from "powerbi-visuals-api";

import type { Bucket, BucketRole, MeasureInfo, ModelOptions, ParsedDataView, SeriesInfo, ValueRole, Values } from "./types";
import { combine, toNumber } from "./values";
import { buildWeekBuckets } from "./weeks";

type DataView = powerbi.DataView;
type ValueColumn = powerbi.DataViewValueColumn;

const VALUE_ROLES: readonly ValueRole[] = ["columnValues", "lineValues", "tableOnlyValues", "tooltips"];

export function emptyParsedDataView(): ParsedDataView {
    return {
        bucketRole: null,
        buckets: [],
        series: [],
        hasSeries: false,
        measures: [],
        values: {},
        highlights: null,
        tooltipValues: {},
        warnings: { excludedDateRows: 0, dataReduced: false },
    };
}

/** Series groups as Power BI delivers them; a dataView without series is one group. */
export function valueGroups(values: powerbi.DataViewValueColumns | undefined): powerbi.DataViewValueColumnGroup[] {
    if (!values) return [];
    return typeof values.grouped === "function" ? values.grouped() : [{ values } as powerbi.DataViewValueColumnGroup];
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
                // Columns arrive in well order within each role, so encounter order is the well order.
                roleIndex: measures.filter((m) => m.role === role).length,
                columnIndexInGroup,
            });
        }
    });
    return measures.sort((a, b) => VALUE_ROLES.indexOf(a.role) - VALUE_ROLES.indexOf(b.role) || a.roleIndex - b.roleIndex);
}

function readBuckets(category: powerbi.DataViewCategoryColumn, role: BucketRole, options: ModelOptions): { buckets: Bucket[]; excludedRows: number } {
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
    return { buckets, excludedRows: 0 };
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
    const bucketRole: BucketRole | null = category?.source.roles?.categoryDate ? "categoryDate" : category ? "category" : null;
    if (category && bucketRole) {
        const { buckets, excludedRows } = readBuckets(category, bucketRole, options);
        parsed.bucketRole = bucketRole;
        parsed.buckets = buckets;
        parsed.warnings.excludedDateRows = excludedRows;
    }

    const groups = valueGroups(categorical?.values);
    if (groups.length === 0) return parsed;

    parsed.hasSeries = Boolean(categorical?.values?.source);
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
