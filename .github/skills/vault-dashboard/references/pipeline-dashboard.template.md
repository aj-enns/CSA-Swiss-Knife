<!-- vault-sync template: Pipeline Intelligence Dashboard v2
     Written once by Mode 7 (Dashboard Sync) into _Dashboard/Pipeline Dashboard.md.
     Agent updates: last_refreshed, dashboard_scope, filterStage, filterSolutionPlay, filterCustomer, filterRisk.
     Charts render via Charts View plugin (chartsview blocks with dataviewjs data).
     Tables render via Dataview/DataviewJS. Filters via Meta Bind (optional).
     Prompt chips are static — edit this template to change them.
     Requires: Dataview, DataviewJS, Charts View. Optional: Meta Bind v0.12+, Iconize. -->

---
tags:
  - dashboard
  - pipeline
icon: LiLayoutDashboard
sticker: lucide//layout-dashboard
last_refreshed: "{{syncDate}}"
dashboard_scope: "{{scopeSummary}}"
filterStage: "all"
filterSolutionPlay: "all"
filterCustomer: "all"
filterRisk: "all"
---

# 📊 Pipeline Intelligence Dashboard

> **Last synced:** `{{syncDate}}` · `{{scopeSummary}}`

> [!abstract]- 🔧 Filters
> **Stage** `INPUT[inlineSelect(option(all), option(Listen & Consult), option(Inspire & Design), option(Empower & Achieve), option(Realize Value), option(Manage & Optimize)):filterStage]`
> **Solution Play** `INPUT[inlineSelect(option(all), option(Migrate and Modernize Your Estate), option(Innovate with Azure AI Apps and Agents), option(Unify Your Data Platform), option(Copilot and Agents at Work), option(Modern SecOps with Unified Platform), option(Service Transformation with AI)):filterSolutionPlay]`
> **Customer** `INPUT[text(placeholder(all customers)):filterCustomer]`
> **Risk Focus** `INPUT[inlineSelect(option(all), option(overdue), option(no-acr), option(at-risk milestones), option(blocked milestones)):filterRisk]`

---

## 💡 Pipeline Pulse

```dataviewjs
const opps = dv.pages('"Customers"').where(p =>
  p.tags?.includes("opportunity") &&
  !["Closed Won","Closed Lost"].includes(p.stage)
);
const mils = dv.pages('"Customers"').where(p =>
  p.tags?.includes("milestone") &&
  !["Completed","Cancelled","Closed as Incomplete"].includes(p.status)
);
const today = new Date();
const overdueOpps = opps.filter(p => p.estClose && new Date(p.estClose) < today).length;
const atRiskMils = mils.filter(p => ["At Risk","Blocked"].includes(p.status)).length;
const totalACR = opps.array().reduce((s, p) => s + (p.recurringACR || 0), 0);
const fmt = n => "$" + n.toLocaleString("en-US");

dv.paragraph(
  `> [!multi-column]\n` +
  `> > [!info] 💰 Total ACR/mo\n> > **${fmt(totalACR)}**\n>\n` +
  `> > [!example] 🎯 Active Opps\n> > **${opps.length}**\n>\n` +
  `> > [!warning] ⏰ Overdue Close\n> > **${overdueOpps}**\n>\n` +
  `> > [!danger] 🔥 At Risk / Blocked\n> > **${atRiskMils}** milestones`
);
```

---

## 📊 ACR by Customer

````chartsview
#-----------------#
#- chart type    -#
#-----------------#
type: Bar

#-----------------#
#- chart data    -#
#-----------------#
data: |
  dataviewjs:
  return dv.pages('"Customers"')
    .where(p => p.tags?.includes("opportunity") && !["Closed Won","Closed Lost"].includes(p.stage))
    .groupBy(p => p.customer || "Unknown")
    .map(g => ({ customer: g.key, acr: g.rows.array().reduce((s, p) => s + (p.recurringACR || 0), 0) }))
    .array()
    .sort((a, b) => b.acr - a.acr)
    .slice(0, 15);

