---
description: "Azure portfolio review using MSA_AzureConsumption_Enterprise (MSXI). Answers: gap to target, pipeline conversion ranking, and recommended actions. Pulls ACR actuals, budget attainment, pipeline, and account attributes from Power BI with user-scoped filters."
---

# Azure Enterprise Portfolio Review

Analyze my Azure portfolio using the **MSA_AzureConsumption_Enterprise** Power BI model. Answer three questions:

1. **What is my gap to target?** — ACR actuals vs. budget, pipeline sufficiency
2. **Which opportunities have the highest chance to convert?** — Ranked by stage, commitment, and movement signals
3. **What can I do to close my gap?** — Actionable recommendations from account attributes and pipeline state

## Configuration

> **Managers**: Fork this file and update these values for your team's model and scope.

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `726c8fed-367a-4249-b685-e4e22ca82b3d` | MSA_AzureConsumption_Enterprise in BICOE_Prod_BICore_Azure01 |
| **Report ID** | `d07c4e15-95f9-42f6-8411-59293f6895a1` | [Open in Power BI](https://msit.powerbi.com/groups/me/reports/d07c4e15-95f9-42f6-8411-59293f6895a1) |
| **Account Roster** | *(user-provided or `.docs/AccountReference.md`)* | Optional — if not set, prompt asks interactively |
| **Default Date Filter** | `'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"` | YTD closed months + current open month |
| **Default View** | `'DimViewType'[ViewType] = "Curated"` | Standard curated view |

## Workflow

### Step 0 — Power BI Auth Pre-Check

```dax
EVALUATE TOPN(1, 'DimDate')
```

If this returns data → auth is good, proceed.

If this fails → **stop** and tell the user:

> Power BI MCP authentication has expired. Please run:
> ```
> az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
> az account get-access-token --resource https://analysis.windows.net/powerbi/api
> ```
> Then restart `powerbi-remote` in VS Code (MCP icon → restart).

### Step 1 — Scope the Query

Before pulling any data, ask the user to narrow the scope:

> **To scope your portfolio review, tell me:**
> 1. **Which accounts?** (names, TPIDs, "all my assigned accounts", or an ATU/territory)
> 2. **Solution play or pillar filter?** (or "all")
> 3. **Time window?** (default: FY26 YTD — closed months + current open)

**Required — pick at least one:**

| Filter | Column | Example |
|---|---|---|
| Customer name(s) | `'DimCustomer'[TPAccountName]` | "Contoso", "Fabrikam" |
| TPID(s) | `'DimCustomer'[TPID]` | 12345, 67890 |
| ATU / Territory | `'DimAccountSummaryGroupingDscOCDM'[ATUName]` or `[ATUGroup]` | "US East Healthcare" |
| Field Area | `'DimAccountSummaryGroupingDscOCDM'[FieldArea]` | "East" |
| Role alias | `'CustomerAssignByRole'[CSACloudAndAI]`, `[SpecialistCloudAndAI]`, `[SECloudAndAI]`, etc. | "jlee" |

**Optional refinements:**

| Filter | Column | Example |
|---|---|---|
| Solution Play | `'F_AzureConsumptionPipe'[SolutionPlay]` | "Migrate & Modernize" |
| Strategic Pillar | `'F_AzureConsumptionPipe'[StrategicPillar]` or `[SuperStrategicPillar]` | "Infra", "Data & AI" |
| Segment | `'DimAccountSummaryGroupingDscOCDM'[Segment]` | "Enterprise" |
| Fiscal period | `'DimDate'[FY_Rel]` or `'DimDate'[Qtr_Rel]` | "FY", "CQ" |
| Sales stage | `'F_AzureConsumptionPipe'[SalesStageName]` | "Qualify", "Develop" |

If user says **"all my assigned accounts"**:
- Use `msx:crm_whoami` to get alias
- Query `CustomerAssignByRole` filtered by that alias across role columns to get TPID list

Build a `<SCOPE_FILTER>` from the user's choices. Always include these base filters:
```
'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
'DimViewType'[ViewType] = "Curated"
```

### Step 2 — Pull ACR Actuals + Budget (Gap to Target)

```dax
EVALUATE
TOPN(
    100,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            "ACR_YTD", 'M_ACR'[$ ACR],
            "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
            "Budget_Attain_YTD", 'M_ACR'[% ACR Budget Attain (YTD)]
        ),
        <SCOPE_FILTER>
    ),
    [ACR_YTD], DESC
)
```

### Step 3 — Pull Pipeline Summary

```dax
EVALUATE
TOPN(
    100,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'DimCustomer'[TPAccountName],
            'DimCustomer'[TPID],
            "Pipe_All", 'M_ACRPipe'[$ Consumption Pipeline All],
            "Pipe_WoW_Change", 'M_ACRPipe'[$ Consumption Pipeline All WoW Change],
            "Qualified_Pipe", 'M_ACRPipe'[$ Qualified Pipeline Prior Week all],
            "Committed_Pipe", 'M_ACRPipe'[$ Consumption Committed Pipeline Prior Week All],
            "Milestones", 'M_ACRPipe'[# Milestones]
        ),
        'DimDate'[FY_Rel] = "FY",
        'DimViewType'[ViewType] = "Curated",
        <ACCOUNT_SCOPE_FILTER>
    ),
    [Pipe_All], DESC
)
```

### Step 4 — Pull Opportunity-Level Detail

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        'F_AzureConsumptionPipe',
        "TPID", 'F_AzureConsumptionPipe'[TPID],
        "Account", 'F_AzureConsumptionPipe'[CRMAccountName],
        "Opportunity", 'F_AzureConsumptionPipe'[OpportunityName],
        "OpptyNumber", 'F_AzureConsumptionPipe'[OpportunityNumber],
        "SalesStage", 'F_AzureConsumptionPipe'[SalesStageName],
        "Commitment", 'F_AzureConsumptionPipe'[CommitmentRecommendation],
        "MilestoneStatus", 'F_AzureConsumptionPipe'[MilestoneStatus],
        "MilestoneName", 'F_AzureConsumptionPipe'[MilestoneName],
        "MilestoneOwner", 'F_AzureConsumptionPipe'[MilestoneOwner],
        "CompletionMonth", 'F_AzureConsumptionPipe'[MilestoneCompletionMonth],
        "SolutionPlay", 'F_AzureConsumptionPipe'[SolutionPlay],
        "Pillar", 'F_AzureConsumptionPipe'[StrategicPillar],
        "StageMove_WoW", 'F_AzureConsumptionPipe'[SalesStageCW1_Movement],
        "CommitChange_WoW", 'F_AzureConsumptionPipe'[CommitmentChangeCW1],
        "RiskBlockers", 'F_AzureConsumptionPipe'[RiskBlockerDetails],
        "CRMLink", 'F_AzureConsumptionPipe'[CRMLink],
        "PartnerShared", 'F_AzureConsumptionPipe'[IsOpptySharedWithPartner]
    ),
    <SCOPE_FILTER>,
    'F_AzureConsumptionPipe'[MilestoneStatus] IN {"In Progress", "Not Started", "Blocked"}
)
ORDER BY [SalesStage] DESC, [Account] ASC
```

### Step 5 — Pull Account Attributes (for recommendations)

> **Important**: `AzureCustomerAttributes` does NOT have a `TPAccountName` column. Filter by TPID only. Use the TPID list gathered from earlier steps or from `'DimCustomer'`.

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        'AzureCustomerAttributes',
        "TPID", 'AzureCustomerAttributes'[TPID],
        "ESI_Tier", 'AzureCustomerAttributes'[ESI_Tier],
        "HasOpenAI", 'AzureCustomerAttributes'[HasOpenAI],
        "HasOpenAI_Pipe", 'AzureCustomerAttributes'[HasOpenAI_Pipe],
        "PTU_Target", 'AzureCustomerAttributes'[PTU_Target_Customer],
        "500K_100K_Target", 'AzureCustomerAttributes'[500K_100K_Targets],
        "NetNewMigrationTarget", 'AzureCustomerAttributes'[NetNewMigrationTarget],
        "LXP_Category", 'AzureCustomerAttributes'[LXP_Category],
        "TrancheGrowthTarget", 'AzureCustomerAttributes'[TrancheGrowthTargetAccounts],
        "GHCP_200Plus", 'AzureCustomerAttributes'[GHCPFY26200Plus],
        "GHCP_200Less", 'AzureCustomerAttributes'[GHCPFY26200Less]
    ),
    'AzureCustomerAttributes'[TPID] IN {<TPID_LIST>}
)
```

