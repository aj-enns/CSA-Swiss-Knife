---
description: "Azure subscription-level deep dive at SL4 granularity: daily ACR amounts and trends at both top-parent (TPID) and enrollment customer name level, with service-level drill-down through ServiceLevel4. Answers: what are the daily consumption trends, which enrollment entities are driving growth or decline, and which SL4 services are moving."
---

# Azure Subscription Detail — SL4 Deep Dive

Query the **AzureSubscriptionDetailsSL4** semantic model for subscription-level Azure consumption at SL4 granularity. Provides dual-level analysis: top-parent (TPID) summary and enrollment customer name breakdown, with service-level drill-through to SL4.

## Configuration

> **Managers**: Fork this file and update model IDs and scope for your team.

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `0bcea7ea-3aa6-4704-b99d-3429e18b5f02` | MSA_Azure_SubscriptionDetails_Enterprise (Prod) |
| **Report ID** | `751679ff-fbf3-485c-b3b3-67bfeac3b190` | [Open in Power BI](https://msit.powerbi.com/groups/1ce1a10e-d56e-4e96-8147-cc06baba1e9e/reports/751679ff-fbf3-485c-b3b3-67bfeac3b190) |
| **Workspace** | BICOE_Prod_BICore_Azure01 | |
| **Account Roster** | *(user-provided or `.docs/AccountReference.md`)* | Optional — prompt asks interactively if not set |
| **Default Date Filter** | `'DimDate'[IsLastAzureClosedMonth] = 1` | Last closed month for point-in-time queries |
| **YTD Date Filter** | `'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"` | YTD closed months + current open |

### Model Overview

Single-model prompt — all queries run against `MSA_Azure_SubscriptionDetails_Enterprise`.

| Table | Purpose | Key Columns |
|---|---|---|
| `Fact ACR Subscription` | Monthly ACR at subscription × service × enrollment grain | `ServiceLevel1`–`ServiceLevel4`, `ServiceCompGrouping`, `StrategicPillar`, `EnrollmentCustomerName`, `EnrollmentNumber`, `SubscriptionGUID`, `SubscriptionName`, `SubscriptionEndDate`, `TPID` |
| `DimCustomer` | Top-parent customer dimension | `TPID`, `TPAccountName` (hidden from schema API — verified via DAX probe) |
| `DimDate` | Time dimension (46 columns) | `FiscalMonth`, `MonthRel`, `FYRel`, `IsLastAzureClosedMonth`, `IsAzureClosedAndCurrentOpen` |
| `DimCustomerAssignments` | Account ownership by alias | `MSSalesTPID`, `EmailAlias` |
| `EnrollmentChildBridge` | Enrollment → child customer mapping | `EndCustomerOrganizationName`, `EnrollmentTPID` |
| `EnrollmentAttributes` | EA enrollment attributes | `TPID`, `HasCurrentYearCredit`, `HasPreviousYearCredit` |
| `SubscriptionTagging` | Custom business tags on subscriptions | `BusinessUnit`, `Division`, `Application`, `OpportunityNumber` |

### Measure Inventory (`Measures | ACR`)

All measures live in the `Measures | ACR` table. Reference them as `'Measures | ACR'[<measure name>]`.

| Measure | Type | Use |
|---|---|---|
| `$ ACR` | Currency | Total ACR for period |
| `$ Average Daily ACR` | Currency | Normalized daily consumption |
| `$ ACR MoM Change` | Currency | Month-over-month $ change |
| `% Avg Daily ACR MoM` | Percent | MoM % change in avg daily ACR |
| `% Avg Daily ACR YoY` | Percent | YoY % change in avg daily ACR |
| `% T3M CAGR` | Percent | Trailing 3-month compound growth |
| `% ACR YTD YoY` | Percent | Year-to-date YoY growth % |
| `$ ACR YoY` | Currency | YoY $ change |
| `$ ACR YoY YTD Change` | Currency | YTD YoY $ change |
| `$ Gross ACR` | Currency | Pre-credit ACR |
| `$ PreCredit ACR` | Currency | Pre-credit ACR (alternate) |
| `# Subscriptions` | Integer | Distinct subscription count |
| `# Metered Units` | Integer | Total metered units |
| `# Paid Units` | Integer | Total paid units |

Additional measures in other tables:
- `'Measures | ACD'[% ACD]` — Azure Consumed Discount rate
- `'Measures | ACO'[$ Credits Granted]`, `'Measures | ACO'[$ Credits Used]` — Azure credit tracking

### Schema Discovery Notes

- **`DimCustomer`** shows only `TPID` via `GetSemanticModelSchema`. The column `TPAccountName` exists (verified by DAX probe) but is hidden from API.
- **`DimViewType`** does NOT exist in this model (unlike WWBI_ACRSL5). Do not include `ViewType = "Curated"` filters.
- **No pipeline data** — this model has no `M_ACRPipe` or pipeline fact tables. For pipeline cross-reference, query the Portfolio model (`726c8fed-367a-4249-b685-e4e22ca82b3d`) separately.

### Capacity Constraints

This model is **very large** and frequently times out on unscoped or multi-measure queries. Apply these rules:

**Hard rules:**
- **Always filter by TPID** — no unscoped queries. Even `TOPN(3, ...)` without a TPID filter will timeout.
- **Max 4 measures per query** — queries with 5+ measures consistently timeout on this model.
- **Split ACR + trend measures** — run totals (ACR, AvgDaily) in one query, trends (MoM%, YoY%, T3M) in a second query. Merge by grouping key.

**Retry policy (same as SL5):**

| Attempt | Wait | Action |
|---|---|---|
| 1st failure | 0s | Retry with fewer measures (keep only `$ ACR` + `% Avg Daily ACR MoM`) |
| 2nd failure | 30s | Wait, then retry the lighter query |
| 3rd failure | — | Stop. Show manual report link and note the capacity issue. |

## Workflow

### Step 0 — Auth Pre-Check

```dax
EVALUATE TOPN(1, 'DimDate')
```

**Interpreting failures:**

| Error | Meaning | Action |
|---|---|---|
| `TypeError: fetch failed`, 401, connection error | Auth expired | Stop. Show auth recovery below. |
| `Fabric compute capacity has exceeded its limits` | Capacity throttled | Wait 5 min, retry once. If still throttled, stop and offer manual report link. |

Auth recovery:

> Power BI MCP authentication has expired. Please run:
> ```
> az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
> az account get-access-token --resource https://analysis.windows.net/powerbi/api
> ```
> Then restart `powerbi-remote` in VS Code (MCP icon → restart).

### Step 1 — Scope the Query

Gather scope from the user:

> **To scope your SL4 deep dive, tell me:**
> 1. **Which accounts?** (names, TPIDs, "all my assigned accounts", or an enrollment number)
> 2. **Service focus?** (strategic pillar, service comp group, SL1, or "all services")
> 3. **Time window?** (default: last closed Azure month)
> 4. **What question?** Examples:
>    - "What's the daily ACR trend at [customer] and its enrollment entities?"
>    - "Which SL4 services are growing and declining at [enrollment customer]?"
>    - "Show me subscription-level detail for [customer]'s declining services"
>    - "Break down Azure consumption by enrollment customer under [TPID]"

**Account scope filters:**

| Filter | Column | Example |
|---|---|---|
| Customer name(s) | `'DimCustomer'[TPAccountName]` | "Contoso" |
| TPID(s) | `'DimCustomer'[TPID]` | 12345, 67890 |
| Enrollment customer | `'Fact ACR Subscription'[EnrollmentCustomerName]` | "Contoso Healthcare" |
| Enrollment number | `'Fact ACR Subscription'[EnrollmentNumber]` | "12345678" |
| Assigned alias | `'DimCustomerAssignments'[EmailAlias]` | "jlee" (requires join) |

**Service filters:**

| Filter | Column | Example |
|---|---|---|
| Strategic Pillar | `'Fact ACR Subscription'[StrategicPillar]` | "Databricks", "Azure SQL Core" |
| Service Comp Group | `'Fact ACR Subscription'[ServiceCompGrouping]` | "Analytics", "Core DBs" |
| Service Level 1 | `'Fact ACR Subscription'[ServiceLevel1]` | "Compute", "Storage" |
| Service Level 2–4 | `'Fact ACR Subscription'[ServiceLevel2]` through `[ServiceLevel4]` | Progressively granular |
| Solution Play | `'Fact ACR Subscription'[SolutionPlay]` | "Migrate & Modernize" |

If user says **"all my assigned accounts"**:
- Use `msx-crm:crm_whoami` to get alias
- Cannot resolve alias → TPID in this model alone (DimCustomerAssignments uses bidirectional filter but has no role column)
- Fallback: ask user for TPIDs or query the Portfolio model (`726c8fed-...`) for alias → TPID resolution, then use those TPIDs here

Build `<ACCOUNT_FILTER>` and `<SERVICE_FILTER>` from user choices. **Always include a TPID filter.**

**Date filter options:**

| Use case | Filter |
|---|---|
| Point-in-time (default) | `'DimDate'[IsLastAzureClosedMonth] = 1` |
| YTD (cumulative) | `'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"` |
| Specific month | `'DimDate'[FiscalMonth] = "FY26-Mar"` |
| Trailing period | `'DimDate'[MonthRel] IN {"CM-1", "CM-2", "CM-3"}` |

### Step 2 — Top-Parent ACR Summary

Pull account-level totals for the scoped TPIDs. Split into **two queries** to stay under the 4-measure limit.

**Step 2a — ACR totals:**

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPAccountName],
        'DimCustomer'[TPID],
        "ACR", 'Measures | ACR'[$ ACR],
        "AvgDailyACR", 'Measures | ACR'[$ Average Daily ACR],
        "MoM_Dollar", 'Measures | ACR'[$ ACR MoM Change],
        "MoM_Pct", 'Measures | ACR'[% Avg Daily ACR MoM]
    ),
    'DimDate'[IsLastAzureClosedMonth] = 1,
    <ACCOUNT_FILTER>
)
```

**Step 2b — Trend signals (run separately):**

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPAccountName],
        'DimCustomer'[TPID],
        "YoY_Pct", 'Measures | ACR'[% Avg Daily ACR YoY],
        "T3M_CAGR", 'Measures | ACR'[% T3M CAGR],
        "YTD_YoY", 'Measures | ACR'[% ACR YTD YoY]
    ),
    'DimDate'[IsLastAzureClosedMonth] = 1,
    <ACCOUNT_FILTER>
)
```

