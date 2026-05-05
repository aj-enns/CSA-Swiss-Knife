---
description: "Analyze GHCP seat data from MSXI and OctoDash Power BI semantic models. Pulls per-account seat composition, attach rates, whitespace, MoM trends from Dim_Metrics (MSXI), and per-subscription/per-BU breakdowns from OctoDash. Surfaces seat expansion opportunities and adoption health across both data sources."
---

# GHCP Seats Analysis — Seat Opportunity & Adoption Review

Review my tracked accounts' GitHub Copilot seat data — seat composition, attach rates, remaining whitespace, and month-over-month trends. Surface where seat expansion is realistic and where adoption is stalling.

## Why This Exists

> Seat data lives in MSXI but requires navigating multiple report tabs and mentally cross-referencing columns. Sellers skip the analysis because it's tedious — and miss expansion signals hiding in attach rate gaps and stagnant accounts.
>
> This prompt pulls seat metrics directly via DAX, filters to your tracked accounts, and presents a prioritized view: where whitespace exists, where adoption is growing or stalling, and where the next conversation should happen.

## Reference

- **PBI Report**: [MSXI Dev Services Hub](https://aka.ms/msxi) → [Direct link](https://msit.powerbi.com/groups/824003D8-7E9B-4D4A-AA2A-FE295B23549E/reports/0d5f46d6-5d27-4f78-82d6-8be082dd6c9b)
- **OctoDash schema & join patterns**: Read `.github/instructions/ghcp-octodash-enrichment.instructions.md` — covers OctoDash table schema, TPID→slug join pattern, source comparison table, presentation guardrails, and common pitfalls.
- **Metric glossary**: Read `.github/documents/ghcp-metric-formulas.md` before analysis — contains cohort classification algorithm, penetration thresholds, NPSA categories, pipeline segmentation rules, and common pitfalls.
- **Metric definitions**: See Key Formulas below

## Key Formulas

```
Seat Opportunity      = MAX(GHE License + GHE Metered, ADO Seats)
Remaining Opportunity = Seat Opp - GHCP Seats - Qualified Pipeline - Unqualified Pipeline
Attach Rate           = GHCP Seats / Seat Opp
ARPU                  = GHCP ACR / GHCP Seats
Seat Ratio            = $16 per seat (ACR-to-seat conversion for pipeline)
```

> **Pitfall**: Simple `Seat Oppty − GHCP Seats` does NOT match `Remaining Seat Opp`. The model subtracts ALL pipeline seats (qualified + unqualified), not just actuals. Always use the `Remaining Seat Opp` column from the model.

## Configuration

> **Managers**: Fork this file and update these values to point at your semantic model and accounts.

| Setting | Value | Notes |
|---|---|---|
| **MSXI Semantic Model ID** | `a0239518-1109-45a3-a3eb-1872dc10ac15` | MSXI dataset — change if using a different workspace/model |
| **MSXI Workspace** | `824003D8-7E9B-4D4A-AA2A-FE295B23549E` | Business Precision workspace |
| **OctoDash Semantic Model ID** | `ecdbfb59-7a8f-44fb-9102-727598416571` | OctoDash (Copilot Telemetry for Octodash) — per-slug/per-subscription data |
| **OctoDash Workspace** | `GitHub and Microsoft` | OctoDash workspace |
| **Account Roster** | `.docs/AccountReference.md` | File with tracked TPIDs (Column B). Change path to your roster |
| **Calendar Filter** | `RelativeFM = -1` | Last completed fiscal month (current month has partial data) |

## Data Model Reference

Seat data lives in the **`Dim_Metrics`** table (NOT `__Measure` — measures return aggregate/top-parent values; `Dim_Metrics` returns LCM-scoped per-account values).

### Core Seat Columns

| Column | Type | Description |
|---|---|---|
| `TPID` | Text | Account identifier (**always quote as text**: `"12345"`, not `12345`) |
| `FiscalMonth` | DateTime | Month of the record |
| `GHCP_Seats` | Integer | Total GitHub Copilot seats |
| `GHCP_Ent_Seats` | Integer | Copilot Enterprise seats |
| `GHCP_Business_Seats` | Integer | Copilot Business seats |
| `GHCP_Standalone_Seats` | Integer | Copilot standalone seats |
| `GHCP_ACR_Dollar` | Double | Total GHCP ACR |
| `ARPU` | Double | Actual ARPU (~$16.66/seat — this is correct, not TAM) |
| `TAM` | Integer | Seat opportunity size (~3,455 — this is correct, not ARPU) |
| `GHCP_attach` | Double | Attach rate (GHCP Seats / Seat Opp) |
| `Remaining Seat Opp` | Integer | Remaining whitespace (Seat Opp - GHCP Seats - Pipeline) |
| `WAU %` | Double | Weekly Active Users percentage |
| `WEU %` | Double | Weekly Engaged Users percentage |

### Developer Platform Columns

| Column | Type | Description |
|---|---|---|
| `GHE_Total_Seats` | Integer | Total GitHub Enterprise seats |
| `GHE_License_Seats` | Integer | GHE license seats |
| `GHE_Metered_Seats` | Integer | GHE metered seats |
| `ADO_Seats` | Integer | Azure DevOps seats |
| `GHAS_Total_Seats` | Integer | GitHub Advanced Security total seats |
| `PRU_Units` | Integer | Paid Resource Units |
| `PRU_Dollar` | Double | PRU ACR |

### Account Context (via RELATED)

| Column | Source Table | Description |
|---|---|---|
| `TopParent` | `Dim_Account` | Account display name |
| `NumDevelopers (MSX)` | `Dim_Account` | MSX developer count |
| `Attach (Num Dev MSX)` | `Dim_Account` | Attach rate vs MSX dev count |
| `MACCTPIDFlag` | `Dim_Account` | MACC flag |
| `UnifiedSupportFlag` | `Dim_Account` | Unified support flag |

### Trend / Growth Columns

| Column | Type | Description |
|---|---|---|
| `GHCP_Growth` | Text | Growth classification |
| `Action` | Text | Recommended action from model |
| `QSeats_GH_FY26` | Integer | Qualified pipeline seats FY26 |
| `NQSeats_GH_FY26` | Integer | Non-qualified pipeline seats FY26 |

## Critical Design Rules

1. **`Dim_Metrics` not `__Measure`**: Measures return aggregate/top-parent values. `Dim_Metrics` returns LCM-scoped values — what the Account View page shows.
2. **`SELECTCOLUMNS` not `ADDCOLUMNS(FILTER(...))`**: `FILTER` returns all 111 columns → column scrambling. `SELECTCOLUMNS` returns only named columns.
3. **`RelativeFM = -1` not `0`**: Month 0 is current partial month. Month -1 is last fully completed month.
4. **TPID is Text in `Dim_Metrics`**: Always quote: `"12345"`, not `12345`.
5. **No ARPU/TAM swap**: `Dim_Metrics[ARPU]` = actual ARPU. `Dim_Metrics[TAM]` = seat opportunity. Names are correct — do not confuse them.

## Workflow

### Step 0 — Power BI Auth Pre-Check

Before any data query, run a lightweight auth check against the semantic model listed in Configuration:

```dax
EVALUATE TOPN(1, 'Dim_Calendar')
```

If this returns data → auth is good, proceed.

If this fails with `TypeError: fetch failed` or any auth/connection error → **stop** and tell the user:

> Power BI MCP authentication has expired. Please run:
> ```
> az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
> az account get-access-token --resource https://analysis.windows.net/powerbi/api
> ```
> Then restart `powerbi-remote` in VS Code (MCP icon → restart).

**OctoDash auth check** — also probe the OctoDash model (semantic model `ecdbfb59-7a8f-44fb-9102-727598416571`):

```dax
EVALUATE TOPN(1, 'Fact_MSFT_Azure_TPID')
```

If OctoDash auth fails → proceed with MSXI-only workflows (Q1–Q3) and note: "OctoDash data unavailable this session — per-org breakdown skipped."

### Step 1 — Load Account Roster

Read the file specified in **Account Roster** (Configuration table) to get the full list of tracked TPIDs.

### Step 1.5 — Load Metric Glossary

Read `.github/documents/ghcp-metric-formulas.md` to load cohort classification rules, penetration thresholds, NPSA categories, and common pitfalls. This is required for accurate analysis in Steps 4–6.

### Step 1.75 — Vault Context Prefetch (Account-Scoped Runs)

When the user scopes the analysis to **specific account(s)** (not a full portfolio run), read the Obsidian vault before executing any DAX queries:

1. For each scoped account, call `get_customer_context({ customer: "<AccountName>" })` via OIL MCP. **If only a TPID was provided**, resolve to the vault customer name first: `query_notes({ where: { tpid: "<TPID>" } })` → use the customer folder name from the path (e.g., `Customers\Nielsen Consumer\Nielsen Consumer.md` → `Nielsen Consumer`). **If an abbreviation was provided** (e.g., NIQ, WBD), resolve via AccountReference.md parenthesized aliases — do NOT use `search_vault` for 2-3 char inputs (fuzzy matches produce false positives like "NIQ" → "Equinix"). Never use CRM sub-account names — vault folders use the full name (e.g., "Windstream Communications" not "Windstream").
2. Read the account's main note (`Customers/<Name>/<Name>.md`) — look for the **Agent Insights** section and any `insights.md` sub-note.
3. Extract **reporting overrides** — any context that changes how seat data should be interpreted:
   - Account/org migrations (EMU consolidation, slug renames, BU mergers)
   - Known seat movements that are NOT churn (decommissioning old orgs → new consolidated org)
   - Slug-level annotations (eval accounts, sandbox orgs, subsidiary billing)
   - Reframe rules ("do not flag decline on X", "true health = Y")
   - CRM-to-actual ACR variance notes
4. If vault is unavailable or the account has no overrides, proceed normally — this step is additive.

**Why this matters**: PBI data shows raw numbers. Without vault context, a 936-seat drop looks like churn. With vault context, the agent knows it's an EMU consolidation — the seats moved, they didn't disappear.

**Delegation pattern**: When delegating to `@pbi-analyst`, include a `## Vault Context` section in the delegation prompt with extracted overrides. The subagent applies them during analysis (Step 4) and report generation (Step 5). If running inline (no subagent), carry the overrides forward yourself.

> **Skip condition**: Full portfolio runs (all TPIDs) skip this step — vault reads for 20+ accounts would be too slow. Only prefetch for ≤5 explicitly named accounts.

### Step 2 — Choose Analysis Workflow

Based on the user's request, select one or more workflows:

| User Intent | Workflow | Query | Description |
|---|---|---|---|
| "Show me seat data for [account]" | **Single Account Deep Dive** | Q1 | Full breakdown for one TPID |
| "Rank my accounts" / "where's the whitespace" | **Portfolio Ranking** | Q3 then Q1 | Sorted by Remaining Opp |
| "Compare to last month" / "what changed" | **MoM Trend** | Q2 | 6-month trend per account |
| "Seat movement" / "who grew or churned" | **Seat Movement Report** | Q2 | NPSA classification per account |
| "Cohort breakdown" / "classify my accounts" | **Cohort Classification** | Q3 | Growth framework distribution |
| "Break down by Azure subscription" / "per-BU seats" / "per-org" | **OctoDash Enrichment** | Q4 + Q5 + Q1 | Per-slug/per-subscription breakdown combined with MSXI aggregates |
| "Full report" / "weekly briefing" / default | **Combined Report** | Q3 + Q2 + Q4 + Q5 | All workflows in one pass — MSXI aggregates + OctoDash per-org breakdown |
| "MSXI only" / "skip OctoDash" | **Combined Report (MSXI only)** | Q3 + Q2 | MSXI-only when OctoDash is unavailable or not needed |

If the user doesn't specify, default to **Combined Report** using Q3 + Q2 (MSXI) + Q4 + Q5 (OctoDash). If OctoDash auth fails, fall back to MSXI-only and note the gap.

### Step 3 — Pull Seat Data from Dim_Metrics

Query the semantic model using Power BI Remote MCP. Replace `{{TPID_LIST}}` with quoted TPIDs from the roster (e.g., `"12345", "67890"`).

#### Q1: Full Account Snapshot (LCM)

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        FILTER('Dim_Metrics', 'Dim_Metrics'[TPID] IN {{{TPID_LIST}}}),
        "TPID", 'Dim_Metrics'[TPID],
        "FiscalMonth", 'Dim_Metrics'[FiscalMonth],
        "GHCP_Seats", 'Dim_Metrics'[GHCP_Seats],
        "GHCP_Ent_Seats", 'Dim_Metrics'[GHCP_Ent_Seats],
        "GHCP_Business_Seats", 'Dim_Metrics'[GHCP_Business_Seats],
        "GHCP_Standalone_Seats", 'Dim_Metrics'[GHCP_Standalone_Seats],
        "GHCP_ACR_Dollar", 'Dim_Metrics'[GHCP_ACR_Dollar],
        "ARPU", 'Dim_Metrics'[ARPU],
        "GHCP_attach", 'Dim_Metrics'[GHCP_attach],
        "TAM", 'Dim_Metrics'[TAM],
        "Remaining_Seat_Opp", 'Dim_Metrics'[Remaining Seat Opp],
        "WAU_pct", 'Dim_Metrics'[WAU %],
        "WEU_pct", 'Dim_Metrics'[WEU %],
        "GHE_Total_Seats", 'Dim_Metrics'[GHE_Total_Seats],
        "GHE_License_Seats", 'Dim_Metrics'[GHE_License_Seats],
        "GHE_Metered_Seats", 'Dim_Metrics'[GHE_Metered_Seats],
        "ADO_Seats", 'Dim_Metrics'[ADO_Seats],
        "GHAS_Total_Seats", 'Dim_Metrics'[GHAS_Total_Seats],
        "PRU_Units", 'Dim_Metrics'[PRU_Units],
        "PRU_Dollar", 'Dim_Metrics'[PRU_Dollar],
        "QSeats_GH_FY26", 'Dim_Metrics'[QSeats_GH_FY26],
        "NQSeats_GH_FY26", 'Dim_Metrics'[NQSeats_GH_FY26],
        "GHCP_Growth", 'Dim_Metrics'[GHCP_Growth],
        "Action", 'Dim_Metrics'[Action],
        "TopParent", RELATED('Dim_Account'[TopParent]),
        "NumDevelopers_MSX", RELATED('Dim_Account'[NumDevelopers (MSX)]),
        "MACCTPIDFlag", RELATED('Dim_Account'[MACCTPIDFlag]),
        "UnifiedSupportFlag", RELATED('Dim_Account'[UnifiedSupportFlag]),
        "SRE_ACR", 'Dim_Metrics'[SRE_ACR],
        "AI_Foundry_ACR", 'Dim_Metrics'[AI_Foundry_ACR],
        "AKS_ACR", 'Dim_Metrics'[AKS_ACR],
        "Fabric_ACR", 'Dim_Metrics'[Fabric_ACR],
        "PGSQL_ACR", 'Dim_Metrics'[PGSQL_ACR],
        "CSPM_ACR", 'Dim_Metrics'[CSPM_ACR]
    ),
    'Dim_Calendar'[RelativeFM] = -1
)
ORDER BY [GHCP_ACR_Dollar] DESC
```

#### Q2: Month-over-Month Trend (6 months)

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        FILTER('Dim_Metrics', 'Dim_Metrics'[TPID] IN {{{TPID_LIST}}}),
        "TPID", 'Dim_Metrics'[TPID],
        "FiscalMonth", 'Dim_Metrics'[FiscalMonth],
        "GHCP_Seats", 'Dim_Metrics'[GHCP_Seats],
        "GHCP_Ent_Seats", 'Dim_Metrics'[GHCP_Ent_Seats],
        "GHCP_Business_Seats", 'Dim_Metrics'[GHCP_Business_Seats],
        "GHCP_Standalone_Seats", 'Dim_Metrics'[GHCP_Standalone_Seats],
        "GHCP_ACR_Dollar", 'Dim_Metrics'[GHCP_ACR_Dollar],
        "ARPU", 'Dim_Metrics'[ARPU],
        "GHCP_attach", 'Dim_Metrics'[GHCP_attach],
        "TAM", 'Dim_Metrics'[TAM],
        "Remaining_Seat_Opp", 'Dim_Metrics'[Remaining Seat Opp],
        "WAU_pct", 'Dim_Metrics'[WAU %],
        "WEU_pct", 'Dim_Metrics'[WEU %],
        "GHE_Total_Seats", 'Dim_Metrics'[GHE_Total_Seats],
        "GHAS_Total_Seats", 'Dim_Metrics'[GHAS_Total_Seats],
        "PRU_Dollar", 'Dim_Metrics'[PRU_Dollar],
        "GHCP_Growth", 'Dim_Metrics'[GHCP_Growth],
        "TopParent", RELATED('Dim_Account'[TopParent])
    ),
    'Dim_Calendar'[RelativeFM] IN {-6, -5, -4, -3, -2, -1}
)
ORDER BY [TPID], [FiscalMonth] ASC
```

