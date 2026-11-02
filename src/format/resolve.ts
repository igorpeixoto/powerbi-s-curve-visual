// The resolution rule (SPEC §9.2): effective value = author's explicit value ?? preset default ?? base default.
// "Explicit" means the property is present in the saved formatting objects, whatever its value: a saved false, 0 or
// "" beats the preset. A saved null (a cleared field) counts as not set.
import { isStylePreset, presetOverrides, type StylePreset } from "./presets";

/** Saved formatting objects: `objects[card][property]`, as in dataView.metadata.objects. */
export type ObjectsLike = Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>> | undefined;

export type Source = "explicit" | "preset" | "base";

export interface Resolved<T = unknown> {
    value: T;
    source: Source;
}

export function isExplicit(objects: ObjectsLike, card: string, property: string): boolean {
    const value = objects?.[card]?.[property];
    return value !== undefined && value !== null;
}

/** The preset in effect: the saved one when it is a known preset, otherwise Classic. */
export function presetOf(objects: ObjectsLike): StylePreset {
    const saved = objects?.general?.stylePreset;
    return isStylePreset(saved) ? saved : "classic";
}

export function resolveSetting<T>(objects: ObjectsLike, card: string, property: string, base: T): Resolved<T | unknown> {
    if (isExplicit(objects, card, property)) {
        return { value: objects?.[card]?.[property], source: "explicit" };
    }
    const overrides = presetOverrides[presetOf(objects)];
    const key = `${card}.${property}`;
    if (key in overrides) {
        return { value: overrides[key], source: "preset" };
    }
    return { value: base, source: "base" };
}
