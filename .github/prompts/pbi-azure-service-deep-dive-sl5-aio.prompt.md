---
description: "Cross-report Azure service deep dive: correlates portfolio-level performance (MSA_AzureConsumption_Enterprise) with service-level consumption (WWBI_ACRSL5). Answers: which services are growing/declining, where is attainment coming from at SL5, and what service-level actions close the portfolio gap."
---

# Azure Service-Level Deep Dive

Cross-correlate **two Power BI models** to answer service-level questions that neither report answers alone:

1. **Which services are growing fastest and declining most?** — SL5 consumption trends with MoM/YoY movement
2. **Where is my attainment coming from?** — Strategic pillar and service-level breakdown of ACR vs. budget
3. **What service-level actions close my gap?** — Cross-reference portfolio gap signals with granular consumption shifts

## Configuration

> **Managers**: Fork this file and update model IDs and scope for your team.

| Setting | Value | Notes |
|---|---|---|
| **Portfolio Model ID** | `726c8fed-367a-4249-b685-e4e22ca82b3d` | MSA_AzureConsumption_Enterprise — budget, pipeline, attributes |
| **Portfolio Report ID** | `d07c4e15-95f9-42f6-8411-59293f6895a1` | [Open in Power BI](https://msit.powerbi.com/groups/me/reports/d07c4e15-95f9-42f6-8411-59293f6895a1) |
| **SL5 Model ID** | `c4a39206-24c8-40b6-a204-391728ffd7a6` | WWBI_ACRSL5 — service-level ACR detail |
| **SL5 Report ID** | `53c27067-b282-432b-b3eb-723e2933b945` | [Open in Power BI](https://msit.powerbi.com/groups/me/reports/53c27067-b282-432b-b3eb-723e2933b945) |
| **Workspace** | BICOE_Prod_BICore_Azure01 | Both models live here |
| **Account Roster** | *(user-provided or `.docs/AccountReference.md`)* | Optional — prompt asks interactively if not set |
| **Default Date Filter (Portfolio)** | `'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"` | YTD closed months + current open |
| **Default Date Filter (SL5)** | `'DimDate'[IsAzureClosedandCurrentOpen] = "Y"` | Same logic, slightly different column casing |
| **Default View** | `'DimViewType'[ViewType] = "Curated"` | Both models use curated view |

### Model Relationship

These models share **TPID** as the join key. Queries run against each model separately; results are merged in the analysis steps by TPID.

| Model | Purpose | Key Tables |
|---|---|---|
| **Portfolio** (`726c8fed-...`) | Budget attainment, pipeline, opportunities, milestones, account attributes | `DimCustomer`, `DimDate`, `F_AzureConsumptionPipe`, `AzureCustomerAttributes`, `CustomerAssignByRole`, `M_ACR`, `M_ACRPipe` |
| **SL5** (`c4a39206-...`) | Granular service consumption — SL1 through SL5, strategic pillars, MoM/YoY changes | `DimCustomer`, `DimDate`, `F_ACR`, `DimServiceHierarchy`, `DimPricingLevelHierarchy`, `M_ACR` |

### Cross-Model Naming Differences

These two models use different names for equivalent structures. Copy-paste between models will break.

| Concept | Portfolio Model | SL5 Model |
|---|---|---|
| Date filter (YTD) | `'DimDate'[IsAzureClosedAndCurrentOpen]` (capital **A**nd) | `'DimDate'[IsAzureClosedandCurrentOpen]` (lowercase **a**nd) |
| Account hierarchy table | `'DimAccountSummaryGroupingDscOCDM'` | `'DimAccountSummary'` |
| ATU name column | `'DimAccountSummaryGroupingDscOCDM'[ATUName]` | `'DimAccountSummary'[ATUName]` |
| Field area column | `'DimAccountSummaryGroupingDscOCDM'[FieldArea]` | `'DimAccountSummary'[FieldArea]` |
| `DimCustomer` richness | 20 columns (lean — TPID, name, MACC) | 71 columns (includes AM, ATS, ATU, geography) |
| Service-level fact table | *(not present)* | `'F_ACR'` (32 columns incl. SL1–SL5, subscription) |
| Pipeline fact table | `'F_AzureConsumptionPipe'` (85 columns) | *(not present)* |

### Measure Availability by Model

**CRITICAL**: `M_ACR` exists in both models but has **very different measure sets**. Portfolio has ~4 measures; SL5 has 19. Never use SL5-only measures in Portfolio queries.

| `M_ACR` Measure | Portfolio | SL5 |
|---|---|---|
| `$ ACR` | ✅ | ✅ |
| `$ ACR Last Closed Month` | ✅ | ✅ |
| `$ ACR MoM Change` | ✅ | ✅ |
| `$ Avg Daily ACR Last Closed Month` | ✅ | ✅ |
| `$ Average Daily ACR` | ❌ | ✅ |
| `$ Avg Daily ACR MoM Change` | ❌ | ✅ |
| `$ Avg Daily ACR MoM Change Last Closed Month` | ❌ | ✅ |
| `$ ACR YTD YoY Change` | ❌ | ✅ |
| `% ACR YTD YoY Growth` | ❌ | ✅ |
| `% Avg Daily ACR MoM` | ❌ | ✅ |
| `% Avg Daily ACR MoM Change Last Closed Month` | ❌ | ✅ |
| `% Avg Daily ACR YoY` | ❌ | ✅ |
| `% Avg Daily ACR YoY Last Closed Month` | ❌ | ✅ |
| `% T3M CAGR` | ❌ | ✅ |
| `% T3M CAGR Last Closed Month` | ❌ | ✅ |
| `$ Gross ACR` | ❌ | ✅ |
| `$ PreCredit ACR` | ❌ | ✅ |
| `# Metered Units` | ❌ | ✅ |
| `# Paid Units` | ❌ | ✅ |

`M_ACRPipe` is **Portfolio-only** (does not exist in SL5):

| `M_ACRPipe` Measure | Portfolio |
|---|---|
| `$ Consumption Pipeline All` | ✅ |
| `$ Consumption Committed Pipeline Prior Week All` | ✅ |
| `$ Consumption Pipeline All WoW Change` | ✅ |
| `# Milestones` | ✅ |

**Budget attainment**: No `% ACR Budget Attain` measure exists in either model. To get attainment, you must calculate it from ACR vs. budget values, or skip it and note the gap.

### Schema Discovery Caveat

`GetSemanticModelSchema` does **not** surface hidden/calculated tables. Specifically:
- `M_ACR` and `M_ACRPipe` (Portfolio) are invisible to the schema API
- `DimViewType` does not appear in either model's schema API output
- `DimDate` shows only ~6 columns via API but actually has 27+

To validate whether a measure exists, use a DAX probe: `EVALUATE ROW("test", 'M_ACR'[<measure name>])`. If it errors with "cannot be found", the measure does not exist in that model.

### Query Design Principles

1. **Keep queries small** — Query one concern at a time (ACR, then pipeline, then attributes). Multi-measure queries with 6+ virtual columns are fragile and hard to debug when a single measure name is wrong.
2. **Validate filters first** — Before running a data query, confirm the account resolves: `EVALUATE CALCULATETABLE(SUMMARIZECOLUMNS('DimCustomer'[TPAccountName], 'DimCustomer'[TPID]), <ACCOUNT_FILTER>)`. This catches name mismatches early.
3. **One model per query** — Never mix Portfolio and SL5 references. They are separate models with separate connections.
4. **Fail fast on measures** — If a query fails with "cannot be found", check the Measure Availability table above before retrying. Don't guess measure names.

### Capacity Resilience (SL5 Timeout Handling)

The SL5 model (`WWBI_ACRSL5`) frequently exceeds Fabric compute capacity limits. This section defines the retry, backoff, and degraded-mode strategy.

**Known timeout triggers:**
- Fabric capacity exceeded (`Unable to complete the action because your organization's Fabric compute capacity has exceeded its limits`)
- DAX query timeout (query runs > 60s and is killed)
- Multiple concurrent users on the same Fabric capacity

**Retry policy:**

| Attempt | Wait | Action |
|---|---|---|
| 1st failure | 0s | Retry immediately with a **lighter query** (fewer measures, add TOPN if missing) |
| 2nd failure | 30s | Wait, then retry the same lighter query |
| 3rd failure | — | **Stop SL5 queries. Switch to Degraded Mode.** |

**Lighter query tactics (apply on 1st retry):**
- Drop trend measures (`T3M_CAGR`, `YoY`) — keep only `ACR_LCM` and `MoM_Change`
- Add `TOPN(50, ...)` if not already present
- Remove `SL2` and deeper granularity columns — aggregate at `ServiceCompGrouping` + `SL1` only
- Drop `ORDER BY` (sorting adds compute cost on large result sets)

**Degraded Mode — Portfolio-Only Fallback:**

When SL5 is unavailable, deliver a partial but still valuable report using **only the Portfolio model**:

1. Run Steps 2a + 2b (Portfolio ACR + pipeline) — these are lightweight and rarely throttled
2. Run Step 7 (Pipeline by Pillar) — gives pillar-level pipeline even without SL5 consumption
3. Run Step 8 (Account Attributes) — propensity flags are portfolio-only anyway
4. **Skip Steps 3–6 entirely** (all SL5-dependent)
5. Present results with a clear note:

> **⚠️ Partial results — SL5 model unavailable due to Fabric capacity limits.**
> Portfolio-level ACR and pipeline data is shown below. Service-level breakdown (pillar, service comp group, SL1–SL5) is unavailable this session.
> To get full service detail: wait 15–30 minutes for capacity recovery, or open the [SL5 report directly](https://msit.powerbi.com/groups/me/reports/53c27067-b282-432b-b3eb-723e2933b945) and apply filters manually.

**Progressive query gating:**

SL5 queries MUST run in this order. If a step fails after retry, skip all subsequent SL5 steps:

```
Auth probe (Step 0) → Step 3a (pillar totals) → Step 3b (pillar trends) → Step 4a (service detail) → [STOP HERE unless user explicitly asks for deeper drill]
```

Steps 4b, 5, 5b, and 6 are **on-demand only** — run them only if:
- The user explicitly asks for YoY trends, SL3–SL5 granularity, subscription detail, or monthly time series
- AND all prior SL5 steps succeeded without retry

## Workflow

### Step 0 — Auth Pre-Check (Both Models)

Test auth against both models sequentially. Run against **Portfolio** model first:

```dax
-- Against Portfolio Model (726c8fed-...)
EVALUATE TOPN(1, 'DimDate')
```

Then against **SL5** model:

```dax
-- Against SL5 Model (c4a39206-...)
EVALUATE TOPN(1, 'DimDate')
```

**Interpreting failures:**

| Error | Meaning | Action |
|---|---|---|
| `TypeError: fetch failed`, 401, connection error | Auth expired | Stop all PBI steps. Show auth recovery instructions below. |
| `Fabric compute capacity has exceeded its limits` | Capacity throttled | Mark that model as **throttled**. If SL5 throttled but Portfolio works → proceed in **Degraded Mode** (see Capacity Resilience above). If both throttled → stop PBI steps, offer manual report links. |

Auth recovery instructions (show only for auth failures):

> Power BI MCP authentication has expired. Please run:
> ```
> az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
> az account get-access-token --resource https://analysis.windows.net/powerbi/api
> ```
> Then restart `powerbi-remote` in VS Code (MCP icon → restart).

### Step 1 — Scope the Query

Before pulling any data, gather scope from the user. Since this prompt queries **two models**, all filters must resolve to a shared TPID set.

> **To scope your service deep dive, tell me:**
> 1. **Which accounts?** (names, TPIDs, "all my assigned accounts", or an ATU/territory)
> 2. **Service-level focus?** (strategic pillar, service comp group, SL1/SL2, or "all services")
> 3. **Time window?** (default: FY26 YTD — closed months + current open)
> 4. **What question are you trying to answer?** Examples:
>    - "Which services are growing fastest and declining most at [customer]?"
>    - "Where is my attainment gap coming from by pillar?"
>    - "Show me OpenAI vs. Fabric trends across my accounts"
>    - "What's driving the ACR drop at [customer]?"

**Account scope filters (apply to both models):**

| Filter | Portfolio Column | SL5 Column | Example |
|---|---|---|---|
| Customer name(s) | `'DimCustomer'[TPAccountName]` | `'DimCustomer'[TPAccountName]` | "Contoso", "Fabrikam" |
| TPID(s) | `'DimCustomer'[TPID]` | `'DimCustomer'[TPID]` | 12345, 67890 |
| ATU / Territory | `'DimAccountSummaryGroupingDscOCDM'[ATUName]` | `'DimAccountSummary'[ATUName]` | "US East Healthcare" |
| Field Area | `'DimAccountSummaryGroupingDscOCDM'[FieldArea]` | `'DimAccountSummary'[FieldArea]` | "East" |
| Role alias | `'CustomerAssignByRole'[CSACloudAndAI]` etc. | *(not in SL5 — resolve TPIDs from Portfolio first)* | "jlee" |

**Service-level filters (SL5 model only):**

| Filter | SL5 Column | Example |
|---|---|---|
| Strategic Pillar | `'F_ACR'[StrategicPillar]` | "AI Platform", "Infrastructure" |
| Super Strategic Pillar | `'F_ACR'[SuperStrategicPillar]` | "Data & AI", "Infra" |
| Service Comp Group | `'F_ACR'[ServiceCompGrouping]` | "Azure OpenAI", "SQL Database" |
| Service Level 1 | `'F_ACR'[ServiceLevel1]` | "Compute", "Storage" |
| Service Level 2–5 | `'F_ACR'[ServiceLevel2]` through `[ServiceLevel5]` | Progressively granular |
| Solution Play | `'F_ACR'[SolutionPlay]` | "Migrate & Modernize" |
| Solution Area | `'F_ACR'[SolutionArea]` | "Azure" |
| Pricing Level | `'DimPricingLevelHierarchy'[AZ_PricingLevel]` | "Pay As You Go", "Enterprise Agreement" |

If user says **"all my assigned accounts"**:
- Use `msx:crm_whoami` to get alias
- Query Portfolio model's `CustomerAssignByRole` filtered by alias to get TPID list
- Use that TPID list for both models

Build `<ACCOUNT_FILTER>` and `<SERVICE_FILTER>` from user choices. Always include base filters per model.

### Step 2 — Pull Portfolio Summary (from Portfolio Model)

Query the **Portfolio model** (`726c8fed-...`) for account-level ACR and pipeline. Run as **two separate queries** — ACR and pipeline use different measure tables and combining them in one SUMMARIZECOLUMNS can cause issues.

**Step 2a — ACR summary:**

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPAccountName],
        'DimCustomer'[TPID],
        "ACR_YTD", 'M_ACR'[$ ACR],
        "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
        "ACR_MoM_Change", 'M_ACR'[$ ACR MoM Change]
    ),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated",
    <ACCOUNT_FILTER>
)
```

> **Note**: Budget attainment (`% ACR Budget Attain`) does not exist as a measure in this model. If the user asks for attainment, note this gap.

**Step 2b — Pipeline summary:**

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPAccountName],
        'DimCustomer'[TPID],
        "Pipe_All", 'M_ACRPipe'[$ Consumption Pipeline All],
        "Pipe_Committed", 'M_ACRPipe'[$ Consumption Committed Pipeline Prior Week All],
        "Pipe_WoW_Change", 'M_ACRPipe'[$ Consumption Pipeline All WoW Change]
    ),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated",
    <ACCOUNT_FILTER>
)
```