### Step 6 — Analyze: Gap to Target

Merge Step 2 (ACR + budget) with Step 3 (pipeline) per account:

| Account | TPID | ACR YTD | ACR LCM | Budget Attain% | Pipeline ($) | Committed Pipe ($) | Pipe WoW Δ | Milestones | Gap Signal |
|---|---|---|---|---|---|---|---|---|---|

**Gap Signal logic:**
- **Ahead** — Budget attainment ≥ 100% YTD
- **On track** — Budget attainment 80–99% with positive pipeline and WoW growth
- **At risk** — Budget attainment < 80%, or pipeline declining WoW, or thin milestone coverage (< 3)
- **Needs pipeline** — ACR present but fewer than 2 active milestones
- **Stalled** — No WoW pipeline movement and no stage changes in Step 4 data

### Step 7 — Analyze: Conversion Ranking

Using Step 4 results, score and rank opportunities:

| Signal | Points | Source |
|---|---|---|
| Stage = "Close" | +3 | `SalesStageName` |
| Stage = "Develop" | +2 | `SalesStageName` |
| Commitment = "Committed" | +3 | `CommitmentRecommendation` |
| Stage advanced this week | +2 | `SalesStageCW1_Movement` shows advancement |
| Commitment upgraded this week | +2 | `CommitmentChangeCW1` shows upgrade |
| No risk/blockers | +1 | `RiskBlockerDetails` is empty |
| Completion month this quarter | +1 | `MilestoneCompletionMonth` within current FQ |
| Partner attached | +1 | `IsOpptySharedWithPartner` = "Yes" |

