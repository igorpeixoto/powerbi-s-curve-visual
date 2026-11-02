// Selection, cross-filtering, tooltips, the context menu and keyboard navigation (SPEC §7). Listeners are delegated
// on the root and attached once; each update only swaps the scene they read, so nothing accumulates (Hard Rule #7).
// Power BI doesn't call update() after the visual's own select(), so emphasis is applied in the handlers too.
import type powerbi from "powerbi-visuals-api";

import { buildIdentities, type Identities } from "../model/identity";
import type { MatrixRow } from "../model/matrix";
import { HIGHLIGHT_BACKGROUND_OPACITY } from "../render/chart";
import type { Scene } from "../render/scene";
import { buildFocusRows, moveFocus, type Focus, type FocusRow, type NavigationKey } from "./navigation";
import { emphasisOf, isLocalOnly, nextSelection, pruneSelection, selectorKey, type Emphasis, type Selector } from "./selectionState";
import { tooltipItems, type TooltipMark } from "./tooltipItems";

type SelectionId = powerbi.visuals.ISelectionId;

export interface InteractivityHost {
    selectionManager: powerbi.extensibility.ISelectionManager;
    tooltipService: powerbi.extensibility.ITooltipService;
    createSelectionIdBuilder(): powerbi.visuals.ISelectionIdBuilder;
    allowInteractions(): boolean;
}

export interface RendererHooks {
    element: HTMLElement;
    onScroll(listener: () => void): void;
    scrollToBucket(index: number): void;
    readonly horizontalScroll: number;
}

/** What a DOM element stands for, read from its data attributes. */
type Mark =
    | { kind: "bar" | "point"; bucket: number; measureKey: string; seriesIndex: number | null }
    | { kind: "line"; measureKey: string; seriesIndex: number | null }
    | { kind: "label"; bucket: number }
    | { kind: "cell"; bucket: number; row: number }
    | { kind: "rowHeader"; row: number }
    | { kind: "legend"; measureKey: string; seriesIndex: number | null };

const MARK_SELECTOR = [
    '[data-role="bar"]', '[data-role="bar-highlight"]', '[data-role="point"]', '[data-role="line"]', '[data-role="line-highlight"]',
    '[data-role="x-label"]', '[data-role="cell"]', '[data-role="row-header"]', '[data-role="legend-item"]',
].join(",");

const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

function numberAttr(element: Element, name: string): number | null {
    const value = element.getAttribute(name);
    return value === null || value === "" ? null : Number(value);
}

function readMark(element: Element): Mark | null {
    const role = element.getAttribute("data-role");
    const bucket = numberAttr(element, "data-bucket");
    const seriesIndex = numberAttr(element, "data-series");
    const measureKey = element.getAttribute("data-measure") ?? "";
    switch (role) {
        case "bar":
        case "bar-highlight":
            return bucket === null ? null : { kind: "bar", bucket, measureKey, seriesIndex };
        case "point":
            return bucket === null ? null : { kind: "point", bucket, measureKey, seriesIndex };
        case "line":
        case "line-highlight":
            return { kind: "line", measureKey, seriesIndex };
        case "x-label":
            return bucket === null ? null : { kind: "label", bucket };
        case "cell": {
            const row = numberAttr(element, "data-row");
            return bucket === null || row === null ? null : { kind: "cell", bucket, row };
        }
        case "row-header": {
            const row = numberAttr(element, "data-row");
            return row === null ? null : { kind: "rowHeader", row };
        }
        case "legend-item":
            return { kind: "legend", measureKey, seriesIndex };
        default:
            return null;
    }
}

export class Interactivity {
    private scene: Scene | null = null;
    private identities: Identities<SelectionId> | null = null;
    private selected: Selector[] = [];
    private focus: Focus | null = null;
    private focusRows: FocusRow[] = [];
    private tooltipTarget: Element | null = null;
    private readonly root: HTMLElement;
    private readonly ring: HTMLDivElement;
    private readonly live: HTMLDivElement;

