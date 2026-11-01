import { scaleLinear } from "d3";

import type { Values } from "./types";

export type Extent = [number, number];

export interface NiceDomain {
    domain: Extent;
    ticks: number[];
}

/**
 * Value extent of the columns, always including zero. `stacks` is measure → series → bucket.
 * Stacked: positives and negatives of one measure's series stack separately per bucket.
 */
export function columnExtent(stacks: readonly Values[][], layout: "stacked" | "clustered"): Extent | null {
    let min = 0;
    let max = 0;
    let any = false;
    for (const measure of stacks) {
        const bucketCount = Math.max(0, ...measure.map((row) => row.length));
        for (let bucket = 0; bucket < bucketCount; bucket++) {
            let positive = 0;
            let negative = 0;
            for (const row of measure) {
                const value = row[bucket];
                if (value === null || value === undefined) continue;
                any = true;
                if (layout === "clustered") {
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                } else if (value >= 0) {
                    positive += value;
                } else {
                    negative += value;
                }
            }
            min = Math.min(min, negative);
            max = Math.max(max, positive);
        }
    }
    return any ? [min, max] : null;
}

/** Extent over every plotted line point, including zero. */
export function lineExtent(lines: readonly Values[]): Extent | null {
    const points = lines.flat().filter((v): v is number => v !== null);
    return points.length === 0 ? null : [Math.min(0, ...points), Math.max(0, ...points)];
}

/** Rounds an extent outward to nice ticks; fixed min/max replace either end. */
export function niceDomain(extent: Extent | null, fixed: { min?: number; max?: number }, tickCount = 5): NiceDomain | null {
    if (!extent) return null;
    let [low, high] = extent;
    if (low === high) {
        low = Math.min(low, 0);
        high = Math.max(high, 0);
        if (low === high) high = low + 1;
    }
    const nice = scaleLinear().domain([low, high]).nice(tickCount).domain() as Extent;
    const domain: Extent = [fixed.min ?? nice[0], fixed.max ?? nice[1]];
    return { domain, ticks: scaleLinear().domain(domain).ticks(tickCount) };
}

/** Percent axis: 0 to at least 100 %, extended (nicely) when values exceed the baseline. */
export function percentDomain(extent: Extent | null, tickCount = 5): NiceDomain {
    const low = Math.min(0, extent?.[0] ?? 0);
    const high = Math.max(1, extent?.[1] ?? 0);
    return niceDomain([low, high], {}, tickCount) as NiceDomain;
}
