import { describe, expect, it } from "vitest";

import { classifyEmptyState } from "../emptyState";
import { parseDataView } from "../parseDataView";
import { defaultModelOptions } from "../types";
import { d, makeDataView, type DataViewSpec } from "./fixtures";

const classify = (spec: DataViewSpec | undefined) =>
    classifyEmptyState(parseDataView(spec ? makeDataView(spec) : undefined, defaultModelOptions));

const measure = { name: "Planned", roles: ["columnValues" as const], values: [1] };

describe("classifyEmptyState", () => {
    it("shows the landing page when nothing is bound", () => {
        expect(classify(undefined)).toBe("landing");
        expect(classify({})).toBe("landing");
    });

    it("names the missing well", () => {
        expect(classify({ measures: [measure] })).toBe("missingBuckets");
        expect(classify({ bucketRole: "category", buckets: ["W01"] })).toBe("missingMeasures");
        expect(classify({ bucketRole: "category", buckets: ["W01"], measures: [{ ...measure, roles: ["tooltips"] }] })).toBe("missingMeasures");
    });

    it("reports zero rows, including when every date was excluded", () => {
        expect(classify({ bucketRole: "category", buckets: [], measures: [{ ...measure, values: [] }] })).toBe("noRows");
        expect(classify({ bucketRole: "categoryDate", buckets: [null], measures: [measure] })).toBe("noRows");
    });

    it("returns null when there is something to draw", () => {
        expect(classify({ bucketRole: "categoryDate", buckets: [d(2026, 2, 2)], measures: [measure] })).toBeNull();
    });
});
