// Colours come only from the report theme (host colour palette); nothing is hardcoded (SPEC §7.4).

interface ColorInfo {
    value: string;
}

/** The parts of ISandboxExtendedColorPalette the visual reads; every member is optional so a thin host can't crash it. */
export interface PaletteLike {
    getColor(key: string): ColorInfo;
    isHighContrast?: boolean;
    foreground?: ColorInfo;
    foregroundNeutralSecondary?: ColorInfo;
    foregroundNeutralTertiary?: ColorInfo;
    foregroundSelected?: ColorInfo;
    background?: ColorInfo;
    backgroundLight?: ColorInfo;
    backgroundNeutral?: ColorInfo;
    separator?: ColorInfo;
}

export interface ThemeColors {
    text: string;
    /** Colour of selected marks in high contrast. */
    selected: string;
    secondaryText: string;
    gridline: string;
    border: string;
    background: string;
    banding: string;
}

/** Falls back to the foreground, then to the CSS current colour, rather than inventing a colour. */
export function themeColors(palette: PaletteLike): ThemeColors {
    const foreground = palette.foreground?.value ?? "currentColor";
    const pick = (info: ColorInfo | undefined) => info?.value ?? foreground;
    if (palette.isHighContrast) {
        return {
            text: foreground,
            selected: palette.foregroundSelected?.value ?? foreground,
            secondaryText: foreground,
            gridline: foreground,
            border: foreground,
            background: palette.background?.value ?? "transparent",
            banding: "transparent",
        };
    }
    return {
        text: foreground,
        selected: pick(palette.foregroundSelected),
        secondaryText: pick(palette.foregroundNeutralSecondary),
        gridline: pick(palette.foregroundNeutralTertiary),
        border: pick(palette.separator ?? palette.foregroundNeutralTertiary),
        background: palette.background?.value ?? "transparent",
        banding: palette.backgroundNeutral?.value ?? palette.backgroundLight?.value ?? "transparent",
    };
}

function parseHex(color: string): [number, number, number] | null {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
    if (!match) return null;
    const hex = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mixes `color` towards `toward` by t (0 = color, 1 = toward). Non-hex inputs return `color` unchanged. */
export function mix(color: string, toward: string, t: number): string {
    const a = parseHex(color);
    const b = parseHex(toward);
    if (!a || !b) return color;
    const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, "0");
    return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** Progressively lighter tints for the 2nd, 3rd, … measure sharing a series colour (SPEC §5.1). */
export const TINTS = [0, 0.4, 0.65, 0.8, 0.88, 0.93];

export interface DataColorInput {
    /** Column measures, in order: key and queryName. */
    columnMeasures: { key: string; queryName: string }[];
    lineMeasures: { key: string; queryName: string }[];
    seriesKeys: string[];
    hasSeries: boolean;
    /** Explicit fills from the Format pane: by series key with series, else by measure queryName. */
    columnOverrides?: Record<string, string>;
    /** Explicit colours of total-across-series lines, by measure queryName. */
    lineOverrides?: Record<string, string>;
}

/**
 * Resolves data colours. Keys are requested in a fixed order (series first, then measures by queryName) so the
 * theme assigns the same colours on every update. A measure keeps one colour for its bar and its line.
 */
export class DataColors {
    private readonly seriesColors: string[];
    private readonly measureColors = new Map<string, string>();
    private readonly columnIndex = new Map<string, number>();
    private readonly lineIndex = new Map<string, number>();
    private readonly queryNames: Map<string, string>;
    private readonly highContrast: string | null;
    private readonly background: string;
    private readonly columnOverrides: Record<string, string>;
    private readonly lineOverrides: Record<string, string>;
    private readonly seriesKeys: string[];

    constructor(palette: PaletteLike, input: DataColorInput) {
        this.highContrast = palette.isHighContrast ? palette.foreground?.value ?? "currentColor" : null;
        this.background = palette.background?.value ?? "";
        this.seriesColors = input.hasSeries ? input.seriesKeys.map((key) => palette.getColor(key).value) : [];
        for (const m of [...input.columnMeasures, ...input.lineMeasures]) {
            if (!this.measureColors.has(m.queryName)) this.measureColors.set(m.queryName, palette.getColor(m.queryName).value);
        }
        this.columnOverrides = input.columnOverrides ?? {};
        this.lineOverrides = input.lineOverrides ?? {};
        this.seriesKeys = input.seriesKeys;
        input.columnMeasures.forEach((m, i) => this.columnIndex.set(m.key, i));
        input.lineMeasures.forEach((m, i) => this.lineIndex.set(m.key, i));
        this.queryNames = new Map([...input.columnMeasures, ...input.lineMeasures].map((m) => [m.key, m.queryName]));
    }

    private tinted(base: string, index: number): string {
        return mix(base, this.background, TINTS[Math.min(index, TINTS.length - 1)]);
    }

    private measureColor(measureKey: string, overrides: Record<string, string>): string {
        const queryName = this.queryNames.get(measureKey) ?? "";
        return overrides[queryName] ?? this.measureColors.get(queryName) ?? "currentColor";
    }

    private seriesColor(seriesIndex: number): string {
        return this.columnOverrides[this.seriesKeys[seriesIndex]] ?? this.seriesColors[seriesIndex];
    }

    bar(measureKey: string, seriesIndex: number | null): string {
        if (this.highContrast) return this.highContrast;
        if (seriesIndex === null) return this.measureColor(measureKey, this.columnOverrides);
        return this.tinted(this.seriesColor(seriesIndex), this.columnIndex.get(measureKey) ?? 0);
    }

    /** A per-measure line colour applies to total-across-series lines; per-series lines use the series colour. */
    line(measureKey: string, seriesIndex: number | null): string {
        if (this.highContrast) return this.highContrast;
        if (seriesIndex === null) return this.measureColor(measureKey, this.lineOverrides);
        return this.tinted(this.seriesColor(seriesIndex), this.lineIndex.get(measureKey) ?? 0);
    }
}
