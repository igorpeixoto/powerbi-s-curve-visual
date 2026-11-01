import { describe, expect, it } from "vitest";
import type powerbi from "powerbi-visuals-api";

import { summarizeDataView } from "../dataViewSummary";

describe("summarizeDataView", () => {
    it("reports no data for an undefined dataView", () => {
        expect(summarizeDataView(undefined)).toEqual({ hasData: false, bucketCount: 0, measureCount: 0 });
    });

    it("counts buckets and measures in a categorical dataView", () => {
        const dataView = {
            metadata: { columns: [] },
            categorical: {
                categories: [{ source: { displayName: "Week" }, values: ["W1", "W2", "W3"] }],
                values: [{ source: { displayName: "Planned" }, values: [1, 2, 3] }],
            },
        } as unknown as powerbi.DataView;

        expect(summarizeDataView(dataView)).toEqual({ hasData: true, bucketCount: 3, measureCount: 1 });
    });
});
