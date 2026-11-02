// Copies the packaged visual from dist/ into the sample report, the way Power BI Desktop stores an imported visual.
// Run after a clean `npm test`, and before tagging a release (RELEASING.md): `npm run sample:sync`.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pbiviz = JSON.parse(await readFile(join(root, "pbiviz.json"), "utf-8"));
const { guid } = pbiviz.visual;
const packagePath = join(root, "dist", "resources", `${guid}.pbiviz.json`);

const packaged = await readFile(packagePath, "utf-8").catch(() => {
    throw new Error(`${packagePath} not found. Run "npm test" first.`);
});
if (packaged.includes("_DEBUG")) {
    throw new Error("The package holds a debug build: stop `pbiviz start`, run `npm test`, then sync again.");
}

const target = join(root, "samples", "report", "s-curve-sample.Report", "CustomVisuals", guid);
await mkdir(join(target, "resources"), { recursive: true });
await writeFile(join(target, "resources", `${guid}.pbiviz.json`), packaged);
const description = {
    version: pbiviz.visual.version,
    author: pbiviz.author,
    resources: [{ resourceId: "rId0", sourceType: 5, file: `resources/${guid}.pbiviz.json` }],
    visual: {
        guid,
        name: pbiviz.visual.name,
        displayName: pbiviz.visual.displayName,
        version: pbiviz.visual.version,
        description: pbiviz.visual.description,
        supportUrl: pbiviz.visual.supportUrl,
        gitHubUrl: pbiviz.visual.gitHubUrl,
        visualClassName: pbiviz.visual.visualClassName,
    },
    metadata: { pbivizjson: { resourceId: "rId0" } },
};
await writeFile(join(target, "package.json"), `${JSON.stringify(description, null, 2)}\n`);
console.log(`Synced visual ${pbiviz.visual.version} into the sample report`);
