// Phase 5 checks (SPEC §9, §12): presets change what renders, explicit values beat presets, the Format pane model
// shows effective values with per-instance slices, and alignment holds while scrolled horizontally.
import { createMockHost } from "./mock-host.mjs";
import { progressDataView } from "./data.mjs";

const COLUMN_PLANNED = "columnValues:Sum(progress.PlannedQty)";
const LINE_PLANNED = "lineValues:Sum(progress.PlannedQty)";

function newContainer(width = 800, height = 500) {
    const container = document.createElement("div");
    container.style.cssText = `position:fixed;left:0;top:0;z-index:20;width:${width}px;height:${height}px;overflow:hidden;background:#fff`;
    document.body.appendChild(container);
    return container;
}

function render(visual, container, dataView, width = 800, height = 500) {
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    visual.update({ dataViews: dataView ? [dataView] : [], viewport: { width, height }, type: 2, viewMode: 0, editMode: 0 });
}

function centerX(elements) {
    const rects = [...elements].map((e) => e.getBoundingClientRect());
    if (rects.length === 0) return null;
    return (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2;
}

/** All nodes of the formatting model whose descriptor names `property`, with their values. */
function paneSlices(model, property) {
    const found = [];
    const walk = (node) => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === "object") {
            if (node.descriptor?.propertyName === property) found.push(node);
            Object.values(node).forEach(walk);
        }
    };
    walk(model);
    return found;
}

function alignmentSpread(container, buckets) {
    const q = (selector) => container.querySelectorAll(selector);
    const spreads = buckets.map((b) => {
        const values = [
            centerX(q(`[data-role="bar"][data-bucket="${b}"]`)),
            centerX(q(`[data-role="point"][data-bucket="${b}"][data-measure="${LINE_PLANNED}"]`)),
            centerX(q(`[data-role="x-label"][data-bucket="${b}"]`)),
            centerX(q(`[data-role="cell"][data-bucket="${b}"][data-row="0"]`)),
        ];
        return values.some((v) => v === null) ? Infinity : Math.max(...values) - Math.min(...values);
    });
    return Math.max(...spreads);
}