Merge 2a + 2b by TPID.

### Step 3 — Enrollment Customer Name Breakdown

Drill into **enrollment-level** ACR under each top-parent. This is the unique value of the SL4 model — shows which child entities drive consumption.

**Step 3a — Enrollment ACR + MoM:**

> **Note**: Do NOT include `TPAccountName` or `EnrollmentNumber` in this grouping — the extra dimension columns cause timeouts on this model. Account name is already resolved in Step 2; enrollment number can be retrieved in Step 7 (subscription detail) if needed.

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPID],
        'Fact ACR Subscription'[EnrollmentCustomerName],
        "ACR", 'Measures | ACR'[$ ACR],
        "AvgDailyACR", 'Measures | ACR'[$ Average Daily ACR],
        "MoM_Pct", 'Measures | ACR'[% Avg Daily ACR MoM]
    ),
    'DimDate'[IsLastAzureClosedMonth] = 1,
    <ACCOUNT_FILTER>
)
```

**Step 3b — Enrollment trend signals (run if Step 3a succeeds):**

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPID],
        'Fact ACR Subscription'[EnrollmentCustomerName],
        "YoY_Pct", 'Measures | ACR'[% Avg Daily ACR YoY],
        "T3M_CAGR", 'Measures | ACR'[% T3M CAGR]
    ),
    'DimDate'[IsLastAzureClosedMonth] = 1,
    <ACCOUNT_FILTER>
)
```

