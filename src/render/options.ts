// Every value the renderers read. The defaults are the SPEC §9.2 "Base (= Classic)" column; Phase 5 fills
// this object from the Format pane through the preset resolution rule instead of using it as is.
import { defaultModelOptions, type ModelOptions, type TotalAggregation } from "../model/types";
import type { WeekLabelFormat } from "../model/labels";
import type { SeriesLayout } from "../model/columns";

export type LineStyle = "solid" | "dashed" | "dotted";
export type LegendPosition = "top" | "bottom" | "left" | "right";
export type GridlineStyle = "solid" | "dashed" | "dotted";

export interface AxisOptions {
    show: boolean;
    min?: number;
    max?: number;
    /** pt */
    fontSize: number;
    /** 0 = auto */
    displayUnits: number;
    precision?: number;
    gridlines: boolean;
}

export interface RenderOptions {
    model: ModelOptions;
    fontFamily: string;
    /** Fraction of each bucket left empty around its band (Format pane shows %). */
    bucketGap: number;
    /** px; 0 = always fit. */
    minBucketWidth: number;
    columns: {
        show: boolean;
        layout: SeriesLayout;
        clusterGap: number;
        /** 0–1 */
        opacity: number;
        cornerRadius: number;
    };
    lines: {
        show: boolean;
        strokeWidth: number;
        opacity: number;
        interpolation: "linear" | "monotone";
        showMarkers: boolean;
        markerSize: number;
        /** Per line-measure queryName. */
        styles: Record<string, LineStyle>;
        /** null = localised default. */
        cumulativeSuffix: string | null;
    };
    leftAxis: AxisOptions;
    rightAxis: AxisOptions;
    gridlines: { style: GridlineStyle; width: number };
    xAxis: { show: boolean; fontSize: number; weekLabelFormat: WeekLabelFormat };
    dataLabels: {
        columns: { show: boolean; position: "outsideEnd" | "insideEnd"; fontSize: number };
        lines: { show: boolean; points: "last" | "all"; fontSize: number };
    };
    legend: { show: boolean; position: LegendPosition; fontSize: number };
    matrix: {
        show: boolean;
        showTotals: boolean;
        /** null = localised default. */
        totalsLabel: string | null;
        expandSeries: boolean;
        fontSize: number;
        headerBold: boolean;
        rowHeight: number;
        showBorders: boolean;
        banding: boolean;
        /** % of the visual's height. */
        maxHeightPercent: number;
        aggregations: { column: TotalAggregation; line: TotalAggregation; table: TotalAggregation };
        measureAggregations: Record<string, TotalAggregation>;
        displayUnits: number;
        precision?: number;
    };
}

export const defaultRenderOptions: RenderOptions = {
    model: defaultModelOptions,
    fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
    bucketGap: 0.2,
    minBucketWidth: 0,
    columns: { show: true, layout: "stacked", clusterGap: 0.1, opacity: 1, cornerRadius: 0 },
    lines: {
        show: true,
        strokeWidth: 2,
        opacity: 1,
        interpolation: "linear",
        showMarkers: false,
        markerSize: 4,
        styles: {},
        cumulativeSuffix: null,
    },
    leftAxis: { show: true, fontSize: 9, displayUnits: 0, gridlines: true },
    rightAxis: { show: true, fontSize: 9, displayUnits: 0, gridlines: false },
    gridlines: { style: "dashed", width: 1 },
    xAxis: { show: true, fontSize: 9, weekLabelFormat: "weekStart" },
    dataLabels: {
        columns: { show: false, position: "outsideEnd", fontSize: 9 },
        lines: { show: true, points: "last", fontSize: 9 },
    },
    legend: { show: true, position: "top", fontSize: 9 },
    matrix: {
        show: true,
        showTotals: true,
        totalsLabel: null,
        expandSeries: false,
        fontSize: 9,
        headerBold: true,
        rowHeight: 20,
        showBorders: true,
        banding: false,
        maxHeightPercent: 50,
        aggregations: { column: "sum", line: "last", table: "sum" },
        measureAggregations: {},
        displayUnits: 0,
    },
};

/** Power BI font sizes are points; the DOM wants pixels. */
export function ptToPx(pt: number): number {
    return (pt * 4) / 3;
}
