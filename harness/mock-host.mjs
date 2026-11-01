// A minimal stand-in for the Power BI visual host. It records the calls the visual makes so that
// checks can assert on them (e.g. renderingFinished fired, renderingFailed did not).

export function createMockHost() {
    const calls = { renderingStarted: 0, renderingFinished: 0, renderingFailed: [] };

    const host = {
        locale: "en-US",
        eventService: {
            renderingStarted: () => { calls.renderingStarted += 1; },
            renderingFinished: () => { calls.renderingFinished += 1; },
            renderingFailed: (_options, reason) => { calls.renderingFailed.push(reason); },
        },
        colorPalette: {
            isHighContrast: false,
            foreground: { value: "#252423" },
            background: { value: "#ffffff" },
            foregroundSelected: { value: "#252423" },
            hyperlink: { value: "#0078d4" },
            getColor: (key) => ({ value: paletteColor(key) }),
            reset: () => {},
        },
        createSelectionIdBuilder: () => createSelectionIdBuilder(),
        createSelectionManager: () => ({
            select: () => Promise.resolve([]),
            clear: () => Promise.resolve(),
            getSelectionIds: () => [],
            hasSelection: () => false,
            showContextMenu: () => Promise.resolve(),
            registerOnSelectCallback: () => {},
        }),
        tooltipService: { enabled: () => true, show: () => {}, move: () => {}, hide: () => {} },
        persistProperties: () => {},
        applyJsonFilter: () => {},
        launchUrl: () => {},
        displayWarningIcon: () => {},
        hostCapabilities: { allowInteractions: true },
    };

    return { host, calls };
}

const palette = ["#118dff", "#12239e", "#e66c37", "#6b007b", "#e044a7", "#744ec2"];
const assigned = new Map();

function paletteColor(key) {
    if (!assigned.has(key)) {
        assigned.set(key, palette[assigned.size % palette.length]);
    }
    return assigned.get(key);
}

function createSelectionIdBuilder() {
    const parts = [];
    const builder = {
        withCategory: (category, index) => { parts.push(`c:${category.source?.queryName}:${index}`); return builder; },
        withSeries: (_series, group) => { parts.push(`s:${group?.name ?? ""}`); return builder; },
        withMeasure: (queryName) => { parts.push(`m:${queryName}`); return builder; },
        withMatrixNode: () => builder,
        withTable: (_table, index) => { parts.push(`t:${index}`); return builder; },
        createSelectionId: () => {
            const key = parts.join("|");
            return {
                key,
                getKey: () => key,
                equals: (other) => other?.getKey?.() === key,
                includes: (other) => other?.getKey?.() === key,
                getSelector: () => ({ key }),
                getSelectorsByColumn: () => ({ key }),
                hasIdentity: () => parts.length > 0,
            };
        },
    };
    return builder;
}
