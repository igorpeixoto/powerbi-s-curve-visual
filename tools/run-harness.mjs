// Runs harness/index.html in headless Chrome against the packaged visual in dist/resources/
// (produced by `pbiviz package --resources`). Exits 1 on any failed check, page error,
// console error, or timeout.

import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const resourcesDir = join(root, "dist", "resources");
const servedDirs = [join(root, "harness"), resourcesDir];
const timeoutMs = 30_000;

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
};

async function findPackageJson() {
    let entries;
    try {
        entries = await readdir(resourcesDir);
    } catch {
        entries = [];
    }
    const matches = entries.filter((name) => name.endsWith(".pbiviz.json"));
    if (matches.length !== 1) {
        throw new Error(`Expected exactly one *.pbiviz.json in ${resourcesDir}, found ${matches.length}. Run "pbiviz package --resources" first.`);
    }
    return matches[0];
}

function startServer() {
    const server = createServer(async (request, response) => {
        const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        const filePath = normalize(join(root, urlPath));
        const allowed = servedDirs.some((dir) => filePath.startsWith(dir + sep));
        if (!allowed) {
            response.writeHead(404).end();
            return;
        }
        try {
            const body = await readFile(filePath);
            response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream" });
            response.end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    return new Promise((resolveServer) => {
        server.listen(0, "127.0.0.1", () => resolveServer(server));
    });
}

async function main() {
    const packageFile = await findPackageJson();
    const server = await startServer();
    const { port } = server.address();
    const pageErrors = [];
    let browser;
    let result;
    // Everything after the server starts sits in this try, so a failed Chrome launch still closes
    // the server; an open server would keep Node alive and hang CI instead of exiting 1.
    try {
        browser = await puppeteer.launch({
            headless: true,
            // Required on GitHub-hosted Ubuntu runners, where the Chrome sandbox is unavailable.
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        page.on("pageerror", (error) => pageErrors.push(`pageerror: ${error.message}`));
        page.on("console", (message) => {
            if (message.type() === "error") {
                pageErrors.push(`console.error: ${message.text()}`);
            }
        });

        const url = `http://127.0.0.1:${port}/harness/index.html?pkg=/dist/resources/${encodeURIComponent(packageFile)}`;
        await page.goto(url);
        try {
            await page.waitForFunction("window.__harnessDone === true", { timeout: timeoutMs });
            result = await page.evaluate("window.__harnessResult");
        } catch {
            result = { pass: 0, fail: 1, lines: [`FAIL harness did not finish within ${timeoutMs} ms`] };
        }
    } finally {
        await browser?.close();
        server.close();
    }

    for (const line of result.lines) console.log(line);
    for (const error of pageErrors) console.log(`FAIL ${error}`);

    const failures = result.fail + pageErrors.length;
    console.log(`\nHarness: ${result.pass} passed, ${failures} failed`);
    process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((error) => {
    console.error(error);
    // Exit explicitly: a leaked handle (browser process, socket) must never turn a failure into a hang.
    process.exit(1);
});