Merge 2a + 2b by TPID in your analysis.

### Step 3 — Pull Service-Level ACR by Pillar (from SL5 Model)

Query the **SL5 model** (`c4a39206-...`) for strategic-pillar-level consumption. Split into **two queries** — ACR totals vs. trend metrics — to keep each query focused and debuggable.

**Step 3a — Pillar ACR totals:**

> **Gate**: This is the first SL5 data query. If it fails with a capacity error, retry once with the lighter variant below. If it fails again, switch to **Degraded Mode** and skip all remaining SL5 steps (3b, 4a, 4b, 5, 5b, 6).

```dax
EVALUATE
TOPN(
    50,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            'F_ACR'[SuperStrategicPillar],
            'F_ACR'[StrategicPillar],
            "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
            "AvgDaily_LCM", 'M_ACR'[$ Avg Daily ACR Last Closed Month]
        ),
        'DimDate'[IsAzureClosedandCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated",
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    [ACR_LCM], DESC
)
```

**Lighter retry variant** (if first attempt fails — drops YTD ACR measure):

```dax
EVALUATE
TOPN(
    30,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            'F_ACR'[StrategicPillar],
            "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month]
        ),
        'DimDate'[IsAzureClosedandCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated",
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    [ACR_LCM], DESC
)
```

