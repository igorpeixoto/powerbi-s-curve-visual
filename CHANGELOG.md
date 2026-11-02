# Changelog — Physical Progress S-Curve

One version heading per release, one line per change. Rules in RELEASING.md.
Claude Code / Developer: when committing completed work, add a line under [Unreleased].

Severity is measured by what breaks in a **consuming report** — see the table below.
Every version heading must match `pbiviz.json`'s `visual.version` and a `vX.Y.Z` git tag
(CLAUDE.md Hard Rule #2).

## [Unreleased]

First release. Everything below is new.

- Field wells: Date or Category, Series, Column values, Line values, Table-only values and Tooltips
- Columns: per-week bars, stacked or clustered by series, on the left axis
- Lines: cumulative lines on the right axis, with running totals computed by the visual, or as a percentage of a baseline measure
- Matrix: aligned with the chart at any width and while scrolling, with totals, optional series rows, a custom row order and a width for the line below any measure row or the header
- X-axis: weekly bucketing from a date field, labels as dates, ISO weeks or project weeks, with an optional second label line
- Format pane: nine grouped cards, per-series and per-measure settings, enforced ranges on number boxes, and three style presets (Classic S-curve, Weekly progress, Minimal) resolved as explicit value, then preset, then base default
- Interaction: selection and cross-filtering from bars, line points, axis labels, matrix cells, row headers and legend entries, highlights from other visuals, tooltips including report-page tooltips, context menu, keyboard navigation with a focus ring and announcements, high-contrast styling, bookmark restore
- Empty states: landing page, missing wells, zero rows, date hierarchy in the Date well, viewport too small
- Localization: all text in English and Brazilian Portuguese, with number and date formats for those and 20 more locales, whose text stays in English
- Samples: a generator for a fictional EPC project (`tools/generate_sample_data.py`) and a sample report (`samples/report`)

<!-- Release protocol: the human or Claude Code bumps pbiviz.json visual.version, renames
     [Unreleased] to ## [X.Y.Z] - YYYY-MM-DD (after the Visual Validation Gate passes) and
     opens a fresh [Unreleased] above it. The tag follows, with the maintainer's approval (RELEASING.md). -->

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
