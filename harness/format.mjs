// Phase 5 checks (SPEC §9, §12): presets change what renders, explicit values beat presets, the Format pane model
// shows effective values with per-instance slices, and alignment holds while scrolled horizontally.
import { createMockHost } from "./mock-host.mjs";
import { categoryDataView, progressDataView } from "./data.mjs";

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

    // A fixed axis range: marks stay in the plot, never over the x-axis labels or above the plot (SPEC §5.3).
    const plotEdges = () => ({
        top: Math.min(...qa(".s-curve__grid line").map((l) => l.getBoundingClientRect().top)),
        labels: Math.min(...qa('[data-role="x-label"]').map((l) => l.getBoundingClientRect().top)),
    });
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { leftAxis: { leftMin: 50 } } }));
    const lowest = qa('[data-role="bar"]').reduce((a, b) => (b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a));
    const lowestRect = lowest.getBoundingClientRect();
    check("a fixed left minimum keeps bars above the x-axis labels", lowestRect.bottom <= plotEdges().labels + 0.5, `bars to ${lowestRect.bottom}, labels from ${plotEdges().labels}`);
    const underPlot = document.elementFromPoint(lowestRect.left + lowestRect.width / 2, plotEdges().labels + 2);
    check("nothing of a bar can be hit below the plot", underPlot?.getAttribute("data-role") !== "bar", underPlot?.getAttribute("data-role"));
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { leftAxis: { leftMax: 100 } } }));
    const barTop = Math.min(...qa('[data-role="bar"]').map((b) => b.getBoundingClientRect().top));
    check("a fixed left maximum keeps bars inside the plot", barTop >= plotEdges().top - 0.5, `bars from ${barTop}, plot from ${plotEdges().top}`);
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { rightAxis: { rightMax: 1000 } } }));
    const rightTop = Math.min(...qa(".s-curve__axis-right text").map((t) => Number(t.getAttribute("y"))));
    const pointCys = qa('[data-role="point"]').map((p) => Number(p.getAttribute("cy")));
    check("a fixed right maximum leaves out line points above it", pointCys.length > 0 && pointCys.length < 40 && pointCys.every((cy) => cy >= rightTop - 0.5), `${pointCys.length} points, highest at ${Math.min(...pointCys)}, axis top ${rightTop}`);
    const lineClip = q('[data-role="line"]').getAttribute("clip-path");
    const clipRect = lineClip ? q(`${lineClip.slice(4, -1)} rect`) : null;
    check("a fixed right maximum clips the line at the plot", clipRect !== null && Number(clipRect.getAttribute("y")) >= rightTop - 2, `clip ${lineClip}, y ${clipRect?.getAttribute("y")}, axis top ${rightTop}`);
    const labelYs = qa('[data-role="line-label"]').map((l) => Number(l.getAttribute("y")));
    check("a fixed right maximum hides labels of points outside the range", labelYs.every((y) => y > rightTop), JSON.stringify(labelYs));

    // A line that reaches exactly 100 % sits on the plot's top edge: its marker stays.
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { lines: { displayAs: "percentOfBaseline", showMarkers: true } } }));
    const percentTop = Math.min(...qa(".s-curve__axis-right text").map((t) => Number(t.getAttribute("y"))));
    const edgePoint = q(`[data-role="point"][data-bucket="19"][data-measure="${LINE_PLANNED}"]`);
    check("keeps a marker on the plot's top edge", edgePoint !== null && Math.abs(Number(edgePoint.getAttribute("cy")) - percentTop) < 0.5, `point at ${edgePoint?.getAttribute("cy")}, axis top ${percentTop}`);

    // ISO weeks come from the Monday of a Sunday-start week, the week its other six days belong to.
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { xAxis: { weekStartDay: "sunday", weekLabelFormat: "isoWeek" } } }));
    const isoLabel = q('[data-role="x-label"][data-bucket="0"]').textContent;
    check("labels a Sunday-start week with the ISO week of its Monday", isoLabel === "2026-W02", isoLabel);

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

    // Every number box in the real pane model carries its limits, except the axis ranges, where negatives are valid.
    const numberBoxes = [];
    const walkPane = (node) => {
        if (Array.isArray(node)) node.forEach(walkPane);
        else if (node && typeof node === "object") {
            if (node.descriptor?.propertyName && "options" in node) numberBoxes.push(node);
            Object.values(node).forEach(walkPane);
        }
    };
    walkPane(rowModel);
    const withoutLimits = numberBoxes.filter((n) => !n.options?.minValue || !n.options?.maxValue).map((n) => n.descriptor.propertyName).sort();
    check("every number box in the pane has limits, except the axis ranges", numberBoxes.length > 25 && withoutLimits.join() === "leftMax,leftMin,rightMax,rightMin", `${numberBoxes.length} boxes; without limits: ${withoutLimits.join()}`);
    check("no number box in the pane allows a negative number", numberBoxes.filter((n) => n.options?.minValue).every((n) => n.options.minValue.value >= 0));

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

    // Every section with text has the same text options (SPEC Decision 17).
    const textSections = [
        { name: "left axis labels", card: "leftAxis", prefix: "leftLabel", selector: ".s-curve__axis-left text" },
        { name: "left axis title", card: "leftAxis", prefix: "leftTitle", selector: '[data-role="axis-title-left"]', extra: { leftTitleShow: true } },
        { name: "right axis labels", card: "rightAxis", prefix: "rightLabel", selector: ".s-curve__axis-right text" },
        { name: "right axis title", card: "rightAxis", prefix: "rightTitle", selector: '[data-role="axis-title-right"]', extra: { rightTitleShow: true } },
        { name: "x-axis labels", card: "xAxis", prefix: "xLabel", selector: '[data-role="x-label"]' },
        { name: "x-axis title", card: "xAxis", prefix: "xTitle", selector: '[data-role="axis-title-x"]', extra: { xTitleShow: true } },
        { name: "column labels", card: "dataLabels", prefix: "columnLabel", selector: '[data-role="column-label"]', extra: { columnLabelsShow: true } },
        { name: "line labels", card: "dataLabels", prefix: "lineLabel", selector: '[data-role="line-label"]' },
        { name: "legend entries", card: "legend", prefix: "legend", selector: '[data-role="legend-item"] text' },
        { name: "legend title", card: "legend", prefix: "legend", selector: '[data-role="legend-title"]', extra: { legendShowTitle: true, legendTitleText: "Legend" } },
        { name: "matrix cells", card: "matrix", prefix: "matrix", selector: '[data-role="cell-text"]' },
        { name: "matrix row headers", card: "matrix", prefix: "matrix", selector: '[data-role="row-header"]' },
        { name: "matrix totals", card: "matrix", prefix: "matrix", selector: '[data-role="total"]' },
    ];
    for (const { name, card, prefix, selector, extra } of textSections) {
        render(visual, container, progressDataView({ reportedWeeks: 20, objects: { [card]: { ...extra, [`${prefix}FontFamily`]: "Georgia", [`${prefix}Bold`]: true, [`${prefix}Italic`]: true, [`${prefix}Underline`]: true } } }));
        const element = q(selector);
        const style = element ? getComputedStyle(element) : null;
        check(`${name} take the font, bold, italic and underline`, style?.fontFamily.includes("Georgia") && style.fontWeight === "600" && style.fontStyle === "italic" && style.textDecorationLine === "underline",
            style ? [style.fontFamily, style.fontWeight, style.fontStyle, style.textDecorationLine].join() : "missing");
    }
    const fontModel = (() => {
        render(visual, container, progressDataView({ reportedWeeks: 20, objects: { general: { fontFamily: "Verdana" }, legend: { legendFontFamily: "Georgia" } } }));
        return visual.getFormattingModel();
    })();
    check("each text section's Format pane card has a font control", textSections.every(({ prefix }) => paneSlices(fontModel, `${prefix}FontFamily`).length === 1 && paneSlices(fontModel, `${prefix}Bold`).length === 1 && paneSlices(fontModel, `${prefix}Italic`).length === 1 && paneSlices(fontModel, `${prefix}Underline`).length === 1));
    check("the font control is the built-in one, holding the size", JSON.stringify(fontModel).includes('"type":"FontControl"') && paneSlices(fontModel, "xLabelFontSize").length === 1);
    check("a section's font shows the General card's until it has its own", paneSlices(fontModel, "matrixFontFamily")[0].value === "Verdana" && paneSlices(fontModel, "legendFontFamily")[0].value === "Georgia");
    const fontOf = (selector) => getComputedStyle(q(selector)).fontFamily;
    check("a section with no font draws in the General card's", fontOf('[data-role="x-label"]').includes("Verdana") && fontOf('[data-role="legend-item"] text').includes("Georgia"));

    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { xAxis: { xTitleShow: true } } }));
    const defaultTitle = q('[data-role="axis-title-x"]');
    check("axis titles stay bold by default", getComputedStyle(defaultTitle).fontWeight === "600");
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { xAxis: { xTitleShow: true, xTitleFontSize: 20, xTitleColor: { solid: { color: "#ff0000" } } } } }));
    const sizedTitle = q('[data-role="axis-title-x"]');
    check("the x-axis title has its own size and colour", Math.abs(parseFloat(getComputedStyle(sizedTitle).fontSize) - 20 * 96 / 72) < 0.1 && sizedTitle.getAttribute("fill") === "#ff0000", `${sizedTitle.style.fontSize} ${sizedTitle.getAttribute("fill")}`);

    // Layout measures text in its font, so a wider font makes room.
    const matrixGutter = (objects) => {
        render(visual, container, progressDataView({ reportedWeeks: 20, objects: { matrix: { headerBold: false, ...objects } } }));
        return q('[data-role="cell"][data-bucket="0"]').getBoundingClientRect().left;
    };
    check("the matrix makes room for bold row headers", matrixGutter({ matrixBold: true }) > matrixGutter({}));

    // A data label's background.
    const labelBackgrounds = (selector) => qa(selector).map((label) => label.previousElementSibling).filter((e) => e?.getAttribute("data-role") === "label-background");
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { dataLabels: { columnLabelsShow: true } } }));
    check("data labels have no background by default", qa('[data-role="label-background"]').length === 0);
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { dataLabels: { columnLabelsShow: true, columnLabelBackgroundShow: true, columnLabelBackgroundColor: { solid: { color: "#ff0000" } }, columnLabelBackgroundOpacity: 40, lineLabelBackgroundShow: true } } }));
    const columnBackgrounds = labelBackgrounds('[data-role="column-label"]');
    check("every column label has its background, in the colour and opacity set", columnBackgrounds.length > 0 && columnBackgrounds.length === qa('[data-role="column-label"]').length
        && columnBackgrounds.every((b) => b.getAttribute("fill") === "#ff0000" && b.getAttribute("fill-opacity") === "0.4"));
    const lineBackgrounds = labelBackgrounds('[data-role="line-label"]');
    check("a line label's background keeps the theme's colour until one is set", lineBackgrounds.length > 0 && lineBackgrounds.every((b) => b.getAttribute("fill") === host.colorPalette.background.value && b.getAttribute("fill-opacity") === "1"), lineBackgrounds[0]?.getAttribute("fill"));
    const firstLabel = q('[data-role="column-label"]').getBoundingClientRect();
    const firstBackground = columnBackgrounds[0].getBoundingClientRect();
    check("a background covers its label's text", firstBackground.left <= firstLabel.left + 0.5 && firstBackground.right >= firstLabel.right - 0.5 && firstBackground.top <= firstLabel.top + 2 && firstBackground.bottom >= firstLabel.bottom - 2);
    check("a background doesn't catch clicks meant for the marks under it", getComputedStyle(columnBackgrounds[0]).pointerEvents === "none");
    check("the Format pane offers the background's controls", ["columnLabel", "lineLabel"].every((p) => ["BackgroundShow", "BackgroundColor", "BackgroundOpacity"].every((s) => paneSlices(visual.getFormattingModel(), `${p}${s}`).length === 1)));

    // Category and series values use their column's format wherever they're shown (Hard Rule 9).
    const legendTexts = () => qa('[data-role="legend-item"]').map((e) => e.textContent);
    const rowHeaders = () => qa('[data-role="row-header"]').map((e) => e.textContent);
    const seriesRows = { matrix: { expandSeries: true } };
    render(visual, container, progressDataView({ reportedWeeks: 20, seriesValues: [0.25, 0.5], seriesFormat: "0%", objects: seriesRows }));
    check("the legend shows a numeric series in its column's format", legendTexts().some((t) => t.startsWith("25%")) && !legendTexts().some((t) => t.includes("0.25")), legendTexts().join());
    check("the matrix shows a numeric series in its column's format", rowHeaders().includes("25%") && !rowHeaders().includes("0.25"), rowHeaders().join());
    const paneNames = JSON.stringify(visual.getFormattingModel());
    check("the Format pane shows a numeric series in its column's format", paneNames.includes('"25%') && !paneNames.includes('"0.25'));
    render(visual, container, progressDataView({ reportedWeeks: 20, seriesValues: [new Date(2026, 0, 5), new Date(2026, 1, 2)], seriesFormat: "MMM yyyy", objects: seriesRows }));
    check("a date series uses its column's format", rowHeaders().includes("Jan 2026") && legendTexts().some((t) => t.startsWith("Jan 2026")), rowHeaders().join());
    render(visual, container, progressDataView({ reportedWeeks: 20, seriesValues: [2026, 2027], objects: seriesRows }));
    check("a number with no format keeps its digits, so a year stays a year", rowHeaders().includes("2026"), rowHeaders().join());
    render(visual, container, progressDataView({ reportedWeeks: 20, seriesValues: [null, "Civil"], objects: seriesRows }));
    check("a blank series has a label in the matrix", rowHeaders().includes("(Blank)"), rowHeaders().join());
    const xLabels = () => qa('[data-role="x-label"]').map((e) => e.textContent);
    render(visual, container, categoryDataView([0.1, 0.25], "0%"));
    check("a numeric category uses its column's format", xLabels().join() === "10%,25%", xLabels().join());
    render(visual, container, categoryDataView([new Date(2026, 0, 5), new Date(2026, 1, 2)], "MMM yyyy"));
    check("a date in the Category well uses its column's format", xLabels().join() === "Jan 2026,Feb 2026", xLabels().join());
    render(visual, container, categoryDataView([2026, 2027]));
    check("a number in the Category well with no format keeps its digits", xLabels().join() === "2026,2027", xLabels().join());

    // The first and last x-axis labels show in full, even when they're wider than their buckets.
    const shownLabels = () => qa('[data-role="x-label"]').filter((l) => l.style.visibility !== "hidden");
    const svgOf = (label) => label.closest("svg");
    const clipEdges = (label) => {
        const id = label.closest("[clip-path]").getAttribute("clip-path").match(/url\(#(.+)\)/)[1];
        const rect = svgOf(label).querySelector(`[id="${id}"] rect`);
        const left = svgOf(label).getBoundingClientRect().left + Number(rect.getAttribute("x"));
        return { left, right: left + Number(rect.getAttribute("width")) };
    };
    const showsInFull = (label) => {
        const box = label.getBoundingClientRect();
        const clip = clipEdges(label);
        const svg = svgOf(label).getBoundingClientRect();
        return box.left >= Math.max(clip.left, svg.left) - 0.5 && box.right <= Math.min(clip.right, svg.right) + 0.5;
    };
    render(visual, container, progressDataView({ reportedWeeks: 20 }));
    check("the first x-axis label shows in full", showsInFull(shownLabels()[0]));
    check("the last x-axis label shows in full", showsInFull(shownLabels().at(-1)));
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { leftAxis: { showLeftAxis: false }, rightAxis: { showRightAxis: false }, matrix: { showMatrix: false } } }));
    check("the first x-axis label shows in full with no gutter", showsInFull(shownLabels()[0]));
    check("the last x-axis label shows in full with no gutter", showsInFull(shownLabels().at(-1)));
    render(visual, container, progressDataView({ reportedWeeks: 20, objects: { dataLabels: { columnLabelsShow: true } } }));
    check("the first column label shows in full", showsInFull(q('[data-role="column-label"]')));

    container.remove();
    return [calls];
}
