import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";
import globals from "globals";

const scoped = (configs, files) => configs.map((config) => ({ ...config, files }));

export default [
    {
        ignores: ["node_modules/**", "dist/**", ".tmp/**", ".api/**", ".vscode/**", "webpack.statistics.*"],
    },

    // The visual itself: the Power BI certification rules plus typescript-eslint's recommended set.
    ...scoped([powerbiVisualsConfigs.configs.recommended], ["src/**/*.ts"]),
    ...scoped(tsPlugin.configs["flat/recommended"], ["src/**/*.ts"]),

    // Node tooling (capability check, harness runner) and the browser-side harness page.
    // These run on a developer machine or CI, never inside Power BI, so the visual rules don't apply.
    {
        ...js.configs.recommended,
        files: ["tools/**/*.mjs", "*.mjs"],
        languageOptions: { sourceType: "module", globals: { ...globals.node } },
    },
    {
        ...js.configs.recommended,
        files: ["harness/**/*.mjs"],
        languageOptions: { sourceType: "module", globals: { ...globals.browser } },
    },
];
