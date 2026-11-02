// Keeps the samples honest: runs the data generator's tests (which also compare the committed CSV with the generator),
// and checks that the sample report agrees with the CSV, capabilities.json and pbiviz.json. It can't check rendering:
// opening the report in Desktop is a manual step (TESTING.md).

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const report = join(root, "samples", "report");
const failures = [];
const check = (name, condition, detail = "") => {
    if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};
const readText = (...parts) => readFile(join(...parts), "utf-8");
const readJson = async (...parts) => JSON.parse(await readText(...parts));

// ----- The generator -----
const python = ["python3", "python", "py"].find((command) => {
    const result = spawnSync(command, ["--version"], { encoding: "utf-8" });
    return result.status === 0 && result.stdout.startsWith("Python 3");
});
if (!python) {
    failures.push("Python 3 not found: the sample data generator's tests didn't run");
} else {
    const result = spawnSync(python, ["-B", "-m", "unittest", "discover", "-s", "tools", "-p", "test_*.py"], { cwd: root, encoding: "utf-8" });
    if (result.status !== 0) failures.push(`generate_sample_data.py tests failed:\n${result.stderr}`);
}

// ----- The report against the CSV -----
const [header] = (await readText(root, "samples", "data", "epc_progress.csv")).split("\n");
const tableFile = await readText(report, "s-curve-sample.SemanticModel", "definition", "tables", "progress.tmdl");
const tmdlColumns = [...tableFile.matchAll(/^\tcolumn (\w+)$/gm)].map((match) => match[1]);
check("the model's columns match the CSV header", tmdlColumns.join() === header, `${tmdlColumns.join()} vs ${header}`);
check("the partition reads the path parameter, not a fixed path", tableFile.includes("File.Contents(SampleDataFile)"));
const modelFile = await readText(report, "s-curve-sample.SemanticModel", "definition", "model.tmdl");
check("auto date/time is off, so WeekStart binds as a date and not as a date hierarchy", modelFile.includes("__PBI_TimeIntelligenceEnabled = 0"));
const expressions = await readText(report, "s-curve-sample.SemanticModel", "definition", "expressions.tmdl");
check("the default data path holds no user folder", !/\\Users\\/i.test(expressions));

// ----- The report against the contract -----
const pbiviz = await readJson(root, "pbiviz.json");
const capabilities = await readJson(root, "capabilities.json");
const { guid, version } = pbiviz.visual;
const roles = new Set(capabilities.dataRoles.map((role) => role.name));
const measures = [...tableFile.matchAll(/^\tmeasure (?:'([^']+)'|(\w+))/gm)].map((match) => match[1] ?? match[2]);
const reportDefinition = join(report, "s-curve-sample.Report", "definition");
const { pageOrder } = await readJson(reportDefinition, "pages", "pages.json");
check("the report has one page", pageOrder.length === 1);
const visual = await readJson(reportDefinition, "pages", pageOrder[0], "visuals", "8f41b6c27d9e03a5c1e4", "visual.json");
check("the visual uses this repo's GUID", visual.visual.visualType === guid, visual.visual.visualType);
check("the Classic preset is set", visual.visual.objects?.general?.[0]?.properties?.stylePreset?.expr?.Literal?.Value === "'classic'");
for (const [role, state] of Object.entries(visual.visual.query.queryState)) {
    check(`the well "${role}" is a data role`, roles.has(role));
    for (const { field } of state.projections) {
        if (field.Measure) check(`the measure "${field.Measure.Property}" is in the model`, measures.includes(field.Measure.Property));
        if (field.Column) check(`the column "${field.Column.Property}" is in the model`, tmdlColumns.includes(field.Column.Property));
    }
}

// ----- The embedded visual against the repo -----
const reportFile = await readJson(reportDefinition, "report.json");
check("the report declares the embedded visual", reportFile.resourcePackages.some((item) => item.type === "CustomVisual" && item.name === guid));
const embedded = join(report, "s-curve-sample.Report", "CustomVisuals", guid);
const embeddedDescription = await readJson(embedded, "package.json");
const embeddedPackage = await readText(embedded, "resources", `${guid}.pbiviz.json`);
const embeddedVisual = JSON.parse(embeddedPackage).visual;
check("the embedded visual has this repo's version (run: npm run sample:sync)", embeddedDescription.version === version && embeddedVisual.version === version, `${embeddedVisual.version} vs ${version}`);
check("the embedded visual has this repo's GUID", embeddedVisual.guid === guid);
check("the embedded visual isn't a debug build", !embeddedPackage.includes("_DEBUG"));

if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
}
console.log(`Sample check: generator tests, CSV, model, report and embedded visual ${version} agree`);
