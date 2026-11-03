import type { ParsedDataView } from "./types";

export type EmptyStateKind = "landing" | "missingBuckets" | "missingMeasures" | "dateHierarchy" | "categoryHierarchy" | "noRows";

/** Which SPEC §8 empty state applies, or null when there is something to draw. */
export function classifyEmptyState(parsed: ParsedDataView): EmptyStateKind | null {
    if (parsed.warnings.dateHierarchy) return "dateHierarchy";
    if (parsed.warnings.categoryHierarchy) return "categoryHierarchy";
    const hasBucketField = parsed.bucketRole !== null;
    const drawable = parsed.measures.some((m) => m.role !== "tooltips");
    if (!hasBucketField && !drawable) return "landing";
    if (!hasBucketField) return "missingBuckets";
    if (!drawable) return "missingMeasures";
    if (parsed.buckets.length === 0) return "noRows";
    return null;
}
