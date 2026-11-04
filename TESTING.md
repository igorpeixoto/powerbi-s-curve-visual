# Testing

`npm test` runs everything automated, in this order. CI runs the same command on every push and pull request, with Node 24 on Linux.

| Step | Command | What it checks |
|---|---|---|
| Lint and types | `npm run lint` | ESLint, and strict TypeScript over all of `src/` |
| Contract | `npm run check:capabilities` | `capabilities.json` and `src/settings.ts` agree: 9 cards, 103 properties, 7 data roles |
| Sample | `npm run check:sample` | The sample data generator, and that the CSV, model, report and embedded visual agree |
| Unit | `npm run test:unit` | Pure logic, with Vitest |
| Harness | `npm run test:harness` | The packaged visual in headless Chrome, with Puppeteer and a mock host |

## What's automated

### Unit tests: 206

The time zone is pinned to `Europe/Berlin` in `vitest.config.mjs`, with a guard test, so date logic can't pass just because of the machine it runs on.

| Area | Tests | Covers |
|---|---:|---|
| `src/model` | 121 | Parsing both dataView shapes, unique text bucket keys, weekly bucketing and empty weeks, a week's rows in date order, combining tooltip rows, running totals, % of baseline, axis domains at the capability limits, shared geometry, column layout, highlights in a stack, ISO weeks, matrix rows and row order, empty states, selection identities |
| `src/format` | 38 | The resolution rule, presets, per-instance settings and their order, unit conversion and clamps, number limits, pane language |
| `src/render` | 27 | Theme colours, layout, the auto-unit formatter cache, string tables (en-US matches the defaults, pt-BR has the same keys and placeholders, no unused strings) |
| `src/behaviour` | 20 | Click rules, stale selections, keyboard moves, keeping the focus on the grid, tooltip contents |

### Harness checks: 225

These load the JavaScript and CSS from the packaged visual, not from the source, into a mock host. Clicks go through `document.elementFromPoint`, so a mark covered by something else fails as it would for a real pointer. Any page error or console error also fails the run.

| Area | Checks | Covers |
|---|---:|---|
| Rendering and data shapes | 32 | Real data, zero rows, missing wells, date hierarchy, Category hierarchy, null measures, lone line points, reduced data, tiny viewports, redraws without leaks, alignment within 0.5 px at 400 to 2000 px |
| Interaction | 62 | Selection, multi-select, cross-filter IDs, repeated and blank Category values, a failed update, highlights in a stack, tooltips over a week of daily rows, context menu, keyboard after a filter and with a hidden matrix, high contrast including deselecting, interactions disabled, moved matrix rows |
| Format pane | 92 | Text options in every section, side legends in a narrow visual, pane order with interleaved columns, label backgrounds, category and series formats, labels at the plot's edges, each preset's effect, explicit over preset, the pane model, per-series and per-measure settings, fixed axis ranges, two-line labels, Sunday-start ISO weeks, row order and lines, number limits, alignment while scrolled |
| Localization | 39 | Both languages in the package, the Portuguese pane and visual, formats for each of the 20 format-only locales, fallback to English |

### Sample data: 16

`tools/test_generate_sample_data.py`, with Python's `unittest`: the logistic curve, budgets adding up exactly, actuals lagging and flattening for any seed, same seed giving the same file, and the committed CSV matching the generator.

### How the tests were tested

New checks were verified by breaking the code on purpose and confirming that they failed, then restoring it. `docs/BUILD_LOG.md` records these mutation checks phase by phase. If you run one yourself, rebuild before using `dist/`: the harness packages whatever is in `src/` at the time.

## What isn't automated

A mock host can't prove what the real Power BI does. These stay manual, and a green `npm test` never counts as passing them.

The **Status** column records what has actually been seen in Power BI Desktop, in `docs/BUILD_LOG.md`. "Reported" means the maintainer tried that build in Desktop and said it was fine, without a specific record of this check. "Not yet" means nobody has observed it, not that it failed.

### Data and rendering

| Check | Status |
|---|---|
| Renders with real data bound | Observed |
| Zero rows shows the message, not an empty rectangle | Observed (sample report before its first refresh) |
| A measure with no values leaves its marks empty | Observed |
| Date hierarchy in the Date well shows the specific message | Observed |
| A hierarchy in the Category well, or a date with its Date Hierarchy there, shows the specific message | Observed |
| A left or right legend in a narrow visual cuts long entries with an ellipsis | Observed |
| Resizing in both directions keeps everything aligned | Observed |
| Second x-axis label line | Observed |
| Daily dates sorted descending or by a measure: an as-provided line takes the week's last day, and Tooltips fields cover the whole week | Observed |
| A fixed axis minimum or maximum cuts bars and lines at the plot's edge | Observed |
| A date or number in the Category or Series well shows in its column's format on the axis, legend, matrix, tooltip and Format pane | Observed |
| The first and last x-axis labels show in full, and look right against the axis labels above them and while scrolled | Observed |

### Cross-filtering in a report

| Check | Status |
|---|---|
| Selecting a mark filters another visual on the page | Observed |
| Selecting in another visual highlights this one | Observed, before the stacked highlight fix |
| A highlight in a stacked chart sits inside its own series | Observed |
| Tooltips appear at the cursor with the right content | Observed |
| A report-page tooltip works | Observed |
| The context menu opens on a mark | Observed |
| A bookmark restores a selection, including one made on a table-only cell or a total-row cell | Observed |
| Keyboard: Enter from the visual container, then arrows, then Esc | Observed |

### Themes and accessibility

| Check | Status |
|---|---|
| Switching the report theme recolours everything not set by hand, including data label backgrounds | Observed |
| A Windows high-contrast theme uses only foreground, background and selected colours, including data label backgrounds | Observed |

### The Format pane as an author sees it

| Check | Status |
|---|---|
| Cards show their own groups, with no group under the wrong card | Observed |
| Per-series colours and per-measure line styles apply and save | Observed |
| Presets change the look, and a value set by hand beats them | Observed |
| Reset to default falls back to the preset | Observed |
| The font control and the data label background appear in each card, apply, save, and reset to default | Observed |
| A section with no font of its own follows the General card's font | Observed |
| Matrix row positions per row kind survive a save and reopen | Observed |
| Line widths, including 0 and with Borders off | Reported |
| Out-of-range numbers are refused by the pane's limits | Reported |

### Languages and hosts

| Check | Status |
|---|---|
| Portuguese in the pane, wells and visual, with Desktop's language set to Português (Brasil) | Observed |
| A package with the empty locale files loads | Observed |
| Another locale's formats, such as en-GB, in Desktop | Observed |
| The visual in the Power BI Service | Observed |

### The sample report

| Check | Status |
|---|---|
| Opens from a fresh clone after setting `SampleDataFile` and refreshing | Observed on the build machine; not yet from a separate clone |
| Totals match the CSV: 42,000 planned, 22,686 actual | Observed |