    constructor(private readonly host: InteractivityHost, private readonly renderer: RendererHooks) {
        this.root = renderer.element;
        this.root.tabIndex = 0;
        this.root.setAttribute("role", "application");
        this.ring = this.root.appendChild(document.createElement("div"));
        this.ring.className = "s-curve__focus-ring";
        this.ring.style.display = "none";
        this.live = this.root.appendChild(document.createElement("div"));
        this.live.className = "s-curve__live";
        this.live.setAttribute("aria-live", "polite");

        this.root.addEventListener("click", (e) => this.onClick(e));
        this.root.addEventListener("contextmenu", (e) => this.onContextMenu(e));
        this.root.addEventListener("mousemove", (e) => this.onPointerMove(e));
        this.root.addEventListener("mouseleave", () => this.hideTooltip());
        this.root.addEventListener("keydown", (e) => this.onKeyDown(e));
        renderer.onScroll(() => this.drawFocusRing());
        host.selectionManager.registerOnSelectCallback((ids) => this.restore(ids as SelectionId[]));
    }

    /** Called after every render; scene is null while an empty state or message is shown. */
    update(scene: Scene | null, dataView: powerbi.DataView | undefined): void {
        this.scene = scene;
        this.hideTooltip();
        if (!scene) {
            this.identities = null;
            this.focusRows = [];
            this.ring.style.display = "none";
            return;
        }
        this.identities = buildIdentities(dataView, scene.model, () => this.host.createSelectionIdBuilder());
        const model = scene.model;
        this.selected = pruneSelection(this.selected, {
            buckets: new Set(model.buckets.map((b) => b.key)),
            series: new Set(model.series.map((s) => s.key)),
            measures: new Set(model.measures.map((m) => m.key)),
        });
        this.focusRows = buildFocusRows({
            columnMeasureKeys: scene.columnMeasures.map((m) => m.key),
            seriesCount: model.series.length,
            hasSeries: model.hasSeries,
            lines: scene.options.lines.show ? model.lines : [],
            matrixRowCount: scene.matrixRows.length,
        });
        this.applyAccessibleLabels();
        this.applyEmphasis();
        this.drawFocusRing();
    }

    // ----- mapping marks to selectors, identities and tooltips -----

    private bucketKey(index: number): string | null {
        return this.scene?.model.buckets[index]?.key ?? null;
    }

    private seriesKey(index: number | null): string | null {
        return index === null ? null : this.scene?.model.series[index]?.key ?? null;
    }

    private matrixRow(index: number): MatrixRow | undefined {
        return this.scene?.matrixRows[index];
    }

    private selectorFor(mark: Mark): Selector | null {
        switch (mark.kind) {
            case "bar":
            case "point":
                return { bucket: this.bucketKey(mark.bucket), series: this.seriesKey(mark.seriesIndex), measure: mark.measureKey };
            case "line":
            case "legend":
                return { bucket: null, series: this.seriesKey(mark.seriesIndex), measure: mark.measureKey };
            case "label":
                return { bucket: this.bucketKey(mark.bucket), series: null, measure: null };
            case "cell": {
                const row = this.matrixRow(mark.row);
                return row ? { bucket: this.bucketKey(mark.bucket), series: this.seriesKey(row.seriesIndex), measure: row.measureKey } : null;
            }
            case "rowHeader": {
                const row = this.matrixRow(mark.row);
                return row ? { bucket: null, series: this.seriesKey(row.seriesIndex), measure: row.measureKey } : null;
            }
        }
    }

    /** Host identities for a selector; none for measure-only selections, which stay inside the visual. */
    private identitiesFor(selector: Selector): SelectionId[] {
        const model = this.scene?.model;
        const ids = this.identities;
        if (!model || !ids || isLocalOnly(selector)) return [];
        const seriesIndex = selector.series === null ? null : model.series.findIndex((s) => s.key === selector.series);
        if (selector.bucket === null) {
            return seriesIndex === null || seriesIndex < 0 ? [] : [ids.series[seriesIndex]];
        }
        const bucketIndex = model.buckets.findIndex((b) => b.key === selector.bucket);
        if (bucketIndex < 0) return [];
        if (selector.measure === null) return ids.buckets[bucketIndex];
        return ids.point(selector.measure, seriesIndex, bucketIndex);
    }

