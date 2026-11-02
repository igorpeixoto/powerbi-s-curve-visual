// Phase 4 checks (SPEC §7, §12): selection, cross-filtering, highlights, tooltips, context menu, keyboard and
// high contrast. Clicks are dispatched on whatever document.elementFromPoint() returns at the mark's centre, so a
// mark covered by a label or a hit target fails here exactly as it would for a real pointer.
import { createMockHost } from "./mock-host.mjs";
import { dailyDescendingDataView, progressDataView } from "./data.mjs";

const PLANNED = "Sum(progress.PlannedQty)";
const COLUMN_PLANNED = `columnValues:${PLANNED}`;
const LINE_PLANNED = `lineValues:${PLANNED}`;
const LINE_ACTUAL = "lineValues:Sum(progress.ActualQty)";

function newContainer(width = 800, height = 500) {
    const container = document.createElement("div");
    // Fixed at the top-left so every mark is inside the page viewport, where elementFromPoint() can find it.
    container.style.cssText = `position:fixed;left:0;top:0;z-index:10;width:${width}px;height:${height}px;overflow:hidden;background:#fff`;
    document.body.appendChild(container);
    return container;
}

function render(visual, container, dataView, width = 800, height = 500) {
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    visual.update({ dataViews: dataView ? [dataView] : [], viewport: { width, height }, type: 2, viewMode: 0, editMode: 0 });
}

function center(element) {
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Dispatches a mouse event where a real pointer at the element's centre would land; returns the hit element. */
function pointerAt(element, type = "click", init = {}) {
    const { x, y } = center(element);
    const hit = document.elementFromPoint(x, y);
    hit?.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init }));
    return hit;
}

function key(root, name, init = {}) {
    root.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
}

const opacity = (element) => element.getAttribute("opacity") ?? "1";

