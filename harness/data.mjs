// Synthetic dataViews shaped like what Power BI sends for the current capabilities.json.

export function weeklyDataView() {
    const week = { displayName: "Week", queryName: "Progress.Week", roles: { category: true }, index: 0 };
    const planned = { displayName: "Planned", queryName: "Sum(Progress.Planned)", roles: { measure: true }, isMeasure: true, index: 1 };
    const actual = { displayName: "Actual", queryName: "Sum(Progress.Actual)", roles: { measure: true }, isMeasure: true, index: 2 };

    return {
        metadata: { columns: [week, planned, actual] },
        categorical: {
            categories: [{ source: week, values: ["W01", "W02", "W03"], identity: [{}, {}, {}] }],
            values: [
                { source: planned, values: [10, 25, 40] },
                { source: actual, values: [8, 20, null] },
            ],
        },
    };
}

export function emptyDataView() {
    return { metadata: { columns: [] } };
}
