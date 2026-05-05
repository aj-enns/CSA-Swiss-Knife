---
description: "SE individual productivity review using Azure Individual Seller Productivity FY26. Answers: HoK activities, milestones engaged, committed milestones, customer deal-team coverage, pipeline created, and engagement velocity. Triggers: SE productivity, SE performance, my SE metrics, seller productivity, individual seller review, how am I doing, SE scorecard, HoK activity count, milestones engaged, committed pipe engaged."
---

# SE Individual Productivity Review

Analyze my SE (Solution Engineer / Technical Seller) productivity using the **Azure Individual Seller Productivity FY26** Power BI model. Produce a performance scorecard covering the metrics that matter for SE role assessment:

1. **Engagement Summary** — Total pipeline engaged, milestones engaged, committed milestones
2. **HoK Activities** — Hands-on-Keyboard activity count and detail
3. **Customer Coverage** — Customers on deal team, penetration breadth
4. **Pipeline Created** — Milestones created by the SE
5. **Milestone Detail** — Per-milestone breakdown with status, category, and HoK involvement
6. **Activity Detail** — Recent CRM activities logged against milestones
7. **Vault Correlation** — Cross-reference PBI data with Obsidian vault for engagement history, gap detection, and enriched recommendations

## Configuration

> **Managers**: Fork this file and update these values for your team scope.

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `00aa1a5f-b4cb-4b5a-9169-43678cf1832a` | Azure Individual Seller Productivity FY26 |
| **Report ID** | `b8df9f23-da40-46f6-aa1d-89503cc5be12` | [Open in Power BI](https://msit.powerbi.com/groups/me/reports/b8df9f23-da40-46f6-aa1d-89503cc5be12) |
| **Default Role Filter** | `'Azure ICs (latest)'[RoleType] IN {"DSE", "SE"}` | SE page filter from report |
| **Past-Due Filter** | `'IsPastEstimatedMonth'[IsPastEstimatedMonth] = FALSE` | Default hides past-due milestones; set to TRUE to include |

## Workflow

### Step 0 — Power BI Auth Pre-Check

```dax
EVALUATE TOPN(1, 'Calendar')
```

If this returns data → auth is good, proceed.

If this fails → **stop** and tell the user:

> Power BI MCP authentication has expired. Run:
> ```
> az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
> az account get-access-token --resource https://analysis.windows.net/powerbi/api
> ```
> Then restart `powerbi-remote` in VS Code (MCP icon → restart).

### Step 1 — Scope the Query

The model uses **row-level security (RLS)** — it returns only the current user's data automatically. Ask the user for any additional scope:

> **To scope your SE productivity review, tell me:**
> 1. **Include past-due milestones?** (default: no — set `IsPastEstimatedMonth` to include TRUE)
> 2. **Solution area or pillar filter?** (optional — filter by `'Product Workload'[SolutionArea]` or `[StrategicPillar]`)
> 3. **Time window?** (default: current FY open milestones)

If user says "just run it" → proceed with defaults (no past-due, no solution filter, current FY).

Build a `<SCOPE_FILTER>` from the user's choices. Always include these base filters:

```
'Azure ICs (latest)'[RoleType] IN {"DSE", "SE"}
'IsPastEstimatedMonth'[IsPastEstimatedMonth] = FALSE
```

### Step 2 — Pull SE Summary Scorecard + Customer Coverage (Combined)

These are pulled as **two queries in one round-trip** to minimize PBI calls. The scorecard is a single summary row; customer coverage is per-TPID.

**Query A — Scorecard (1 row)**:

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'Azure ICs (latest)'[FriendlyName],
        'Azure ICs (latest)'[Alias],
        'Azure ICs (latest)'[ManagerFriendlyName],
        'Azure ICs (latest)'[RoleType],
        'Azure ICs (latest)'[PositionEffectiveDate],
        "Total_Pipe_Engaged_$", 'PBI Calculation'[Total pipe Engaged by Seller],
        "Milestones_Engaged", 'PBI Calculation'[# Pipe Engaged by TS],
        "Committed_Pipe_Engaged_$", 'PBI Calculation'[$ Committed Pipe Engaged by TS],
        "Committed_Pipe_Engaged_Num", 'PBI Calculation'[# Committed Pipe Engaged by TS],
        "Pct_Committed_vs_Engaged", 'PBI Calculation'[% Committed Pipe Engaged vs Total Engaged ($)],
        "Pipe_Created_$", 'PBI Calculation'[$ Pipe Created by TS],
        "Pipe_Created_Num", 'PBI Calculation'[# Pipe Created by TS],
        "HoK_Activities", 'PBI Calculation'[# Hands-on-Keyboard Activity],
        "HoK_Pipe_Engaged", 'PBI Calculation'[# Hands-on-Keyboard Activity Pipe Engaged by TS],
        "Engage_1Plus_Flag", 'PBI Calculation'[Engage 1+ Pipe],
        "Engage_2Plus_Flag", 'PBI Calculation'[Engage 2+ Pipe],
        "Engage_10Plus_Flag", 'PBI Calculation'[Engage 10+ Pipe],
        "Milestones_Engaged_Total", 'PBI Calculation'[Pipe # as Engaged],
        "Avg_Days_Creation_to_Commit", 'PBI Calculation'[Avg Days Creation to Commit (Pipe Involved by TS)],
        "Avg_Days_Commit_to_Complete", 'PBI Calculation'[Avg Days Commit to Complete (Pipe Involved by TS)]
    ),
    <SCOPE_FILTER>
)
```

Present as a **Scorecard Card**:

| Metric | Value |
|---|---|
| **Name / Alias** | {FriendlyName} ({Alias}) |
| **Manager** | {ManagerFriendlyName} |
| **Role** | {RoleType} |
| **Total Pipeline Engaged ($)** | ${Total_Pipe_Engaged_$} |
| **Milestones Engaged (#)** | {Milestones_Engaged} |
| **Committed Milestones Engaged (#)** | {Committed_Pipe_Engaged_Num} |
| **Committed Pipeline Engaged ($)** | ${Committed_Pipe_Engaged_$} |
| **% Committed vs Total Engaged** | {Pct_Committed_vs_Engaged}% |
| **Pipeline Created ($)** | ${Pipe_Created_$} |
| **Milestones Created (#)** | {Pipe_Created_Num} |
| **HoK Activities** | {HoK_Activities} |
| **HoK-Involved Pipeline (milestones)** | {HoK_Pipe_Engaged} |
| **Engage 1+ / 2+ / 10+ Pipe** | {flags} |
| **Avg Days Creation→Commit** | {Avg_Days_Creation_to_Commit} |
| **Avg Days Commit→Complete** | {Avg_Days_Commit_to_Complete} |

**Query B — Customer Coverage**:

> **Data-shape note**: `HoK_Activities` is an SE-level measure — it does **not** slice per-customer in SUMMARIZECOLUMNS (returns the same total on every row). Omit it from this query; use Step 3's `HoK Activities Involved` column for per-customer HoK attribution.

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'Pipeline All'[TopParent],
        'Pipeline All'[TPID],
        "Pipe_Engaged_$", 'PBI Calculation'[Total pipe Engaged by Seller],
        "Milestones_Engaged", 'PBI Calculation'[# Pipe Engaged by TS],
        "Committed_Engaged_Num", 'PBI Calculation'[# Committed Pipe Engaged by TS],
        "Committed_Engaged_$", 'PBI Calculation'[$ Committed Pipe Engaged by TS],
        "Pipe_Created_Num", 'PBI Calculation'[# Pipe Created by TS]
    ),
    <SCOPE_FILTER>
)
ORDER BY [Milestones_Engaged] DESC
```

Present as:

| Customer | TPID | Pipeline Engaged ($) | Milestones Engaged | Committed (#) | Committed ($) | Created (#) |
|---|---|---|---|---|---|---|

**Coverage signals:**
- Customers with milestones engaged = active deal-team presence
- Customers with 0 milestones but appearing in list = TPID assignment only (no pipeline engagement yet)
- Customers with committed milestones = delivery-stage involvement
- Per-customer HoK attribution comes from Step 3 (milestone-level `HoK Activities Involved` column), not from this query

### Step 3 — Pull Milestone Detail (Top 30)

> **Why TOPN(30)?** The user's portfolio had 51 milestones. We only present ~20 grouped by customer, but TOPN(30) gives headroom for grouping while cutting payload by 40%. Columns pruned to the 12 actually displayed — removed `CRMEngagementID`, `OwnerTitle`, `OwnershipGroup`, `CreatedDate`, `DaysInStage`, `ForecastRec`, `SalesPlay`, `EngagingAlias` (these are available via CRM drill-down if needed).

```dax
EVALUATE
TOPN(
    30,
    CALCULATETABLE(
        SELECTCOLUMNS(
            'Pipeline All',
            "CRMID", 'Pipeline All'[CRMID],
            "MilestoneLink", 'Pipeline All'[MilestoneLink],
            "OpportunityLink", 'Pipeline All'[OpportunityLink],
            "EngagementName", 'Pipeline All'[EngagementName],
            "MilestoneName", 'Pipeline All'[MilestoneName],
            "Status", 'Pipeline All'[EngagementMilestoneStatus],
            "Category", 'Pipeline All'[MilestoneCategory],
            "TopParent", 'Pipeline All'[TopParent],
            "TPID", 'Pipeline All'[TPID],
            "Pipeline", 'Pipeline All'[Pipeline],
            "Owner", 'Pipeline All'[Owner],
            "EstDate", 'Pipeline All'[EngagementMilestoneEstimatedDate],
            "SalesStage", 'Pipeline All'[SalesStage],
            "ForecastRec", 'Pipeline All'[ForecastRecommendation],
            "HoK_Involved", 'Pipeline All'[HoK Activities Involved]
        ),
        <SCOPE_FILTER>
    ),
    [Pipeline], DESC
)
```

Present as:

| Customer | Milestone | Status | Category | Pipeline ($) | Stage | Est. Date | Owner | HoK | Opp Link |
|---|---|---|---|---|---|---|---|---|---|

**Highlight:**
- Milestones with `HoK Activities Involved` not blank → flag with HoK indicator (this is the authoritative per-customer HoK signal)
- Milestones with `Category` = "POC/Pilot" → flag as active proof
- `Status` = "Blocked" → surface as risk item
- `ForecastRec` = "Committed" → flag as committed pipeline

> **Blocked / at-risk milestones outside top 30**: If Step 2 Query B shows customers with milestones but none appear in this top-30 result, run a supplemental query filtered to `Status IN {"Blocked", "At Risk"}` to catch low-pipeline-value items that still need escalation.

### Step 4 — Pull HoK Activity Detail

> **Fix from v1**: Added `IsPastEstimatedMonth` filter to match scope of other queries. Added `TOPN(50)` — the live run returned 20 rows; 50 gives headroom without risk of payload explosion.

```dax
EVALUATE
TOPN(
    50,
    CALCULATETABLE(
        SELECTCOLUMNS(
            'Milestone Activity',
            "OwnerAlias", 'Milestone Activity'[Onwer Alias],
            "TopParent", 'Milestone Activity'[TopParent],
            "MilestoneID", 'Milestone Activity'[CRMEngagementMilestoneID],
            "ActivityType", 'Milestone Activity'[ActivityType],
            "Subject", 'Milestone Activity'[Subject]
        ),
        'Azure ICs (latest)'[RoleType] IN {"DSE", "SE"},
        'IsPastEstimatedMonth'[IsPastEstimatedMonth] = FALSE
    ),
    [TopParent], ASC,
    [ActivityType], ASC
)
```

Present as:

| Customer | Milestone ID | Activity Type | Subject |
|---|---|---|---|

**Activity type mapping (for SE context):**
- `PoC/Pilot` → Active proof execution
- `Technical Close/Win Plan` → Technical strategy shaping
- `Blocker Escalation` → Impediment removal
- `Briefing` → Customer/internal positioning
- `HoK` → Direct hands-on-keyboard work

### Step 5 — Analyze: SE Performance Assessment

Combine Steps 2–4 into a holistic assessment:

**A. Engagement Health**

| Signal | Condition | Assessment |
|---|---|---|
| Milestone breadth | 10+ milestones engaged | Strong engagement breadth |
| Milestone breadth | 5-9 milestones engaged | Moderate — look for expansion |
| Milestone breadth | < 5 milestones engaged | Narrow — investigate capacity or assignment gaps |
| Committed ratio | ≥ 30% committed vs total engaged ($) | Healthy commit progression |
| Committed ratio | < 30% committed | Pipeline-heavy, commit conversion needed |
| HoK activities | > 0 | HoK mandate in progress |
| HoK activities | 0 | **Flag**: No HoK activities — SE mandate requires HoK positioning with every client |
| Avg Creation→Commit | < 30 days | Fast progression |
| Avg Creation→Commit | 30-60 days | Moderate |
| Avg Creation→Commit | > 60 days | Slow — investigate blockers |

**B. Customer Coverage**

| Signal | Condition | Assessment |
|---|---|---|
| Customers with milestones > 5 | Good | Broad deal-team coverage |
| Customers with milestones 3-5 | Moderate | Room to expand |
| Customers with milestones < 3 | Narrow | Identify TPID assignments without engagement |
| Customers with HoK > 0 | Active proof or HoK | Technical depth deployed |
| Customers with only TPID assignment | Latent | Not yet engaged — potential pipeline source |

**C. Role-Specific Flags (per SE Role Card)**

- **HoK Mandate Check**: If HoK activities = 0, flag: "No HoK activities recorded. SE mandate requires positioning HoK with every client."
- **POC/Pilot Tracking**: Count milestones with Category = "POC/Pilot". If 0, note absence of active proofs.
- **Cusp Customers**: Customers on deal team with no committed milestones and uncertain next steps → flag as cusp for leadership discussion.
- **Blocked Milestones**: Any milestone with Status = "Blocked" → immediate escalation candidate.

### Step 6 — Vault Correlation

After PBI analysis is complete, correlate findings with the Obsidian vault to enrich the report with durable context. If the vault (OIL) is unavailable, skip this step and note "Vault unavailable — PBI-only report."

**6a. Vault availability + structure check**

Call `get_vault_context()`. If unavailable → skip to Step 7.

> **Efficiency note**: `get_vault_context()` returns the full folder tree including `Customers/` with note counts per customer. Use this to perform **gap detection without per-customer calls** — check which PBI customers have matching vault folders and which don't. This replaces the old pattern of calling `get_customer_context` for every active customer just to discover missing notes.

From the folder structure, build a vault coverage map:

```
For each customer in Step 2 Query B (active milestones > 0):
  → Check if Customers/<name>/ exists in vault folder tree
  → If yes: note count, has milestones/ subfolder, has opportunities/ subfolder
  → If no: flag as "no vault note"
```

**6b. Targeted customer context — flagged customers only**

Call `get_customer_context()` **only** for customers that have at least one of these flags from PBI analysis:
- Blocked or at-risk milestones
- Cusp customer (engaged but no committed milestones)
- HoK mandate gap (milestones engaged but zero HoK in Step 3 `HoK_Involved` column)
- Top 2 customers by pipeline value (for enriched recommendations)

Do **not** call `get_customer_context` for customers that are performing well with no flags — the PBI data is sufficient for those rows.

For flagged customers, extract:
- **Engagement history** — prior meetings, workshops, proof outcomes, and decision points
- **Team / contacts** — key stakeholders, technical champions, and decision-makers
- **Open action items** — any vault-tracked next steps not yet reflected in CRM
- **Connect hooks** — previously captured impact evidence
- **Risk notes** — vault-flagged risks, blockers, or relationship signals
- **HoK context** — legal coverage status, environment tier, HoK positioning notes

**6c. Gap detection — Vault vs PBI**

Cross-reference vault folder tree (from 6a) and customer context (from 6b) to surface:

| Gap Type | Detection | Action |
|---|---|---|
| **PBI engagement, no vault note** | Customer has milestones in PBI but no folder under `Customers/` in vault tree | Flag: "No vault note for {customer}. Create one to capture durable context." |
| **Vault note, no PBI engagement** | Vault `Customers/` folder exists but PBI shows 0 milestones engaged | Flag: "Vault context exists for {customer} but no pipeline engagement in PBI." |
| **Stale vault context** | (Only for 6b customers) Action items reference dates > 30 days old | Flag: "Vault context for {customer} may be stale." |
| **HoK legal coverage gap** | PBI shows HoK activities but vault has no legal coverage confirmation | Flag: "HoK activities but no legal coverage noted. Confirm per SE mandate." |
| **Missing Connect hooks** | PBI shows completed milestones / HoK but vault `connectHooks` is null | Flag: "Impact evidence exists but no Connect hooks captured." |

**6d. Enrich recommended actions**

For each recommended action from Step 5, check vault (6b results) for additional context:
- If vault has stakeholder names → include them in the recommendation
- If vault has prior meeting notes → reference the last touchpoint
- If vault has open action items → merge with PBI-derived actions for a unified next-steps list

**6e. Persist report to vault (optional, user-confirmed)**

If the user requests it, offer to persist the SE productivity report as a vault note:

```
write_note({
  path: "Reports/SE-Productivity-<date>.md",
  content: <rendered final report>
})
```

Do **not** auto-persist without user confirmation.

### Step 7 — Present Final Report

**Section 1: SE Scorecard** (table from Step 2 Query A)

**Section 2: Customer Coverage** (table from Step 2 Query B, with coverage signals)

**Section 3: Milestone Detail** (top 30 from Step 3, grouped by customer)
- Highlight HoK milestones (using `HoK Activities Involved` column — this is the per-customer HoK truth), POC/Pilot milestones, and blocked items

**Section 4: HoK Activity Log** (table from Step 4)
- Group by customer and activity type

**Section 5: Performance Assessment** (from Step 5)
- Engagement health signals
- Customer coverage assessment
- Role-specific flags (HoK mandate, cusp customers, blocked items)
- Recommended actions ranked by impact

**Section 6: Vault Correlation** (from Step 6, if vault available)
- Per-customer vault enrichment (flagged customers only — not every active customer)
- Gap detection table (PBI↔vault mismatches from folder tree)
- Connect hook opportunities (uncaptured impact evidence)
- Enriched recommendations with stakeholder names and last-touchpoint context

**Section 7: Scope & Data Freshness**
- Model: Azure Individual Seller Productivity FY26 (`00aa1a5f-b4cb-4b5a-9169-43678cf1832a`)
- Report: [Open in Power BI](https://msit.powerbi.com/groups/me/reports/b8df9f23-da40-46f6-aa1d-89503cc5be12)
- Filters applied: list scope selections
- Vault status: available / unavailable
- Note: "Model uses RLS — data shown is scoped to the authenticated user's alias. By default, past-due milestones are excluded. The report's Data Dictionary page defines: Engaged = Milestone Owner, Milestone Team, Opportunity Owner, or Opportunity Team involvement."

### Downstream Operations (Optional)

With the report complete, you can now:
- **"Cross-check at-risk accounts in CRM"** → reads report, runs `get_milestones` for flagged TPIDs
- **"Capture Connect hooks"** → uses HoK activity log + vault context to draft impact evidence
- **"Run pipeline hygiene triage"** → report provides the prioritized account list
- **"Persist to vault"** → saves the full report as a durable vault note for future reference
