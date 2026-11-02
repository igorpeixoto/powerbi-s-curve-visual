// Selection state, keyed by stable values (bucket key, series key, measure key) rather than indices, so a filter
// change or an inserted empty week can't move a selection onto a different week (SPEC §7.1, stale selections).

/** What was selected; null fields match anything. */
export interface Selector {
    bucket: string | null;
    series: string | null;
    measure: string | null;
}

export type Emphasis = "normal" | "selected" | "dimmed";

export function selectorKey(s: Selector): string {
    return `${s.bucket ?? "*"}\u0001${s.series ?? "*"}\u0001${s.measure ?? "*"}`;
}

/**
 * Whether a mark falls under a selector: every field the selector names must equal the mark's. Line paths span all
 * buckets, so they ignore the bucket field (selecting a week keeps the lines as they are).
 */
export function matches(selector: Selector, mark: Selector, options: { ignoreBucket?: boolean } = {}): boolean {
    if (selector.bucket !== null && !options.ignoreBucket && mark.bucket !== selector.bucket) return false;
    if (selector.series !== null && mark.series !== selector.series) return false;
    if (selector.measure !== null && mark.measure !== selector.measure) return false;
    return true;
}

export function emphasisOf(selected: readonly Selector[], mark: Selector, options: { ignoreBucket?: boolean } = {}): Emphasis {
    if (selected.length === 0) return "normal";
    return selected.some((s) => matches(s, mark, options)) ? "selected" : "dimmed";
}

/**
 * Click semantics of built-in visuals: a plain click selects only that mark, or clears when it was the only
 * selected one; Ctrl/Cmd toggles it within the current selection.
 */
export function nextSelection(current: readonly Selector[], clicked: Selector, multi: boolean): Selector[] {
    const key = selectorKey(clicked);
    const present = current.some((s) => selectorKey(s) === key);
    if (multi) {
        return present ? current.filter((s) => selectorKey(s) !== key) : [...current, clicked];
    }
    return present && current.length === 1 ? [] : [clicked];
}

export interface AvailableKeys {
    buckets: ReadonlySet<string>;
    series: ReadonlySet<string>;
    measures: ReadonlySet<string>;
}

/** Drops selectors that name a bucket, series or measure the current data no longer has. */
export function pruneSelection(current: readonly Selector[], available: AvailableKeys): Selector[] {
    return current.filter((s) =>
        (s.bucket === null || available.buckets.has(s.bucket))
        && (s.series === null || available.series.has(s.series))
        && (s.measure === null || available.measures.has(s.measure)));
}

/** Measure-only selections emphasise within the visual and are never sent to the host (SPEC Decision 5). */
export function isLocalOnly(s: Selector): boolean {
    return s.bucket === null && s.series === null;
}
