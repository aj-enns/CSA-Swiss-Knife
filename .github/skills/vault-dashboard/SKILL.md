---
name: vault-dashboard
description: "Obsidian dashboard component library for visual vault rendering. CSS component catalog (stat cards, funnel bars, timeline, milestone rows, action streams, status pills, stacked bars, customer scorecards), Charts View patterns (Bar, Pie, Treemap, Column with dataviewjs data), DataviewJS HTML rendering patterns, Meta Bind filter wiring, and design rules for building new dashboard pages from vault data. Triggers: dashboard design, new dashboard, dashboard component, visualize vault data, chart from vault, styled dataview, add chart, enhance dashboard, dashboard layout, create scorecard, visual pipeline, vault visualization."
---

# Obsidian Dashboard — Component Library & Design System

Reusable visual components for rendering vault data in Obsidian. All components are proven in production on the Pipeline Intelligence Dashboard. Use these patterns when building any new dashboard page or enhancing existing vault notes with visualizations.

## Freedom Level

**Medium** — Component selection involves judgment (choosing the right viz for the data shape). Layout composition is creative. Data queries must be exact.

## Plugin Stack

| Plugin | Role | Required? |
|--------|------|-----------|
| **Dataview** | Live vault queries (`dataview` + `dataviewjs` blocks) | ✅ Required |
| **Charts View** (`obsidian-chartsview-plugin`) | Rendered charts (Bar, Pie, Treemap, Column, DualAxes, Radar) powered by Ant Design Charts | ✅ Required for charts |
| **Meta Bind** v0.12+ | Inline filter controls (`INPUT[inlineSelect]`, `INPUT[text]`) bound to frontmatter | Optional — graceful degradation |
| **Iconize** | `icon:` frontmatter → sidebar file icons | Optional — cosmetic |
| **Style Settings** | Exposes CSS variables for color/layout tweaks | Optional — cosmetic |
| **MCL Multi Column** | CSS snippet for multi-column layouts | Already installed |

## Page Setup

Every dashboard note MUST include:

```yaml
---
cssclasses:
  - wide-page        # Activates 1200px max-width + compact table styling
tags:
  - dashboard
icon: LiLayoutDashboard
sticker: lucide//layout-dashboard
---
```

The `wide-page` class hooks into `dashboard.css` to enable all component styles.

---

## Component Catalog

### 1. Stat Cards (`.dashboard-cards` + `.customer-card`)

Flex row of KPI cards with emoji icon, uppercase label, and bold value. Cards auto-wrap on narrow screens.

**When to use**: Top of any dashboard for aggregate stats (totals, counts, alerts).

**RAG coloring**: Add `.rag-green`, `.rag-amber`, or `.rag-red` to the card div for left-border color coding.

**DataviewJS pattern**:
```js
const cards = [
  { icon: "💰", label: "Total ACR/mo", value: "$128,500", cls: "" },
  { icon: "⚠️", label: "At Risk", value: 19, cls: "rag-amber" },
  { icon: "🔴", label: "Blocked", value: 3, cls: "rag-red" },
];
const html = '<div class="dashboard-cards">' + cards.map(c =>
  '<div class="customer-card ' + c.cls + '" style="flex:1 1 140px;min-width:130px;text-align:center;">' +
    '<div style="font-size:1.8em;margin-bottom:2px;">' + c.icon + '</div>' +
    '<div style="font-size:0.72em;text-transform:uppercase;letter-spacing:0.05em;opacity:0.65;">' + c.label + '</div>' +
    '<div style="font-size:1.6em;font-weight:700;margin-top:2px;">' + c.value + '</div>' +
  '</div>'
).join("") + '</div>';
dv.el("div", html);
```

---

### 2. Funnel Bars (`.funnel-row` + `.funnel-bar`)

Horizontal bars proportional to a max value. Label on the left, bar in the middle, count on the right.

**When to use**: Stage progression, category distribution where order matters, pipeline funnels.

