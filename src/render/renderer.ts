// Owns the visual's DOM. Each update rebuilds the scene and redraws; the only listener (the horizontal
// scrollbar) is attached once here, so nothing accumulates across updates.
import { select, type Selection } from "d3";
import type powerbi from "powerbi-visuals-api";

import { buildModel } from "../model/buildModel";
import { classifyEmptyState, type EmptyStateKind } from "../model/emptyState";
import { drawChart } from "./chart";
import type { PaletteLike } from "./colors";
import { themeColors } from "./colors";
import { Formatters } from "./format";
import { drawLegend } from "./legendView";
import { drawMatrix } from "./matrixView";
import { createTextMeasurer, measureScrollbarSize, type TextMeasurer } from "./measure";
import { ptToPx, type RenderOptions } from "./options";
import { buildScene, type Scene } from "./scene";
import { createStrings, type LocalizationManagerLike, type StringKey, type Strings } from "./strings";

export interface RendererHost {
    colorPalette: PaletteLike;
    locale: string;
    localizationManager?: LocalizationManagerLike;
    displayWarningIcon?(hoverText: string, detailedText: string): void;
}

const EMPTY_MESSAGES: Record<EmptyStateKind, StringKey> = {
    landing: "landingBody",
    missingBuckets: "missingBuckets",
    missingMeasures: "missingMeasures",
    dateHierarchy: "dateHierarchy",
    noRows: "noRows",
};

let instanceCounter = 0;

export class Renderer {
    private readonly root: Selection<HTMLDivElement, unknown, null, undefined>;
    private readonly legend: Selection<SVGSVGElement, unknown, null, undefined>;
    private readonly chart: Selection<SVGSVGElement, unknown, null, undefined>;
    private readonly matrix: Selection<HTMLDivElement, unknown, null, undefined>;
    private readonly scrollbar: Selection<HTMLDivElement, unknown, null, undefined>;
    private readonly spacer: Selection<HTMLDivElement, unknown, null, undefined>;
    private readonly message: Selection<HTMLDivElement, unknown, null, undefined>;
    private readonly note: Selection<HTMLDivElement, unknown, null, undefined>;
    private readonly strings: Strings;
    private readonly formatters: Formatters;
    private readonly scrollbarSize: number;
    private readonly ids: { chartClip: string; matrixClip: string };
    private measure: TextMeasurer | null = null;
    private measureFont = "";
    private scrolled: Selection<SVGGElement, unknown, null, undefined>[] = [];
    private scrollX = 0;
    private plotLeft = 0;
    private scene: Scene | null = null;
    private scrollListener: (() => void) | null = null;

    constructor(element: HTMLElement, private readonly host: RendererHost) {
        instanceCounter += 1;
        this.ids = { chartClip: `s-curve-chart-clip-${instanceCounter}`, matrixClip: `s-curve-matrix-clip-${instanceCounter}` };
        this.strings = createStrings(host.localizationManager);
        this.formatters = new Formatters(host.locale);
        this.scrollbarSize = measureScrollbarSize();

        this.root = select(element).append("div").attr("class", "s-curve");
        this.legend = this.root.append("svg").attr("class", "s-curve__legend");
        this.chart = this.root.append("svg").attr("class", "s-curve__chart");
        this.matrix = this.root.append("div").attr("class", "s-curve__matrix");
        this.scrollbar = this.root.append("div").attr("class", "s-curve__scrollbar");
        this.spacer = this.scrollbar.append("div").attr("class", "s-curve__scrollbar-spacer");
        this.note = this.root.append("div").attr("class", "s-curve__note");
        this.message = this.root.append("div").attr("class", "s-curve__message");

        this.scrollbar.on("scroll", () => {
            this.scrollX = (this.scrollbar.node() as HTMLDivElement).scrollLeft;
            this.applyScroll();
            this.scrollListener?.();
        });
    }

    /** The visual's root element, for delegated event listeners. */
    get element(): HTMLDivElement {
        return this.root.node() as HTMLDivElement;
    }

    /** Called after every horizontal scroll (e.g. to move the keyboard focus ring). */
    onScroll(listener: () => void): void {
        this.scrollListener = listener;
    }

    /** Scrolls horizontally just enough to show a bucket. */
    scrollToBucket(index: number): void {
        const geometry = this.scene?.layout.geometry;
        const bucket = geometry?.buckets[index];
        if (!geometry || !bucket || !geometry.scrollable) return;
        let next = this.scrollX;
        if (bucket.x0 < next) next = bucket.x0;
        if (bucket.x1 > next + geometry.plotWidth) next = bucket.x1 - geometry.plotWidth;
        if (next !== this.scrollX) {
            this.scrollX = next;
            (this.scrollbar.node() as HTMLDivElement).scrollLeft = next;
            this.applyScroll();
        }
    }