#-----------------#
#- chart options -#
#-----------------#
options:
  xField: "acr"
  yField: "customer"
  seriesField: "customer"
  legend: false
  barWidthRatio: 0.6
  label:
    position: "right"
    formatter:
      function formatter(val) { return '$' + val.acr.toLocaleString('en-US') + '/mo'; }
  color: ["#0078D4","#00B7C3","#5C2D91","#E74856","#FFB900","#107C10","#767676","#D83B01","#00188F","#00CC6A","#E3008C","#4C4A48","#0099BC","#2D7D9A","#B4009E"]
  xAxis:
    label:
      formatter:
        function formatter(val) { return '$' + Number(val).toLocaleString('en-US'); }
````

---

## 🎯 Pipeline by Stage

````chartsview
#-----------------#
#- chart type    -#
#-----------------#
type: Pie

#-----------------#
#- chart data    -#
#-----------------#
data: |
  dataviewjs:
  return dv.pages('"Customers"')
    .where(p => p.tags?.includes("opportunity") && !["Closed Won","Closed Lost"].includes(p.stage))
    .groupBy(p => p.stage || "Unknown")
    .map(g => ({ stage: g.key, count: g.rows.length, acr: g.rows.array().reduce((s, p) => s + (p.recurringACR || 0), 0) }))
    .array();

#-----------------#
#- chart options -#
#-----------------#
options:
  angleField: "acr"
  colorField: "stage"
  radius: 0.8
  innerRadius: 0.5
  label:
    type: "spider"
    content: "{name}\n{value}"
    formatter:
      function formatter(datum) { return datum.stage + '\n$' + datum.acr.toLocaleString('en-US') + '/mo'; }
  statistic:
    title:
      content: "Pipeline ACR"
    content:
      formatter:
        function formatter(datum, data) { return '$' + data.reduce((s, d) => s + d.acr, 0).toLocaleString('en-US') + '/mo'; }
  color: ["#0078D4","#00B7C3","#FFB900","#E74856","#107C10"]
  legend:
    position: "bottom"
````

---

## 🏗️ Solution Play Mix

````chartsview
#-----------------#
#- chart type    -#
#-----------------#
type: Treemap

#-----------------#
#- chart data    -#
#-----------------#
data: |
  dataviewjs:
  const plays = dv.pages('"Customers"')
    .where(p => p.tags?.includes("opportunity") && !["Closed Won","Closed Lost"].includes(p.stage))
    .groupBy(p => p.solutionPlay || "Unknown")
    .map(g => ({ name: g.key, value: g.rows.array().reduce((s, p) => s + (p.recurringACR || 0), 0), count: g.rows.length }))
    .array()
    .filter(d => d.name !== "Not Applicable" && d.name !== "Unknown");
  return { name: "Pipeline", children: plays };

#-----------------#
#- chart options -#
#-----------------#
options:
  colorField: "name"
  legend:
    position: "bottom"
  tooltip:
    formatter:
      function formatter(datum) { return { name: datum.name, value: '$' + datum.value.toLocaleString('en-US') + '/mo (' + (datum.count || '') + ' opps)' }; }
````

---

## ⏰ Close Date Timeline — Overdue & Upcoming

> [!danger] Opportunities past their estimated close date or closing within 30 days.