export function runInteractionChecks(plugin, check) {
    const container = newContainer();
    const { host, calls } = createMockHost();
    const visual = plugin.create({ element: container, host });
    const q = (selector) => container.querySelector(selector);
    const qa = (selector) => [...container.querySelectorAll(selector)];
    const bar = (bucket, series = 0) => q(`[data-role="bar"][data-bucket="${bucket}"][data-measure="${COLUMN_PLANNED}"][data-series="${series}"]`);
    const lastSelect = () => calls.select.at(-1)?.keys ?? [];

    // Three updates before any click: if listeners accumulated, one click would select several times.
    for (let i = 0; i < 3; i++) render(visual, container, progressDataView({ reportedWeeks: 20 }));

    // Bar: bucket + series + measure.
    const target = bar(9);
    const hit = pointerAt(target);
    check("a real click at a bar's centre reaches the bar", hit === target, `hit ${hit?.getAttribute("data-role")}`);
    check("clicking a bar selects bucket, series and measure",
        calls.select.length === 1 && lastSelect().length === 1 && lastSelect()[0] === `c:progress.WeekStart:9|s:Civil|m:${PLANNED}`,
        JSON.stringify(calls.select));
    check("dims unselected marks and keeps the selected one",
        opacity(bar(9)) === "1" && opacity(bar(3)) === "0.4" && opacity(bar(9, 1)) === "0.4");

    // Ctrl-click accumulates.
    pointerAt(bar(10), "click", { ctrlKey: true });
    check("Ctrl-click adds to the selection", lastSelect().length === 2 && opacity(bar(10)) === "1", JSON.stringify(lastSelect()));

    // Axis label: the whole bucket (the label must be visible to be clicked; at 800 px every 2nd label shows).
    const label = q('[data-role="x-label"][data-bucket="4"]');
    check("a real click reaches the axis label", pointerAt(label) === label);
    check("clicking an axis label selects the bucket", lastSelect().length === 1 && lastSelect()[0] === "c:progress.WeekStart:4", JSON.stringify(lastSelect()));
    check("a bucket selection keeps both bars of that week", opacity(bar(4)) === "1" && opacity(bar(4, 2)) === "1" && opacity(bar(5)) === "0.4");

    // Matrix cell: bucket + measure of its row.
    const cell = q('[data-role="cell"][data-bucket="6"][data-row="0"]');
    check("a real click reaches a matrix cell (not its text)", pointerAt(cell) === cell);
    check("clicking a matrix cell selects its bucket and row measure", lastSelect()[0] === `c:progress.WeekStart:6|m:${PLANNED}`, JSON.stringify(lastSelect()));

    // Measure row header: emphasises inside the visual only (SPEC Decision 5).
    const clearsBefore = calls.clear;
    const header = qa('[data-role="row-header"]').find((h) => h.textContent.startsWith("Sum of PlannedQty (cumulative)"));
    pointerAt(header);
    check("a measure row header emphasises the measure without cross-filtering",
        calls.clear === clearsBefore + 1 && opacity(q(`[data-role="line"][data-measure="${LINE_PLANNED}"]`)) === "1"
            && opacity(q(`[data-role="line"][data-measure="${LINE_ACTUAL}"]`)) === "0.4");

    // Legend entry with a series: cross-filters by series.
    const legendCivil = q(`[data-role="legend-item"][data-measure="${COLUMN_PLANNED}"][data-series="0"]`);
    pointerAt(legendCivil);
    check("a series legend entry selects the series", lastSelect().length === 1 && lastSelect()[0] === "s:Civil", JSON.stringify(lastSelect()));

    // Background click clears.
    const chart = q(".s-curve__chart");
    const chartRect = chart.getBoundingClientRect();
    const background = document.elementFromPoint(chartRect.left + chartRect.width / 2, chartRect.top + 3);
    background.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: chartRect.left + chartRect.width / 2, clientY: chartRect.top + 3 }));
    check("a background click clears the selection", calls.clear === clearsBefore + 2 && qa('[data-role="bar"]').every((b) => opacity(b) === "1"));

    // Clicking the only selected mark again clears it.
    pointerAt(bar(2));
    const clears = calls.clear;
    pointerAt(bar(2));
    check("clicking the only selected mark again clears it", calls.clear === clears + 1 && opacity(bar(5)) === "1");

    // Stale selection: the selected week no longer exists after a filter change.
    pointerAt(q('[data-role="x-label"][data-bucket="18"]'));
    render(visual, container, progressDataView({ reportedWeeks: 10, weeks: 10 }));
    check("drops a selection whose week no longer exists", qa('[data-role="bar"]').every((b) => opacity(b) === "1"));
    render(visual, container, progressDataView({ reportedWeeks: 20 }));

    // Bookmark restore: the host hands back identities; measure-only emphasis is local and doesn't survive it.
    calls.onSelect?.([{ getKey: () => "c:progress.WeekStart:4", getSelector: () => ({}) }]);
    check("restores a bucket selection from the host (bookmarks)", opacity(bar(4)) === "1" && opacity(bar(7)) === "0.4");
    calls.onSelect?.([]);
    check("restoring an empty selection shows everything", qa('[data-role="bar"]').every((b) => opacity(b) === "1"));

    // Context menu: the mark's identity, or an empty selection on the background.
    pointerAt(bar(9), "contextmenu");
    check("opens the context menu with the mark's identity", calls.contextMenu.at(-1)?.key === `c:progress.WeekStart:9|s:Civil|m:${PLANNED}`, JSON.stringify(calls.contextMenu));
    background.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: chartRect.left + 50, clientY: chartRect.top + 3 }));
    check("opens the context menu with an empty selection on the background", calls.contextMenu.length === 2 && calls.contextMenu[1].key === null);

    // Tooltips: show on a new mark, move on the same one, hide on leaving.
    pointerAt(bar(9), "mousemove");
    const shown = calls.tooltip.show.at(-1);
    const items = shown?.dataItems ?? [];
    check("shows a tooltip with bucket, series and value",
        items[0]?.header && items.some((i) => i.displayName === "Discipline" && i.value === "Civil") && items.some((i) => i.displayName === "Sum of PlannedQty"),
        JSON.stringify(items));
    check("passes the mark's identity to the tooltip (report-page tooltips)", shown?.identities?.length === 1);
    pointerAt(bar(9), "mousemove");
    container.querySelector(".s-curve").dispatchEvent(new MouseEvent("mouseleave"));
    check("moves the tooltip over the same mark and hides it on leaving", calls.tooltip.move >= 1 && calls.tooltip.hide >= 1);
    // Week 15: the two cumulative lines are far apart there, so the Planned point isn't under the Actual one.
    const point = q(`[data-role="point"][data-bucket="15"][data-measure="${LINE_PLANNED}"]`);
    pointerAt(point, "mousemove");
    const pointItems = calls.tooltip.show.at(-1)?.dataItems ?? [];
    check("a line point tooltip shows the cumulative and the per-bucket value",
        pointItems.some((i) => i.displayName === "Sum of PlannedQty (cumulative)") && pointItems.some((i) => i.displayName === "Sum of PlannedQty"),
        JSON.stringify(pointItems));

    // Keyboard: arrows move a visible focus, Enter selects, Enter on the only selected mark clears.
    const root = container.querySelector(".s-curve");
    check("the visual is one tab stop", root.tabIndex === 0);
    const ring = container.querySelector(".s-curve__focus-ring");
    key(root, "ArrowRight");
    key(root, "ArrowRight");
    const focusRect = ring.getBoundingClientRect();
    const focusedBar = bar(1);
    const barRect = focusedBar.getBoundingClientRect();
    check("arrow keys move a visible focus ring onto the mark",
        getComputedStyle(ring).display !== "none" && Math.abs((focusRect.left + focusRect.right) / 2 - (barRect.left + barRect.right) / 2) < 1,
        `ring ${focusRect.left.toFixed(1)}-${focusRect.right.toFixed(1)}, bar ${barRect.left.toFixed(1)}-${barRect.right.toFixed(1)}`);
    const live = container.querySelector(".s-curve__live");
    check("announces the focused mark", live.textContent.length > 0 && live.textContent === focusedBar.getAttribute("aria-label"), live.textContent);
    const selectsBefore = calls.select.length;
    key(root, "Enter");
    check("Enter selects the focused mark", calls.select.length === selectsBefore + 1 && lastSelect()[0] === `c:progress.WeekStart:1|s:Civil|m:${PLANNED}`, JSON.stringify(lastSelect()));
    const clearsBeforeKey = calls.clear;
    key(root, "Enter");
    check("Enter on the only selected mark clears it", calls.clear === clearsBeforeKey + 1);
    for (let i = 0; i < 30; i++) key(root, "ArrowDown");
    const lastCell = q('[data-role="cell"][data-bucket="1"][data-row="4"]');
    const cellRect = lastCell.getBoundingClientRect();
    const ringNow = ring.getBoundingClientRect();
    check("↓ past the chart rows moves the focus into the matrix", Math.abs(ringNow.top + ringNow.height / 2 - (cellRect.top + cellRect.height / 2)) < 1);
    key(root, "Escape");
    check("Esc is left to the host and doesn't clear the selection", calls.clear === clearsBeforeKey + 1);
    const unlabeled = qa('[data-role="bar"],[data-role="point"],[data-role="cell"]').filter((e) => !e.getAttribute("aria-label"));
    check("every focusable mark has an aria-label", unlabeled.length === 0, `${unlabeled.length} without`);

    // Highlights from another visual: solid highlighted part over the faded full value.
    render(visual, container, progressDataView({ reportedWeeks: 20, highlights: true }));
    const fullBars = qa('[data-role="bar"]');
    check("draws highlighted bars solid over the faded full bars",
        qa('[data-role="bar-highlight"]').length > 0 && fullBars.every((b) => b.getAttribute("fill-opacity") === "0.4"));
    check("draws a solid highlighted line over each faded line",
        qa('[data-role="line-highlight"]').length === 2 && qa('[data-role="line"]').every((l) => l.getAttribute("stroke-opacity") === "0.4"));
    const matrixText = q('[data-role="cell-text"][data-bucket="5"][data-row="0"]')?.textContent ?? "";
    const highlightedBar = q(`[data-role="bar-highlight"][data-bucket="5"][data-measure="${COLUMN_PLANNED}"]`);
    check("the matrix shows highlighted values", highlightedBar !== null && matrixText !== "" && Number(matrixText.replace(/,/g, "")) === Number(highlightedBar.dataset.value), `cell "${matrixText}" vs bar ${highlightedBar?.dataset.value}`);
    pointerAt(highlightedBar, "mousemove");
    check("the tooltip shows both the full and the highlighted value",
        (calls.tooltip.show.at(-1)?.dataItems ?? []).some((i) => i.displayName.endsWith("(highlighted)")));

    // Another visual highlights part of every series: each solid part sits inside its own series' faded bar (SPEC §7.2).
    render(visual, container, progressDataView({ reportedWeeks: 20, partialHighlights: true }));
    const stackRect = (role, series) => q(`[data-role="${role}"][data-bucket="10"][data-measure="${COLUMN_PLANNED}"][data-series="${series}"]`).getBoundingClientRect();
    const misplaced = [0, 1, 2, 3].filter((series) => {
        const full = stackRect("bar", series);
        const part = stackRect("bar-highlight", series);
        return Math.abs(full.bottom - part.bottom) > 0.5 || part.top < full.top - 0.5;
    });
    check("draws each series' highlight inside its own stacked segment", misplaced.length === 0, `misplaced series: ${misplaced.join(", ")}`);

    // Daily rows delivered newest first: the week still takes its last day, and Tooltips fields cover the whole week.
    render(visual, container, dailyDescendingDataView());
    pointerAt(q('[data-role="point"][data-bucket="0"]'), "mousemove");
    const dailyItems = calls.tooltip.show.at(-1)?.dataItems ?? [];
    const dailyValue = (name) => dailyItems.find((i) => i.displayName === name)?.value;
    check("an as-provided line takes the week's last day whatever the sort order", dailyValue("Reported") === "9", JSON.stringify(dailyItems));
    check("a numeric Tooltips field adds up the week's rows", dailyValue("Crew") === "10", JSON.stringify(dailyItems));
    check("a text Tooltips field shows the week's latest value", dailyValue("Status") === "status 9", JSON.stringify(dailyItems));
    container.querySelector(".s-curve").dispatchEvent(new MouseEvent("mouseleave"));

    // The keyboard focus outlives a filter that removes its bucket.
    const focusContainer = newContainer();
    const focusHost = createMockHost();
    const focusVisual = plugin.create({ element: focusContainer, host: focusHost.host });
    render(focusVisual, focusContainer, progressDataView({ reportedWeeks: 20 }));
    const focusRoot = focusContainer.querySelector(".s-curve");
    key(focusRoot, "ArrowRight");
    key(focusRoot, "End");
    render(focusVisual, focusContainer, progressDataView({ reportedWeeks: 10, weeks: 10 }));
    check("a filter that removes the focused bucket doesn't fail the render", focusHost.calls.renderingFailed.length === 0, focusHost.calls.renderingFailed.join("; "));
    const focusRing = focusContainer.querySelector(".s-curve__focus-ring").getBoundingClientRect();
    const lastBar = focusContainer.querySelector(`[data-role="bar"][data-bucket="9"][data-measure="${COLUMN_PLANNED}"][data-series="0"]`).getBoundingClientRect();
    check("moves the focus ring to the last bucket left", Math.abs((focusRing.left + focusRing.right) / 2 - (lastBar.left + lastBar.right) / 2) < 1, `ring ${focusRing.left}-${focusRing.right}, bar ${lastBar.left}-${lastBar.right}`);
    focusContainer.remove();

    // A matrix hidden for lack of space isn't reachable from the keyboard (SPEC §3.3, §7.4).
    const shortContainer = newContainer(800, 200);
    const shortHost = createMockHost();
    const shortVisual = plugin.create({ element: shortContainer, host: shortHost.host });
    render(shortVisual, shortContainer, progressDataView({ reportedWeeks: 20 }), 800, 200);
    check("a short visual hides its matrix", getComputedStyle(shortContainer.querySelector(".s-curve__note")).display !== "none" && !shortContainer.querySelector('[data-role="cell"]'));
    const shortRoot = shortContainer.querySelector(".s-curve");
    for (let i = 0; i < 30; i++) key(shortRoot, "ArrowDown");
    const lastPoint = shortContainer.querySelector(`[data-role="point"][data-bucket="0"][data-measure="${LINE_ACTUAL}"]`);
    check("↓ stops at the last chart row when the matrix is hidden", shortContainer.querySelector(".s-curve__live").textContent === lastPoint.getAttribute("aria-label"), shortContainer.querySelector(".s-curve__live").textContent);
    key(shortRoot, "Enter");
    check("Enter selects that chart row's mark, not a hidden matrix row", shortHost.calls.select.at(-1)?.keys[0] === "c:progress.WeekStart:0|m:Sum(progress.ActualQty)", JSON.stringify(shortHost.calls.select.at(-1)?.keys));
    shortContainer.remove();

    // Reordered matrix rows: clicks, tooltips and the keyboard follow the row, not its default position (SPEC Decision 13).
    const rowsContainer = newContainer();
    const rowsHost = createMockHost();
    const rowsVisual = plugin.create({ element: rowsContainer, host: rowsHost.host });
    const TABLE = "Sum(progress.Table1)";
    render(rowsVisual, rowsContainer, progressDataView({ reportedWeeks: 20, columnObjects: { [TABLE]: { matrix: { tableRowPosition: 1, tableRowLineWidth: 6 } } } }));
    const movedCell = rowsContainer.querySelector('[data-role="cell"][data-bucket="6"][data-row="0"]');
    check("a real click reaches a cell next to a saved row line", pointerAt(movedCell) === movedCell);
    const cellBox = movedCell.getBoundingClientRect();
    const onLine = document.elementFromPoint(cellBox.left + cellBox.width / 2, cellBox.bottom);
    check("a wide row line doesn't block the cells under it", onLine?.getAttribute("data-role") === "cell", onLine?.getAttribute("data-role"));
    check("clicking a cell in a moved row selects that row's measure", rowsHost.calls.select.at(-1)?.keys[0] === `c:progress.WeekStart:6|m:${TABLE}`, JSON.stringify(rowsHost.calls.select.at(-1)?.keys));
    pointerAt(movedCell, "mousemove");
    check("the tooltip of a moved row names its measure", (rowsHost.calls.tooltip.show.at(-1)?.dataItems ?? []).some((i) => i.displayName === "Table measure 1"), JSON.stringify(rowsHost.calls.tooltip.show.at(-1)?.dataItems));
    const rowsRoot = rowsContainer.querySelector(".s-curve");
    const rowsRing = rowsContainer.querySelector(".s-curve__focus-ring");
    const matrixTop = rowsContainer.querySelector(".s-curve__matrix-body").getBoundingClientRect().top;
    const ringMiddle = () => center(rowsRing).y;
    for (let i = 0; i < 30 && ringMiddle() < matrixTop; i++) key(rowsRoot, "ArrowDown");
    check("↓ enters the matrix at the moved row",
        Math.abs(ringMiddle() - center(movedCell).y) < 1 && rowsContainer.querySelector(".s-curve__live").textContent.includes("Table measure 1"),
        `ring ${ringMiddle()}, row ${center(movedCell).y}, "${rowsContainer.querySelector(".s-curve__live").textContent}"`);
    rowsContainer.remove();

    // No interactions when the host disallows them (e.g. a dashboard tile).
    const lockedContainer = newContainer();
    const locked = createMockHost({ allowInteractions: false });
    const lockedVisual = plugin.create({ element: lockedContainer, host: locked.host });
    render(lockedVisual, lockedContainer, progressDataView({ reportedWeeks: 20 }));
    pointerAt(lockedContainer.querySelector(`[data-role="bar"][data-bucket="9"][data-measure="${COLUMN_PLANNED}"][data-series="0"]`));
    check("does nothing on click when interactions are disallowed",
        locked.calls.select.length === 0 && [...lockedContainer.querySelectorAll('[data-role="bar"]')].every((b) => opacity(b) === "1"));

    // High contrast: only foreground, background and selected colours (SPEC §7.4, §12).
    const hcContainer = newContainer();
    const hc = createMockHost({ highContrast: true });
    const hcVisual = plugin.create({ element: hcContainer, host: hc.host });
    render(hcVisual, hcContainer, progressDataView({ reportedWeeks: 20 }));
    const hcBar = (bucket) => hcContainer.querySelector(`[data-role="bar"][data-bucket="${bucket}"][data-measure="${COLUMN_PLANNED}"][data-series="0"]`);
    const hcRestingStroke = hcBar(9).getAttribute("stroke");
    pointerAt(hcBar(9));
    check("a selected bar takes the selected colour in high contrast", hcBar(9).getAttribute("stroke") === "#00ffff", hcBar(9).getAttribute("stroke"));
    const allowed = new Set(["#ffff00", "#00ffff", "#000000", "none", "transparent", "currentcolor"]);
    const used = new Set();
    hcContainer.querySelectorAll("*").forEach((e) => {
        for (const attribute of ["fill", "stroke"]) {
            const value = e.getAttribute(attribute);
            if (value) used.add(value.toLowerCase());
        }
    });
    const stray = [...used].filter((c) => !allowed.has(c));
    check("uses only high-contrast colours", stray.length === 0, `stray: ${stray.join(", ")}`);
    const hcLines = [...hcContainer.querySelectorAll('[data-role="line"]')].map((l) => l.getAttribute("stroke-dasharray") ?? "solid");
    check("tells lines apart by dash style in high contrast", new Set(hcLines).size === hcLines.length, JSON.stringify(hcLines));
    // Power BI doesn't call update() after the visual's own select(), so nothing redraws the bar.
    pointerAt(hcBar(3));
    check("a deselected bar gets its own stroke back in high contrast", hcBar(9).getAttribute("stroke") === hcRestingStroke && hcBar(9).getAttribute("stroke-width") === "1.5", hcBar(9).getAttribute("stroke"));

    for (const c of [container, lockedContainer, hcContainer]) c.remove();
    return [calls, focusHost.calls, shortHost.calls, rowsHost.calls, locked.calls, hc.calls];
}