**Step 3b — Pillar trend signals:**

> **Gate**: Only run if Step 3a succeeded. If 3a required the lighter retry variant, use the lighter version of 3b too.

Full version:

```dax
EVALUATE
TOPN(
    50,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            'F_ACR'[SuperStrategicPillar],
            'F_ACR'[StrategicPillar],
            "AvgDaily_MoM_Change", 'M_ACR'[$ Avg Daily ACR MoM Change Last Closed Month],
            "AvgDaily_MoM_Pct", 'M_ACR'[% Avg Daily ACR MoM Change Last Closed Month],
            "YoY_Pct", 'M_ACR'[% ACR YTD YoY Growth],
            "T3M_CAGR", 'M_ACR'[% T3M CAGR Last Closed Month]
        ),
        'DimDate'[IsAzureClosedandCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated",
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    ABS([AvgDaily_MoM_Change]), DESC
)
```

**Lighter retry variant** (drops YoY and T3M — keeps only MoM):

```dax
EVALUATE
TOPN(
    30,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            'F_ACR'[StrategicPillar],
            "AvgDaily_MoM_Change", 'M_ACR'[$ Avg Daily ACR MoM Change Last Closed Month]
        ),
        'DimDate'[IsAzureClosedandCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated",
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    ABS([AvgDaily_MoM_Change]), DESC
)
```

