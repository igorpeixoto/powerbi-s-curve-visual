import type powerbi from "powerbi-visuals-api";

import { valueGroups } from "./parseDataView";
import type { ParsedDataView } from "./types";

/** The subset of the host's ISelectionIdBuilder the model needs; injected so this stays pure and testable. */
export interface SelectionIdBuilderLike<Id> {
    withCategory(column: powerbi.DataViewCategoryColumn, index: number): SelectionIdBuilderLike<Id>;
    withSeries(columns: powerbi.DataViewValueColumns, group: powerbi.DataViewValueColumnGroup): SelectionIdBuilderLike<Id>;
    withMeasure(queryName: string): SelectionIdBuilderLike<Id>;
    createSelectionId(): Id;
}

export interface Identities<Id> {
    /** Per bucket: one identity per source row (a week spans several rows; an inserted week has none). */
    buckets: Id[][];
    /** Per series index; empty without series. */
    series: Id[];
    /** Identities of one mark: bucket rows × (series) × measure. seriesIndex null = total across series. */
    point(measureKey: string, seriesIndex: number | null, bucketIndex: number): Id[];
    /** Measure-only identity (measure row headers, legend entries); emphasises within the visual only. */
    measure(measureKey: string): Id | null;
}

export function buildIdentities<Id>(
    dataView: powerbi.DataView | undefined,
    parsed: ParsedDataView,
    createBuilder: () => SelectionIdBuilderLike<Id>,
): Identities<Id> {
    const category = dataView?.categorical?.categories?.[0];
    const columns = dataView?.categorical?.values;
    const groups = valueGroups(columns);
    const measures = new Map(parsed.measures.map((m) => [m.key, m]));

    const buckets = parsed.buckets.map((bucket) =>
        category ? bucket.rowIndices.map((row) => createBuilder().withCategory(category, row).createSelectionId()) : []);

    const series = parsed.hasSeries && columns
        ? parsed.series.map((s) => createBuilder().withSeries(columns, groups[s.groupIndex]).createSelectionId())
        : [];

    const point = (measureKey: string, seriesIndex: number | null, bucketIndex: number): Id[] => {
        const measure = measures.get(measureKey);
        const bucket = parsed.buckets[bucketIndex];
        if (!measure || !bucket || !category) return [];
        return bucket.rowIndices.map((row) => {
            let builder = createBuilder().withCategory(category, row);
            if (seriesIndex !== null && parsed.hasSeries && columns) {
                builder = builder.withSeries(columns, groups[parsed.series[seriesIndex].groupIndex]);
            }
            return builder.withMeasure(measure.queryName).createSelectionId();
        });
    };

    const measure = (measureKey: string): Id | null => {
        const info = measures.get(measureKey);
        return info ? createBuilder().withMeasure(info.queryName).createSelectionId() : null;
    };

    return { buckets, series, point, measure };
}
