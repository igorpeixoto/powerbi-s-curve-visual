import { describe, expect, it } from "vitest";

import { presetOverrides, THEME_LIGHT_TINT } from "../presets";
import { isExplicit, presetOf, resolveSetting } from "../resolve";

describe("presetOf", () => {
    it("reads the saved preset and defaults to Classic", () => {
        expect(presetOf(undefined)).toBe("classic");
        expect(presetOf({ general: { stylePreset: "minimal" } })).toBe("minimal");
        expect(presetOf({ general: { stylePreset: "retired-preset" } })).toBe("classic");
    });
});

describe("resolveSetting", () => {
    it("uses the base default when nothing is saved and the preset doesn't override it", () => {
        expect(resolveSetting(undefined, "matrix", "showMatrix", true)).toEqual({ value: true, source: "base" });
    });

    it("lets the preset override the base", () => {
        expect(resolveSetting({ general: { stylePreset: "weeklyProgress" } }, "matrix", "showMatrix", true))
            .toEqual({ value: false, source: "preset" });
        expect(resolveSetting({ general: { stylePreset: "minimal" } }, "leftAxis", "gridlineColor", ""))
            .toEqual({ value: THEME_LIGHT_TINT, source: "preset" });
    });

    it("lets an explicit value beat the preset", () => {
        expect(resolveSetting({ general: { stylePreset: "minimal" }, matrix: { showMatrix: true } }, "matrix", "showMatrix", true))
            .toEqual({ value: true, source: "explicit" });
    });

    it("treats a saved false, 0 or empty string as explicit", () => {
        const objects = { general: { stylePreset: "weeklyProgress", bucketGap: 0 }, dataLabels: { columnLabelsShow: false }, leftAxis: { leftTitleText: "" } };
        expect(resolveSetting(objects, "general", "bucketGap", 20)).toEqual({ value: 0, source: "explicit" });
        expect(resolveSetting(objects, "dataLabels", "columnLabelsShow", false)).toEqual({ value: false, source: "explicit" });
        expect(resolveSetting(objects, "leftAxis", "leftTitleText", "x")).toEqual({ value: "", source: "explicit" });
    });

    it("counts a saved value equal to the base as explicit", () => {
        expect(resolveSetting({ general: { stylePreset: "minimal" }, legend: { legendPosition: "top" } }, "legend", "legendPosition", "top").source)
            .toBe("explicit");
    });

    it("falls back to the preset when the saved value is removed (reset to default) or cleared to null", () => {
        expect(resolveSetting({ general: { stylePreset: "minimal" }, legend: {} }, "legend", "legendPosition", "top"))
            .toEqual({ value: "bottom", source: "preset" });
        expect(resolveSetting({ general: { stylePreset: "minimal" }, legend: { legendPosition: null } }, "legend", "legendPosition", "top").source)
            .toBe("preset");
        expect(isExplicit({ leftAxis: { leftMin: null } }, "leftAxis", "leftMin")).toBe(false);
    });

    it("keeps explicit values when the preset changes", () => {
        const saved = { matrix: { showMatrix: true }, lines: { strokeWidth: 3 } };
        for (const preset of ["classic", "weeklyProgress", "minimal"]) {
            const objects = { ...saved, general: { stylePreset: preset } };
            expect(resolveSetting(objects, "matrix", "showMatrix", true)).toEqual({ value: true, source: "explicit" });
            expect(resolveSetting(objects, "lines", "strokeWidth", 2)).toEqual({ value: 3, source: "explicit" });
        }
    });

    it("keeps Classic identical to the base", () => {
        expect(Object.keys(presetOverrides.classic)).toEqual([]);
    });
});