    private tooltipMarkFor(mark: Mark): TooltipMark | null {
        if (mark.kind === "bar" || mark.kind === "point") return mark;
        if (mark.kind === "cell") {
            const row = this.matrixRow(mark.row);
            return row ? { kind: "cell", bucket: mark.bucket, row } : null;
        }
        return null;
    }

    private tooltipContext() {
        const scene = this.scene as Scene;
        return {
            model: scene.model,
            bucketLabels: scene.bucketTitles,
            cumulativeSuffix: scene.cumulativeSuffix,
            highlightedSuffix: scene.strings("highlightedSuffix"),
            blankLabel: scene.strings("blank"),
            formatValue: scene.formatValue,
            formatRaw: scene.formatRaw,
            color: (m: TooltipMark) => (m.kind === "bar" ? scene.colors.bar(m.measureKey, m.seriesIndex)
                : m.kind === "point" ? scene.colors.line(m.measureKey, m.seriesIndex) : undefined),
        };
    }

    private markAt(target: EventTarget | null): { element: Element; mark: Mark } | null {
        const element = target instanceof Element ? target.closest(MARK_SELECTOR) : null;
        if (!element || !this.root.contains(element)) return null;
        const mark = readMark(element);
        return mark ? { element, mark } : null;
    }

    // ----- selection -----

    private select(selector: Selector | null, multi: boolean): void {
        this.selected = selector ? nextSelection(this.selected, selector, multi) : [];
        const ids = this.selected.flatMap((s) => this.identitiesFor(s));
        if (ids.length) {
            void this.host.selectionManager.select(ids, false);
        } else {
            void this.host.selectionManager.clear();
        }
        this.applyEmphasis();
    }

    private restore(ids: SelectionId[]): void {
        const scene = this.scene;
        const identities = this.identities;
        if (!scene || !identities) return;
        const key = (id: SelectionId) => (typeof id.getKey === "function" ? id.getKey() : JSON.stringify(id.getSelector()));
        const wanted = new Set(ids.map(key));
        const found = new Map<string, Selector>();
        const offer = (id: SelectionId | undefined, selector: Selector) => {
            if (id && wanted.has(key(id))) found.set(selectorKey(selector), selector);
        };
        const model = scene.model;
        model.buckets.forEach((bucket, b) => identities.buckets[b].forEach((id) => offer(id, { bucket: bucket.key, series: null, measure: null })));
        model.series.forEach((series, s) => offer(identities.series[s], { bucket: null, series: series.key, measure: null }));
        // A measure bound to both wells is one host column, so its bar and line point share an identity;
        // a restored point selection can't tell them apart and maps to whichever is offered last.
        const marks = [
            ...scene.bars.segments.map((s) => ({ measureKey: s.measureKey, seriesIndex: s.seriesIndex, bucket: s.bucketIndex })),
            ...model.lines.flatMap((line) => line.values.map((_, b) => ({ measureKey: line.measureKey, seriesIndex: line.seriesIndex, bucket: b }))),
        ];
        for (const m of marks) {
            const selector = { bucket: model.buckets[m.bucket].key, series: this.seriesKey(m.seriesIndex), measure: m.measureKey };
            identities.point(m.measureKey, m.seriesIndex, m.bucket).forEach((id) => offer(id, selector));
        }
        this.selected = [...found.values()];
        this.applyEmphasis();
    }

    // ----- emphasis -----

    private markSelector(element: Element): { selector: Selector; ignoreBucket: boolean } | null {
        const mark = readMark(element);
        if (!mark) return null;
        const selector = this.selectorFor(mark);
        if (!selector) return null;
        const ignoreBucket = mark.kind === "line" || mark.kind === "legend" || mark.kind === "rowHeader";
        return { selector, ignoreBucket };
    }