**DataviewJS pattern**:
```js
const stages = ["Stage A","Stage B","Stage C"];
const colors = ["#0078D4","#00B7C3","#FFB900"];
const data = [{ count: 128, acr: 50000 }, { count: 92, acr: 30000 }, { count: 64, acr: 20000 }];
const max = Math.max(...data.map(d => d.count), 1);

let html = '';
for (let i = 0; i < stages.length; i++) {
  const pct = Math.round((data[i].count / max) * 100);
  html += '<div class="funnel-row">' +
    '<div class="funnel-label">' + stages[i] + '</div>' +
    '<div class="funnel-bar" style="width:' + pct + '%;background:' + colors[i] + ';">' + data[i].count + '</div>' +
    '<span class="funnel-count">$' + data[i].acr.toLocaleString("en-US") + '/mo</span>' +
  '</div>';
}
dv.el("div", html);
```

---

### 3. Timeline (`.milestone-timeline` + `.timeline-item` + `.timeline-dot`)

Horizontal scrolling timeline with color-coded dots. Each item shows a label, date, and metadata line.

**When to use**: Due dates, close dates, event sequences, milestone timelines. Best for 5–20 items.

**Dot classes**: `.on-track` (green), `.at-risk` (amber), `.blocked` (red), `.past-due` (crimson).

**DataviewJS pattern**:
```js
let html = '<div class="milestone-timeline">';
for (const item of items.slice(0, 20)) {
  const cls = item.overdue ? "past-due" : "at-risk";
  html += '<div class="timeline-item">' +
    '<div class="timeline-dot ' + cls + '"></div>' +
    '<div class="timeline-label">' + item.name.substring(0, 30) + '</div>' +
    '<div class="timeline-date">' + item.date + ' · ' + item.daysLabel + '</div>' +
    '<div class="timeline-customer">' + item.customer + '</div>' +
  '</div>';
}
html += '</div>';
dv.el("div", html);
```

---

### 4. Milestone Rows (`.milestone-row` + `.ms-name` + `.ms-meta` + `.ms-badges`)

Clickable card rows with title, metadata line, and right-aligned badge pills. Hover effect included.

**When to use**: Top-N lists, ranked items, any clickable entity list. Replaces `dv.table()` for styled output.

**RAG coloring**: Add `.rag-green`, `.rag-amber`, `.rag-red` to `.milestone-row` for left-border color.

**DataviewJS pattern**:
```js
html += '<div class="milestone-row rag-red" style="cursor:pointer;" ' +
  'onclick="app.workspace.openLinkText(\'' + path.replace(/'/g, "\\'") + '\',\'\',false);">' +
  '<div>' +
    '<div class="ms-name">' + name + '</div>' +
    '<div class="ms-meta">' + customer + ' · ' + stage + ' · Close: ' + closeDate + '</div>' +
  '</div>' +
  '<div class="ms-badges">' +
    '<span class="status-pill status-active">$4,000/mo</span>' +
    '<span class="status-pill status-past-due">OVERDUE</span>' +
  '</div>' +
'</div>';
```

---

### 5. Status Pills (`.status-pill`)

Inline rounded badges for status labels. Color-coded by class.

| Class | Color | Use |
|-------|-------|-----|
| `.status-on-track` | Green | Healthy milestones |
| `.status-at-risk` | Amber | Warning state |
| `.status-blocked` | Red | Blocked items |
| `.status-past-due` | Crimson | Overdue dates |
| `.status-active` | Blue | Active/info values like ACR |
| `.status-completed` | Faded green | Done items |

**HTML**: `<span class="status-pill status-blocked">Blocked</span>`

---

### 6. Action Stream (`.action-stream-item`)

Priority-striped rows for issue lists, task feeds, or risk registers. Left border color indicates severity.

**Priority classes**: `.priority-1` (red), `.priority-2` (crimson), `.priority-3` (amber), `.priority-4` (orange), `.priority-5` (purple), `.priority-6` (blue).

**DataviewJS pattern**:
```js
html += '<div class="action-stream-item priority-1" style="cursor:pointer;" ' +
  'onclick="app.workspace.openLinkText(\'' + path.replace(/'/g, "\\'") + '\',\'\',false);">' +
  '<div style="font-size:1.2em;">🔴</div>' +
  '<div style="flex:1;">' +
    '<div style="font-weight:600;font-size:0.9em;">' + name + '</div>' +
    '<div style="font-size:0.78em;opacity:0.6;">' + customer + ' · ' + issue + ' · 👤 ' + owner + '</div>' +
  '</div>' +
'</div>';
```