Merge 3a + 3b by TPID + StrategicPillar.

### Step 4 — Pull Service-Level Detail (SL5 Granularity)

Drill into **service comp group** and **SL1/SL2** for the fastest movers. Split into **two queries** to keep measure count manageable.

**Step 4a — Service-level ACR with MoM movement:**

> **Gate**: Only run if Steps 3a and 3b both succeeded. If either required the lighter variant, drop `SL2` from this query.

```dax
EVALUATE
TOPN(
    100,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            'F_ACR'[StrategicPillar],
            'F_ACR'[ServiceCompGrouping],
            'F_ACR'[ServiceLevel1],
            "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
            "AvgDaily_MoM_Change", 'M_ACR'[$ Avg Daily ACR MoM Change Last Closed Month]
        ),
        'DimDate'[IsAzureClosedandCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated",
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    ABS([AvgDaily_MoM_Change]), DESC
)
```

> **Note**: `SL2` is removed from the default query to reduce cardinality. Add it back only for single-account, single-pillar drills where the result set is small.

**Step 4b — Service-level YoY and T3M trends (ON-DEMAND):**

> **Gate**: Run ONLY if the user explicitly asks for YoY or T3M trend data at service level, AND Steps 3–4a all succeeded without retry. Otherwise skip — MoM from Step 4a is sufficient for most analyses.