    private applyEmphasis(): void {
        const scene = this.scene;
        if (!scene) return;
        const interactive = this.host.allowInteractions();
        const selected = interactive ? this.selected : [];
        const markers = scene.options.lines.showMarkers || scene.highContrast;
        const emphasis = (element: Element): Emphasis => {
            const target = this.markSelector(element);
            return target ? emphasisOf(selected, target.selector, { ignoreBucket: target.ignoreBucket }) : "normal";
        };
        const setOpacity = (element: Element, state: Emphasis) => {
            if (scene.highContrast) return;
            element.setAttribute("opacity", state === "dimmed" ? String(HIGHLIGHT_BACKGROUND_OPACITY) : "1");
        };

        this.root.querySelectorAll('[data-role="bar"],[data-role="bar-highlight"],[data-role="line"],[data-role="line-highlight"],[data-role="legend-item"],[data-role="row-header"]')
            .forEach((element) => {
                const state = emphasis(element);
                setOpacity(element, state);
                if (scene.highContrast && element.getAttribute("data-role")?.startsWith("bar")) {
                    element.setAttribute("stroke-width", state === "selected" ? "3" : "1.5");
                    if (state === "selected") element.setAttribute("stroke", scene.theme.selected);
                }
            });
        this.root.querySelectorAll('[data-role="point"]').forEach((element) => {
            const state = emphasis(element);
            // With markers off, a selected point becomes visible so the selection can be seen on the line.
            if (!markers) element.setAttribute("fill-opacity", state === "selected" && selected.length ? "1" : "0");
            else setOpacity(element, state);
            if (scene.highContrast) element.setAttribute("fill", state === "selected" ? scene.theme.selected : scene.theme.text);
        });
        this.root.querySelectorAll('[data-role="cell"]').forEach((cell) => {
            const state = emphasis(cell);
            const text = this.root.querySelector(`[data-role="cell-text"][data-bucket="${cell.getAttribute("data-bucket")}"][data-row="${cell.getAttribute("data-row")}"]`);
            if (text) {
                setOpacity(text, state);
                if (scene.highContrast) text.setAttribute("fill", state === "selected" ? scene.theme.selected : scene.theme.text);
            }
        });
    }

    private applyAccessibleLabels(): void {
        if (!this.scene) return;
        const context = this.tooltipContext();
        this.root.querySelectorAll('[data-role="bar"],[data-role="point"],[data-role="cell"]').forEach((element) => {
            const mark = readMark(element);
            const tooltipMark = mark ? this.tooltipMarkFor(mark) : null;
            if (!tooltipMark) return;
            const items = tooltipItems(context, tooltipMark);
            const label = [items[0]?.header, ...items.map((i) => (i.displayName ? `${i.displayName} ${i.value}` : i.value))].filter(Boolean).join(", ");
            element.setAttribute("aria-label", label);
        });
    }

    // ----- event handlers -----

    private onClick(event: MouseEvent): void {
        if (!this.scene || !this.host.allowInteractions()) return;
        const hit = this.markAt(event.target);
        this.select(hit ? this.selectorFor(hit.mark) : null, event.ctrlKey || event.metaKey);
    }

    private onContextMenu(event: MouseEvent): void {
        if (!this.scene || !this.host.allowInteractions()) return;
        event.preventDefault();
        const hit = this.markAt(event.target);
        const selector = hit ? this.selectorFor(hit.mark) : null;
        const id = selector ? this.identitiesFor(selector)[0] : undefined;
        void this.host.selectionManager.showContextMenu(id ?? ({} as SelectionId), { x: event.clientX, y: event.clientY });
    }

    private onPointerMove(event: MouseEvent): void {
        if (!this.scene || !this.host.allowInteractions() || !this.host.tooltipService.enabled()) return;
        const hit = this.markAt(event.target);
        const tooltipMark = hit ? this.tooltipMarkFor(hit.mark) : null;
        if (!hit || !tooltipMark) {
            this.hideTooltip();
            return;
        }
        const selector = this.selectorFor(hit.mark);
        const options = {
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false,
            dataItems: tooltipItems(this.tooltipContext(), tooltipMark),
            identities: selector ? this.identitiesFor(selector) : [],
        };
        if (this.tooltipTarget === hit.element) {
            this.host.tooltipService.move(options);
        } else {
            this.tooltipTarget = hit.element;
            this.host.tooltipService.show(options);
        }
    }

    private hideTooltip(): void {
        if (!this.tooltipTarget) return;
        this.tooltipTarget = null;
        this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
    }

