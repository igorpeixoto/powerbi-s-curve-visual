import { describe, expect, it } from "vitest";

import { DataColors, mix, themeColors, type PaletteLike } from "../colors";

function palette(extra: Partial<PaletteLike> = {}): PaletteLike & { requested: string[] } {
    const theme = ["#118dff", "#12239e", "#e66c37", "#6b007b"];
    const assigned = new Map<string, string>();
    const requested: string[] = [];
    return {
        requested,
        getColor: (key) => {
            requested.push(key);
            if (!assigned.has(key)) assigned.set(key, theme[assigned.size % theme.length]);
            return { value: assigned.get(key) as string };
        },
        foreground: { value: "#252423" },
        background: { value: "#ffffff" },
        ...extra,
    };
}

const input = {
    columnMeasures: [{ key: "columnValues:P", queryName: "P" }, { key: "columnValues:A", queryName: "A" }],
    lineMeasures: [{ key: "lineValues:P", queryName: "P" }],
    seriesKeys: ["Civil", "Electrical"],
};

describe("mix", () => {
    it("blends hex colours and leaves anything else alone", () => {
        expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
        expect(mix("#118dff", "#ffffff", 0)).toBe("#118dff");
        expect(mix("#fff", "#000", 1)).toBe("#000000");
        expect(mix("currentColor", "#ffffff", 0.5)).toBe("currentColor");
    });
});

describe("themeColors", () => {
    it("uses theme neutrals and falls back to the foreground, never to an invented colour", () => {
        expect(themeColors(palette({ foregroundNeutralSecondary: { value: "#605e5c" } })).secondaryText).toBe("#605e5c");
        expect(themeColors(palette()).gridline).toBe("#252423");
        expect(themeColors({ getColor: () => ({ value: "" }) }).text).toBe("currentColor");
    });

    it("uses only foreground and background in high contrast", () => {
        const colors = themeColors(palette({ isHighContrast: true, foregroundNeutralSecondary: { value: "#605e5c" } }));
        expect(new Set([colors.text, colors.secondaryText, colors.gridline, colors.border])).toEqual(new Set(["#252423"]));
    });
});

describe("DataColors", () => {
    it("gives a measure one colour for its bar and its line without series", () => {
        const colors = new DataColors(palette(), { ...input, hasSeries: false });
        expect(colors.bar("columnValues:P", null)).toBe("#118dff");
        expect(colors.line("lineValues:P", null)).toBe("#118dff");
        expect(colors.bar("columnValues:A", null)).toBe("#12239e");
    });

    it("colours bars by series with lighter tints for later measures", () => {
        const p = palette();
        const colors = new DataColors(p, { ...input, hasSeries: true });
        expect(p.requested.slice(0, 2)).toEqual(["Civil", "Electrical"]); // series first: stable theme order
        expect(colors.bar("columnValues:P", 0)).toBe("#118dff");
        expect(colors.bar("columnValues:A", 0)).toBe(mix("#118dff", "#ffffff", 0.4));
        expect(colors.bar("columnValues:P", 1)).toBe("#12239e");
    });

    it("uses the foreground for every mark in high contrast", () => {
        const colors = new DataColors(palette({ isHighContrast: true }), { ...input, hasSeries: true });
        expect(colors.bar("columnValues:A", 1)).toBe("#252423");
        expect(colors.line("lineValues:P", null)).toBe("#252423");
    });
});
