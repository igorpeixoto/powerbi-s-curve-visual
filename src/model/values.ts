import type { TotalAggregation, Values } from "./types";

/** Finite numbers pass through; anything else (null, NaN, text) is "not reported". */
export function toNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Combines the values of several source rows that fall into one bucket. */
export function combine(values: Values, how: "sum" | "last"): number | null {
    let result: number | null = null;
    for (const value of values) {
        if (value === null) continue;
        result = how === "sum" ? (result ?? 0) + value : value;
    }
    return result;
}

/** Combines a Tooltips field over a bucket's rows, in date order: numbers add up like the bars, anything else shows the latest value. */
export function combineTooltip(values: readonly unknown[]): unknown {
    const present = values.filter((v) => v !== null && v !== undefined);
    if (present.length === 0) return null;
    return present.every((v) => typeof v === "number") ? (present as number[]).reduce((a, b) => a + b, 0) : present[present.length - 1];
}

/** Whether a reported point has no reported neighbour, so the line draws nothing for it. */
export function isIsolated(values: Values, index: number): boolean {
    return values[index] !== null && (values[index - 1] ?? null) === null && (values[index + 1] ?? null) === null;
}

export function aggregateTotal(values: Values, how: TotalAggregation): number | null {
    switch (how) {
        case "sum":
            return combine(values, "sum");
        case "last":
            return combine(values, "last");
        case "average": {
            const present = values.filter((v): v is number => v !== null);
            return present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
        }
        case "none":
            return null;
    }
}

/** Per-bucket sum across series rows; a bucket stays null when every series is null there. */
export function sumAcross(rows: Values[]): Values {
    if (rows.length === 0) return [];
    return rows[0].map((_, bucket) => combine(rows.map((row) => row[bucket] ?? null), "sum"));
}
