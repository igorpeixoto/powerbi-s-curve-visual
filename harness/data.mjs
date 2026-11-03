// Synthetic dataViews in the shape Power BI Desktop actually sent (observed Oct 2026, see BUILD_LOG):
// dates as local-midnight Date objects, one value column per measure flagged with every role it is bound to,
// values.grouped() with a series source, and identity arrays.

const DISCIPLINES = ["Civil", "Electrical", "Instrumentation", "Mechanical"];
const SCALE = { Civil: 4200, Electrical: 2400, Instrumentation: 1300, Mechanical: 3100 };

function logisticShare(i, n) {
    const f = (x) => 1 / (1 + Math.exp(-10 * (x - 0.5)));
    return (f((i + 1) / n) - f(i / n)) / (f(1) - f(0));
}

function column(displayName, queryName, roles, extra = {}) {
    return { displayName, queryName, roles: Object.fromEntries(roles.map((r) => [r, true])), isMeasure: true, ...extra };
}

/**
 * Weekly progress: Planned and Actual bound to both Column values and Line values, plus table-only measures.
 * Actuals stop after `reportedWeeks` (null afterwards), so the actual line ends early.
 */
export function progressDataView({
    weeks = 20,
    reportedWeeks = 12,
    series = true,
    tableOnly = 1,
    reduced = false,
    actualAllNull = false,
    highlights = false,
    partialHighlights = false,
    objects = undefined,
    seriesObjects = {},
    columnObjects = {},
    seriesValues = DISCIPLINES,
    seriesFormat = undefined,
} = {}) {
    const dates = Array.from({ length: weeks }, (_, i) => new Date(2026, 0, 5 + 7 * i));
    const dateSource = { displayName: "WeekStart", queryName: "progress.WeekStart", roles: { categoryDate: true }, index: 0 };
    const planned = column("Sum of PlannedQty", "Sum(progress.PlannedQty)", ["columnValues", "lineValues"], { format: "#,0" });
    const actual = column("Sum of ActualQty", "Sum(progress.ActualQty)", ["columnValues", "lineValues"], { format: "#,0" });
    const tables = Array.from({ length: tableOnly }, (_, i) => column(`Table measure ${i + 1}`, `Sum(progress.Table${i + 1})`, ["tableOnlyValues"], { format: "#,0" }));
    const seriesNames = series ? seriesValues : [undefined];

    const groups = seriesNames.map((name, g) => {
        const scale = SCALE[name] ?? 11000;
        const plannedValues = dates.map((_, i) => Math.round(scale * logisticShare(i, weeks)));
        const actualValues = plannedValues.map((v, i) => (actualAllNull || i >= reportedWeeks ? null : Math.round(v * (0.75 + 0.05 * ((i + g) % 4)))));
        const values = [
            { source: { ...planned, groupName: name }, values: plannedValues },
            { source: { ...actual, groupName: name }, values: actualValues },
            ...tables.map((t, k) => ({ source: { ...t, groupName: name }, values: dates.map((_, i) => (i + k + g) % 5 + 1) })),
        ];
        // Another visual highlights one discipline: its values come back as highlights, the others as null.
        if (highlights) {
            for (const column of values) column.highlights = column.values.map((v) => (g === 0 ? v : null));
        }
        // Another visual highlights part of every discipline.
        if (partialHighlights) {
            for (const column of values) column.highlights = column.values.map((v) => (v === null ? null : v / 2));
        }
        return { name, identity: name ? { key: `series:${name}` } : undefined, values, objects: seriesObjects[g] };
    });

    const flat = groups.flatMap((g) => g.values);
    flat.grouped = () => groups;
    // Per-measure formatting (selector { metadata: queryName }) arrives on the metadata column.
    const columns = [dateSource, planned, actual, ...tables].map((c) => (columnObjects[c.queryName] ? { ...c, objects: columnObjects[c.queryName] } : c));
    if (series) {
        flat.source = { displayName: "Discipline", queryName: "progress.Discipline", roles: { series: true }, format: seriesFormat };
        columns.push(flat.source);
    }

    return {
        metadata: { columns, ...(reduced ? { segment: {} } : {}), ...(objects ? { objects } : {}) },
        categorical: {
            categories: [{ source: dateSource, values: dates, identity: dates.map((_, i) => ({ key: `row:${i}` })) }],
            values: flat,
        },
    };
}