```dax
EVALUATE
TOPN(
    100,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            'F_ACR'[StrategicPillar],
            'F_ACR'[ServiceCompGrouping],
            'F_ACR'[ServiceLevel1],
            "YoY_Change", 'M_ACR'[$ ACR YTD YoY Change],
            "T3M_CAGR", 'M_ACR'[% T3M CAGR Last Closed Month]
        ),
        'DimDate'[IsAzureClosedandCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated",
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    ABS([YoY_Change]), DESC
)
```

Merge 4a + 4b by TPID + StrategicPillar + ServiceCompGrouping + ServiceLevel1.

### Step 5 — Pull SL5-Level Detail (deepest granularity, ON-DEMAND)

> **Gate**: Run ONLY if the user explicitly asks for SL3–SL5 granularity AND all prior SL5 steps succeeded without retry. This is the heaviest query in the prompt — expect timeouts on multi-account scopes.

If the user asks for maximum service detail (e.g., "what specific resources are declining?"), drill to SL3–SL5. Keep to 3 measures max at this granularity — high-cardinality dimension columns + many measures = slow/failed queries. **Narrow to a single account + single pillar** before running.

```dax
EVALUATE
TOPN(
    200,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            'F_ACR'[StrategicPillar],
            'F_ACR'[ServiceCompGrouping],
            'F_ACR'[ServiceLevel1],
            'F_ACR'[ServiceLevel2],
            'F_ACR'[ServiceLevel3],
            'F_ACR'[ServiceLevel4],
            'F_ACR'[ServiceLevel5],
            "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
            "AvgDaily_MoM_Change", 'M_ACR'[$ Avg Daily ACR MoM Change Last Closed Month],
            "AvgDaily_MoM_Pct", 'M_ACR'[% Avg Daily ACR MoM Change Last Closed Month]
        ),
        'DimDate'[IsAzureClosedandCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated",
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    ABS([AvgDaily_MoM_Change]), DESC
)
```

