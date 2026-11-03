// Tooltip contents for a mark (SPEC §7.3): bucket as header, series, the measure's value, for line points also the
// per-bucket value, the highlighted value when another visual highlights a subset, then the Tooltips fields.
import type { MatrixRow } from "../model/matrix";
import type { SCurveModel, Values } from "../model/types";
import { sumAcross } from "../model/values";

export interface TooltipItem {
    displayName: string;
    value: string;
    header?: string;
    color?: string;
}

export type TooltipMark =
    | { kind: "bar"; bucket: number; measureKey: string; seriesIndex: number | null }
    | { kind: "point"; bucket: number; measureKey: string; seriesIndex: number | null }
    | { kind: "cell"; bucket: number; row: MatrixRow };

export interface TooltipContext {
    model: SCurveModel;
    bucketLabels: string[];
    cumulativeSuffix: string;
    highlightedSuffix: string;
    seriesName(seriesIndex: number): string;
    /** Full-precision value in the measure's format (or a percentage). */
    formatValue(format: string | undefined, value: number | null, percent: boolean): string;
    /** Any other value (text or number) in its own format. */
    formatRaw(value: unknown, format: string | undefined): string;
    color?(mark: TooltipMark): string | undefined;
}

function rowFor(rows: Values[] | undefined, seriesIndex: number | null): Values {
    if (!rows) return [];
    return seriesIndex === null ? sumAcross(rows) : rows[seriesIndex] ?? [];
}

export function tooltipItems(ctx: TooltipContext, mark: TooltipMark): TooltipItem[] {
    const { model } = ctx;
    const header = ctx.bucketLabels[mark.bucket] ?? "";
    const items: TooltipItem[] = [];
    const seriesIndex = mark.kind === "cell" ? mark.row.seriesIndex : mark.seriesIndex;
    if (seriesIndex !== null && model.hasSeries) {
        items.push({ displayName: model.seriesFieldName ?? "", value: ctx.seriesName(seriesIndex) });
    }

    const measureKey = mark.kind === "cell" ? mark.row.measureKey : mark.measureKey;
    const measure = model.measures.find((m) => m.key === measureKey);
    const color = ctx.color?.(mark);
    if (measure) {
        if (mark.kind === "bar") {
            const value = rowFor(model.values[measureKey], seriesIndex)[mark.bucket] ?? null;
            items.push({ displayName: measure.displayName, value: ctx.formatValue(measure.format, value, false), color });
            if (model.highlights) {
                const highlighted = rowFor(model.highlights[measureKey], seriesIndex)[mark.bucket] ?? null;
                items.push({ displayName: `${measure.displayName}${ctx.highlightedSuffix}`, value: ctx.formatValue(measure.format, highlighted, false) });
            }
        } else if (mark.kind === "point") {
            const detail = model.lineDetails[measureKey];
            const line = seriesIndex === null ? detail?.total : detail?.perSeries[seriesIndex];
            const percent = model.displayAs === "percentOfBaseline";
            const name = `${measure.displayName}${line?.accumulated ? ctx.cumulativeSuffix : ""}`;
            items.push({ displayName: name, value: ctx.formatValue(measure.format, line?.values[mark.bucket] ?? null, percent), color });
            if (line?.accumulated) {
                const perBucket = rowFor(model.values[measureKey], seriesIndex)[mark.bucket] ?? null;
                items.push({ displayName: measure.displayName, value: ctx.formatValue(measure.format, perBucket, false) });
            }
            if (model.highlights && line?.highlights) {
                items.push({ displayName: `${name}${ctx.highlightedSuffix}`, value: ctx.formatValue(measure.format, line.highlights[mark.bucket] ?? null, percent) });
            }
        } else {
            items.push({ displayName: mark.row.label, value: ctx.formatValue(mark.row.format, mark.row.values[mark.bucket] ?? null, mark.row.percent), color });
        }
    }

    // Tooltips fields: the series' value, or across series a numeric sum (text: the first value).
    for (const tooltip of model.measures.filter((m) => m.role === "tooltips")) {
        const perSeries = model.tooltipValues[tooltip.key] ?? [];
        const values = (seriesIndex === null ? perSeries : [perSeries[seriesIndex] ?? []]).map((row) => row[mark.bucket]);
        const present = values.filter((v) => v !== null && v !== undefined);
        if (present.length === 0) continue;
        const value = present.every((v) => typeof v === "number") ? (present as number[]).reduce((a, b) => a + b, 0) : present[0];
        items.push({ displayName: tooltip.displayName, value: ctx.formatRaw(value, tooltip.format) });
    }

    return items.map((item, i) => (i === 0 ? { ...item, header } : item));
}