export function runFormatChecks(plugin, check) {
    const container = newContainer();
    const { host, calls } = createMockHost();
    const visual = plugin.create({ element: container, host });
    const q = (selector) => container.querySelector(selector);
    const qa = (selector) => [...container.querySelectorAll(selector)];
    const preset = (name, extra = {}) => ({ general: { stylePreset: name }, ...extra });

    // The pane renders before the first update, with nothing bound.
    const emptyModel = visual.getFormattingModel();
    check("builds the Format pane before any data arrives", emptyModel?.cards?.length === 9, `cards ${emptyModel?.cards?.length}`);

    // Classic (the base): columns, lines with end labels, matrix, legend on top.
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: preset("classic") }));
    check("Classic preset: columns, line end labels and matrix", qa('[data-role="bar"]').length > 0 && qa('[data-role="line-label"]').length === 2 && q(".s-curve__matrix-body") !== null);

    // Weekly progress: column labels, no line labels, no matrix, lighter lines.
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: preset("weeklyProgress") }));
    const weeklyLines = qa('[data-role="line"]');
    check("Weekly progress preset: column labels, no matrix, half-opacity thin lines",
        qa('[data-role="column-label"]').length > 0 && qa('[data-role="line-label"]').length === 0 && q(".s-curve__matrix-body") === null
            && weeklyLines.every((l) => l.getAttribute("stroke-opacity") === "0.5" && l.getAttribute("stroke-width") === "1"),
        `column labels ${qa('[data-role="column-label"]').length}, line labels ${qa('[data-role="line-label"]').length}, matrix ${q(".s-curve__matrix-body") !== null}, lines ${weeklyLines.map((l) => `${l.getAttribute("stroke-opacity")}/${l.getAttribute("stroke-width")}`).join(" ")}`);

    // Minimal: no columns, no matrix, legend at the bottom.
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: preset("minimal") }));
    const legend = q(".s-curve__legend").getBoundingClientRect();
    const chart = q(".s-curve__chart").getBoundingClientRect();
    check("Minimal preset: lines only, no matrix, legend at the bottom",
        qa('[data-role="bar"]').length === 0 && qa('[data-role="line"]').length === 2 && q(".s-curve__matrix-body") === null && legend.top >= chart.bottom - 0.5);
    const minimalModel = visual.getFormattingModel();
    const showColumns = paneSlices(minimalModel, "showColumns")[0];
    check("the Format pane shows effective values (Minimal turns columns off)", showColumns?.value === false, JSON.stringify(showColumns?.value));
    check("the Format pane has the nine SPEC cards", minimalModel.cards.length === 9);
    const groupUids = minimalModel.cards.flatMap((c) => c.groups.map((g) => g.uid));
    check("every Format pane group has a unique uid (no group shows up under another card)", new Set(groupUids).size === groupUids.length,
        groupUids.filter((u, i) => groupUids.indexOf(u) !== i).join(", "));

    // An explicit value beats the preset.
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: preset("minimal", { matrix: { showMatrix: true } }) }));
    check("a saved value beats the preset (Minimal + matrix on)", q(".s-curve__matrix-body") !== null && qa('[data-role="bar"]').length === 0);

    // Per-instance settings: slices per series and per measure, with selectors; a saved series fill reaches the bars.
    render(visual, container, progressDataView({
        reportedWeeks: 20,
        seriesObjects: { 0: { columns: { columnFill: { solid: { color: "#123456" } } } } },
        columnObjects: { "Sum(progress.PlannedQty)": { lines: { lineStyle: "dashed" } } },
    }));
    const model = visual.getFormattingModel();
    const fills = paneSlices(model, "columnFill");
    check("offers one column fill per series, with a selector", fills.length === 4 && fills.every((f) => f.descriptor.selector), `got ${fills.length}`);
    const columnsCard = model.cards.find((c) => c.uid === "columns-card");
    const fillsInColumnsCard = paneSlices(columnsCard, "columnFill").length;
    check("the column fills sit in the Columns card", fillsInColumnsCard === 4, `got ${fillsInColumnsCard}`);
    check("offers per-measure line settings with measure selectors",
        paneSlices(model, "lineColor").length === 2 && paneSlices(model, "lineColor").every((s) => s.descriptor.selector?.metadata));
    const civilBar = q(`[data-role="bar"][data-measure="${COLUMN_PLANNED}"][data-series="0"]`);
    check("applies a saved per-series column colour", civilBar?.getAttribute("fill") === "#123456", civilBar?.getAttribute("fill"));
    const plannedLine = q(`[data-role="line"][data-measure="${LINE_PLANNED}"]`);
    check("applies a saved per-measure line style", plannedLine?.getAttribute("stroke-dasharray") !== null);

    // Matrix row order and lines (SPEC Decision 13).
    const TABLE = "Sum(progress.Table1)";
    const PLANNED = "Sum(progress.PlannedQty)";
    const headersText = () => qa('[data-role="row-header"]').map((h) => h.textContent);
    const rowLine = (row) => q(`[data-role="row-line"][data-row="${row}"]`);
    render(visual, container, progressDataView({ reportedWeeks: 20 }));
    const defaultHeaders = headersText();
    const defaultTableCell = q('[data-role="cell-text"][data-bucket="4"][data-row="4"]').textContent;
    const defaultTableTotal = q('[data-role="total"][data-row="4"]').textContent;
    const defaultCumulativeTotal = q('[data-role="total"][data-row="2"]').textContent;
    render(visual, container, progressDataView({ reportedWeeks: 20, columnObjects: { [TABLE]: { matrix: { tableRowPosition: 1 } }, [PLANNED]: { matrix: { lineRowPosition: 5 } } } }));
    const moved = headersText();
    check("moves matrix rows to their saved positions, per row kind",
        moved.length === 5 && moved[0] === defaultHeaders[4] && moved[1] === defaultHeaders[0] && moved[2] === defaultHeaders[1] && moved[3] === defaultHeaders[3] && moved[4] === defaultHeaders[2],
        JSON.stringify(moved));
    check("a moved row keeps its own cells and total",
        q('[data-role="cell-text"][data-bucket="4"][data-row="0"]').textContent === defaultTableCell
            && q('[data-role="total"][data-row="0"]').textContent === defaultTableTotal
            && q('[data-role="total"][data-row="4"]').textContent === defaultCumulativeTotal);
    const movedYs = qa('[data-role="row-header"]').map((h) => Number(h.getAttribute("y")));
    check("reordered rows keep the fixed row height", movedYs.every((y, i) => y === i * 20 + 10), JSON.stringify(movedYs));
    const barsSpread = alignmentSpread(container, [0, 9, 19]);
    check("alignment holds with reordered rows", barsSpread <= 0.5, `spread ${barsSpread}`);
    const rowModel = visual.getFormattingModel();
    const panePositions = ["columnRowPosition", "lineRowPosition", "tableRowPosition"].flatMap((p) => paneSlices(rowModel, p).map((s) => s.value));
    check("the Format pane shows each row's effective position", JSON.stringify(panePositions) === JSON.stringify([2, 3, 5, 4, 1]), JSON.stringify(panePositions));
    check("per-row position slices are per-measure", paneSlices(rowModel, "lineRowPosition").every((s) => s.descriptor.selector?.metadata));
    const paneLimits = (property) => {
        const slice = paneSlices(rowModel, property)[0];
        return [slice?.options?.minValue?.value, slice?.options?.maxValue?.value, slice?.value];
    };
    check("the pane limits a row position from 1 to the number of rows", paneLimits("tableRowPosition").slice(0, 2).join() === "1,5", paneLimits("tableRowPosition").join());
    check("the pane limits a line from 0 to 6 and shows the default of 1", paneLimits("lineRowLineWidth").join() === "0,6,1", paneLimits("lineRowLineWidth").join());
    check("the pane limits the header line and shows the default of 1", paneLimits("headerLineWidth").join() === "0,6,1", paneLimits("headerLineWidth").join());

    render(visual, container, progressDataView({ reportedWeeks: 20, series: true, objects: { matrix: { expandSeries: true } }, columnObjects: { [TABLE]: { matrix: { tableRowPosition: 1, tableRowLineWidth: 3 } } } }));
    const expanded = headersText();
    check("with one row per series, a moved measure keeps its series rows above its total",
        expanded[4] === "Table measure 1" && expanded.slice(0, 4).join() === "Civil,Electrical,Instrumentation,Mechanical", JSON.stringify(expanded.slice(0, 6)));
    check("the line below a block sits under its total row", rowLine(4)?.getAttribute("stroke-width") === "3" && rowLine(3)?.getAttribute("stroke-width") === "1");

    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { matrix: { headerLineWidth: 2 } }, columnObjects: { [PLANNED]: { matrix: { columnRowLineWidth: 4, lineRowLineWidth: 0 } } } }));
    check("a saved row line uses its width and the others keep the default", rowLine(0)?.getAttribute("stroke-width") === "4" && rowLine(1)?.getAttribute("stroke-width") === "1");
    check("a saved 0 removes that row's line", rowLine(2) === null && rowLine(3) !== null);
    render(visual, container, progressDataView({ reportedWeeks: 20 }));
    const defaultLineY = rowLine(0).getAttribute("y1");
    render(visual, container, progressDataView({ reportedWeeks: 20, columnObjects: { [PLANNED]: { matrix: { columnRowLineWidth: 1 } } } }));
    check("typing the default width draws the same line as no setting", rowLine(0).getAttribute("stroke-width") === "1" && rowLine(0).getAttribute("y1") === defaultLineY);
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { matrix: { headerLineWidth: 2 } }, columnObjects: { [PLANNED]: { matrix: { columnRowLineWidth: 4, lineRowLineWidth: 0 } } } }));
    check("a saved header line uses its width", q('[data-role="header-line"]')?.getAttribute("stroke-width") === "2");
    check("cells draw no horizontal edges of their own", qa('[data-role="cell"]').every((c) => c.getAttribute("stroke") === null) && qa('[data-role="column-line"]').length === 21);
    check("a wide line straddles the row boundary without moving the rows",
        Number(rowLine(0).getAttribute("y1")) === 20 && Number(q('[data-role="row-header"][data-row="1"]').getAttribute("y")) === 30, rowLine(0).getAttribute("y1"));

    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { matrix: { showBorders: false, headerLineWidth: 1 } }, columnObjects: { [TABLE]: { matrix: { tableRowLineWidth: 3 } } } }));
    check("with Borders off, only saved lines draw",
        qa('[data-role="row-line"]').length === 1 && rowLine(4) !== null && q('[data-role="header-line"]') !== null && qa('[data-role="column-line"]').length === 0);
    const lastLine = rowLine(4);
    const matrixBottom = q(".s-curve__matrix-body").getBoundingClientRect().bottom;
    check("the last row's line stays inside the matrix", lastLine.getBoundingClientRect().bottom <= matrixBottom + 0.5 && Number(lastLine.getAttribute("y1")) === 100 - 1.5, `y ${lastLine.getAttribute("y1")}`);

    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { matrix: { showBorders: false } } }));
    check("with Borders off and nothing saved, no lines draw", qa('[data-role="row-line"]').length === 0 && q('[data-role="header-line"]') === null);

    // Two-line x-axis labels (SPEC Decision 12): date above, ISO week below, still aligned with the marks.
    render(visual, container, progressDataView({ reportedWeeks: 20 }));
    const oneLineY = Number(q('[data-role="x-label"][data-bucket="0"]').getAttribute("y"));
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { xAxis: { weekLabelSecondLine: "isoWeek" } } }));
    const label0 = q('[data-role="x-label"][data-bucket="0"]');
    const lines = [...(label0?.querySelectorAll("tspan") ?? [])].map((t) => t.textContent);
    check("shows a second x-axis label line with the chosen format", lines.length === 2 && lines[0] === "1/5/2026" && lines[1] === "2026-W02", JSON.stringify(lines));
    const twoLineY = Number(label0.getAttribute("y"));
    const labelBottom = label0.getBoundingClientRect().bottom;
    const chartBottom = q(".s-curve__chart").getBoundingClientRect().bottom;
    check("makes room for the second label line inside the chart",
        twoLineY < oneLineY && labelBottom <= chartBottom + 0.5, `label y ${twoLineY} vs ${oneLineY}; label bottom ${labelBottom.toFixed(1)} vs chart bottom ${chartBottom.toFixed(1)}`);
    check("keeps two-line labels aligned with the marks", alignmentSpread(container, [0, 9, 19]) <= 0.5);
    q('[data-role="bar"][data-bucket="0"]').dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 }));
    const header = calls.tooltip.show.at(-1)?.dataItems?.[0]?.header;
    check("shows both label lines in the tooltip header", header === "1/5/2026 · 2026-W02", header);

    // Horizontal scroll (the Phase 3 deferral): alignment holds at first/middle/last while scrolled.
    const scrollCase = (tableOnly, label) => {
        render(visual, container, progressDataView({ reportedWeeks: 20, tableOnly, objects: { general: { minBucketWidth: 70 } } }));
        const scrollbar = q(".s-curve__scrollbar");
        const visibleScrollbar = scrollbar && getComputedStyle(scrollbar).display !== "none";
        scrollbar.scrollLeft = 400;
        scrollbar.dispatchEvent(new Event("scroll"));
        const spread = alignmentSpread(container, [0, 9, 19]);
        check(`aligns first/middle/last buckets while scrolled horizontally${label}`, visibleScrollbar && scrollbar.scrollLeft > 0 && spread <= 0.5, `scrollbar ${visibleScrollbar}, scrollLeft ${scrollbar.scrollLeft}, spread ${spread}`);
    };
    scrollCase(1, "");
    scrollCase(10, " with the matrix also scrolling vertically");
    const body = q(".s-curve__matrix-body");
    check("the matrix scrolls vertically in the combined case", body && body.scrollHeight > body.clientHeight);

    container.remove();
    return [calls];
}
