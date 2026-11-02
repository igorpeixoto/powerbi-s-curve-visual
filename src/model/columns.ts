import type { Values } from "./types";

export type SeriesLayout = "stacked" | "clustered";

export interface ColumnMeasureInput {
    measureKey: string;
    /** One row per series (a single row without series), indexed by bucket. */
    rows: Values[];
}

/** One drawn bar piece, in value space. `base`..`top` may run downwards for negative values. */
export interface BarSegment {
    measureKey: string;
    seriesIndex: number | null;
    bucketIndex: number;
    /** Position within the bucket's cluster. */
    slot: number;
    base: number;
    top: number;
    value: number;
}

export interface BarLayout {
    slotCount: number;
    segments: BarSegment[];
}

/**
 * Positions the column measures within each bucket (SPEC §5.1): one slot per measure; with series, stacked
 * series share their measure's slot (positives and negatives stack separately) or each get their own slot.
 * Null draws nothing; zero draws a zero-height bar.
 */
export function buildBarLayout(measures: readonly ColumnMeasureInput[], hasSeries: boolean, layout: SeriesLayout, bucketCount: number): BarLayout {
    const seriesCount = hasSeries ? Math.max(0, ...measures.map((m) => m.rows.length)) : 1;
    const clustered = hasSeries && layout === "clustered";
    const slotCount = measures.length * (clustered ? seriesCount : 1);
    const segments: BarSegment[] = [];

    measures.forEach((measure, measureIndex) => {
        for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
            let positive = 0;
            let negative = 0;
            measure.rows.forEach((row, seriesIndex) => {
                const value = row[bucketIndex];
                if (value === null || value === undefined) return;
                const slot = clustered ? measureIndex * seriesCount + seriesIndex : measureIndex;
                let base = 0;
                if (!clustered) {
                    base = value >= 0 ? positive : negative;
                    if (value >= 0) positive += value;
                    else negative += value;
                }
                segments.push({
                    measureKey: measure.measureKey,
                    seriesIndex: hasSeries ? seriesIndex : null,
                    bucketIndex,
                    slot,
                    base,
                    top: base + value,
                    value,
                });
            });
        }
    });
    return { slotCount, segments };
}
