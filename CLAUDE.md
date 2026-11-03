# CLAUDE.md

Physical Progress S-Curve (`physicalProgressSCurve`) is one reusable Power BI custom visual: weekly bars, cumulative lines and a summary matrix on one time axis. It's a TypeScript repo, open source under MIT. It isn't a report project, so there's no semantic model here apart from the small fixture in `samples/report`.

Reply in the language of the user's prompt. Everything in the repo is in English: code, comments, UI strings, docs and commit messages. Portuguese belongs only in `stringResources/pt-BR`, plus the one mention in the README.

## Where things are

```
SPEC.md                  the v1 contract; behaviour changes start here (§13 records decisions)
ARCHITECTURE.md          how a field well becomes a pixel; TESTING.md: what's automated and what's manual
pbiviz.json              metadata: GUID (permanent), version, apiVersion
capabilities.json        data roles, mappings, one `objects` entry per Format pane card
src/visual.ts            thin glue: settings, render, interactivity
src/settings.ts          Format pane model (CompositeCard > Group > slices) and number LIMITS
src/format/              resolution (explicit, preset, base), applySettings, toRenderOptions
src/model/               pure functions, no DOM: parsing, weeks, totals, geometry, matrix rows, identities
src/render/              scene, layout, D3 drawers, strings, colours
src/behaviour/           selection state, navigation, tooltips, Interactivity
stringResources/         <locale>/resources.resjson; en-US must match defaultStrings in src/render/strings.ts
harness/, tools/         headless harness and mock host; run-harness, check-capabilities, check-sample, sample tools
samples/                 data/epc_progress.csv (generated) and report/ (PBIP with the visual embedded)
docs/BUILD_LOG.md        what the AI and the maintainer did, session by session
.claude/skills/          add-format-setting, check-in-desktop
```

## Commands

```bash
npm test                 # lint (ESLint + tsc) > check:capabilities > check:sample > test:unit > test:harness
npm run test:unit        # Vitest, src/**/__tests__
npm run test:harness     # pbiviz package --resources, then Puppeteer against the packaged JS
npm run sample:sync      # copies dist/ into the sample report (after a clean npm test)
npm start                # pbiviz dev server
```

Fix failing tests in the code, never by weakening a test.

## Hard rules

### Identity and versioning
1. **Never change `visual.guid`.** Power BI binds an imported visual to a report by GUID. A new GUID shows a missing-visual placeholder, and every well has to be re-bound by hand.
2. **`visual.version`, the `CHANGELOG.md` heading and the git tag are one number.** Bump them together, and only upward: the org store refuses a lower version. Keep the fourth segment at `0`.

### Format pane
3. **Every card is a `CompositeCard` split into named `Group`s.** Group names aren't stored, but the formatting library builds each group's uid from its name alone, so they must be unique across all cards. The code prefixes them with the card (`columnsColors`, `linesColors`).
4. **Property names are unique across their whole card.** Each card is one flattened `objects` entry in `capabilities.json`, and `npm run check:capabilities` enforces the match.
5. **Never rename or retype a released property, data role or card `name`.** Saved settings and bindings are keyed by them in each report. A rename doesn't error; it silently resets authors' configuration. Add a new property and read the old one as a fallback.

### Data and rendering
6. **`update()` must survive every degenerate dataView.** A bad update renders an empty rectangle, not an error. Guard explicitly and show a deliberate empty state (`src/model/emptyState.ts`).
7. **Clean up between updates.** `update()` fires on every resize, filter and format change. Listeners are delegated on the root and attached once; slices are created fresh on each model.
8. **Never hardcode a colour.** Read `host.colorPalette`. Pass colours to the renderer only when the author set them, so theme switches still apply.
9. **No host-model assumptions**: no fixed field names, series counts, date grains or locales. Format numbers through `valueFormatter`, with the column's own format string.
10. **Interactivity goes through host services**: `ISelectionManager`, `tooltipService`, `showContextMenu`. Never a DOM-only tooltip.

### Toolchain
11. **Installing the dev certificate and enabling Developer Mode are the maintainer's actions.** Prompt for them; never run them.
12. **Never hand-edit `.api/`, `dist/`, `node_modules/` or `package-lock.json`.** Never bump `apiVersion` without moving `powerbi-visuals-api` to match.
13. **`dist/` is gitignored, and the released `.pbiviz` belongs to its GitHub Release.** The one exception is the copy embedded in `samples/report`, because a report can't open without it.
14. **Line endings are LF**, through `.gitattributes`. A mass of modified files with an empty diff is a CRLF flip, not real edits.

