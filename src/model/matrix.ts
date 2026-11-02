import type { MeasureInfo, SCurveModel, TotalAggregation, Values } from "./types";
import { aggregateTotal, sumAcross } from "./values";

export type MatrixRowKind = "column" | "line" | "table";

export interface MatrixRow {
    key: string;
    kind: MatrixRowKind;
    measureKey: string;
    /** Series index for an expanded series row; null for a measure (total) row. */
    seriesIndex: number | null;
    /** 0 = measure row, 1 = series row inside an expanded measure. */
    level: 0 | 1;
    label: string;
    /** Exactly what the chart shows for this row, per bucket (SPEC §5.6). */
    values: Values;
    total: number | null;
    format?: string;
    /** Values are ratios of the % baseline. */
    percent: boolean;
}

export interface MatrixOptions {
    expandSeries: boolean;
    cumulativeSuffix: string;
    /** Default aggregation per row kind. */
    aggregations: Record<MatrixRowKind, TotalAggregation>;
    /** Per-measure override, keyed `${kind}:${queryName}`. */
    measureAggregations: Record<string, TotalAggregation>;
}

const KIND_BY_ROLE: Partial<Record<MeasureInfo["role"], MatrixRowKind>> = {
    columnValues: "column",
    lineValues: "line",
    tableOnlyValues: "table",
};

/**
 * Matrix rows in SPEC order: column measures, then line measures, then table-only measures, in well order.
 * When another visual highlights a subset, cells and totals show the highlighted values (SPEC §7.2).
 */
export function buildMatrixRows(model: SCurveModel, options: MatrixOptions): MatrixRow[] {
    const rows: MatrixRow[] = [];
    for (const measure of model.measures) {
        const kind = KIND_BY_ROLE[measure.role];
        if (!kind) continue;

        const aggregation = options.measureAggregations[`${kind}:${measure.queryName}`] ?? options.aggregations[kind];
        const detail = kind === "line" ? model.lineDetails[measure.key] : undefined;
        const percent = kind === "line" && model.displayAs === "percentOfBaseline";
        const label = detail?.total.accumulated ? `${measure.displayName}${options.cumulativeSuffix}` : measure.displayName;
        const highlighted = model.highlights !== null;
        const sourceRows = (highlighted ? model.highlights?.[measure.key] : model.values[measure.key]) ?? [];
        const lineRow = (line: { values: Values; highlights: Values | null }) => (highlighted ? line.highlights ?? [] : line.values);

        const row = (seriesIndex: number | null, values: Values): MatrixRow => ({
            key: `${measure.key}|${seriesIndex ?? "total"}`,
            kind,
            measureKey: measure.key,
            seriesIndex,
            level: seriesIndex === null ? 0 : 1,
            label: seriesIndex === null ? label : String(model.series[seriesIndex]?.value ?? ""),
            values,
            total: aggregateTotal(values, aggregation),
            format: measure.format,
            percent,
        });

        if (options.expandSeries && model.hasSeries) {
            model.series.forEach((_, seriesIndex) => {
                rows.push(row(seriesIndex, detail ? lineRow(detail.perSeries[seriesIndex]) : sourceRows[seriesIndex] ?? []));
            });
        }
        rows.push(row(null, detail ? lineRow(detail.total) : sumAcross(sourceRows)));
    }
    return rows;
}
