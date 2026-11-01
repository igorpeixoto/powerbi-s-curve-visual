import { describe, expect, it } from "vitest";
import type powerbi from "powerbi-visuals-api";

import { buildIdentities, type SelectionIdBuilderLike } from "../identity";
import { parseDataView } from "../parseDataView";
import { defaultModelOptions } from "../types";
import { d, makeDataView } from "./fixtures";

// Records what the builder was asked for, so identities can be compared as strings.
function fakeBuilder(): SelectionIdBuilderLike<string> {
    const parts: string[] = [];
    const builder: SelectionIdBuilderLike<string> = {
        withCategory: (column, index) => {
            parts.push(`cat:${(column.identity?.[index] as unknown as { key: string }).key}`);
            return builder;
        },
        withSeries: (_columns, group) => {
            parts.push(`series:${(group.identity as unknown as { key: string }).key}`);
            return builder;
        },
        withMeasure: (queryName) => {
            parts.push(`measure:${queryName}`);
            return builder;
        },
        createSelectionId: () => parts.join("|"),
    };
    return builder;
}

const build = (dataView: powerbi.DataView) => buildIdentities(dataView, parseDataView(dataView, defaultModelOptions), fakeBuilder);

describe("buildIdentities", () => {
    it("gives each week bucket one identity per source row", () => {
        const ids = build(makeDataView({
            bucketRole: "categoryDate",
            buckets: [d(2026, 2, 2), d(2026, 2, 4), d(2026, 2, 10)],
            measures: [{ name: "Planned", roles: ["columnValues"], values: [1, 2, 3] }],
        }));
        expect(ids.buckets).toEqual([["cat:row0", "cat:row1"], ["cat:row2"]]);
    });

    it("builds point identities from bucket, series and measure", () => {
        const ids = build(makeDataView({
            bucketRole: "category",
            buckets: ["W01", "W02"],
            series: ["Civil", "Electrical"],
            measures: [{ name: "Planned", roles: ["columnValues"], values: [[1, 2], [3, 4]] }],
        }));
        expect(ids.series).toEqual(["series:series0", "series:series1"]);
        expect(ids.point("columnValues:Sum(Progress.Planned)", 1, 0))
            .toEqual(["cat:row0|series:series1|measure:Sum(Progress.Planned)"]);
        // A line summed across series (seriesIndex null) is identified by bucket and measure only.
        expect(ids.point("columnValues:Sum(Progress.Planned)", null, 1))
            .toEqual(["cat:row1|measure:Sum(Progress.Planned)"]);
    });

    it("returns no identities for inserted empty weeks or an unknown measure", () => {
        const ids = build(makeDataView({
            bucketRole: "categoryDate",
            buckets: [d(2026, 2, 2), d(2026, 2, 16)],
            measures: [{ name: "Planned", roles: ["columnValues"], values: [1, 2] }],
        }));
        expect(ids.buckets[1]).toEqual([]);
        expect(ids.point("columnValues:Sum(Progress.Planned)", null, 1)).toEqual([]);
        expect(ids.point("columnValues:nope", null, 0)).toEqual([]);
    });
});
