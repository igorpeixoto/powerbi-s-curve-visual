import { createMockHost } from "./mock-host.mjs";
import { emptyDataView, weeklyDataView } from "./data.mjs";

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

    return { guid: pkg.visual.guid, plugin: window.powerbi.visuals?.plugins?.[pkg.visual.guid] };
}

function updateOptions(dataView, width = 800, height = 500) {
    return {
        dataViews: dataView ? [dataView] : [],
        viewport: { width, height },
        type: 2,
        viewMode: 0,
        editMode: 0,
    };
}

async function run() {
    const packageUrl = new URLSearchParams(location.search).get("pkg");
    const { guid, plugin } = await loadPackagedVisual(packageUrl);
    check("packaged visual registers its plugin under the GUID", Boolean(plugin), `guid ${guid}`);
    if (!plugin) return;

    const element = document.getElementById("visual");
    const { host, calls } = createMockHost();
    const visual = plugin.create({ element, host });

    visual.update(updateOptions(weeklyDataView()));
    const message = element.querySelector(".s-curve__message");
    check("renders synthetic weekly data", message?.textContent === "3 buckets, 2 measures", `got "${message?.textContent}"`);
    check("signals renderingFinished without renderingFailed",
        calls.renderingFinished === 1 && calls.renderingFailed.length === 0,
        JSON.stringify(calls));

    visual.update(updateOptions(emptyDataView()));
    check("renders an empty state for a dataView with no categories",
        element.querySelector(".s-curve--empty") !== null && message.textContent.length > 0);

    visual.update(updateOptions(undefined));
    check("renders an empty state when no dataView is sent", element.querySelector(".s-curve--empty") !== null);
    check("never reports renderingFailed", calls.renderingFailed.length === 0, calls.renderingFailed.join("; "));
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
