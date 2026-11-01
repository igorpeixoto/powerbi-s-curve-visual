// The shared x geometry (SPEC §3.1): the single source of truth for where each bucket sits.
// Bars, line points, axis labels and matrix cells are all positioned from computeGeometry's result.

export interface GeometryInput {
    /** Viewport width in px. */
    width: number;
    bucketCount: number;
    leftGutter: number;
    rightGutter: number;
    /** Fraction (0–0.9) of each bucket left empty around its band. */
    bucketGap: number;
    /** Minimum bucket width in px; 0 means always fit the plot range. */
    minBucketWidth: number;
}

export interface BucketGeometry {
    index: number;
    /** Positions relative to the plot origin (add plotLeft, minus the scroll offset, for page x). */
    x0: number;
    x1: number;
    center: number;
    /** The part of the bucket that bars and matrix cell content may use. */
    bandStart: number;
    bandWidth: number;
}

export interface XGeometry {
    plotLeft: number;
    /** Visible plot range width (viewport minus gutters). */
    plotWidth: number;
    rightGutter: number;
    bucketWidth: number;
    /** Full width of all buckets; larger than plotWidth when scrolling. */
    contentWidth: number;
    scrollable: boolean;
    buckets: BucketGeometry[];
}

export function resolveGutters(widths: { leftAxisWidth: number; matrixHeaderWidth: number; rightAxisWidth: number; totalsWidth: number }): { left: number; right: number } {
    return {
        left: Math.max(widths.leftAxisWidth, widths.matrixHeaderWidth),
        right: Math.max(widths.rightAxisWidth, widths.totalsWidth),
    };
}

export function computeGeometry(input: GeometryInput): XGeometry {
    const plotWidth = Math.max(0, input.width - input.leftGutter - input.rightGutter);
    const count = Math.max(0, Math.floor(input.bucketCount));
    const bucketWidth = count > 0 ? Math.max(plotWidth / count, Math.max(0, input.minBucketWidth)) : 0;
    const contentWidth = bucketWidth * count;
    const gap = Math.min(0.9, Math.max(0, input.bucketGap));

    const buckets = Array.from({ length: count }, (_, index): BucketGeometry => {
        const x0 = index * bucketWidth;
        return {
            index,
            x0,
            x1: x0 + bucketWidth,
            center: x0 + bucketWidth / 2,
            bandStart: x0 + (bucketWidth * gap) / 2,
            bandWidth: bucketWidth * (1 - gap),
        };
    });

    return {
        plotLeft: input.leftGutter,
        plotWidth,
        rightGutter: input.rightGutter,
        bucketWidth,
        contentWidth,
        scrollable: contentWidth > plotWidth + 0.5,
        buckets,
    };
}

/** Splits a bucket's band into equal slots (one per bar in a cluster) separated by a gap fraction. */
export function clusterSlots(band: { bandStart: number; bandWidth: number }, slotCount: number, clusterGap: number): { x: number; width: number }[] {
    if (slotCount <= 0) return [];
    if (slotCount === 1) return [{ x: band.bandStart, width: band.bandWidth }];
    const slotWidth = band.bandWidth / (slotCount + (slotCount - 1) * clusterGap);
    return Array.from({ length: slotCount }, (_, i) => ({
        x: band.bandStart + i * slotWidth * (1 + clusterGap),
        width: slotWidth,
    }));
}

/** Shows every label when they fit, otherwise every 2nd, 4th, 8th, …; Infinity when no label fits. */
export function labelStep(bucketWidth: number, labelWidth: number, spacing = 4): number {
    if (bucketWidth <= 0) return Number.POSITIVE_INFINITY;
    let step = 1;
    while (step * bucketWidth < labelWidth + spacing) step *= 2;
    return step;
}