Merge 3a + 3b by TPID + EnrollmentCustomerName.

### Step 4 — Service Trends at Top-Parent Level (Strategic Pillar + Service Comp Group)

Which services are growing or declining at the TPID level?

**Step 4a — Pillar × Service Comp Group ACR:**

```dax
EVALUATE
TOPN(
    30,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPID],
            'Fact ACR Subscription'[StrategicPillar],
            'Fact ACR Subscription'[ServiceCompGrouping],
            "ACR", 'Measures | ACR'[$ ACR],
            "MoM_Pct", 'Measures | ACR'[% Avg Daily ACR MoM]
        ),
        'DimDate'[IsLastAzureClosedMonth] = 1,
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    [ACR], DESC
)
```

> **Gate**: If this times out, retry dropping `ServiceCompGrouping` and grouping only by `StrategicPillar`.

### Step 5 — SL4 Service Detail (Deepest Granularity)

> **Gate**: Only run if Step 4a succeeded. Narrow to a **single TPID** and optionally a **single pillar** before running.

```dax
EVALUATE
TOPN(
    20,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPID],
            'Fact ACR Subscription'[StrategicPillar],
            'Fact ACR Subscription'[ServiceCompGrouping],
            'Fact ACR Subscription'[ServiceLevel1],
            'Fact ACR Subscription'[ServiceLevel4],
            "ACR", 'Measures | ACR'[$ ACR],
            "MoM_Pct", 'Measures | ACR'[% Avg Daily ACR MoM]
        ),
        'DimDate'[IsLastAzureClosedMonth] = 1,
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    [ACR], DESC
)
```

