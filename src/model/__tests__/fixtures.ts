// Builders for categorical dataViews shaped like the ones Power BI sends for capabilities.json.
import type powerbi from "powerbi-visuals-api";

import type { BucketRole, ValueRole } from "../types";

export interface MeasureSpec {
    name: string;
    queryName?: string;
    /** Every role this column is flagged with (two roles = one column bound to two wells). */
    roles: ValueRole[];
    format?: string;
    /** Values per row, or per series then per row when the dataView has series. */
    values: unknown[] | unknown[][];
    highlights?: unknown[] | unknown[][];
}

export interface DataViewSpec {
    bucketRole?: BucketRole;
    buckets?: unknown[];
    series?: unknown[];
    measures?: MeasureSpec[];
    reduced?: boolean;
}

export function d(year: number, month: number, day: number): Date {
    return new Date(year, month - 1, day);
}

export function makeDataView(spec: DataViewSpec): powerbi.DataView {
    const columns: powerbi.DataViewMetadataColumn[] = [];
    let categories: powerbi.DataViewCategoryColumn[] | undefined;
    if (spec.bucketRole && spec.buckets) {
        const source: powerbi.DataViewMetadataColumn = {
            displayName: spec.bucketRole === "categoryDate" ? "Date" : "Week",
            queryName: `Progress.${spec.bucketRole}`,
            roles: { [spec.bucketRole]: true },
            index: columns.length,
        };
        columns.push(source);
        categories = [{
            source,
            values: spec.buckets as powerbi.PrimitiveValue[],
            identity: spec.buckets.map((_, i) => ({ key: `row${i}` }) as unknown as powerbi.visuals.CustomVisualOpaqueIdentity),
        }];
    }

    const measureSources = (spec.measures ?? []).map((m) => {
        const source: powerbi.DataViewMetadataColumn = {
            displayName: m.name,
            queryName: m.queryName ?? `Sum(Progress.${m.name})`,
            roles: Object.fromEntries(m.roles.map((r) => [r, true])),
            isMeasure: true,
            format: m.format,
            index: columns.length,
        };
        columns.push(source);
        return source;
    });

    const seriesValues = spec.series ?? [undefined];
    const groups = seriesValues.map((seriesValue, groupIndex) => {
        const values = (spec.measures ?? []).map((m, mi) => {
            const pick = <T>(data: T[] | T[][] | undefined): T[] | undefined =>
                data === undefined ? undefined : spec.series ? (data as T[][])[groupIndex] : (data as T[]);
            const column: powerbi.DataViewValueColumn = {
                source: { ...measureSources[mi], groupName: seriesValue as powerbi.PrimitiveValue },
                values: pick(m.values) as powerbi.PrimitiveValue[],
            };
            const highlights = pick(m.highlights);
            if (highlights) column.highlights = highlights as powerbi.PrimitiveValue[];
            return column;
        });
        return {
            name: seriesValue as powerbi.PrimitiveValue,
            identity: spec.series ? ({ key: `series${groupIndex}` } as unknown as powerbi.visuals.CustomVisualOpaqueIdentity) : undefined,
            values,
        };
    });

    const flat = groups.flatMap((g) => g.values) as powerbi.DataViewValueColumns;
    flat.grouped = () => groups as unknown as powerbi.DataViewValueColumnGroup[];
    if (spec.series) {
        const seriesSource: powerbi.DataViewMetadataColumn = {
            displayName: "Discipline",
            queryName: "Progress.Discipline",
            roles: { series: true },
            index: columns.length,
        };
        columns.push(seriesSource);
        flat.source = seriesSource;
    }

    return {
        metadata: { columns, ...(spec.reduced ? { segment: {} } : {}) },
        categorical: { categories, values: flat },
    } as powerbi.DataView;
}