### Step 5b — Pull Subscription-Level Detail (ON-DEMAND, for churn risk)

> **Gate**: Run ONLY if Step 11 analysis flags subscription end-date risk AND all prior SL5 steps succeeded without retry. **Narrow to a single account** before running.

If Step 11 flags subscription end-date risk, or user asks about specific subscriptions, pull subscription metadata from `F_ACR`:

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPAccountName],
        'F_ACR'[SubscriptionName],
        'F_ACR'[SubscriptionGUID],
        'F_ACR'[SubscriptionStartDate],
        'F_ACR'[SubscriptionEndDate],
        'F_ACR'[StrategicPillar],
        'F_ACR'[ServiceCompGrouping],
        "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
        "AvgDaily_MoM_Change", 'M_ACR'[$ Avg Daily ACR MoM Change Last Closed Month]
    ),
    'DimDate'[IsAzureClosedandCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated",
    <ACCOUNT_FILTER>,
    <SERVICE_FILTER>
)
ORDER BY [SubscriptionEndDate] ASC
```

This enables the "subscription end date approaching" recommendation in Step 11.

### Step 6 — Pull Monthly Trend (SL5 Model, ON-DEMAND time series)

> **Gate**: Run ONLY if the user explicitly asks for a time-series trend AND all prior SL5 steps succeeded without retry. **Narrow to a single pillar or service comp group** — monthly × account × pillar is a very large result set.

For trending analysis ("show me the last 6 months of OpenAI growth"), pull monthly ACR by service:

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimDate'[FiscalMonth],
        'DimCustomer'[TPAccountName],
        'DimCustomer'[TPID],
        'F_ACR'[SuperStrategicPillar],
        'F_ACR'[StrategicPillar],
        "ACR", 'M_ACR'[$ ACR],
        "AvgDailyACR", 'M_ACR'[$ Average Daily ACR]
    ),
    'DimDate'[FY_Rel] IN {"FY", "FY-1"},
    'DimViewType'[ViewType] = "Curated",
    <ACCOUNT_FILTER>,
    <SERVICE_FILTER>
)
ORDER BY [FiscalMonth] ASC, [StrategicPillar] ASC
```

### Step 7 — Pull Pipeline by Pillar (from Portfolio Model)