```dataviewjs
const filterStage = dv.current().filterStage || "all";
const filterPlay = dv.current().filterSolutionPlay || "all";
const filterCust = (dv.current().filterCustomer || "all").toLowerCase();

const today = new Date();
const in30 = new Date(today.getTime() + 30 * 86400000);

let opps = dv.pages('"Customers"').where(p =>
  p.tags?.includes("opportunity") &&
  !["Closed Won","Closed Lost"].includes(p.stage) &&
  p.estClose
);
if (filterStage !== "all") opps = opps.where(p => p.stage === filterStage);
if (filterPlay !== "all") opps = opps.where(p => p.solutionPlay === filterPlay);
if (filterCust !== "all") opps = opps.where(p => (p.customer||"").toLowerCase().includes(filterCust));

const urgent = opps.where(p => {
  const d = new Date(p.estClose);
  return d < in30;
}).sort(p => p.estClose, "asc");

if (urgent.length === 0) {
  dv.paragraph("✅ No opportunities overdue or closing within 30 days.");
} else {
  const overdue = urgent.where(p => new Date(p.estClose) < today);
  const closing = urgent.where(p => new Date(p.estClose) >= today);

  if (overdue.length > 0) {
    dv.header(4, "🔴 Overdue (" + overdue.length + ")");
    dv.table(
      ["🎯 Opportunity", "🏢 Customer", "Est. Close", "Days Over", "💰 ACR/mo", "Stage", "🔗"],
      overdue.map(p => {
        const days = Math.round((today - new Date(p.estClose)) / 86400000);
        return [
          p.file.link,
          p.customer || "—",
          p.estClose,
          "⚠️ " + days + "d",
          p.recurringACR ? "$" + p.recurringACR.toLocaleString("en-US") : "—",
          p.stage || "—",
          p.msxLink ? "[MSX](" + p.msxLink + ")" : "—"
        ];
      })
    );
  }

  if (closing.length > 0) {
    dv.header(4, "🟡 Closing in ≤30d (" + closing.length + ")");
    dv.table(
      ["🎯 Opportunity", "🏢 Customer", "Est. Close", "Days Left", "💰 ACR/mo", "Stage", "🔗"],
      closing.map(p => {
        const days = Math.round((new Date(p.estClose) - today) / 86400000);
        return [
          p.file.link,
          p.customer || "—",
          p.estClose,
          days + "d",
          p.recurringACR ? "$" + p.recurringACR.toLocaleString("en-US") : "—",
          p.stage || "—",
          p.msxLink ? "[MSX](" + p.msxLink + ")" : "—"
        ];
      })
    );
  }
}
```

---

## 💰 Top ACR Opportunities

> [!info] Top 15 opportunities by recurring ACR — your highest-value pipeline.

```dataviewjs
const filterStage = dv.current().filterStage || "all";
const filterPlay = dv.current().filterSolutionPlay || "all";
const filterCust = (dv.current().filterCustomer || "all").toLowerCase();

let opps = dv.pages('"Customers"').where(p =>
  p.tags?.includes("opportunity") &&
  !["Closed Won","Closed Lost"].includes(p.stage) &&
  (p.recurringACR || 0) > 0
);
if (filterStage !== "all") opps = opps.where(p => p.stage === filterStage);
if (filterPlay !== "all") opps = opps.where(p => p.solutionPlay === filterPlay);
if (filterCust !== "all") opps = opps.where(p => (p.customer||"").toLowerCase().includes(filterCust));

opps = opps.sort(p => p.recurringACR || 0, "desc").limit(15);

dv.table(
  ["🎯 Opportunity", "🏢 Customer", "💰 ACR/mo", "Stage", "Est. Close", "Play", "🔗"],
  opps.map(p => [
    p.file.link,
    p.customer || "—",
    "$" + (p.recurringACR || 0).toLocaleString("en-US"),
    p.stage || "—",
    p.estClose || "—",
    p.solutionPlay || "—",
    p.msxLink ? "[MSX](" + p.msxLink + ")" : "—"
  ])
);
```

---

## 🔥 At-Risk & Blocked Milestones

> [!danger] Milestones flagged At Risk or Blocked — needs immediate attention.

````chartsview
#-----------------#
#- chart type    -#
#-----------------#
type: Column

#-----------------#
#- chart data    -#
#-----------------#
data: |
  dataviewjs:
  return dv.pages('"Customers"')
    .where(p => p.tags?.includes("milestone") && ["At Risk","Blocked"].includes(p.status))
    .groupBy(p => p.customer || "Unknown")
    .flatMap(g => [
      { customer: g.key, status: "At Risk", count: g.rows.filter(p => p.status === "At Risk").length },
      { customer: g.key, status: "Blocked", count: g.rows.filter(p => p.status === "Blocked").length }
    ])
    .array()
    .filter(d => d.count > 0);