#### Q3: Portfolio Health (Lean)

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        FILTER('Dim_Metrics', 'Dim_Metrics'[TPID] IN {{{TPID_LIST}}}),
        "TPID", 'Dim_Metrics'[TPID],
        "TopParent", RELATED('Dim_Account'[TopParent]),
        "GHCP_Seats", 'Dim_Metrics'[GHCP_Seats],
        "GHCP_ACR_Dollar", 'Dim_Metrics'[GHCP_ACR_Dollar],
        "GHCP_attach", 'Dim_Metrics'[GHCP_attach],
        "TAM", 'Dim_Metrics'[TAM],
        "Remaining_Seat_Opp", 'Dim_Metrics'[Remaining Seat Opp],
        "ARPU", 'Dim_Metrics'[ARPU],
        "GHCP_Growth", 'Dim_Metrics'[GHCP_Growth],
        "Action", 'Dim_Metrics'[Action]
    ),
    'Dim_Calendar'[RelativeFM] = -1
)
ORDER BY [GHCP_ACR_Dollar] DESC
```

#### Q4: OctoDash — TPID → Enterprise Slugs + Azure Subscriptions

**Semantic Model**: `ecdbfb59-7a8f-44fb-9102-727598416571` (OctoDash)

For the target TPID, resolve all enterprise slugs and their Azure subscription mappings. Replace `{{TPID}}` with the **unquoted** integer TPID (OctoDash `msft_tpid` is Integer type, unlike MSXI where TPID is Text).

```dax
EVALUATE
SELECTCOLUMNS(
  FILTER('Fact_MSFT_Azure_TPID', 'Fact_MSFT_Azure_TPID'[msft_tpid] = {{TPID}}),
  "Enterprise_Slug", 'Fact_MSFT_Azure_TPID'[billable_owner_name],
  "SF_Account_Name", 'Fact_MSFT_Azure_TPID'[salesforce_account_name],
  "Azure_Subscription_ID", 'Fact_MSFT_Azure_TPID'[azure_subscription_id],
  "Copilot_Product_Type", 'Fact_MSFT_Azure_TPID'[Copilot Product Type]
)
```

A single TPID can map to multiple slugs (BUs, subsidiaries, eval accounts). Two slugs may share the same Azure Subscription ID — flag this in the report.

#### Q5: OctoDash — Per-Slug Weekly Adoption

Using the slugs returned by Q4, pull per-org adoption data from the preferred weekly table. This query auto-resolves slugs from the TPID — no need to hardcode slug names.

```dax
EVALUATE
SELECTCOLUMNS(
  FILTER(
    'Installed_Vs_Active_Vs_Engaged_Weekly',
    'Installed_Vs_Active_Vs_Engaged_Weekly'[billable_owner_name] IN
      DISTINCT(SELECTCOLUMNS(
        FILTER('Fact_MSFT_Azure_TPID', 'Fact_MSFT_Azure_TPID'[msft_tpid] = {{TPID}}),
        "slug", 'Fact_MSFT_Azure_TPID'[billable_owner_name]
      ))
  ),
  "Slug", 'Installed_Vs_Active_Vs_Engaged_Weekly'[billable_owner_name],
  "Week", 'Installed_Vs_Active_Vs_Engaged_Weekly'[week],
  "Licensed_Users", 'Installed_Vs_Active_Vs_Engaged_Weekly'[weekly_licensed_users],
  "Auth_Ratio", 'Installed_Vs_Active_Vs_Engaged_Weekly'[authenticated_user_ratio],
  "Active_Ratio", 'Installed_Vs_Active_Vs_Engaged_Weekly'[active_user_ratio],
  "Engaged_Ratio", 'Installed_Vs_Active_Vs_Engaged_Weekly'[engagement_ratio],
  "Industry", 'Installed_Vs_Active_Vs_Engaged_Weekly'[industry],
  "Industry_Active_Benchmark", 'Installed_Vs_Active_Vs_Engaged_Weekly'[industry_active_user_ratio]
)
ORDER BY 'Installed_Vs_Active_Vs_Engaged_Weekly'[week] DESC
```

Use the most recent week's data for the main report. Include the last 4 weeks for trend analysis on major slugs. If the target week returns no rows, step back one week at a time.

> **Join pattern**: OctoDash tables join via `billable_owner_name` (enterprise slug), NOT by TPID. Only `Fact_MSFT_Azure_TPID` has `msft_tpid`. The workflow is always: TPID → `Fact_MSFT_Azure_TPID` → slugs → weekly tables via slug.

### Step 4 — Seat Opportunity Analysis

Read the cohort classification algorithm from `.github/documents/ghcp-metric-formulas.md` § "GHCP Growth Framework". Apply the decision tree to each account:

```
if NOT (GHE_Total > 0 OR ADO > 0) AND GHCP_Seats == 0 → Cohort 0 (No platform)
elif GHCP_Seats < 50                                    → Cohort 1 (Limited GHCP)
elif GHCP_Attach < 50%                                  → Cohort 2 (Low attach)
elif ARPU < $30                                         → Cohort 3 (Low ARPU)
else                                                    → Cohort 4 (High value)
```

#### Cohort Actions

| Cohort | Name | Action | Next Steps |
|---|---|---|---|
| **0** | No platform | Land Copilot | Identify developer population, establish GHE/ADO baseline, pitch POC |
| **1** | Limited GHCP | Land Copilot | Drive initial POC/pilot, team-level adoption, target 50+ seats |
| **2** | Low attach | Expand Copilot | Expand across teams, increase attach rate, target 50%+ coverage |
| **3** | Low ARPU | Upsell to Enterprise | Upsell Business→Enterprise, drive PRU/custom models, target ARPU >$30 |
| **4** | High value | Nurture & Cross-sell | GHAS, AI Foundry, AKS, Fabric, PGSQL, CSPM; protect installed base |

> Validate against the `Action` column from the PBI model. Flag discrepancies between computed cohort and model's pre-computed action.

#### MoM Trend Analysis (when Q2 data is used)

For each account across the 6-month window:

- **Growth Velocity** = (seats[latest] − seats[oldest]) / months
- **Stagnation Flag** = seat delta = 0 for 3+ consecutive months
- **Churn Risk** = seats declined 2+ consecutive months
- **Attach Rate Trajectory** = improving / flat / declining

#### Seat Movement Classification (NPSA)

When comparing two months, classify each account per the NPSA rules from the glossary:

| Category | Rule |
|---|---|
| **New** | Previous = 0, Current > 0 |
| **Increase** | Both > 0, MoM gain exceeds threshold |
| **Flat** | Both > 0, MoM change within threshold |
| **Decrease** | Both > 0, MoM loss exceeds threshold |
| **Loss** | Previous > 0, Current = 0 |
| **Not Customers** | Both = 0 |

### Step 5 — Report

Output depends on the workflow(s) selected in Step 2:

#### Single Account Deep Dive

```markdown
## [Account Name] (TPID: [TPID])

