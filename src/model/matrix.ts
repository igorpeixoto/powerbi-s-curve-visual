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
    /** The author's width for the line below this row; null = the grid default. Only on a measure's last row. */
    lineBelow: number | null;
}

export interface MatrixOptions {
    expandSeries: boolean;
    cumulativeSuffix: string;
    /** Default aggregation per row kind. */
    aggregations: Record<MatrixRowKind, TotalAggregation>;
    /** Per-measure override, keyed `${kind}:${queryName}`. */
    measureAggregations: Record<string, TotalAggregation>;
    /** Per-row position (1 = first), keyed `${kind}:${queryName}`. */
    rowPositions: Record<string, number>;
    /** Per-row width of the line below, keyed `${kind}:${queryName}`. */
    rowLineWidths: Record<string, number>;
}

const KIND_BY_ROLE: Partial<Record<MeasureInfo["role"], MatrixRowKind>> = {
    columnValues: "column",
    lineValues: "line",
    tableOnlyValues: "table",
};

/**
 * The keys in their final order (SPEC §5.6). A key with a position lands in that slot, counted from 1; the others
 * keep their relative order and fill the slots left free. On a tie the earlier key goes first and the later one
 * takes the next free slot; a position past the end means last.
 */
export function orderByPosition(keys: readonly string[], positions: Readonly<Record<string, number>>): string[] {
    const positionOf = (key: string): number => Math.max(1, Math.round(positions[key]));
    const placed = keys.filter((key) => Number.isFinite(positions[key])).sort((a, b) => positionOf(a) - positionOf(b));
    const free = keys.filter((key) => !Number.isFinite(positions[key]));
    const ordered: string[] = [];
    while (placed.length || free.length) {
        const slot = ordered.length + 1;
        const takePlaced = placed.length > 0 && (free.length === 0 || positionOf(placed[0]) <= slot);
        ordered.push((takePlaced ? placed : free).shift() as string);
    }
    return ordered;
}

/**
 * Matrix rows: column measures, then line measures, then table-only measures, in well order, unless the author
 * positioned them. A measure's rows move as one block (SPEC §5.6). When another visual highlights a subset, cells
 * and totals show the highlighted values (SPEC §7.2).
 */
export function buildMatrixRows(model: SCurveModel, options: MatrixOptions): MatrixRow[] {
    const blocks = new Map<string, MatrixRow[]>();
    for (const measure of model.measures) {
        const kind = KIND_BY_ROLE[measure.role];
        if (!kind) continue;

        const blockKey = `${kind}:${measure.queryName}`;
        const rows: MatrixRow[] = [];
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
            lineBelow: seriesIndex === null ? options.rowLineWidths[blockKey] ?? null : null,
        });

        if (options.expandSeries && model.hasSeries) {
            model.series.forEach((_, seriesIndex) => {
                rows.push(row(seriesIndex, detail ? lineRow(detail.perSeries[seriesIndex]) : sourceRows[seriesIndex] ?? []));
            });
        }
        rows.push(row(null, detail ? lineRow(detail.total) : sumAcross(sourceRows)));
        blocks.set(blockKey, rows);
    }
    return orderByPosition([...blocks.keys()], options.rowPositions).flatMap((key) => blocks.get(key) ?? []);
}
