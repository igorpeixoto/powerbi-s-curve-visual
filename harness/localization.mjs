// Phase 6 checks (SPEC §10): the package ships both languages and the format-only locales, and with the string resources in the package, the pane
// and the visual read in the host's language, with numbers and dates in its format. Stored values never translate.
import { createMockHost } from "./mock-host.mjs";
import { progressDataView } from "./data.mjs";

function newContainer(width = 800, height = 500) {
    const container = document.createElement("div");
    container.style.cssText = `position:fixed;left:0;top:0;z-index:30;width:${width}px;height:${height}px;overflow:hidden;background:#fff`;
    document.body.appendChild(container);
    return container;
}

function render(visual, dataView, width = 800, height = 500) {
    visual.update({ dataViews: dataView ? [dataView] : [], viewport: { width, height }, type: 2, viewMode: 0, editMode: 0 });
}

/** All nodes of the formatting model whose descriptor names `property`. */
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

export function runLocalizationChecks(plugin, stringResources, check) {
    const en = stringResources?.["en-US"] ?? {};
    const pt = stringResources?.["pt-BR"] ?? {};
    check("the package ships en-US and pt-BR with the same keys",
        Object.keys(en).length > 100 && Object.keys(en).sort().join() === Object.keys(pt).sort().join(), `${Object.keys(en).length} / ${Object.keys(pt).length}`);

    // The same report, in Portuguese.
    const container = newContainer();
    const { host, calls } = createMockHost({ locale: "pt-BR", strings: pt });
    const visual = plugin.create({ element: container, host });
    const q = (selector) => container.querySelector(selector);

    check("the Format pane is in Portuguese before the first update", JSON.stringify(visual.getFormattingModel()).includes("Eixo X"));
    render(visual, undefined);
    check("the landing page is in Portuguese", container.textContent.includes(pt.Visual_landingTitle), container.textContent.slice(0, 80));

    const objects = { general: { stylePreset: "classic" }, leftAxis: { leftTitleShow: true } };
    render(visual, progressDataView({ reportedWeeks: 20, objects }));
    const model = visual.getFormattingModel();
    const pane = JSON.stringify(model);
    check("no resource key or string key reaches the pane", !pane.includes("Visual_") && !/"(enum|pane|placeholder|instance)[A-Z]/.test(pane), pane.match(/.{30}(Visual_|"enum[A-Z]|"pane[A-Z]).{20}/)?.[0]);
    check("the cards are in Portuguese", model.cards.map((c) => c.displayName).join() === "Geral,Colunas,Linhas,Eixo Y (colunas),Eixo Y (linhas),Eixo X,Rótulos de dados,Legenda,Matriz", model.cards.map((c) => c.displayName).join());
    const preset = paneSlices(model, "stylePreset")[0];
    check("dropdown items are in Portuguese, with stored values untouched",
        preset.value.displayName === pt.Visual_enumClassic && preset.value.value === "classic" && preset.items.map((i) => i.value).join() === "classic,weeklyProgress,minimal",
        JSON.stringify(preset.value));
    check("per-measure labels name the measure in Portuguese", pane.includes("Sum of PlannedQty · Modo de valor") && pane.includes("Sum of PlannedQty (linha) · Posição"));
    check("placeholders are in Portuguese", paneSlices(model, "leftTitleText")[0].placeholder === pt.Visual_placeholderMeasureName);
    check("default texts in the pane are in Portuguese", paneSlices(model, "cumulativeSuffix")[0].value === pt.Visual_cumulativeSuffix);

    const header = q('[data-role="row-header"][data-row="2"]')?.textContent;
    check("the cumulative suffix on the visual is in Portuguese", header === "Sum of PlannedQty (acumulado)", header);
    const dateLabel = q('[data-role="x-label"][data-bucket="0"]')?.textContent;
    check("dates use the host's format", dateLabel === "05/01/2026", dateLabel);
    const total = q('[data-role="total"][data-row="0"]')?.textContent;
    check("numbers use the host's separators", /^\d{1,3}(\.\d{3})+$/.test(total ?? ""), total);

    render(visual, progressDataView({ reportedWeeks: 20, objects: { xAxis: { weekLabelFormat: "projectWeek" } } }));
    const weekLabel = q('[data-role="x-label"][data-bucket="0"]')?.textContent;
    check("project weeks use the Portuguese prefix", weekLabel === "S1", weekLabel);
    render(visual, progressDataView({ reportedWeeks: 20, objects: { xAxis: { weekLabelFormat: "isoWeek" } } }));
    const isoLabel = q('[data-role="x-label"][data-bucket="0"]')?.textContent;
    check("ISO weeks keep the ISO format in any language", isoLabel === "2026-W02", isoLabel);
    render(visual, progressDataView({ reportedWeeks: 20, objects: { matrix: { totalsLabel: "Soma final" }, lines: { cumulativeSuffix: " (acum.)" } } }));
    check("text the author typed is left as typed", q('[data-role="totals-header"]')?.textContent === "Soma final" && q('[data-role="row-header"][data-row="2"]')?.textContent === "Sum of PlannedQty (acum.)");
    container.remove();

    // English from the package's own en-US resources.
    const enContainer = newContainer();
    const english = createMockHost({ strings: en });
    const enVisual = plugin.create({ element: enContainer, host: english.host });
    render(enVisual, progressDataView({ reportedWeeks: 20 }));
    const enPane = JSON.stringify(enVisual.getFormattingModel());
    check("en-US reads the same as the built-in defaults", enPane.includes("Y-axis (columns)") && enPane.includes("Classic S-curve") && !enPane.includes("Visual_"));
    enContainer.remove();

    // Locales shipped for their number and date formats: an empty resource file, so the text stays in English.
    const FORMATS = {
        "en-GB": ["05/01/2026", "10,994"], "en-AU": ["5/01/2026", "10,994"], "en-CA": ["05/01/2026", "10,994"], "en-IE": ["05/01/2026", "10,994"],
        "en-IN": ["05-01-2026", "10,994"], "en-ZA": ["2026/01/05", "10 994"], "de-DE": ["05.01.2026", "10.994"], "fr-FR": ["05/01/2026", "10 994"],
        "fr-CA": ["2026-01-05", "10 994"], "es-ES": ["05/01/2026", "10.994"], "es-MX": ["05/01/2026", "10,994"], "es-AR": ["05/01/2026", "10.994"],
        "es-CL": ["05-01-2026", "10.994"], "pt-PT": ["05-01-2026", "10.994"], "it-IT": ["05/01/2026", "10.994"], "nl-NL": ["5-1-2026", "10.994"],
        "sv-SE": ["2026-01-05", "10 994"], "nb-NO": ["05.01.2026", "10 994"], "da-DK": ["05-01-2026", "10.994"], "pl-PL": ["2026-01-05", "10 994"],
    };
    const shipped = Object.keys(stringResources ?? {}).filter((locale) => locale !== "en-US" && locale !== "pt-BR").sort();
    check("the package ships the format-only locales", shipped.join() === Object.keys(FORMATS).sort().join(), shipped.join());
    const localeCalls = [];
    for (const [locale, [date, number]] of Object.entries(FORMATS)) {
        const localeContainer = newContainer();
        const localeHost = createMockHost({ locale, strings: stringResources?.[locale] });
        const localeVisual = plugin.create({ element: localeContainer, host: localeHost.host });
        render(localeVisual, progressDataView({ reportedWeeks: 20 }));
        const shownDate = localeContainer.querySelector('[data-role="x-label"][data-bucket="0"]')?.textContent;
        // Some locales group digits with a no-break space.
        const shownNumber = localeContainer.querySelector('[data-role="total"][data-row="0"]')?.textContent?.replace(/\s/g, " ");
        const localePane = JSON.stringify(localeVisual.getFormattingModel());
        check(`${locale} shows its own formats, with English text`, shownDate === date && shownNumber === number && localePane.includes("Y-axis (columns)") && !localePane.includes("Visual_"), `${shownDate} | ${shownNumber}`);
        localeCalls.push(localeHost.calls);
        localeContainer.remove();
    }

    // A locale the package has no folder for: en-US text and formats, never a key.
    const otherContainer = newContainer();
    const other = createMockHost({ locale: "ja-JP" });
    const otherVisual = plugin.create({ element: otherContainer, host: other.host });
    render(otherVisual, progressDataView({ reportedWeeks: 20 }));
    const otherPane = JSON.stringify(otherVisual.getFormattingModel());
    check("a locale without a folder falls back to en-US, never to keys", otherPane.includes("Y-axis (columns)") && !otherPane.includes("Visual_") && otherContainer.querySelector('[data-role="x-label"][data-bucket="0"]')?.textContent === "1/5/2026");
    otherContainer.remove();

    return [calls, english.calls, other.calls, ...localeCalls];
}
