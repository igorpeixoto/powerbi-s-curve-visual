import type powerbi from "powerbi-visuals-api";

type DataView = powerbi.DataView;

export interface DataViewSummary {
    hasData: boolean;
    bucketCount: number;
    measureCount: number;
}

/**
 * Counts what the categorical dataView actually carries, without assuming any of it exists.
 * Placeholder for the Phase 2 model parser; it only exists to prove the pipeline end to end.
 */
export function summarizeDataView(dataView: DataView | undefined): DataViewSummary {
    const categorical = dataView?.categorical;
    const bucketCount = categorical?.categories?.[0]?.values.length ?? 0;
    const measureCount = categorical?.values?.length ?? 0;
    return {
        hasData: bucketCount > 0 && measureCount > 0,
        bucketCount,
        measureCount,
    };
}