Present as:

| Rank | Opportunity | Account | Stage | Commitment | Score | Key Signal | CRM Link |
|---|---|---|---|---|---|---|---|

### Step 8 — Analyze: Recommendations to Close Gap

For each account with gap signal "At risk", "Needs pipeline", or "Stalled", combine pipeline (Step 4) with attributes (Step 5):

| Condition | Recommendation |
|---|---|
| Uncommitted milestone past due | "Milestone '{name}' is past completion date — update date or flip to committed. Confirm with {owner}." |
| Blocked milestone | "'{name}' blocked: {RiskBlockerDetails}. Escalate to unblock." |
| No stage/commitment movement 2+ weeks | "'{opportunity}' stalled. Schedule next-step call." |
| < 2 active milestones | "Thin pipeline — check propensity flags for expansion plays." |
| HasOpenAI = Y, no OpenAI pipe | "Account uses OpenAI with no pipeline. Explore AI expansion." |
| PTU_Target = Y, no PTU pipe | "PTU target with no PTU pipeline. Engage SE for sizing." |
| NetNewMigrationTarget = Y | "Migration target. Check for workload modernization plays." |
| 500K_100K_Target set | "High-value target — ensure coverage across solution areas." |
| GHCP FY26 flags set | "GHCP incentive account — cross-reference with GHCP New Logo prompt for eligibility." |
| ESI activated, not certified | "ESI activated but not certified. Skilling engagement may accelerate." |
| Pipeline declining WoW | "Pipeline dropped ${WoW_change} this week. Investigate lost/stalled milestones." |

### Step 9 — Present Final Report

**Section 1: Portfolio Summary**
- Accounts in scope: N
- Total ACR YTD: $X | Last closed month: $Y
- Budget attainment (aggregate): Z%
- Pipeline: $X total | $Y committed | WoW Δ: $Z
- Gap signals: N ahead | N on track | N at risk | N needs pipeline | N stalled

**Section 2: Gap Analysis** (table from Step 6)

**Section 3: Top Conversion Opportunities** (table from Step 7, top 10)

**Section 4: Recommended Actions** (from Step 8, ordered by impact)
- Number each action with CRM link
- Tag: 🏃 Quick win (< 5 min fix) vs. 📋 Strategic action

**Section 5: Scope & Data Freshness**
- Model: MSA_AzureConsumption_Enterprise (`726c8fed-...`)
- Filters applied: list user's scope selections
- Date context: report the `DimDate[Wk_Rel]` and `DimDate[Month_Rel]` from latest data
- Note: "Budget measures reflect org-level targets. Account-level attainment is derived from the `% ACR Budget Attain (YTD)` measure."
