# Changelog — Physical Progress S-Curve

One version heading per release, one line per change. Rules in RELEASING.md.
Claude Code / Developer: when committing completed work, add a line under [Unreleased].

Severity is measured by what breaks in a **consuming report** — see the table below.
Every version heading must match `pbiviz.json`'s `visual.version` and a `vX.Y.Z` git tag
(CLAUDE.md Hard Rule #2).

## [Unreleased]

- Format pane: nine grouped cards (86 controls plus per-measure and per-series colours, styles, value modes and totals) and three style presets (Classic S-curve, Weekly progress, Minimal) resolved as explicit value, then preset, then base default; axis titles, legend title, label colours, units and precision
- Interaction: selection and cross-filtering from bars, line points, axis labels, matrix cells, row headers and legend entries (Ctrl/Cmd for multi-select, background click clears), highlights from other visuals, tooltips including report-page tooltips, context menu, keyboard navigation with a focus ring and announcements, high-contrast styling, bookmark restore
- Rendering: stacked or clustered columns, cumulative lines with end labels, value axes, weekly x-axis labels, legend, and the aligned matrix with totals, all positioned from the shared x geometry
- Empty states: landing page, missing wells, zero rows, date hierarchy in the Date well, viewport too small
- Data roles per SPEC §4: Category or Date, Series, Column values, Line values, Table-only values, Tooltips
- Model layer: weekly bucketing, running totals, percent of baseline, axis domains, shared x geometry, selection identities
- Scaffold, strict TypeScript, ESLint, unit tests (Vitest), headless harness (Puppeteer), capability parity check, CI and tag-driven release workflow

<!-- Release protocol: the human or Claude Code bumps pbiviz.json visual.version, renames
     [Unreleased] to ## [X.Y.Z] - YYYY-MM-DD (after the Visual Validation Gate passes) and
     opens a fresh [Unreleased] above it. Claude Code creates the vX.Y.Z tag (CLAUDE.md §5). -->

## Version Numbering (Visual-Adapted Semver)

| Bump  | Criteria                                                            |
| ----- | ------------------------------------------------------------------- |
| MAJOR | Breaks an existing report: data role or property removed/renamed,   |
|       | dataViewMappings shape changed, apiVersion bump, or a rendering     |
|       | change that alters the meaning of published numbers                 |
| MINOR | New optional data role, new formatting card/group/property, new     |
|       | rendering capability — existing bindings and settings keep working  |
| PATCH | Rendering fixes, default corrections, label fixes, perf, dependency |
|       | bumps with no contract change                                       |
