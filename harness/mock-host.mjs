// A minimal stand-in for the Power BI visual host. It records the calls the visual makes so that
// checks can assert on them (rendering events, warnings).

export function createMockHost({ highContrast = false } = {}) {
    const calls = { renderingStarted: 0, renderingFinished: 0, renderingFailed: [], warnings: [] };
    const color = (value) => ({ value });

    const host = {
        locale: "en-US",
        eventService: {
            renderingStarted: () => { calls.renderingStarted += 1; },
            renderingFinished: () => { calls.renderingFinished += 1; },
            renderingFailed: (_options, reason) => { calls.renderingFailed.push(reason); },
        },
        // The members of ISandboxExtendedColorPalette the visual reads, with Power BI's default-theme values.
        colorPalette: {
            isHighContrast: highContrast,
            foreground: color("#252423"),
            foregroundNeutralSecondary: color("#605e5c"),
            foregroundNeutralTertiary: color("#b3b0ad"),
            foregroundSelected: color("#252423"),
            background: color("#ffffff"),
            backgroundLight: color("#f3f2f1"),
            backgroundNeutral: color("#c8c6c4"),
            separator: color("#c8c6c4"),
            hyperlink: color("#0078d4"),
            getColor: (key) => color(paletteColor(key)),
            reset: () => {},
        },
        createLocalizationManager: () => ({ getDisplayName: (key) => key }),
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
        displayWarningIcon: (hoverText, detailedText) => { calls.warnings.push({ hoverText, detailedText }); },
        hostCapabilities: { allowInteractions: true },
    };

    return { host, calls };
}

const palette = ["#118dff", "#12239e", "#e66c37", "#6b007b", "#e044a7", "#744ec2", "#d9b300", "#d64550"];
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
