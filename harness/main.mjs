import { createMockHost } from "./mock-host.mjs";
import {
    bucketsOnlyDataView,
    dateHierarchyDataView,
    isolatedPointsDataView,
    measuresOnlyDataView,
    progressDataView,
    zeroRowsDataView,
} from "./data.mjs";
import { runFormatChecks } from "./format.mjs";
import { runInteractionChecks } from "./interaction.mjs";
import { runLocalizationChecks } from "./localization.mjs";

const lines = [];
let pass = 0;
let fail = 0;

function check(name, condition, detail = "") {
    if (condition) {
        pass += 1;
        lines.push(`PASS ${name}`);
    } else {
        fail += 1;
        lines.push(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
    }
}

// Loads exactly what ships inside the .pbiviz: the packaged JS and CSS from the resources JSON.
async function loadPackagedVisual(packageUrl) {
    const pkg = await (await fetch(packageUrl)).json();
    window.powerbi = {};

    const style = document.createElement("style");
    style.textContent = pkg.content.css;
    document.head.appendChild(style);

    const script = document.createElement("script");
    script.textContent = pkg.content.js;
    document.head.appendChild(script);

    return { guid: pkg.visual.guid, plugin: window.powerbi.visuals?.plugins?.[pkg.visual.guid], stringResources: pkg.stringResources };
}

const element = document.getElementById("visual");

/** Sizes the container and passes the same size as the viewport: geometry must come from the viewport. */
function render(visual, dataView, width = 800, height = 500) {
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    visual.update({
        dataViews: dataView ? [dataView] : [],
        viewport: { width, height },
        type: 2,
        viewMode: 0,
        editMode: 0,
    });
}

function centerX(elements) {
    const rects = [...elements].map((e) => e.getBoundingClientRect());
    if (rects.length === 0) return null;
    return (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2;
}

const PLANNED_LINE = "lineValues:Sum(progress.PlannedQty)";

function alignmentAt(bucket) {
    const q = (selector) => element.querySelectorAll(selector);
    return {
        bars: centerX(q(`[data-role="bar"][data-bucket="${bucket}"]`)),
        point: centerX(q(`[data-role="point"][data-bucket="${bucket}"][data-measure="${PLANNED_LINE}"]`)),
        label: centerX(q(`[data-role="x-label"][data-bucket="${bucket}"]`)),
        cell: centerX(q(`[data-role="cell"][data-bucket="${bucket}"][data-row="0"]`)),
    };
}

function checkAlignment(name, bucketCount) {
    const failures = [];
    for (const bucket of [0, Math.floor((bucketCount - 1) / 2), bucketCount - 1]) {
        const c = alignmentAt(bucket);
        const values = Object.values(c);
        if (values.some((v) => v === null)) {
            failures.push(`bucket ${bucket}: missing ${Object.entries(c).filter(([, v]) => v === null).map(([k]) => k).join(",")}`);
            continue;
        }
        const spread = Math.max(...values) - Math.min(...values);
        if (spread > 0.5) failures.push(`bucket ${bucket}: spread ${spread.toFixed(2)} px ${JSON.stringify(c)}`);
    }
    check(name, failures.length === 0, failures.join("; "));
}

function messageState() {
    const message = element.querySelector(".s-curve__message");
    return message && getComputedStyle(message).display !== "none" ? { state: message.dataset.state, text: message.textContent } : null;
}

async function run() {
    const packageUrl = new URLSearchParams(location.search).get("pkg");
    const { guid, plugin, stringResources } = await loadPackagedVisual(packageUrl);
    check("packaged visual registers its plugin under the GUID", Boolean(plugin), `guid ${guid}`);
    if (!plugin) return;

    const { host, calls } = createMockHost();
    const visual = plugin.create({ element, host });

    // Full chart: columns, lines and matrix from data shaped like Desktop's.
    render(visual, progressDataView());
    const q = (selector) => element.querySelectorAll(selector);
    check("draws stacked columns for every series and measure", q('[data-role="bar"]').length > 0 && q('[data-role="bar"][data-series="3"]').length > 0);
    check("draws one cumulative line per line measure", q('[data-role="line"]').length === 2);
    check("ends the actual line at the last reported week", q('[data-role="point"][data-measure="lineValues:Sum(progress.ActualQty)"]').length === 12);
    const headers = [...q('[data-role="row-header"]')].map((e) => e.textContent);
    check("lists matrix rows: columns, cumulative lines, table-only", headers.length === 5 && headers[2].endsWith("(cumulative)") && headers[4] === "Table measure 1", JSON.stringify(headers));
    check("shows a totals column", q('[data-role="total"]').length === 5 && q('[data-role="totals-header"]').length === 1);
    check("draws a legend entry per drawn mark", q('[data-role="legend-item"]').length === 10, `got ${q('[data-role="legend-item"]').length}`);
    check("labels the last point of each line", q('[data-role="line-label"]').length === 2);

    // Alignment: bars, line points, axis labels and matrix cells share x centres (SPEC §3.1, §12).
    // Every slot is filled here (actuals reported to the end), so the drawn cluster spans the whole band.
    for (const width of [400, 800, 1200, 2000]) {
        render(visual, progressDataView({ reportedWeeks: 20 }), width, 500);
        checkAlignment(`aligns first/middle/last buckets at ${width} px`, 20);
    }

    // When a measure has no value in a bucket, the others keep their slots: the planned bar sits at the
    // same offset from the bucket centre in a week without actuals as in a week with them.
    render(visual, progressDataView(), 800, 500);
    const offset = (bucket) => {
        const bar = centerX(q(`[data-role="bar"][data-bucket="${bucket}"][data-measure="columnValues:Sum(progress.PlannedQty)"]`));
        const label = centerX(q(`[data-role="x-label"][data-bucket="${bucket}"]`));
        return bar === null || label === null ? null : bar - label;
    };
    const fullWeek = offset(0);
    const tailWeek = offset(19);
    check("keeps bar slots fixed when a measure is missing in a bucket",
        fullWeek !== null && tailWeek !== null && Math.abs(fullWeek - tailWeek) <= 0.5,
        `offset week 1 ${fullWeek?.toFixed(2)}, week 20 ${tailWeek?.toFixed(2)}`);

    // A matrix tall enough to scroll vertically must not shift its columns or hide its totals.
    render(visual, progressDataView({ tableOnly: 10, reportedWeeks: 20 }), 800, 500);
    const body = element.querySelector(".s-curve__matrix-body");
    check("scrolls a tall matrix vertically", body && body.scrollHeight > body.clientHeight, body ? `${body.scrollHeight} / ${body.clientHeight}` : "no body");
    checkAlignment("aligns columns while the matrix scrolls vertically", 20);
    const bodyRight = body ? body.getBoundingClientRect().left + body.clientWidth : 0;
    const totalsRight = Math.max(...[...q('[data-role="total"]')].map((e) => e.getBoundingClientRect().right));
    check("keeps the totals column clear of the vertical scrollbar", totalsRight <= bodyRight + 0.5, `totals ${totalsRight.toFixed(1)} vs body ${bodyRight.toFixed(1)}`);

    // Updates redraw instead of accumulating DOM (CLAUDE.md Hard Rule #7).
    render(visual, progressDataView(), 800, 500);
    const before = element.querySelectorAll("*").length;
    render(visual, progressDataView(), 800, 500);
    check("repeated updates don't accumulate elements", element.querySelectorAll("*").length === before);

    // Degenerate data still draws what it can.
    render(visual, progressDataView({ actualAllNull: true }));
    check("renders the other measures when one measure is all null", q('[data-role="bar"]').length > 0 && messageState() === null);
    render(visual, progressDataView({ weeks: 1, reportedWeeks: 1 }));
    check("renders a single bucket", q('[data-role="bar"][data-bucket="0"]').length > 0 && q('[data-role="point"]').length === 2);
    // With markers off (the default) a lone point has no line to show it, so it keeps a marker (SPEC §8).
    const shownAsMarker = (point) => point.getAttribute("fill-opacity") === "1" && point.getAttribute("r") === "4";
    const pointLooks = () => [...q('[data-role="point"]')].map((p) => `${p.getAttribute("fill-opacity")}/${p.getAttribute("r")}`).join(" ");
    check("shows a single bucket's line points as markers", [...q('[data-role="point"]')].every(shownAsMarker), pointLooks());
    render(visual, isolatedPointsDataView());
    check("shows points between gaps as markers", q('[data-role="point"]').length === 2 && [...q('[data-role="point"]')].every(shownAsMarker), pointLooks());
    render(visual, progressDataView({ reportedWeeks: 20 }));
    check("keeps points on a continuous line hidden with markers off", [...q('[data-role="point"]')].every((p) => p.getAttribute("fill-opacity") === "0"), pointLooks());

    // Empty states render a clear message, not an error (SPEC §8).
    const emptyCases = [
        ["landing page with nothing bound", undefined, "landing"],
        ["message for measures without a Date/Category", measuresOnlyDataView(), "missingBuckets"],
        ["message for a Date without measures", bucketsOnlyDataView(), "missingMeasures"],
        ["message for zero rows", zeroRowsDataView(), "noRows"],
        ["message for a date hierarchy in the Date well", dateHierarchyDataView(), "dateHierarchy"],
    ];
    for (const [name, dataView, state] of emptyCases) {
        render(visual, dataView);
        const message = messageState();
        check(`shows the ${name}`, message?.state === state && message.text.length > 0, JSON.stringify(message));
    }
    render(visual, progressDataView(), 100, 60);
    check("asks for more room in a tiny viewport", messageState()?.state === "tooSmall");

    // Warnings go to the host's warning icon.
    calls.warnings.length = 0;
    render(visual, progressDataView({ reduced: true }));
    check("reports reduced data through the warning icon", calls.warnings.some((w) => /reduced/i.test(w.detailedText)), JSON.stringify(calls.warnings));

    const interactionCalls = runInteractionChecks(plugin, check);
    const formatCalls = runFormatChecks(plugin, check);
    const localizationCalls = runLocalizationChecks(plugin, stringResources, check);
    const failures = [calls, ...interactionCalls, ...formatCalls, ...localizationCalls].flatMap((c) => c.renderingFailed);
    check("never reports renderingFailed", failures.length === 0, failures.join("; "));
    check("signals renderingFinished for every update", calls.renderingFinished === calls.renderingStarted, JSON.stringify(calls));
}

run()
    .catch((error) => {
        fail += 1;
        lines.push(`FAIL harness crashed: ${error?.stack ?? error}`);
    })
    .finally(() => {
        window.__harnessResult = { pass, fail, lines };
        window.__harnessDone = true;
    });