To cross-correlate consumption trends with pipeline investment, query the **Portfolio model** for pillar-level pipeline:

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPAccountName],
        'DimCustomer'[TPID],
        'F_AzureConsumptionPipe'[StrategicPillar],
        'F_AzureConsumptionPipe'[SolutionPlay],
        "Pipe_All", 'M_ACRPipe'[$ Consumption Pipeline All],
        "Pipe_Committed", 'M_ACRPipe'[$ Consumption Committed Pipeline Prior Week All],
        "Milestones", 'M_ACRPipe'[# Milestones],
        "Pipe_WoW_Change", 'M_ACRPipe'[$ Consumption Pipeline All WoW Change]
    ),
    'DimDate'[FY_Rel] = "FY",
    'DimViewType'[ViewType] = "Curated",
    <ACCOUNT_FILTER>
)
ORDER BY [Pipe_All] DESC
```

### Step 8 — Pull Account Attributes (from Portfolio Model)

For propensity cross-referencing:

> **Important**: `AzureCustomerAttributes` does NOT have a `TPAccountName` column. Filter by TPID only.

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        'AzureCustomerAttributes',
        "TPID", 'AzureCustomerAttributes'[TPID],
        "HasOpenAI", 'AzureCustomerAttributes'[HasOpenAI],
        "HasOpenAI_Pipe", 'AzureCustomerAttributes'[HasOpenAI_Pipe],
        "PTU_Target", 'AzureCustomerAttributes'[PTU_Target_Customer],
        "NetNewMigrationTarget", 'AzureCustomerAttributes'[NetNewMigrationTarget],
        "ESI_Tier", 'AzureCustomerAttributes'[ESI_Tier],
        "500K_100K_Target", 'AzureCustomerAttributes'[500K_100K_Targets],
        "TrancheGrowthTarget", 'AzureCustomerAttributes'[TrancheGrowthTargetAccounts]
    ),
    'AzureCustomerAttributes'[TPID] IN {<TPID_LIST>}
)
```

### Step 9 — Analyze: Service Growth & Decline Ranking

Merge Step 3 (pillar-level) and Step 4 (service-level) data. Rank services by absolute MoM change:

**Top Growers** — sorted by `AvgDaily_MoM_Change` DESC:

| Account | Pillar | Service Comp Group | SL1 | SL2 | ACR (LCM) | MoM Δ ($) | MoM Δ (%) | T3M CAGR | Signal |
|---|---|---|---|---|---|---|---|---|---|

**Top Decliners** — sorted by `AvgDaily_MoM_Change` ASC:

| Account | Pillar | Service Comp Group | SL1 | SL2 | ACR (LCM) | MoM Δ ($) | MoM Δ (%) | T3M CAGR | Signal |
|---|---|---|---|---|---|---|---|---|---|

**Signal logic:**
- **Accelerating** — MoM growth > 0 AND T3M CAGR > MoM growth (compounding)
- **Growing** — MoM growth > 0 AND T3M CAGR ≤ MoM (growth but decelerating)
- **Flat** — |MoM change| < 2% AND |T3M CAGR| < 2%
- **Declining** — MoM growth < 0 AND T3M CAGR > MoM (slowing decline)
- **Falling** — MoM growth < 0 AND T3M CAGR ≤ MoM (accelerating decline)
- **New** — ACR present this month, no prior month data

### Step 10 — Analyze: Attainment Decomposition by Pillar

Merge Step 2 (portfolio ACR + pipeline) with Step 3 (pillar breakdown). For each account:

| Account | ACR YTD | ACR LCM | Pillar | ACR (Pillar) | % of Total ACR | MoM Δ ($) | MoM Δ (%) | YoY Growth% | Pipeline ($) | Gap Contribution |
|---|---|---|---|---|---|---|---|---|---|---|

**Gap Contribution logic:**
- Calculate each pillar's share of total account ACR
- If pillar is declining: **gap contributor** — flag with magnitude
- If pillar is growing: **gap closer** — flag with magnitude
- If pipeline exists for a declining pillar: **covered** — pipeline may offset decline
- If no pipeline for declining pillar: **uncovered gap** — needs action