/** One line measure, already cumulative, and optional Tooltips fields; rows arrive in the order given. */
function lineDataView(dates, lineValues, tooltips = []) {
    const dateSource = { displayName: "Day", queryName: "progress.Day", roles: { categoryDate: true }, index: 0 };
    const reported = column("Reported", "Reported", ["lineValues"], { format: "#,0", objects: { lines: { valueMode: "asProvided" } } });
    const fields = tooltips.map((t) => column(t.name, t.name, ["tooltips"], { format: "#,0" }));
    const values = [
        { source: reported, values: lineValues },
        ...tooltips.map((t, i) => ({ source: fields[i], values: t.values })),
    ];
    const flat = [...values];
    flat.grouped = () => [{ values }];
    return {
        metadata: { columns: [dateSource, reported, ...fields] },
        categorical: {
            categories: [{ source: dateSource, values: dates, identity: dates.map((_, i) => ({ key: `row:${i}` })) }],
            values: flat,
        },
    };
}

/** Eight days in two weeks, newest first, as a sort by date descending delivers them. The value of each is its day of the month. */
export function dailyDescendingDataView() {
    const days = [14, 13, 12, 9, 8, 7, 6, 5];
    return lineDataView(days.map((day) => new Date(2026, 0, day)), days, [
        { name: "Crew", values: days.map(() => 2) },
        { name: "Status", values: days.map((day) => `status ${day}`) },
    ]);
}

/** Weekly values with gaps, so every reported point has no neighbour to draw a line to. */
export function isolatedPointsDataView() {
    return lineDataView([5, 12, 19, 26].map((day) => new Date(2026, 0, day)), [10, null, 30, null]);
}

/** A field in the Category well, which may be a number or a date with its own format. */
export function categoryDataView(values, format) {
    const view = progressDataView({ series: false, weeks: values.length, reportedWeeks: values.length });
    const source = { displayName: "Phase", queryName: "progress.Phase", roles: { category: true }, index: 0, format };
    view.metadata.columns[0] = source;
    view.categorical.categories = [{ source, values, identity: values.map((_, i) => ({ key: `row:${i}` })) }];
    return view;
}

/** A hierarchy in the Category well: one category column per level. */
export function categoryHierarchyDataView() {
    const view = categoryDataView(["2026", "2026"]);
    const year = view.categorical.categories[0];
    const month = { source: { ...year.source, displayName: "Month", queryName: "progress.Month" }, values: ["January", "February"], identity: [{}, {}] };
    view.categorical.categories = [year, month];
    return view;
}

/** Measures bound, no Date/Category field. */
export function measuresOnlyDataView() {
    const view = progressDataView({ series: false });
    delete view.categorical.categories;
    return view;
}

/** Date bound, no measures. */
export function bucketsOnlyDataView() {
    const view = progressDataView({ series: false });
    delete view.categorical.values;
    return view;
}

/** Wells bound but the filters leave no rows. */
export function zeroRowsDataView() {
    const view = progressDataView({ series: false, weeks: 0 });
    return view;
}

/** Date dropped with its Date Hierarchy: one category column per level, queryNames through the Variation. */
export function dateHierarchyDataView() {
    const view = progressDataView({ series: false, weeks: 2 });
    const levels = ["Year", "Quarter", "Month", "Day"];
    const values = { Year: [2026, 2026], Quarter: ["Qtr 1", "Qtr 1"], Month: ["January", "January"], Day: [5, 12] };
    view.categorical.categories = levels.map((level) => ({
        source: { displayName: level, queryName: `progress.Date.Variation.Date Hierarchy.${level}`, roles: { categoryDate: true } },
        values: values[level],
        identity: [{}, {}],
    }));
    return view;
}
