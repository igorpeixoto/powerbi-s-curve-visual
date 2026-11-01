import type { LineEnd, ValueMode, Values } from "./types";
import { combine } from "./values";

function reportedRange(values: Values): [number, number] | null {
    const first = values.findIndex((v) => v !== null);
    if (first < 0) return null;
    let last = values.length - 1;
    while (values[last] === null) last -= 1;
    return [first, last];
}

/**
 * Running total in bucket order. Null buckets add nothing and the total carries across them;
 * after the last reported bucket the line stops (lastValue) or carries its total to the end (lastBucket).
 */
export function runningTotal(values: Values, lineEnd: LineEnd): Values {
    const range = reportedRange(values);
    if (!range) return values.map(() => null);
    const [first, last] = range;
    let total = 0;
    return values.map((value, i) => {
        if (i < first) return null;
        if (i > last) return lineEnd === "lastBucket" ? total : null;
        total += value ?? 0;
        return total;
    });
}

/** Values plotted as they arrive (already cumulative, or ratios); lastBucket carries the last one to the end. */
export function asProvided(values: Values, lineEnd: LineEnd): Values {
    const range = reportedRange(values);
    if (!range) return values.map(() => null);
    const [, last] = range;
    return values.map((value, i) => (i > last && lineEnd === "lastBucket" ? values[last] : value));
}

/** The grand total a percent line is measured against. */
export function baselineOf(values: Values, mode: ValueMode): number | null {
    return combine(values, mode === "runningTotal" ? "sum" : "last");
}

/** Divides by the baseline; null when there is no usable baseline (never divides by zero). */
export function toPercent(values: Values, baseline: number | null): Values | null {
    if (baseline === null || baseline === 0) return null;
    return values.map((v) => (v === null ? null : v / baseline));
}