**Lighter retry variant** (drop SL4, keep SL1 only):

```dax
EVALUATE
TOPN(
    20,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPID],
            'Fact ACR Subscription'[StrategicPillar],
            'Fact ACR Subscription'[ServiceLevel1],
            "ACR", 'Measures | ACR'[$ ACR],
            "MoM_Pct", 'Measures | ACR'[% Avg Daily ACR MoM]
        ),
        'DimDate'[IsLastAzureClosedMonth] = 1,
        <ACCOUNT_FILTER>,
        <SERVICE_FILTER>
    ),
    [ACR], DESC
)
```

### Step 6 — SL4 Service Detail at Enrollment Level (ON-DEMAND)

> **Gate**: Run ONLY if user explicitly asks for enrollment-level service breakdown AND Steps 4–5 succeeded. Narrow to a **single TPID + single enrollment customer**.

```dax
EVALUATE
TOPN(
    20,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPID],
            'Fact ACR Subscription'[EnrollmentCustomerName],
            'Fact ACR Subscription'[StrategicPillar],
            'Fact ACR Subscription'[ServiceCompGrouping],
            'Fact ACR Subscription'[ServiceLevel4],
            "ACR", 'Measures | ACR'[$ ACR],
            "MoM_Pct", 'Measures | ACR'[% Avg Daily ACR MoM]
        ),
        'DimDate'[IsLastAzureClosedMonth] = 1,
        <ACCOUNT_FILTER>,
        'Fact ACR Subscription'[EnrollmentCustomerName] = "<ENROLLMENT_NAME>"
    ),
    [ACR], DESC
)
```

### Step 7 — Subscription Detail (ON-DEMAND)

> **Gate**: Run ONLY if user asks for subscription-level data or if analysis flags churn risk. Narrow to **single TPID**.

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPID],
        'Fact ACR Subscription'[SubscriptionName],
        'Fact ACR Subscription'[SubscriptionGUID],
        'Fact ACR Subscription'[SubscriptionEndDate],
        'Fact ACR Subscription'[EnrollmentCustomerName],
        'Fact ACR Subscription'[StrategicPillar],
        "ACR", 'Measures | ACR'[$ ACR],
        "MoM_Pct", 'Measures | ACR'[% Avg Daily ACR MoM]
    ),
    'DimDate'[IsLastAzureClosedMonth] = 1,
    <ACCOUNT_FILTER>
)
```

### Step 8 — Monthly Time Series (ON-DEMAND)

> **Gate**: Run ONLY if user explicitly asks for a time-series trend. Narrow to **single TPID + single pillar or service**.

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimDate'[FiscalMonth],
        'DimCustomer'[TPID],
        'Fact ACR Subscription'[StrategicPillar],
        "ACR", 'Measures | ACR'[$ ACR],
        "AvgDailyACR", 'Measures | ACR'[$ Average Daily ACR]
    ),
    'DimDate'[FYRel] IN {"FY", "FY-1"},
    <ACCOUNT_FILTER>,
    <SERVICE_FILTER>
)
ORDER BY [FiscalMonth] ASC
```

### Step 9 — Enrollment Credit & Discount Context (ON-DEMAND)

> **Gate**: Run only if user asks about credits or discount rates.

**Discount rate:**
```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPID],
        'Fact ACR Subscription'[EnrollmentCustomerName],
        'Fact ACR Subscription'[EnrollmentNumber],
        "ACD_Pct", 'Measures | ACD'[% ACD]
    ),
    'DimDate'[IsLastAzureClosedMonth] = 1,
    <ACCOUNT_FILTER>
)
```

**Credits:**
```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'DimCustomer'[TPID],
        "CreditsGranted", 'Measures | ACO'[$ Credits Granted],
        "CreditsUsed", 'Measures | ACO'[$ Credits Used]
    ),
    <ACCOUNT_FILTER>
)
```

### Step 10 — Analyze: Top-Parent + Enrollment Composition

Merge Step 2 (top-parent totals) with Step 3 (enrollment breakdown). For each TPID:

**Top-Parent Summary:**

| Account | TPID | ACR (LCM) | Avg Daily ACR | MoM Δ ($) | MoM Δ (%) | YoY (%) | T3M CAGR |
|---|---|---|---|---|---|---|---|

**Enrollment Breakdown (under each TPID):**

