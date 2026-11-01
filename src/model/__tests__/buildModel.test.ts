import { describe, expect, it } from "vitest";

import { buildModel } from "../buildModel";
import { makeDataView } from "./fixtures";

const PLANNED = "Sum(Progress.Planned)";
const ACTUAL = "Sum(Progress.Actual)";

const twoSeries = () => makeDataView({
    bucketRole: "category",
    buckets: ["W01", "W02", "W03"],
    series: ["Civil", "Electrical"],
    measures: [
        { name: "Planned", roles: ["columnValues", "lineValues"], values: [[10, 20, 30], [5, 5, 10]] },
        { name: "Actual", roles: ["columnValues", "lineValues"], values: [[8, 15, null], [4, null, null]] },
    ],
});

describe("buildModel", () => {
    it("draws one running-total line per measure, summed across series, by default", () => {
        const model = buildModel(twoSeries(), {});
        expect(model.lines.map((l) => [l.measureKey, l.seriesIndex, l.accumulated])).toEqual([
            [`lineValues:${PLANNED}`, null, true],
            [`lineValues:${ACTUAL}`, null, true],
        ]);
        expect(model.lines[0].values).toEqual([15, 40, 80]);
        expect(model.lines[1].values).toEqual([12, 27, null]); // actuals stop at the last reported week
    });

    it("draws one line per measure and series in perSeries mode", () => {
        const model = buildModel(twoSeries(), { lineSeriesMode: "perSeries" });
        expect(model.lines).toHaveLength(4);
        expect(model.lines.map((l) => l.seriesIndex)).toEqual([0, 1, 0, 1]);
        expect(model.lines[3].values).toEqual([4, null, null]);
    });

    it("applies per-measure value modes and line ends", () => {
        const model = buildModel(twoSeries(), {
            valueModes: { [PLANNED]: "asProvided" },
            lineEnds: { [ACTUAL]: "lastBucket" },
        });
        expect(model.lines[0]).toMatchObject({ values: [15, 25, 40], accumulated: false });
        expect(model.lines[1].values).toEqual([12, 27, 27]);
    });

    it("shows lines as a share of the first line measure's grand total in percent mode", () => {
        const model = buildModel(twoSeries(), { displayAs: "percentOfBaseline" });
        expect(model.displayAs).toBe("percentOfBaseline");
        expect(model.baseline).toBe(80);
        expect(model.lines[0].values).toEqual([15 / 80, 0.5, 1]);
        expect(model.lines[1].values[1]).toBeCloseTo(27 / 80);
    });

    it("falls back to values with a warning when the baseline is zero", () => {
        const dataView = makeDataView({
            bucketRole: "category",
            buckets: ["W01"],
            measures: [{ name: "Planned", roles: ["lineValues"], values: [0] }],
        });
        const model = buildModel(dataView, { displayAs: "percentOfBaseline" });
        expect(model.displayAs).toBe("value");
        expect(model.warnings.percentBaselineMissing).toBe(true);
        expect(model.lines[0].values).toEqual([0]);
    });

    it("accumulates highlighted values alongside the full values", () => {
        const dataView = makeDataView({
            bucketRole: "category",
            buckets: ["W01", "W02"],
            measures: [{ name: "Planned", roles: ["lineValues"], values: [10, 20], highlights: [4, 6] }],
        });
        const model = buildModel(dataView, {});
        expect(model.lines[0].values).toEqual([10, 30]);
        expect(model.lines[0].highlights).toEqual([4, 10]);
    });

    it("produces an empty but valid model with no data", () => {
        const model = buildModel(undefined, {});
        expect(model.buckets).toEqual([]);
        expect(model.lines).toEqual([]);
        expect(model.displayAs).toBe("value");
    });
});