---

### 7. Customer Scorecard (`.customer-card`)

Rounded card with RAG left border. Use inside `.two-col` or `.three-col` grid for multi-customer views.

**Grid wrappers**: `.two-col` (2-column), `.three-col` (3-column), `.command-center-grid` (2-column with wider spacing). All responsive.

---

### 8. Stacked Bar (`.stacked-bar`)

Pure CSS horizontal stacked bar for composition views (e.g., on-track vs at-risk vs blocked %).

```js
const total = onTrack + atRisk + blocked;
html += '<div class="stacked-bar">' +
  '<div style="width:' + (onTrack/total*100) + '%;background:var(--color-green);">' + onTrack + '</div>' +
  '<div style="width:' + (atRisk/total*100) + '%;background:var(--color-amber);">' + atRisk + '</div>' +
  '<div style="width:' + (blocked/total*100) + '%;background:var(--color-red);">' + blocked + '</div>' +
'</div>';
```

---

### 9. Progress Bar (`.progress-bar` + `.progress-bar-fill`)

Single-value progress indicator. Set width and background on `.progress-bar-fill`.

```html
<div class="progress-bar">
  <div class="progress-bar-fill" style="width:72%;background:var(--color-green);"></div>
</div>
```

---

### 10. Sparkline (`.sparkline` + `.sparkline-bar`)

Inline micro-bar chart for trends. Each `.sparkline-bar` gets a height percentage.

```js
const vals = [30, 50, 40, 80, 60];
const max = Math.max(...vals);
html += '<div class="sparkline">' +
  vals.map(v => '<div class="sparkline-bar" style="height:' + (v/max*100) + '%;"></div>').join("") +
'</div>';
```

---

## Charts View Patterns

