import type { BaseType, Selection } from "d3";

import { PLAIN_FONT, ptToPx, type TextFont } from "./options";

export type TextMeasurer = (text: string, fontSizePt: number, font?: TextFont) => number;

/** Draws text in a section's font; what a section doesn't set is inherited from the visual's root. */
export function applyFont<E extends BaseType, D, P extends BaseType, PD>(selection: Selection<E, D, P, PD>, font: TextFont): void {
    selection
        .style("font-family", () => font.family)
        .style("font-weight", () => (font.bold ? "600" : null))
        .style("font-style", () => (font.italic ? "italic" : null))
        .style("text-decoration", () => (font.underline ? "underline" : null));
}

/** Measures text width with an offscreen canvas (no layout reflow), cached per font and string. */
export function createTextMeasurer(fontFamily: string): TextMeasurer {
    const context = document.createElement("canvas").getContext("2d");
    const cache = new Map<string, number>();
    return (text, fontSizePt, textFont = PLAIN_FONT) => {
        const font = `${textFont.italic ? "italic " : ""}${textFont.bold ? "600 " : ""}${ptToPx(fontSizePt)}px ${textFont.family ?? fontFamily}`;
        const key = `${font}|${text}`;
        let width = cache.get(key);
        if (width === undefined) {
            if (context) {
                context.font = font;
                width = context.measureText(text).width;
            } else {
                width = text.length * ptToPx(fontSizePt) * 0.55;
            }
            cache.set(key, width);
        }
        return width;
    };
}

/** Width of a native scrollbar here (0 with overlay scrollbars), measured once. */
export function measureScrollbarSize(): number {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden";
    document.body.appendChild(probe);
    const size = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return size;
}

/** Shortens text with an ellipsis to fit maxWidth; empty when not even the ellipsis fits. */
export function truncate(text: string, maxWidth: number, measure: (t: string) => number): string {
    if (measure(text) <= maxWidth) return text;
    const ellipsis = "…";
    if (measure(ellipsis) > maxWidth) return "";
    let low = 0;
    let high = text.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (measure(text.slice(0, mid) + ellipsis) <= maxWidth) low = mid;
        else high = mid - 1;
    }
    return text.slice(0, low) + ellipsis;
}
