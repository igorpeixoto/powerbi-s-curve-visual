import type powerbi from "powerbi-visuals-api";

import { asProvided, baselineOf, runningTotal, toPercent } from "./cumulative";
import { parseDataView } from "./parseDataView";
import { defaultModelOptions, type LineDetail, type LineSeries, type MeasureInfo, type ModelOptions, type SCurveModel, type Values } from "./types";
import { sumAcross } from "./values";

function plot(values: Values, measure: MeasureInfo, options: ModelOptions): Values {
    const lineEnd = options.lineEnds[measure.queryName] ?? "lastValue";
    return options.valueModes[measure.queryName] === "asProvided" ? asProvided(values, lineEnd) : runningTotal(values, lineEnd);
}

function lineSeries(measure: MeasureInfo, seriesIndex: number | null, row: Values, highlightRow: Values | null, options: ModelOptions): LineSeries {
    return {
        measureKey: measure.key,
        seriesIndex,
        values: plot(row, measure, options),
        highlights: highlightRow ? plot(highlightRow, measure, options) : null,
        accumulated: options.valueModes[measure.queryName] !== "asProvided",
    };
}

/** Parses the dataView and computes everything the renderers draw, per SPEC §6. */
export function buildModel(dataView: powerbi.DataView | undefined, overrides: Partial<ModelOptions>): SCurveModel {
    const options: ModelOptions = { ...defaultModelOptions, ...overrides };
    const parsed = parseDataView(dataView, options);
    const lineMeasures = parsed.measures.filter((m) => m.role === "lineValues");
    const perSeries = options.lineSeriesMode === "perSeries" && parsed.hasSeries;

    // Every line measure gets its total across series and, with series, one line per series. The chart draws
    // one of the two depending on lineSeriesMode; the matrix may need either (SPEC §5.6: rows show plotted values).
    const lineDetails: Record<string, LineDetail> = {};
    for (const measure of lineMeasures) {
        const rows = parsed.values[measure.key];
        const highlightRows = parsed.highlights?.[measure.key] ?? null;
        lineDetails[measure.key] = {
            total: lineSeries(measure, null, sumAcross(rows), highlightRows && sumAcross(highlightRows), options),
            perSeries: parsed.hasSeries
                ? rows.map((row, seriesIndex) => lineSeries(measure, seriesIndex, row, highlightRows?.[seriesIndex] ?? null, options))
                : [],
        };
    }
    const allLines = Object.values(lineDetails).flatMap((detail) => [detail.total, ...detail.perSeries]);
    const lines = lineMeasures.flatMap((m) => (perSeries ? lineDetails[m.key].perSeries : [lineDetails[m.key].total]));

    // Percent mode: the baseline is the marked line measure, else the first one as delivered (SPEC §6.3).
    let displayAs = options.displayAs;
    let baseline: number | null = null;
    let percentBaselineMissing = false;
    if (displayAs === "percentOfBaseline") {
        const base = lineMeasures.find((m) => m.queryName === options.percentBaseline) ?? lineMeasures[0];
        baseline = base ? baselineOf(sumAcross(parsed.values[base.key]), options.valueModes[base.queryName] ?? "runningTotal") : null;
        const converted = allLines.map((line) => ({ values: toPercent(line.values, baseline), highlights: line.highlights && toPercent(line.highlights, baseline) }));
        if (converted.some((c) => c.values === null)) {
            displayAs = "value";
            baseline = null;
            percentBaselineMissing = allLines.length > 0;
        } else {
            converted.forEach((c, i) => {
                allLines[i].values = c.values as Values;
                allLines[i].highlights = c.highlights ?? null;
            });
        }
    }

    return {
        ...parsed,
        lines,
        lineDetails,
        displayAs,
        baseline,
        warnings: { ...parsed.warnings, percentBaselineMissing },
    };
}