### Step 11 — Analyze: Cross-Report Recommendations

For each account, cross-reference:
- Portfolio gap signal (Step 2) + service trend (Steps 3–4) + pipeline by pillar (Step 7) + attributes (Step 8)

| Condition | Recommendation |
|---|---|
| Pillar declining MoM with no pipeline coverage | "**{Pillar}** at {account} declined ${MoM_change} with no pipeline. Investigate workload churn and consider {SolutionPlay} pipeline." |
| Service comp group declining but pillar overall growing | "**{ServiceCompGroup}** declining within {Pillar} — offset by growth elsewhere. Monitor for workload migration vs. true churn." |
| OpenAI ACR growing + HasOpenAI_Pipe = N | "OpenAI consumption growing at {account} with no formalized pipeline. Convert existing usage to committed pipeline." |
| PTU_Target = Y + no OpenAI ACR or flat | "PTU target account with no/flat OpenAI consumption. Engage SE for PTU sizing workshop." |
| T3M CAGR negative across multiple pillars | "Broad-based decline across {N} pillars at {account}. Escalate — may indicate workload exit or competitor displacement." |
| Pillar with large pipeline but flat/declining ACR | "**{Pillar}** has ${Pipe} pipeline but ACR is declining. Validate pipeline realism — milestones may be stale." |
| Migration target + Infra pillar declining | "Migration target account but Infra ACR declining. Check if migration pipeline is converting or stalled." |
| New service appearing (no prior month) | "New **{ServiceCompGroup}** consumption detected at {account} (${ACR}). Verify if this maps to an active opportunity." |
| Budget attainment > 100% + specific pillar driving it | "Ahead of target — growth led by **{Pillar}** (+{YoY}% YoY). Protect this growth and look for expansion in adjacent pillars." *(Note: budget attainment must be inferred from ACR trajectory vs. pipeline, not from a model measure.)* |
| Service declining + subscription end date approaching | "**{Service}** declining — subscription {SubscriptionName} ends {EndDate}. Risk of renewal churn." |

### Step 12 — Present Final Report

**Section 1: Portfolio Context**
- Accounts in scope: N
- Total ACR YTD: $X | Last closed month: $Y
- Pipeline: $X total | $Y committed
- Note: Budget attainment % is not available as a model measure — show ACR vs. pipeline coverage instead

**Section 2: Service Growth & Decline** (from Step 9)
- Top 10 growers table
- Top 10 decliners table
- Use the signal column to color-code: Accelerating/Growing = positive, Declining/Falling = negative

**Section 3: Attainment by Pillar** (from Step 10)
- Per-account pillar breakdown showing where attainment is coming from and where gaps are
- Highlight uncovered gaps (declining pillar, no pipeline)

**Section 4: Monthly Trend** (from Step 6, if requested)
- Line chart description or table of monthly ACR by pillar
- Call out inflection points ("OpenAI inflected upward in {month}", "Infra declined starting {month}")

**Section 5: Cross-Report Recommendations** (from Step 11)
- Number each action
- Tag: 🏃 Quick win (pipeline hygiene, commit existing usage) vs. 📋 Strategic action (new engagement, escalation)
- Include which report to reference for evidence: `[Portfolio]` or `[SL5]`

**Section 6: Scope & Data Freshness**
- Portfolio Model: MSA_AzureConsumption_Enterprise (`726c8fed-...`)
- SL5 Model: WWBI_ACRSL5 (`c4a39206-...`)
- Filters applied: list all user scope selections
- Date context: report `DimDate` fiscal month/week from latest data in each model
- Note: "Service-level data (SL5) may reflect ACR at different aggregation than portfolio budget measures. Pillar-level totals from SL5 should directionally match portfolio ACR but may differ due to adjustment flags and subsegment exclusions."
- Report default filters (SL5): Excludes SubSegmentIds {0, 200, 222, 250, 295, 346, 352, 365, 400, 404, 405} and `ServiceCompGrouping = 'XCR - W365'`