    private onKeyDown(event: KeyboardEvent): void {
        const scene = this.scene;
        if (!scene) return;
        if (NAVIGATION_KEYS.has(event.key)) {
            event.preventDefault();
            this.focus = moveFocus(this.focus, event.key as NavigationKey, this.focusRows.length, scene.model.buckets.length);
            if (this.focus) this.renderer.scrollToBucket(this.focus.bucket);
            this.drawFocusRing();
            this.announce();
            return;
        }
        // Esc is left to the host, which moves focus back to the visual container (SPEC §7.4).
        if ((event.key === "Enter" || event.key === " ") && this.focus && this.host.allowInteractions()) {
            event.preventDefault();
            const element = this.focusedElement();
            const mark = element ? readMark(element) : null;
            const selector = mark ? this.selectorFor(mark) : this.focusedSelector();
            if (selector) this.select(selector, event.ctrlKey || event.metaKey);
        }
    }

    // ----- keyboard focus -----

    private focusedSelector(): Selector | null {
        const row = this.focus ? this.focusRows[this.focus.row] : undefined;
        if (!row || !this.focus) return null;
        const bucket = this.bucketKey(this.focus.bucket);
        if (row.kind === "cell") {
            const matrixRow = this.matrixRow(row.matrixRow);
            return matrixRow ? { bucket, series: this.seriesKey(matrixRow.seriesIndex), measure: matrixRow.measureKey } : null;
        }
        return { bucket, series: this.seriesKey(row.seriesIndex), measure: row.measureKey };
    }

    private focusedElement(): Element | null {
        const row = this.focus ? this.focusRows[this.focus.row] : undefined;
        if (!row || !this.focus) return null;
        const bucket = this.focus.bucket;
        if (row.kind === "cell") {
            return this.root.querySelector(`[data-role="cell"][data-bucket="${bucket}"][data-row="${row.matrixRow}"]`);
        }
        const role = row.kind === "bar" ? "bar" : "point";
        const series = row.seriesIndex === null ? ":not([data-series])" : `[data-series="${row.seriesIndex}"]`;
        return this.root.querySelector(`[data-role="${role}"][data-bucket="${bucket}"][data-measure="${CSS.escape(row.measureKey)}"]${series}`);
    }

    private drawFocusRing(): void {
        const scene = this.scene;
        if (!scene || !this.focus) {
            this.ring.style.display = "none";
            return;
        }
        const row = this.focusRows[this.focus.row];
        const element = this.focusedElement();
        if (row?.kind === "cell" && element) this.scrollMatrixRowIntoView(row.matrixRow);
        const rootRect = this.root.getBoundingClientRect();
        let rect: { left: number; top: number; width: number; height: number };
        if (element) {
            const r = element.getBoundingClientRect();
            rect = { left: r.left - rootRect.left, top: r.top - rootRect.top, width: r.width, height: r.height };
        } else {
            // No mark (null value): outline the bucket's band across the plot.
            const bucket = scene.layout.geometry.buckets[this.focus.bucket];
            const scrollX = this.renderer.horizontalScroll;
            rect = {
                left: scene.layout.block.x + scene.layout.geometry.plotLeft + bucket.bandStart - scrollX,
                top: scene.layout.block.y + scene.layout.plotTop,
                width: bucket.bandWidth,
                height: scene.layout.plotBottom - scene.layout.plotTop,
            };
        }
        const pad = 2;
        Object.assign(this.ring.style, {
            display: "block",
            left: `${rect.left - pad}px`,
            top: `${rect.top - pad}px`,
            width: `${Math.max(rect.width, 4) + 2 * pad}px`,
            height: `${Math.max(rect.height, 4) + 2 * pad}px`,
            color: scene.highContrast ? scene.theme.selected : scene.theme.text,
        });
    }

    private scrollMatrixRowIntoView(rowIndex: number): void {
        const body = this.root.querySelector(".s-curve__matrix-body");
        const scene = this.scene;
        if (!body || !scene) return;
        const rowHeight = scene.options.matrix.rowHeight;
        const top = rowIndex * rowHeight;
        if (top < body.scrollTop) body.scrollTop = top;
        else if (top + rowHeight > body.scrollTop + body.clientHeight) body.scrollTop = top + rowHeight - body.clientHeight;
    }

    private announce(): void {
        const element = this.focusedElement();
        this.live.textContent = element?.getAttribute("aria-label") ?? this.scene?.bucketTitles[this.focus?.bucket ?? 0] ?? "";
    }
}
