// Style presets (SPEC §9.2). Base defaults are the Classic look, so Classic overrides nothing; the other presets
// override only the properties listed. Keys are `card.property`; values are in the property's saved form.

export type StylePreset = "classic" | "weeklyProgress" | "minimal";

export const STYLE_PRESETS: readonly StylePreset[] = ["classic", "weeklyProgress", "minimal"];

/** Marker for "a lighter tint of the theme's gridline colour", resolved by the renderer, never shown as a token. */
export const THEME_LIGHT_TINT = "themeLightTint";

export const presetOverrides: Record<StylePreset, Readonly<Record<string, unknown>>> = {
    classic: {},
    weeklyProgress: {
        "general.bucketGap": 10,
        "lines.strokeWidth": 1,
        "lines.lineOpacity": 50,
        "dataLabels.columnLabelsShow": true,
        "dataLabels.lineLabelsShow": false,
        "matrix.showMatrix": false,
    },
    minimal: {
        "columns.showColumns": false,
        "dataLabels.lineLabelsShow": false,
        "leftAxis.gridlineStyle": "solid",
        "leftAxis.gridlineColor": THEME_LIGHT_TINT,
        "matrix.showMatrix": false,
        "legend.legendPosition": "bottom",
    },
};

export function isStylePreset(value: unknown): value is StylePreset {
    return typeof value === "string" && (STYLE_PRESETS as readonly string[]).includes(value);
}
