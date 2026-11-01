import type powerbi from "powerbi-visuals-api";

import { asProvided, baselineOf, runningTotal, toPercent } from "./cumulative";
import { parseDataView } from "./parseDataView";
import { defaultModelOptions, type LineSeries, type MeasureInfo, type ModelOptions, type SCurveModel, type Values } from "./types";
import { sumAcross } from "./values";

function plot(values: Values, measure: MeasureInfo, options: ModelOptions): Values {
    const lineEnd = options.lineEnds[measure.queryName] ?? "lastValue";
    return options.valueModes[measure.queryName] === "asProvided" ? asProvided(values, lineEnd) : runningTotal(values, lineEnd);
}

/** Parses the dataView and computes everything the renderers draw, per SPEC §6. */
export function buildModel(dataView: powerbi.DataView | undefined, overrides: Partial<ModelOptions>): SCurveModel {
    const options: ModelOptions = { ...defaultModelOptions, ...overrides };
    const parsed = parseDataView(dataView, options);
    const lineMeasures = parsed.measures.filter((m) => m.role === "lineValues");
    const perSeries = options.lineSeriesMode === "perSeries" && parsed.hasSeries;

    const lines: LineSeries[] = [];
    for (const measure of lineMeasures) {
        const rows = parsed.values[measure.key];
        const highlightRows = parsed.highlights?.[measure.key] ?? null;
        const accumulated = options.valueModes[measure.queryName] !== "asProvided";
        if (perSeries) {
            rows.forEach((row, seriesIndex) => lines.push({
                measureKey: measure.key,
                seriesIndex,
                values: plot(row, measure, options),
                highlights: highlightRows ? plot(highlightRows[seriesIndex], measure, options) : null,
                accumulated,
            }));
        } else {
            lines.push({
                measureKey: measure.key,
                seriesIndex: null,
                values: plot(sumAcross(rows), measure, options),
                highlights: highlightRows ? plot(sumAcross(highlightRows), measure, options) : null,
                accumulated,
            });
        }
    }

    // Percent mode: the baseline is the grand total of the first line measure (SPEC §6.3).
    let displayAs = options.displayAs;
    let baseline: number | null = null;
    let percentBaselineMissing = false;
    if (displayAs === "percentOfBaseline") {
        const first = lineMeasures[0];
        baseline = first ? baselineOf(sumAcross(parsed.values[first.key]), options.valueModes[first.queryName] ?? "runningTotal") : null;
        const converted = lines.map((line) => ({ values: toPercent(line.values, baseline), highlights: line.highlights && toPercent(line.highlights, baseline) }));
        if (converted.some((c) => c.values === null)) {
            displayAs = "value";
            baseline = null;
            percentBaselineMissing = lines.length > 0;
        } else {
            converted.forEach((c, i) => {
                lines[i].values = c.values as Values;
                lines[i].highlights = c.highlights ?? null;
            });
        }
    }

    return {
        ...parsed,
        lines,
        displayAs,
        baseline,
        warnings: { ...parsed.warnings, percentBaselineMissing },
    };
}