### Workflow
15. **A green `npm test` isn't the whole check.** It covers data shapes, with assertions. It doesn't cover a theme switch, high contrast, real cross-filtering, or the Format pane as an author sees it. Those stay in the manual checklist in `TESTING.md`, and must never be reported as passed because the harness was green. A behavioural change with no new harness assertion is incomplete. See the `check-in-desktop` skill.
16. **`/code-review` and `/simplify` take an explicit effort level and a narrow target** (`src/`, one file or a branch diff, never the repo root), in a fresh session, and never both in one session. Run `/code-review medium src/` before a release.
17. **Branch when a change can break existing reports**: a data role or capabilities change, a removed or renamed property, an `apiVersion` bump. Additive work can go on `main`.

## Project rules

- **Clean room.** Build only from `SPEC.md`, the public Power BI visuals SDK docs and samples, and public library docs (D3, Vitest, Puppeteer). Never read, search or copy from any other visual's source, or from client or employer projects. No client or employer names, real project data, or company URLs or emails anywhere; synthetic data only.
- **Never push, create remotes, tag or publish without the maintainer's explicit approval.** Show the exact commands first.
- **Never invent numbers** (time spent, users, feedback). Use `TODO(igor): …` placeholders.
- **Commits** use the repo-local identity (`git config --local`), never the global one.
- **Consumer-visible changes** get one line under `[Unreleased]` in `CHANGELOG.md`, in the same commit. Severity is what breaks in a consuming report; see the table in `RELEASING.md`.
- **Build log:** append an entry to `docs/BUILD_LOG.md` at the end of every working session.
- **Out of scope for Claude Code:** AppSource submission, Microsoft certification, org-store administration and tenant settings.

## Things that aren't obvious

- **Toolchain:** Node 24 locally and in CI, `powerbi-visuals-tools` pinned as a devDependency, API 5.11.1. `pbiviz start` needs PowerShell 7 on Windows to generate the dev certificate.
- **Never run `pbiviz package` while `pbiviz start` is running.** The dev server rewrites `.tmp/precompile/visualPlugin.ts` with a `<guid>_DEBUG` plugin name, and the package picks it up. On Windows, stopping `npx pbiviz start` can leave its node process alive on port 8080; kill it explicitly.
- **After a mutation check, rebuild before using `dist/`.** `npm run test:harness` packages whatever is in `src/` at the time.
- **`powerbi-visuals-utils-formattingutils` is pinned to 6.1.2.** Version 7.0.0 ships its locale table as an ES module, and the loader in `powerbi-visuals-tools` 7.2.1 `eval`s it as CommonJS, so packaging fails. Revisit when the tools are upgraded.
- **What Power BI actually sends** (Desktop 2.159, observed): a measure in two wells is one column flagged with both roles, with no `rolesIndex` and its well order lost; dates arrive at local midnight; a date hierarchy arrives as Year, Quarter, Month and Day columns; the host doesn't call `update()` after the visual's own `select()`; and Esc is reserved by the host. `SPEC.md` records the consequences.
- **Per-measure settings** are saved on the column with the selector `{ metadata: queryName }`. Since a measure in two wells is one column, a setting that differs by row kind needs one property per kind, such as `columnRowPosition` and `lineRowPosition`.
- **`powerbi.visuals.ValidatorType` is a const enum**, which Vitest's transpiler can't inline, so `src/settings.ts` uses its numeric values.
- **Font controls:** a `FontControl` is one row in the pane and isn't stored; the slices inside it are. So `staticSlices` in `src/format/applySettings.ts` expands it, and any test walking `group.slices` has to as well. A size that already shipped keeps its property name inside the control.
- **Strings:** a new one goes in `defaultStrings` and in both `stringResources` files, with the key `Visual_<key>`; unit tests fail if they differ or if a string is unused. Slices use `displayNameKey: resourceKey("...")`. The formatting library doesn't translate dropdown items or placeholders, so those hold a string key in `settings.ts` until `applySettings` translates them.
- **Locale formats ship per folder.** The packager keeps number and date formats only for en-US and for locales with a `stringResources/<locale>` folder, so 20 locales have an empty `{}` resource file just for that (SPEC Decision 14). Don't delete them as unused.
- **Sample report:** its embedded visual moves only at releases or on purpose (`npm run sample:sync`). `npm run check:sample` fails if its version differs from `pbiviz.json`, or if the report and the CSV disagree. Close the report in Desktop before editing its files, because Desktop overwrites them when it saves.