All charts use `chartsview` fenced code blocks (4 backticks). Data comes from `dataviewjs:` prefix inside the `data:` YAML field. The plugin supports all [Ant Design Charts](https://charts.ant.design/en/examples/gallery) types.

### Syntax Structure

````
````chartsview
type: <ChartType>
data: |
  dataviewjs:
  return dv.pages('"Folder"')
    .where(p => ...)
    .groupBy(p => ...)
    .map(g => ({ field: g.key, value: ... }))
    .array();
options:
  xField: "field"
  yField: "value"
  ...
````
````

### Recommended Chart Types by Data Shape

| Data Shape | Chart Type | When |
|-----------|-----------|------|
| Categorical ranking (top N) | `Bar` (horizontal) | ACR by customer, count by category |
| Part-of-whole composition | `Pie` (donut with `innerRadius`) | Stage distribution, play mix |
| Hierarchical composition | `Treemap` | Nested category ACR weight (use with caution — requires `{ name, children }` shape; prefer Bar when flat) |
| Categorical comparison | `Column` (vertical) | Risk counts by customer, monthly trends |
| Stacked categories | `Column` + `isStack: true` | At-risk + blocked by customer |
| Two metrics on one axis | `DualAxes` | Count + ACR over time |
| Multi-dimension comparison | `Radar` | Customer health across dimensions |
| Trend over time | `TinyLine` | ACR history, close-date density |
| Tag/word distribution | `WordCloud` | Tags, solution plays |

### Allowed Dataview API Methods

Charts View allows these `dv.*` methods inside `data: | dataviewjs:` blocks:
- `dv.current()`, `dv.pages(source?)`, `dv.pagePaths(source?)`, `dv.page(path)`
- `dv.array(value)`, `dv.isArray(value)`, `dv.date(text)`, `dv.fileLink(path)`
- `dv.query(source, settings?)`, `dv.io`

### Color Palette (Microsoft-aligned)

```yaml
color: ["#0078D4","#00B7C3","#5C2D91","#E74856","#FFB900","#107C10","#767676","#D83B01","#00188F","#00CC6A","#E3008C","#4C4A48","#0099BC","#2D7D9A","#B4009E"]
```

---

## Meta Bind Filter Wiring

Filters use `INPUT[...]` syntax bound to frontmatter keys. DataviewJS reads them via `dv.current().filterKey`.

### Standard Filter Pattern

**Frontmatter**:
```yaml
filterStage: "all"
filterCustomer: "all"
```

**Callout** (collapsible):
```markdown
> [!abstract]- 🔧 Filters
> **Stage** `INPUT[inlineSelect(option(all), option(Value1), option(Value2)):filterStage]`
> **Customer** `INPUT[text(placeholder(all customers)):filterCustomer]`
```

**DataviewJS consumption**:
```js
const filterStage = dv.current().filterStage || "all";
const filterCust = (dv.current().filterCustomer || "all").toLowerCase();

let pages = dv.pages('"Customers"').where(p => p.tags?.includes("opportunity"));
if (filterStage !== "all") pages = pages.where(p => p.stage === filterStage);
if (filterCust !== "all") pages = pages.where(p => (p.customer||"").toLowerCase().includes(filterCust));
```

**Rule**: Always default filters to `"all"` in frontmatter. Always null-check with `|| "all"` in DataviewJS. Filters that are "all" must be no-ops (no filtering applied).

---

## Design Rules

### Data Volume Strategy

| Volume | Strategy | Never |
|--------|----------|-------|
| < 20 items | Full table or milestone-row list | N/A |
| 20–100 items | Chart + top-N table (10–15) | Don't dump all rows |
| 100+ items | Chart only + filtered drilldown tables | Don't table-dump 300+ rows |

### Visualization Selection

1. **Identify the question** the user cares about — "which customers carry the most ACR?" not "show me all opps"
2. **Match data shape** to chart type (see table above)
3. **Use CSS components** for entity lists — milestone-rows, action-streams, not plain `dv.table()`
4. **Limit visible items** — top 15 for tables, top 20 for timelines; always show count of hidden items
5. **Pre-filter to the interesting subset** — at-risk only, overdue only, above-threshold only
6. **RAG-code everything with dates or status** — red/amber/green borders and pills make risk instantly visible

### Dashboard Composition Order

1. **Stat cards** — 4–6 KPI cards at the top
2. **Charts** — 2–3 chart blocks for the big picture (distribution, ranking, composition)
3. **Filtered tables** — exception lists, not exhaustive dumps
4. **Action prompts** — copy-paste Copilot prompts at the bottom

### CSS Class Quick Reference

| Layout | Class |
|--------|-------|
| Wide page | `cssclasses: [wide-page]` |
| Card row | `.dashboard-cards` |
| 2-column grid | `.two-col` |
| 3-column grid | `.three-col` |
| Section card | `.scorecard-section` |

| Component | Classes |
|-----------|---------|
| Stat card | `.customer-card` + `.rag-{green,amber,red}` |
| Funnel bar | `.funnel-row` > `.funnel-label` + `.funnel-bar` + `.funnel-count` |
| Timeline | `.milestone-timeline` > `.timeline-item` > `.timeline-dot.{on-track,at-risk,blocked,past-due}` + `.timeline-label` + `.timeline-date` + `.timeline-customer` |
| Entity row | `.milestone-row` > `.ms-name` + `.ms-meta` + `.ms-badges` |
| Status badge | `.status-pill.status-{on-track,at-risk,blocked,past-due,active,completed}` |
| Issue row | `.action-stream-item.priority-{1..6}` |
| Stacked bar | `.stacked-bar` > `div` (flex children with width %) |
| Progress | `.progress-bar` > `.progress-bar-fill` |
| Sparkline | `.sparkline` > `.sparkline-bar` |

---

## Templates

| Template | File | Used By |
|----------|------|---------|
| Pipeline Dashboard | [`references/pipeline-dashboard.template.md`](references/pipeline-dashboard.template.md) | vault-sync Mode 7 (Dashboard Sync) |

---

## Related Skills

- **vault-sync** (Mode 7: Dashboard Sync) — creates/refreshes the Pipeline Dashboard from this template
- **pipeline-hygiene-triage** — exception detection rules used by the Hygiene Risk Register
- **vault-routing** — entity icon standards and vault path conventions
- **pbi-reference** — for live PBI data; dashboards are vault-only (no PBI queries)
