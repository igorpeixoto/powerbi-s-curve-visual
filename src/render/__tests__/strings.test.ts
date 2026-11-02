import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createStrings, defaultStrings, paneLocalization, resourceKey, type StringKey } from "../strings";

const root = resolve(__dirname, "../../..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf-8")) as Record<string, string>;
const enUS = readJson("stringResources/en-US/resources.resjson");
const ptBR = readJson("stringResources/pt-BR/resources.resjson");
const defaults = defaultStrings as Record<string, string>;
const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort();

describe("stringResources", () => {
    it("en-US matches the defaults exactly", () => {
        const expected = Object.fromEntries(Object.entries(defaults).map(([key, text]) => [`Visual_${key}`, text]));
        expect(enUS).toEqual(expected);
    });

    it("pt-BR has the same keys as en-US, with the same placeholders and no empty text", () => {
        expect(Object.keys(ptBR).sort()).toEqual(Object.keys(enUS).sort());
        for (const [key, text] of Object.entries(ptBR)) {
            expect(text.trim(), key).not.toBe("");
            expect(placeholders(text), key).toEqual(placeholders(enUS[key]));
        }
    });

    it("every other locale folder is empty: it exists only to ship that locale's number and date formats", () => {
        const others = readdirSync(join(root, "stringResources")).filter((locale) => locale !== "en-US" && locale !== "pt-BR");
        expect(others.length).toBe(20);
        for (const locale of others) expect(readJson(`stringResources/${locale}/resources.resjson`), locale).toEqual({});
    });

    it("keeps the leading space of suffixes in every language", () => {
        for (const key of ["Visual_cumulativeSuffix", "Visual_highlightedSuffix"]) {
            expect(ptBR[key].startsWith(" "), key).toBe(true);
        }
    });

    it("every data role in capabilities.json has keys that exist", () => {
        const capabilities = JSON.parse(readFileSync(join(root, "capabilities.json"), "utf-8")) as { dataRoles: { name: string; displayNameKey?: string; description?: string; descriptionKey?: string }[] };
        for (const role of capabilities.dataRoles) {
            expect(enUS[role.displayNameKey ?? ""], role.name).toBeDefined();
            if (role.description) expect(enUS[role.descriptionKey ?? ""], role.name).toBeDefined();
        }
    });

    it("has no string that nothing uses", () => {
        const sources = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
            if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(join(dir, entry.name));
            return entry.name.endsWith(".ts") && entry.name !== "strings.ts" ? [readFileSync(join(root, dir, entry.name), "utf-8")] : [];
        });
        const code = [...sources("src"), readFileSync(join(root, "capabilities.json"), "utf-8")].join("\n");
        const unused = Object.keys(defaults).filter((key) => !code.includes(`"${key}"`) && !code.includes(`"Visual_${key}"`));
        expect(unused).toEqual([]);
    });
});

describe("createStrings", () => {
    it("uses the host's text, and en-US when the host returns the key or nothing", () => {
        expect(createStrings({ getDisplayName: () => "Matriz" })("paneMatrix")).toBe("Matriz");
        expect(createStrings({ getDisplayName: (key) => key })("paneMatrix")).toBe("Matrix");
        expect(createStrings({ getDisplayName: () => "" })("paneMatrix")).toBe("Matrix");
        expect(createStrings()("paneMatrix")).toBe("Matrix");
    });

    it("falls back to en-US when the host throws", () => {
        const throwing = { getDisplayName: () => { throw new Error("no localization"); } };
        expect(createStrings(throwing)("paneMatrix")).toBe("Matrix");
    });

    it("fills arguments, keeping special characters in a measure name literal", () => {
        const strings = createStrings();
        expect(strings("instanceColor", "Planned")).toBe("Planned · Color");
        expect(strings("instanceColor", "Cost $& more $1")).toBe("Cost $& more $1 · Color");
    });
});

describe("paneLocalization", () => {
    it("resolves the library's resource keys through the same lookup", () => {
        const pane = paneLocalization(createStrings({ getDisplayName: (key) => (key === "Visual_paneMatrix" ? "Matriz" : key) }));
        expect(pane.getDisplayName(resourceKey("paneMatrix" as StringKey))).toBe("Matriz");
        expect(pane.getDisplayName(resourceKey("paneLegend"))).toBe("Legend");
    });
});
