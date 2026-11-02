# SPEC: Physical Progress S-Curve (v1)

Status: **approved 2026-11-01** (v1 contract). Everything from Phase 2 onward is built against this document. The decisions taken during review are recorded in [§13 Decisions](#13-decisions); changing a role, card, group or property `name` from here on needs a deliberate SPEC change.

## 1. Purpose

Project planners track physical progress with an **S-curve**: for each time bucket (usually a week), the planned and actual quantities of work, plus their running totals. The weekly values show the pace; the cumulative curves show where the project stands against the plan. In the field this lives in spreadsheets as a chart with a table pasted under it, and the two never quite line up.

This visual draws the whole thing natively in Power BI, on **one shared time axis**:

- **columns** for per-bucket values (e.g. weekly planned vs. actual), on the left axis;
- **lines** for cumulative values, on the right axis;
- an aligned **matrix** under the chart: one row per measure, one cell per bucket, optional totals column. Every matrix cell sits exactly under its bucket in the chart.

Typical use: bind `Planned qty` and `Actual qty` to both *Column values* and *Line values*. The visual draws weekly bars, computes the cumulative lines itself, and lists both in the matrix.

## 2. Glossary

| Term | Meaning |
|---|---|
| Bucket | One position on the time axis: a text category, or one week when dates are bound. |
| Measure | A numeric field bound to *Column values*, *Line values* or *Table-only values*. |
| Series | The legend split (e.g. discipline). Splits every measure into one value per series. |
| Running total | The cumulative sum of a measure over buckets, in bucket order. |
| Shared x geometry | The single computation of bucket positions and widths that the chart and the matrix both read. |
| Effective value | A formatting value after the preset resolution rule (§9.2). |

## 3. Layout

```
┌──────────┬──────────────────────────────────────────────┬──────────┐
│ left     │                 plot area                     │ right    │
│ axis     │   ▇ ▇      ▇ ▇      ▇ ▇      ▇ ▇    ___----   │ axis     │
│ (columns)│   ▇ ▇  ▇ ▇ ▇ ▇  ▇ ▇ ▇ ▇  ▇ ▇ ▇___--          │ (lines)  │
│          │ ──┴─┴──┴─┴─┴─┴──┴─┴─┴─┴──┴─┴─┴──────────────  │          │
│          │    W01    W02    W03    W04    W05   …        │          │
├──────────┼──────┬──────┬──────┬──────┬──────┬────────────┼──────────┤
│ Planned  │  10  │  25  │  40  │  55  │  60  │  …         │  Total   │
│ Actual   │   8  │  20  │  35  │      │      │  …         │          │
│ …        │      │      │      │      │      │            │          │
└──────────┴──────┴──────┴──────┴──────┴──────┴────────────┴──────────┘
  left gutter        bucket columns (shared x geometry)        right gutter
```

### 3.1 Shared x geometry (the alignment contract)

- One pure function computes, for a given viewport width and bucket count: the **left gutter**, the **right gutter**, the **plot range** `[plotLeft, plotRight]`, and for each bucket `{ index, x0, x1, center }`.
- **Left gutter** = max(left axis width, matrix row-header width). **Right gutter** = max(right axis width, matrix totals-column width). The chart and the matrix use the same gutters, so the plot range and the matrix bucket columns are the same pixels.
- Bars, line points, x-axis labels and matrix cells are all positioned from this one result. No renderer computes x positions on its own.
- **Alignment must hold at any width and any number of buckets.** Concretely: for the first, middle and last bucket, the bar cluster centre, the line point, the axis label centre and the matrix cell centre are equal to within 0.5 px, at every width from 400 to 2000 px.

### 3.2 Narrow widths and many buckets

- **Bucket gap** (format setting) is the fraction of each bucket left empty between clusters.
- **Minimum bucket width** (format setting, default 0 = always fit): when `bucketCount × minBucketWidth` exceeds the plot range, the chart and the matrix **scroll horizontally together**; the y-axes, matrix row headers and totals column stay pinned. Alignment holds while scrolling.
- **Axis labels** thin out when they would overlap (every 2nd, 4th, … label is shown); the thinning is computed from the geometry, not from the label count.
- **Matrix cell text** that doesn't fit its cell is first abbreviated with automatic display units, then hidden. The cell itself always renders, and its tooltip shows the full value.

### 3.3 Vertical space

- The matrix takes `rows × rowHeight` plus its header, capped at **Matrix max height** (% of the viewport, default 50%). Rows beyond the cap scroll vertically inside the matrix area; vertical scrolling never affects horizontal alignment.
- If the chart would be shorter than 120 px, the matrix is hidden and a small "Matrix hidden: not enough space" note is shown.

## 4. Field wells (data roles)

| Role `name` | Display name | Kind | Types | Min–max | Notes |
|---|---|---|---|---|---|
| `category` | Category | Grouping | any | 0–1 | Text buckets, shown in data order (the model's sort order is respected, e.g. a week label sorted by week number). |
| `categoryDate` | Date | Grouping | date (see note) | 0–1 | Grouped into weeks by the visual (§6.1). The capabilities schema can't require a date type for a role, so values that aren't dates are excluded and counted like null dates (§6.1). |
| `series` | Series | Grouping | any | 0–1 | Legend split. |
| `columnValues` | Column values | Measure | numeric | 0–6 | Per-bucket values, drawn as columns on the left axis. |
| `lineValues` | Line values | Measure | numeric | 0–6 | Drawn as lines on the right axis; by default the visual plots their running total (§6.2). |
| `tableOnlyValues` | Table-only values | Measure | numeric | 0–10 | Rows shown only in the matrix. |
| `tooltips` | Tooltips | Measure | any | 0–10 | Extra fields in the default tooltip. |

- `category` and `categoryDate` are **mutually exclusive**, enforced by Power BI through two `conditions` entries (one with `category ≤ 1, categoryDate = 0`, one the other way round). The code never has to arbitrate between them. (Decision 9.)
- The same measure may be bound to several wells (the typical case is `Planned qty` in both *Column values* and *Line values*). Observed in Power BI Desktop (Oct 2026): such a measure arrives as **one** value column whose `source.roles` flags both roles, positioned by its first well, and the host sends no `rolesIndex`, so the order of measures within the second well is **not** recoverable. The parser reads each value column's `source.roles` and creates one entry per role flagged (and still accepts one column per role). No feature may depend on the order of measures inside a well beyond "as delivered".
- Role names above are final once SPEC.md is approved: renaming a role after release discards report authors' bindings.

### 4.1 dataViewMappings

One **categorical** mapping:

- `categories`: `select` binding `category` and `categoryDate`; `dataReductionAlgorithm: { top: { count: 1000 } }`. The limit counts **distinct source values before weekly bucketing**: 1000 daily dates is under three years, and `top` keeps the first 1000 in sort order, so the most recent dates (the actuals tail) are the ones cut. The documentation will recommend binding a week-start column (1000 weeks ≈ 19 years); the count stays at 1000 for v1 (Decision 8).
- `values`: `group` **by** `series`, `select` binding `columnValues`, `lineValues`, `tableOnlyValues`, `tooltips`; `dataReductionAlgorithm: { top: { count: 30 } }` on series.
- `sorting: { default: {} }`, so authors can sort text buckets from the visual's menu. Date buckets are always chronological.

If Power BI reduces the data (more than 1000 categories or 30 series), the visual shows the host warning icon with a "Not all data is shown" message.

### 4.2 Capability flags

`supportsHighlight`, `supportsMultiVisualSelection`, `supportsKeyboardFocus`, `supportsLandingPage`, `supportsEmptyDataView`, tooltips (`default` and `canvas` report-page tooltips), `privileges: []` (no web access, no local storage). No external JavaScript and no network calls.

## 5. Rendering

### 5.1 Columns

- One cluster per bucket, one bar per column measure, in well order.
- With **series** bound, **Series layout** decides: `stacked` (default; each measure's bar is stacked by series) or `clustered` (one bar per measure × series).
- Colours: without series, one colour per measure; with series, one colour per series, and the 2nd, 3rd, … measure in a cluster use progressively lighter tints of the series colour (100 %, 60 %, 35 %, …). Defaults come from the report theme via `colorPalette.getColor(key)`; authors can override per measure or per series.
- Null values draw no bar; zero draws a zero-height bar (visible to keyboard and tooltips).
- Negative values are supported: the left axis includes zero and extends below it.

### 5.2 Lines

- One line per line measure. With series bound, **Line series mode** decides: `total` (default; one line per measure summed across series) or `perSeries` (one line per measure × series).
- Each point sits at its bucket's `center`. Optional markers. Interpolation `linear` (default) or `monotone` (smooth, never overshoots, so a cumulative curve never appears to go backwards).
- Line styles per measure: solid, dashed or dotted (the usual convention is planned = dashed, actual = solid, but nothing is assumed from names).

### 5.3 Axes

- **Left axis** (columns): auto range including zero, "nice" ticks; optional fixed min/max; labels formatted with the first column measure's format string and the chosen display units.
- **Right axis** (lines): same rules, formatted from the first line measure (or as % in percent mode, §6.3).
- A fixed range cuts what falls outside it: bars stop at the plot's edge, lines are clipped there, and line points outside the range aren't drawn (Decision 15).
- Hidden automatically when their side has nothing to show (no column measures → no left axis).
- **X axis**: one label per bucket (thinned as in §3.2). Date bucket labels per §6.1.
- Gridlines follow the left axis by default; the right axis can show its own.

### 5.4 Data labels

- Column labels: off by default; position `outsideEnd` (default) or `insideEnd`.
- Line labels: `last` point only (default when on) or `all` points.
- Labels that would collide with each other or leave the plot area are hidden, never overlapped.

### 5.5 Legend

- One entry per drawn mark: a measure bound to both columns and lines appears twice, as a bar swatch and as a line sample (with its dash style); the line entry carries the same cumulative suffix as its matrix row (§5.6). With series bound, entries are per series as well.
- Position: top (default), bottom, left, right.
- Clicking a legend entry selects its series (or measure) like a row header (§7.1).

### 5.6 Matrix

- **Rows**, by default in this order: column measures, then line measures, then table-only measures, each in well order. With **Expand series** on, each measure becomes a group: one row per series, then a measure total row.
- **Row order** (Decision 13): the author can give any measure row a position, counted from 1. Rows with a position land in that slot; the others keep their relative order and fill the free slots. On a tie the earlier row goes first; a position past the end means last. The setting is per measure **and per row kind**, so a measure's weekly and cumulative rows move separately. With Expand series on, a measure's series rows and total move as one block, and positions count blocks; series rows inside a block follow the series order the model sends.
- **Lines** (Decision 13): the author can set the width of the line below any measure row (below its total row when series are expanded), and of the line below the header, from 0 to 6 px. The default is the grid's width: 1 px with Borders on, none with Borders off. The pane shows that width for a line the author hasn't set, so typing it is the way back to the default. A saved width draws even with Borders off, so a matrix can have group separators without a grid; a saved 0 removes that line. Lines straddle the row boundary, so they never move rows or change the matrix height. The pane limits positions to 1 through the number of rows and widths to 0 through 6; values outside those limits in a saved report are clamped.
- **Row labels**: the field's display name (which authors can rename in the well). Line rows whose values the visual accumulates get the **cumulative suffix** (`lines.cumulativeSuffix`, localised default " (cumulative)"), so that a measure bound to both columns and lines reads as two distinct rows. The legend uses the same suffix.
- **Cells** show exactly what the chart shows: per-bucket values for column and table-only rows, the plotted cumulative value for line rows. Formatting uses each measure's own format string and the matrix display units.
- **Totals column** (optional, default on): per row, `sum`, `last`, `average` or `none`. The setting is per measure **and per row kind**, so a measure shown as both a weekly row and a cumulative row can total each one differently: column rows default to `sum`, line rows to `last` (the final cumulative value), table-only rows to `sum`.
- Empty cells are blank, not "0".

## 6. Calculations

### 6.1 Date bucketing (weekly)

- Every date maps to the **week that contains it**, starting on **Week start day** (Monday by default, or Sunday). Dates use their local calendar date; time of day is ignored.
- **Show empty weeks** (default on): weeks between the first and last bucket that have no rows are inserted as empty buckets, so the time axis stays continuous. Text buckets are never inferred. If the range spans more than 1000 weeks (typically one outlier date), empty weeks are not filled and the warning icon says so.
- When several dates fall in one week, values are combined per role: column and table-only measures are **summed**; line measures in *as provided* mode take the **last non-null** value in the week by date, whatever order the rows arrive in (a cumulative measure must not be summed); line measures in *running total* mode are summed and then accumulated. *Tooltips* fields add up when numeric, and otherwise show the latest non-null value (Decision 15).
- If the bound date column is already weekly (one date per week), no combining happens. The documentation will recommend binding a week-start column from a date table.
- Null dates, and values in the Date well that aren't dates, are excluded and counted; if any were excluded, the warning icon says how many.
- **Week label format**: `weekStart` (the week's start date, short date in the report locale; default), `isoWeek` (e.g. `2026-W05`; a Sunday-start week takes the number of its Monday), or `projectWeek` (`W1`, `W2`, … counted from the first bucket).
- **Second line** (optional, default none): a second label line under each week in any of the same formats, e.g. the date above and the ISO or project week below (Decision 12). Text buckets always use one line.

### 6.2 Cumulative values

Per line measure (and per series in `perSeries` mode):

- **Value mode** `runningTotal` (default): the visual accumulates the per-bucket values in bucket order. `asProvided`: values are plotted as they arrive (for measures that are already cumulative in DAX, or ratios).
- **Null vs. zero**: null means "nothing reported for this bucket"; zero is a reported value. In running-total mode a null bucket adds nothing and the line carries the previous cumulative value across it.
- **Line end** `lastValue` (default): the line stops at the last bucket with a non-null source value. This makes an actuals line end at the last reported week instead of running flat to the end of the project. `lastBucket`: the line carries its last cumulative value to the final bucket (useful for a plan whose last weeks are blank).
- Leading nulls: the line starts at the first non-null bucket.

### 6.3 Percent display

Physical progress is usually read as a percentage. **Display as** `value` (default) or `percentOfBaseline`, where the baseline is the **grand total of the line measure marked *Use as % baseline*** (normally the plan). If none is marked, the first line measure as delivered is used (see §4: well order isn't recoverable for measures bound to two wells, so authors should mark the baseline explicitly). If several are marked, the first marked one, in delivered order, wins. In percent mode every line and its matrix rows show `cumulative ÷ baseline`, and the right axis runs from 0 % to 100 % (it extends above 100 % if values exceed the baseline). Column values and the left axis are unaffected.

### 6.4 Scales and domains

- Left domain: from min(0, smallest stacked or clustered value) to max(0, largest), padded to nice ticks; fixed min/max override either end.
- Right domain: the same over every plotted cumulative point (or 0–100 % in percent mode, as in §6.3).
- With no values at all on a side, that side's domain is empty and its axis is hidden.

## 7. Interaction

### 7.1 Selection and cross-filtering

| Element | Selection identity | Effect |
|---|---|---|
| Bar | bucket (+ series) + measure | cross-filters by bucket (and series) |
| Line point | bucket (+ series in `perSeries` mode) + measure | as above |
| X-axis label | bucket | cross-filters by bucket |
| Matrix cell | bucket (+ series for expanded rows) + measure | as above |
| Matrix row header, legend entry | series (series rows), or measure (measure rows) | series rows cross-filter by series; measure rows only emphasise that measure within the visual |

- A **date bucket** spans several rows of the date column; selecting it selects all of their identities.
- **Ctrl/Cmd-click** adds or removes from the selection. A **background click** clears it; clicking the only selected mark again also clears it.
- Unselected marks dim (opacity 0.4); selected marks stay at full strength.
- **Stale selections**: after a data update, identities that no longer exist are dropped; if none remain, the visual shows the unselected state. Selection restored by bookmarks is honoured through the selection callback.
- When the host disallows interactions (`allowInteractions = false`), clicks do nothing and nothing dims.

### 7.2 Highlights from other visuals

When another visual highlights a subset, the highlighted part is shown solid and the full value faded: bars draw the full bar faded with the highlighted portion solid, inside its own series' segment when stacked; lines draw the cumulative of the highlighted values solid, with the full line faded behind it; matrix cells show the highlighted values (the tooltip shows both).

### 7.3 Tooltips and context menu

- Default tooltip on bars, line points and matrix cells: bucket label, series (if any), measure name and formatted value; for line points also the per-bucket value; plus every *Tooltips* field for that bucket.
- Report-page tooltips (canvas) are supported.
- Right-click on any mark opens the Power BI context menu for that mark's identity; on the background, for an empty identity.

### 7.4 Keyboard and accessibility

- Entering and leaving follow the host (Microsoft's keyboard rules for custom visuals): **Enter** on the visual container moves focus inside, **Esc** moves it back out to the container and keeps the selection; with keyboard focus enabled, Tab stays inside the visual until Esc. Inside, **←/→** move between buckets, **↑/↓** between measures (and series), **Enter/Space** selects the focused mark (or clears the selection when it is the only selected mark), and **Ctrl+Enter** adds or removes it. The matrix is reachable with the same keys (↓ past the last chart measure moves into the matrix rows), unless it's hidden for lack of space.
- The focused mark has a visible focus ring. Every focusable mark has an `aria-label` such as "Week of 2 Feb 2026, Planned, 120".
- **High-contrast mode** (`colorPalette.isHighContrast`): all marks use the foreground colour; measures are told apart by fill vs. outline (bars), dash style and markers (lines); selection uses `foregroundSelected`. No information is carried by colour alone.
- **Theme colours** are the only source of default colours; nothing is hardcoded.

## 8. Empty and degenerate states

| Situation | Behaviour |
|---|---|
| No fields bound | Landing page: short description of the visual and which wells to fill. |
| Bucket field bound, no measures (or the reverse) | Message naming the missing well(s). |
| Wells bound, zero rows | "No data for the current filters." |
| Date well holds a date hierarchy (Year/Quarter/Month/Day) instead of a date | "Use the date field itself, not its Date Hierarchy" (with how to switch it in the well). |
| A measure whose values are all null | Its marks and matrix row stay empty; everything else renders. No error. |
| No column measures / no line measures / no table-only measures | That part simply isn't drawn; its axis is hidden. Not an error. |
| One bucket | Renders normally (one cluster, a single line point with a marker). Any line point with no reported neighbour keeps a marker, even with markers off. |
| Data reduced by Power BI, or null dates excluded | Host warning icon with a short explanation. |
| Viewport too small for any chart | "Make the visual larger to see the chart." |

`update()` never throws on any of these, and the visual always reports `renderingFinished` (or `renderingFailed` with a reason for genuine errors).

## 9. Format pane

### 9.1 Principles

- Every card is a `CompositeCard` split into named groups. Property names are unique across their card (they are flattened into one `capabilities.json` object per card).
- Card and property `name`s below are **final** once SPEC.md is approved; they are stored in reports. `displayName`s are localised.
- Group names are never stored, but the formatting library derives each group's uid from its name alone, so they must be unique across all cards. The code prefixes each group with its card (`columnsColors`, `linesColors`, …); the short group names below are the SPEC's labels for them. (Found in the Phase 5 Desktop check, where groups with the same name collided across cards.)
- Number boxes carry limits the pane enforces on input; saved values outside them are clamped when rendering. Text sizes 6 to 40; decimal places 0 to 9; opacity and gaps within a bucket 0 to 100 %; gap between buckets 0 to 90 %; minimum bucket width 0 to 400 px; corner radius 0 to 40 px; stroke width 0.5 to 12 px; marker size 1 to 20 px; gridline width 0.5 to 6 px; row height 12 to 60 px; matrix maximum height 10 to 90 %; matrix line widths 0 to 6 px; matrix row positions 1 to the number of rows. Axis minimum and maximum have no limits, because negative values are valid there.
- v1 has **88 static controls** (86 at approval, plus the x-axis second line from Decision 12 and the matrix header line from Decision 13), plus per-instance controls (colours, line styles, value modes, totals, matrix row positions and lines) repeated once per measure or series. All of them stay in v1 (Decision 7).

### 9.2 Style presets and the resolution rule

**Style preset** (`general.stylePreset`): `classic` (default), `weeklyProgress`, `minimal`.

```
effective value = author's explicit value ?? preset default ?? base default
```

- "Explicit" means the property exists in the report's saved formatting (`dataView.metadata.objects`), not merely that it equals some value.
- **Base defaults are the Classic look**, so `classic` overrides nothing. The other presets override only the properties listed below.
- Switching preset never erases explicit values: what an author set by hand survives. Resetting a property in the Format pane removes the explicit value, so it falls back to the preset.
- The Format pane always shows **effective** values.

| Property | Base (= Classic) | Weekly progress | Minimal |
|---|---|---|---|
| `columns.showColumns` | on | on | **off** |
| `columns.columnOpacity` | 100 | 100 | — |
| `general.bucketGap` | 20 | **10** | 20 |
| `lines.strokeWidth` | 2 | **1** | 2 |
| `lines.lineOpacity` | 100 | **50** | 100 |
| `dataLabels.columnLabelsShow` | off | **on** | off |
| `dataLabels.lineLabelsShow` | on (last point) | **off** | **off** |
| `leftAxis.gridlineStyle` | dashed | dashed | **solid** |
| `leftAxis.gridlineColor` | theme | theme | **lighter theme tint** |
| `matrix.showMatrix` | on | **off** | **off** |
| `legend.legendPosition` | top | top | **bottom** |

### 9.3 Cards

Types: T toggle, N number, % percent number, C colour, D dropdown, X text, F font. "Inst." marks per-instance properties (one per measure or series, via selectors).

**General** (`general`)
- *Preset* (`preset`): `stylePreset` D
- *Layout* (`layout`): `minBucketWidth` N (0 = fit), `bucketGap` % (20), `fontFamily` F (theme default)

**Columns** (`columns`), card toggle `showColumns` T
- *Options* (`options`): `seriesLayout` D (stacked | clustered), `clusterGap` % (10), `columnOpacity` % (100), `cornerRadius` N (0)
- *Colors* (`colors`): `columnFill` C, Inst. (one per series when Series is bound, otherwise one per column measure)

**Lines** (`lines`), card toggle `showLines` T
- *Options* (`options`): `lineSeriesMode` D (total | perSeries), `strokeWidth` N (2), `lineOpacity` % (100), `interpolation` D (linear | monotone), `showMarkers` T (off), `markerSize` N (4)
- *Values* (`values`): `valueMode` D (runningTotal | asProvided), Inst.; `lineEnd` D (lastValue | lastBucket), Inst.; `percentBaseline` T (off), Inst.; `displayAs` D (value | percentOfBaseline); `cumulativeSuffix` X (" (cumulative)")
- *Colors and style* (`colors`): `lineColor` C, Inst.; `lineStyle` D (solid | dashed | dotted), Inst. `lineColor` applies to total-across-series lines; in `perSeries` mode each line takes its series colour (`columnFill`), tinted per measure.

**Y-axis (columns)** (`leftAxis`), card toggle `showLeftAxis` T
- *Range* (`range`): `leftMin` N, `leftMax` N (auto)
- *Labels* (`labels`): `leftLabelFontSize` N (9), `leftLabelColor` C, `leftDisplayUnits` D (auto), `leftPrecision` N (auto)
- *Title* (`title`): `leftTitleShow` T (off), `leftTitleText` X, `leftTitleFontSize` N (11), `leftTitleColor` C
- *Gridlines* (`gridlines`): `gridlinesShow` T (on), `gridlineColor` C, `gridlineWidth` N (1), `gridlineStyle` D (solid | dashed | dotted)

**Y-axis (lines)** (`rightAxis`), card toggle `showRightAxis` T
- *Range*: `rightMin` N, `rightMax` N
- *Labels*: `rightLabelFontSize` N, `rightLabelColor` C, `rightDisplayUnits` D, `rightPrecision` N
- *Title*: `rightTitleShow` T, `rightTitleText` X, `rightTitleFontSize` N, `rightTitleColor` C
- *Gridlines*: `rightGridlinesShow` T (off)

**X-axis** (`xAxis`), card toggle `showXAxis` T
- *Labels* (`labels`): `xLabelFontSize` N (9), `xLabelColor` C, `weekLabelFormat` D (weekStart | isoWeek | projectWeek), `weekLabelSecondLine` D (none | weekStart | isoWeek | projectWeek), `weekStartDay` D (monday | sunday), `showEmptyWeeks` T (on)
- *Title* (`title`): `xTitleShow` T (off), `xTitleText` X

**Data labels** (`dataLabels`)
- *Columns* (`columnLabels`): `columnLabelsShow` T, `columnLabelPosition` D (outsideEnd | insideEnd), `columnLabelFontSize` N, `columnLabelColor` C, `columnLabelDisplayUnits` D, `columnLabelPrecision` N
- *Lines* (`lineLabels`): `lineLabelsShow` T, `lineLabelPoints` D (last | all), `lineLabelFontSize` N, `lineLabelColor` C, `lineLabelDisplayUnits` D, `lineLabelPrecision` N

**Legend** (`legend`), card toggle `showLegend` T
- *Options* (`options`): `legendPosition` D (top | bottom | left | right), `legendShowTitle` T (off), `legendTitleText` X
- *Text* (`text`): `legendFontSize` N (9), `legendColor` C

**Matrix** (`matrix`), card toggle `showMatrix` T
- *Options* (`options`): `showTotals` T (on), `totalsLabel` X ("Total"), `expandSeries` T (off)
- *Values* (`values`): `columnTotalAggregation`, `lineTotalAggregation`, `tableTotalAggregation` D (sum | last | average | none), each Inst. per measure; `matrixDisplayUnits` D (auto), `matrixPrecision` N (auto)
- *Row order and lines* (`rows`): `columnRowPosition`, `lineRowPosition`, `tableRowPosition` N, each Inst. per measure (shows the row's effective position); `columnRowLineWidth`, `lineRowLineWidth`, `tableRowLineWidth` N (grid width), each Inst. per measure
- *Text* (`text`): `matrixFontSize` N (9), `matrixFontColor` C, `headerFontColor` C, `headerBold` T (on)
- *Grid* (`grid`): `rowHeight` N (20), `showBorders` T (on), `borderColor` C, `headerLineWidth` N (grid width), `banding` T (off), `maxHeightPercent` % (50)

All colour defaults come from the theme (foreground, secondary foreground, or `getColor` for data colours).

## 10. Localization

- en-US is the default; pt-BR ships in `stringResources/pt-BR/resources.resjson`. Every role, card, group and property `displayName`, every enum label and every UI string (empty states, warnings, suffixes, week-label prefixes, aria-labels) uses a `displayNameKey` / resource key.
- Numbers and dates are formatted with Power BI's value formatter in the host locale (`host.locale`), using each measure's own format string. No hand-rolled decimal or thousands separators.
- Stored values never translate: only display text does. Text the author typed (titles, totals label, suffix) stays as typed. ISO week labels keep the ISO format (`2026-W05`) in every language; project weeks use the localised prefix (`W1`, `S1`).
- A language without a translation shows English text, never a resource key.
- **Locale formats:** the packager only keeps number and date formats for en-US and for locales with a folder in `stringResources/` (the localization loader in `powerbi-visuals-tools`). So 20 more locales ship an empty resource file, which gives them their own formats with English text (Decision 14): en-GB, en-AU, en-CA, en-IE, en-IN, en-ZA, de-DE, fr-FR, fr-CA, es-ES, es-MX, es-AR, es-CL, pt-PT, it-IT, nl-NL, sv-SE, nb-NO, da-DK, pl-PL. A report in any other locale gets en-US formats. Adding a locale costs about 1 KB.

## 11. Non-goals for v1

- Drill-down / drill-through hierarchies on the time axis.
- Small multiples.
- Forecasting, trend extrapolation or earned-value metrics (SPI, CPI, EAC). The visual plots what the model provides.
- Bucketing other than weekly (daily, monthly, quarterly). Text buckets cover any other grain the model prepares.
- A data-date / "today" marker line.
- Model-side totals for the matrix (totals are computed in the visual, per §5.6).
- Conditional formatting (fx) on colours or values.
- More than two value axes, or per-measure chart-type switching beyond columns/lines.
- Exporting or editing matrix contents; R or Python visuals.
- AppSource certification (later, not v1).

## 12. Acceptance criteria (drive the tests)

Unit (model layer, no DOM):
- Weekly bucketing for both week start days, across year boundaries and DST changes; empty weeks inserted only when enabled. Date tests run under a pinned time zone that observes DST (e.g. `Europe/Berlin`), set in the Vitest setup, because CI runs in UTC and the development machine's zone has no DST.
- Per-role combining within a week (sum vs. last non-null).
- Running totals: carry across null buckets, stop after the last non-null value (`lastValue`), carry to the end (`lastBucket`), leading nulls, negative values, a single bucket.
- Percent of baseline, including a zero or null baseline (no division by zero: lines stay in value mode with a warning).
- Domain and nice-tick calculations for both axes, with fixed min/max, negatives, all-null sides.
- Shared geometry: gutters, bucket positions and centres for many widths and counts; minimum bucket width and scroll extent; label thinning.
- Preset resolution: explicit beats preset beats base; reset falls back to the preset; switching preset keeps explicit values.

Harness (packaged visual, mock host):
- Alignment: bar, line point, axis label and matrix cell centres equal within 0.5 px at the first, middle and last bucket, at 400, 800, 1200 and 2000 px.
- Every row of the §8 table renders its message or partial chart without `renderingFailed`.
- Selection: each element in §7.1 calls `select` with the expected identities; Ctrl-click accumulates; a background click clears; stale selections are dropped after an update; nothing happens when interactions are disallowed.
- Highlights render the solid/faded split; the context menu opens with the mark's identity; tooltips carry the expected fields.
- Keyboard: arrows move focus, Enter selects, Enter on the only selected mark clears; focusable marks have aria-labels.
- High contrast: no data colour other than foreground/selected colours is used.
- Each preset renders without errors; capability parity stays green.

## 13. Decisions

Settled in the SPEC review on 2026-11-01 (all as proposed in the draft):

1. **Percent display (§6.3)**: included. `displayAs = percentOfBaseline`. Amended after the Desktop check: the baseline is the line measure marked with the per-measure `percentBaseline` toggle, falling back to the first line measure as delivered.
2. **Highlights (§7.2)**: the highlighted subset is shown in bars, lines and the matrix, with full values as faded context in the chart.
3. **Line end (§6.2)**: `lastValue` is the default for every line measure; a plan with blank final weeks is switched to `lastBucket` by the author. No positional assumptions.
4. **Series with several measures (§5.1)**: `stacked` by series is the default, with lighter tints for the 2nd and later measures.
5. **Measure-row selection (§7.1)**: clicking a measure row header (no series) only emphasises that measure inside the visual.
6. **Cumulative suffix (§5.6)**: " (cumulative)" by default, localised.
7. **Control count (§9.1)**: all 86 static controls stay in v1.
8. **Limits (§4.1)**: 1000 distinct dates or categories before bucketing, 30 series, 6 column, 6 line and 10 table-only measures; the documentation recommends binding a week-start date column.
9. **Category and Date (§4)**: mutually exclusive in v1, enforced by `conditions`. Allowing both (date for ordering, text for labels) would be an additive change later.
10. **Date hierarchy in the Date well (§8)**: decided after the Desktop check. Power BI sends Year/Quarter/Month/Day columns instead of dates; the visual detects it and shows a specific message rather than rebuilding dates from localised level values.
11. **Keyboard exit (§7.4)**: decided at the start of Phase 4. The host reserves Esc to move focus out of a custom visual, so Esc no longer clears the selection; Enter on the only selected mark (or a background click) clears it, as in built-in visuals.
12. **Two-line x-axis labels (§6.1, §9.3)**: requested after the Phase 5 Desktop review. A new `xAxis.weekLabelSecondLine` dropdown adds an optional second label line for week buckets (none by default), so authors can show, for example, the date and the ISO or project week together. Tooltip headers and keyboard announcements show both lines.
13. **Matrix row order and lines (§5.6, §9.3)**: requested after the Phase 5 Desktop review, so authors can group rows by type or discipline and separate the groups visually. Per measure and row kind, a position and the width of the line below; a static width for the line below the header. Series rows inside an expanded measure don't get their own settings: they move with the measure and follow the series order the model sends.
14. **Locale formats (§10)**: found in Phase 6. Without a folder in `stringResources/`, a UK, German or Spanish report showed `1/5/2026` and `10,994`, because the packager drops those formats. All 352 locales would add about 470 KB and 352 folders, so v1 ships 20 major ones, with English text.
15. **Week tooltips and fixed ranges (§5.3, §6.1)**: found by the code review before v1. A numeric *Tooltips* field adds up over a week's rows, as the bars do, so the tooltip and the bar describe the same days; text has no sum, so it shows the latest value. A non-additive measure, such as a percentage bound to a daily date, adds up too; binding a week-start column avoids that. Marks outside a fixed axis range are cut at the plot's edge, not drawn over the axis labels. Bars are shortened rather than clipped, so the keyboard focus ring stays in the plot too; a line point outside the range isn't drawn, so its focus falls back to the bucket's band.