    get horizontalScroll(): number {
        return this.scrollX;
    }

    /** Draws the visual and returns the scene, or null when an empty state or a message is shown instead. */
    render(dataView: powerbi.DataView | undefined, viewport: powerbi.IViewport, options: RenderOptions): Scene | null {
        const width = Math.max(0, viewport.width);
        const height = Math.max(0, viewport.height);
        this.root.style("width", `${width}px`).style("height", `${height}px`).style("font-family", options.fontFamily);
        if (!this.measure || this.measureFont !== options.fontFamily) {
            this.measure = createTextMeasurer(options.fontFamily);
            this.measureFont = options.fontFamily;
        }

        const model = buildModel(dataView, options.model);
        this.reportWarnings(model.warnings);
        const theme = themeColors(this.host.colorPalette);
        this.root.style("color", theme.text);

        const empty = classifyEmptyState(model);
        if (empty) {
            this.showMessage(empty === "landing" ? this.strings("landingTitle") : null, this.strings(EMPTY_MESSAGES[empty]), empty);
            return null;
        }

        const scene = buildScene({
            model,
            options,
            viewport: { width, height },
            palette: this.host.colorPalette,
            formatters: this.formatters,
            measure: this.measure,
            strings: this.strings,
            scrollbarSize: this.scrollbarSize,
        });
        if (scene.layout.tooSmall) {
            this.showMessage(null, this.strings("tooSmall"), "tooSmall");
            return null;
        }
        this.draw(scene);
        return scene;
    }

    private draw(scene: Scene): void {
        const { layout } = scene;
        this.scene = scene;
        this.message.style("display", "none");
        this.chart.style("display", null);

        const maxScroll = Math.max(0, layout.geometry.contentWidth - layout.geometry.plotWidth);
        this.scrollX = Math.min(this.scrollX, maxScroll);
        this.plotLeft = layout.geometry.plotLeft;

        drawLegend(this.legend, scene);
        const chart = drawChart(this.chart, scene, this.ids.chartClip, this.scrollX);
        const matrix = drawMatrix(this.matrix, scene, this.ids.matrixClip, this.scrollX, this.scrollbarSize);
        this.scrolled = [...chart.scrolled, ...matrix.scrolled];

        if (layout.xScrollbar) {
            this.scrollbar.style("display", null)
                .style("left", `${layout.xScrollbar.x}px`).style("top", `${layout.xScrollbar.y}px`)
                .style("width", `${layout.xScrollbar.width}px`).style("height", `${layout.xScrollbar.height}px`);
            this.spacer.style("width", `${layout.geometry.contentWidth}px`);
            (this.scrollbar.node() as HTMLDivElement).scrollLeft = this.scrollX;
        } else {
            this.scrollbar.style("display", "none");
            this.scrollX = 0;
        }

        this.note.style("display", layout.matrixHiddenForSpace ? "block" : "none");
        if (layout.matrixHiddenForSpace) {
            this.note.text(this.strings("matrixHidden"))
                .style("color", scene.theme.secondaryText)
                .style("font-size", `${ptToPx(scene.options.matrix.fontSize)}px`);
        }
    }

    private applyScroll(): void {
        for (const group of this.scrolled) {
            group.attr("transform", `translate(${this.plotLeft - this.scrollX},0)`);
        }
    }

    private showMessage(title: string | null, body: string, kind: string): void {
        this.scene = null;
        this.legend.style("display", "none");
        this.chart.style("display", "none");
        this.matrix.style("display", "none");
        this.scrollbar.style("display", "none");
        this.note.style("display", "none");
        this.scrolled = [];
        this.message.style("display", null).attr("data-state", kind).selectAll("*").remove();
        if (title) this.message.append("div").attr("class", "s-curve__message-title").text(title);
        this.message.append("div").attr("class", "s-curve__message-body").text(body);
    }

    private reportWarnings(warnings: ReturnType<typeof buildModel>["warnings"]): void {
        const details: string[] = [];
        if (warnings.dataReduced) details.push(this.strings("warningReduced"));
        if (warnings.excludedDateRows > 0) details.push(this.strings("warningExcludedDates", warnings.excludedDateRows));
        if (warnings.emptyWeeksSkipped) details.push(this.strings("warningEmptyWeeks"));
        if (warnings.percentBaselineMissing) details.push(this.strings("warningPercentBaseline"));
        if (details.length) this.host.displayWarningIcon?.(this.strings("warningTitle"), details.join(" "));
    }
}