| Metric | Value |
|---|---|
| GHCP Seat Opportunity | X,XXX |
| GHCP Seats (actual) | X,XXX |
| Remaining Seat Opp | X,XXX |
| GHCP Attach | XX.X% |
| ARPU | $XX.XX |
| Growth Cohort | Cohort N — [Action] |

### Seat Composition
- Enterprise: X,XXX | Business: X,XXX | Standalone: XXX

### Opportunity Basis
- GHE Total: X,XXX (License: X,XXX + Metered: XXX)
- ADO Seats: XXX
- Basis: [GHE|ADO] (whichever is larger)

### Pipeline
- Qualified: XXX seats | Non-Qualified: XXX seats

### Recommended Action
[Cohort-driven guidance from table above]
```

#### Portfolio Ranking

| Rank | Account | TPID | Seat Opp | GHCP Seats | Remaining | Attach % | ARPU | ACR | Cohort | Action |
|---|---|---|---|---|---|---|---|---|---|---|

Sorted by `Remaining_Seat_Opp` descending (biggest whitespace first).

**Portfolio totals row**: Sum of Seat Opp, GHCP Seats, Remaining | Weighted avg Attach | Weighted avg ARPU.

#### MoM Trend

| Account | TPID | Seats (prev) | Seats (curr) | Δ Seats | ACR Δ | Attach Δ | Velocity | Flag |
|---|---|---|---|---|---|---|---|---|

Grouped: **Gains** (Δ > 0 desc), **Losses** (Δ < 0 asc), **Flat** (Δ = 0).

#### Seat Movement Report

For each NPSA category, show:
```
## [Category] (Count: X | Total Δ seats: Y | Total Δ ACR: $Z)
- Account 1: +XX seats, +$XXX ACR
- Account 2: ...
```

#### Cohort Distribution

| Cohort | Action | # Accounts | Total Seats | Total Remaining |
|---|---|---|---|---|
| 0 | Land Copilot | X | 0 | N/A |
| 1 | Land Copilot | X | XX | X,XXX |
| 2 | Expand | X | X,XXX | X,XXX |
| 3 | Upsell | X | X,XXX | X,XXX |
| 4 | Nurture | X | X,XXX | X,XXX |

Followed by accounts listed under each cohort heading.

#### OctoDash Enrichment (when Q4 + Q5 data is used)

When the workflow includes OctoDash data, add these sections to the report:

**Section A: Per-Organization Breakdown** (source: OctoDash — Week of YYYY-MM-DD)

| Enterprise Slug | SF Account Name | Licensed Seats | Product Type | Active% | Engaged% | vs Industry Benchmark |
|---|---|---|---|---|---|---|

Include a **TOTAL** row summing licensed seats. Note the number of unique Azure Subscription IDs.

- Flag if two slugs share the same Azure Subscription ID — those orgs can't be separated by subscription alone.
- Compare each org's Active% against the `industry_active_user_ratio` benchmark. Flag orgs significantly below benchmark.
- Flag eval/sandbox slugs that may not be production-relevant.

**Section B: MSXI TPID-Level Summary** (source: MSXI — Last Completed Month: Mon YYYY)

| Metric | Value |
|---|---|
| GHCP Seats | X,XXX |
| GHCP Business / Enterprise / Standalone | X,XXX / XXX / XXX |
| GHE Total Seats | X,XXX |
| GHAS Total Seats | XXX |
| GHCP ACR | $XXX,XXX |
| ARPU | $XX.XX |
| TAM (Seat Opportunity) | X,XXX |
| WAU% / WEU% | XX% / XX% |
| Growth Cohort | Cohort N — [Action] |

**Section C: Key Callouts** (2–4 bullets)

- Which org holds the majority of seats?
- Any significant seat drops or growth across the 4-week window?
- Any orgs above or below industry benchmarks?
- Shared Azure Subscription IDs requiring triage?

**Section D: Azure Subscription ID Summary**

| Azure Subscription ID | Enterprise Slug(s) | Seat Count | Product Type |
|---|---|---|---|

> **Formatting rule — Azure Subscription IDs**: Always display the **full 36-character GUID** (e.g., `e3912a3c-dee1-4339-ada8-737ef38ddd66`). Never truncate, abbreviate, or ellipsis-shorten subscription IDs (no `e3912a3c-...`). These are lookup keys — stakeholders copy-paste them for license triage. This applies everywhere a subscription ID appears: Section A callouts, Section D table, Key Callouts, and any inline references.

This is the section stakeholders need for license triage — which Azure subscriptions to investigate.

#### Source Comparison (when both MSXI and OctoDash data is present)

| Source | Total GHCP Seats | Notes |
|---|---|---|
| MSXI (TPID-level) | X,XXX | Last completed fiscal month |
| OctoDash (sum of slugs) | X,XXX | Week of YYYY-MM-DD |
| **Delta** | ±XXX | Different pipelines and refresh cadences — do not reconcile |

> These totals will rarely match exactly. MSXI and OctoDash use different data pipelines and refresh cadences. Present both and note the discrepancy — do not attempt to reconcile or explain the difference.

### Step 5.5 — Apply Vault Overrides (Account-Scoped Runs)

If Step 1.75 produced reporting overrides, apply them to the report **before** presenting to the user:

1. **Reframe seat movements**: If vault says an org migration occurred, annotate any seat decline on the old org with the migration context. Do not classify migrated seats as "Decrease" or "Loss" in NPSA — reclassify as "Migration (neutral)" and note the destination org.
2. **Annotate OctoDash slugs**: If vault identifies decommissioning slugs vs. active slugs, add a `Status` column to the Per-Organization Breakdown table: `Active`, `Decommissioning`, `Eval/Sandbox`.
3. **Adjust Key Callouts**: Replace generic "significant seat drop" language with the vault-sourced explanation (e.g., "EMU consolidation — seats migrated to [new org], not churned").
4. **Flag unresolved gaps**: If the vault mentions a known issue (e.g., CRM ACR mismatch) that the PBI data confirms, call it out explicitly with both the vault note and the PBI evidence.
5. **Add Vault Context section**: At the end of the report, add:

```markdown
### Vault Context Applied
- [List each override that was applied and how it affected the report]
- Source: Obsidian vault — Customers/<Name>/insights.md (last updated: YYYY-MM-DD)
```

If no overrides were found in Step 1.75, skip this step entirely.

### Step 6 — Summary & Recommendations

End with:

1. **Portfolio scorecard**: Total seats across portfolio, total whitespace, weighted average attach rate, total ACR
2. **Top 3 expansion targets**: Accounts with largest `Remaining_Seat_Opp` AND healthy adoption signals (WAU/WEU > 0) — these are where a seat conversation has the best chance
3. **Adoption risks**: Accounts with seats but low WAU/WEU — these need engagement, not more seats
4. **Land opportunities**: Cohort 0–1 accounts with developer base present but <50 GHCP seats
5. **Upsell candidates**: Cohort 3 accounts — high attach, low ARPU, ripe for Business→Enterprise conversation
6. **Stagnation alerts** (if trend data used): Accounts flat for 3+ months — what broke?
7. **Churn warnings** (if trend data used): Accounts with declining seats 2+ consecutive months
8. **Seat movement summary** (if comparing periods): New/Increase/Flat/Decrease/Loss counts with total seat and ACR deltas
9. **Effort guidance**: For each expansion target, estimate remaining opportunity in dollars (`Remaining_Seat_Opp × ARPU`)
10. **Cross-sell signals**: Cohort 4 accounts — flag which adjacent services (GHAS, AI Foundry, AKS, etc.) show zero ACR as cross-sell conversation starters

## Presentation Guardrails

These rules are **mandatory** for all output — chat, email, report file, Teams message, any channel.

### 1. Identity — Say What This Is

Every output that includes OctoDash or MSXI data **must** include a clear identity statement near the top:

> "These are custom account health briefs put together using SE tooling — not Sales Excellence reports, not official Microsoft reports."

### 2. Never Mix Revenue Sources

- **MSXI ACR** = actual billed revenue from Azure meters (backward-looking)
- **CRM milestone $/mo** = forecasted engagement consumption (forward-looking)

Never subtract one from the other. Never present them in the same table. Never call the difference a "gap." If both appear, keep them in clearly labeled separate sections with a note explaining the distinction.

### 3. Source and Date on Every Table

| Source | Label Format |
|---|---|
| OctoDash | `OctoDash — Week of YYYY-MM-DD` |
| MSXI | `MSXI — Last Completed Month: Mon YYYY` |
| CRM | `MSX/CRM — Queried YYYY-MM-DD` |

Never present data without source and extraction date.

## Cross-Source Pitfalls

1. **OctoDash seat totals ≠ MSXI seat totals.** Different data pipelines, different refresh cadences. Present both and note the discrepancy — do not try to reconcile.
2. **`Licensed_User_Weekly` can be stale.** Prefer `Installed_Vs_Active_Vs_Engaged_Weekly` for current data.
3. **Shared Azure Subscription IDs.** Two enterprise slugs can bill to the same subscription. Flag this — those orgs can't be separated by subscription alone.
4. **Never compare OctoDash per-slug ACR with MSXI TPID-level ACR.** OctoDash doesn't surface ACR per slug. MSXI ACR is the authoritative revenue figure.
5. **TPID type mismatch between sources.** OctoDash `msft_tpid` = Integer (no quotes). MSXI `Dim_Metrics[TPID]` = Text (must quote). Getting this wrong returns empty results with no error.