| Enrollment Customer | Enrollment # | ACR (LCM) | Avg Daily ACR | MoM (%) | YoY (%) | % of Parent ACR | Signal |
|---|---|---|---|---|---|---|---|

**Signal logic:**
- **Accelerating** — MoM > 0 AND T3M CAGR > MoM (compounding)
- **Growing** — MoM > 0 AND T3M CAGR ≤ MoM (decelerating growth)
- **Flat** — |MoM| < 2% AND |T3M CAGR| < 2%
- **Declining** — MoM < 0 AND T3M CAGR > MoM (slowing decline)
- **Falling** — MoM < 0 AND T3M CAGR ≤ MoM (accelerating decline)

### Step 11 — Analyze: Service Growth & Decline Ranking

Merge Step 4 (pillar × service comp group) data. Rank by absolute MoM change:

**Top Growers** — sorted by `MoM_Pct` DESC:

| Account | Pillar | Service Comp Group | ACR (LCM) | MoM (%) | Signal |
|---|---|---|---|---|---|

**Top Decliners** — sorted by `MoM_Pct` ASC:

| Account | Pillar | Service Comp Group | ACR (LCM) | MoM (%) | Signal |
|---|---|---|---|---|---|

If Step 5 data is available, add SL4 detail rows under each service comp group.

### Step 12 — Analyze: Cross-Level Recommendations

Cross-reference top-parent trends with enrollment and service breakdown:

| Condition | Recommendation |
|---|---|
| Enrollment entity declining while parent grows | "**{EnrollmentName}** declining (MoM {pct}%) — masked by growth elsewhere under {TPID}. Investigate workload shift." |
| Single enrollment drives >70% of parent ACR | "**{EnrollmentName}** is {pct}% of {Account} ACR — concentration risk. Diversification through additional enrollments would reduce churn exposure." |
| SL4 service declining within a growing pillar | "**{SL4 Service}** declining within {Pillar} — offset by sibling services. Monitor for workload migration vs. abandonment." |
| Subscription end date within 90 days + declining ACR | "Subscription **{SubName}** ends {EndDate} with declining consumption — high renewal churn risk." |
| New enrollment customer appearing (no prior-month data) | "New enrollment entity **{EnrollmentName}** detected (${ACR}). Verify onboarding alignment with active opportunity." |
| T3M CAGR negative across multiple enrollment entities | "Broad decline across {N} enrollment entities under {Account}. Escalate — may indicate contract-level risk." |
| Credits granted > 0 + flat/declining ACR | "Credits active but consumption flat/declining at {Account}. Credits may be expiring unused." |

### Step 13 — Present Final Report

**Section 1: Top-Parent Summary**
- Accounts in scope: N
- Total ACR (last closed month): $X | Avg Daily: $Y
- Overall MoM trend: +/- X% | YoY: +/- X%

**Section 2: Enrollment Entity Breakdown** (from Step 10)
- Per-TPID enrollment customer table
- Flag enrollment entities with >70% concentration
- Flag enrollment entities with divergent trends from parent

**Section 3: Service Growth & Decline** (from Step 11)
- Top 10 growers table
- Top 10 decliners table
- Signal column color-coding: Accelerating/Growing = positive, Declining/Falling = negative

**Section 4: SL4 Detail** (from Step 5, if run)
- Deepest service granularity for the pillar/service in focus
- Only show when user requested specific service drill-down

**Section 5: Monthly Trend** (from Step 8, if requested)
- Table of monthly ACR by pillar or enrollment entity
- Call out inflection points

**Section 6: Recommendations** (from Step 12)
- Number each action
- Tag: 🏃 Quick win vs. 📋 Strategic action
- Note which step/data supports each recommendation

**Section 7: Scope & Data Freshness**
- Model: MSA_Azure_SubscriptionDetails_Enterprise (`0bcea7ea-3aa6-4704-b99d-3429e18b5f02`)
- [Open report in Power BI](https://msit.powerbi.com/groups/1ce1a10e-d56e-4e96-8147-cc06baba1e9e/reports/751679ff-fbf3-485c-b3b3-67bfeac3b190)
- Filters applied: list all user scope selections
- Date context: last closed Azure month from `DimDate`
- Note: "This model provides subscription-level detail at SL4 granularity. It does not include pipeline data. For pipeline cross-reference, use the Azure All-in-One review (`pbi-azure-all-in-one-review`) or the SL5 deep dive (`pbi-azure-service-deep-dive-sl5-aio`)."