#-----------------#
#- chart options -#
#-----------------#
options:
  isStack: true
  xField: "customer"
  yField: "count"
  seriesField: "status"
  color: ["#FFB900","#E74856"]
  label:
    position: "middle"
  legend:
    position: "top-right"
  xAxis:
    label:
      autoRotate: true
````

```dataviewjs
const mils = dv.pages('"Customers"').where(p =>
  p.tags?.includes("milestone") &&
  ["At Risk","Blocked"].includes(p.status)
).sort(p => p.status === "Blocked" ? 0 : 1, "asc");

if (mils.length === 0) {
  dv.paragraph("✅ No at-risk or blocked milestones.");
} else {
  dv.table(
    ["📋 Milestone", "🏢 Customer", "Status", "👤 Owner", "💰 ACR/mo", "📅 Due", "🔗"],
    mils.map(p => [
      p.file.link,
      p.customer || "—",
      p.status === "Blocked" ? "🔴 Blocked" : "🟡 At Risk",
      p.owner || "Unknown",
      p.monthlyUse ? "$" + p.monthlyUse.toLocaleString("en-US") : "—",
      p.milestoneDate || "—",
      p.msxLink ? "[MSX](" + p.msxLink + ")" : "—"
    ])
  );
}
```

---

## ⚠️ Hygiene Risk Register

> [!warning] CRM data quality issues — missing fields, stale sync, unrecorded ACR. Top 25 shown.

```dataviewjs
const rows = [];
const today = new Date();
const opps = dv.pages('"Customers"').where(p =>
  p.tags?.includes("opportunity") &&
  !["Closed Won","Closed Lost"].includes(p.stage)
);

for (const p of opps.array()) {
  if (!p.stage || p.stage === "Unknown")
    rows.push(["🔴", p.customer||"—", p.file.link, "Missing stage", "Specialist"]);
  if (!p.estClose)
    rows.push(["🔴", p.customer||"—", p.file.link, "No close date", "Specialist"]);
  if (!p.recurringACR && !p.dealValue)
    rows.push(["🔴", p.customer||"—", p.file.link, "No ACR recorded", "Specialist"]);
  if (!p.solutionPlay || p.solutionPlay === "Unknown")
    rows.push(["🟡", p.customer||"—", p.file.link, "Missing solution play", "Specialist"]);
}

const order = {"🔴": 0, "🟡": 1, "🟢": 2};
rows.sort((a, b) => (order[a[0]]??3) - (order[b[0]]??3));

if (rows.length === 0) {
  dv.paragraph("✅ All opportunities have complete CRM fields.");
} else {
  dv.header(4, rows.length + " issues across " + new Set(rows.map(r => r[2]?.path || "")).size + " opportunities");
  dv.table(["", "🏢 Customer", "🎯 Opportunity", "Issue", "👤 Owner"], rows.slice(0, 25));
  if (rows.length > 25) dv.paragraph("*...and " + (rows.length - 25) + " more. Run pipeline hygiene triage for the full list.*");
}
```

---

## 🤖 AI Action Prompts

*Copy a prompt → paste into Copilot Chat → done.*

> [!tip] 🧹 Fix Hygiene Issues
> ```
> Run pipeline hygiene triage across all my active opportunities and generate a dry-run correction list.
> ```

> [!tip] 📋 Sync Milestones
> ```
> Sync milestones for all customers — deep refresh active milestone notes from CRM.
> ```

> [!tip] 📊 Morning Brief
> ```
> Morning brief — pull my pipeline, milestones, today's meetings, and overdue tasks.
> ```

> [!tip] 👤 Refresh Deal Teams
> ```
> Sync people — update deal team notes for all active opportunities.
> ```

> [!tip] 🔭 Expansion Signals
> ```
> Run stage 5 review for my active delivery milestones — surface expansion signals.
> ```

> [!tip] ⚡ Refresh ACR Data
> ```
> Opp sync all — refresh opportunity ACR, stage, and deal team from CRM.
> ```

> [!tip] 🔄 Refresh Dashboard
> ```
> Refresh dashboard — update pipeline dashboard scope summary and sync timestamp.
> ```

---

<!-- end-crm-sync -->

## Notes

