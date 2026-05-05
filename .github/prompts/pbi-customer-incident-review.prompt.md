---
description: "Customer incident and outage review using AA&MSXI (CMI). Answers: what are the current incidents for my customers, active escalations and CritSits, outage trends, and reactive support health. Pulls outage, ICM, escalation, and service request data from Power BI with customer-scoped filters."
---

# Customer Incident & Outage Review

Analyze my customers' incident and outage posture using the **AA&MSXI** Power BI model (Customer Metrics & Insights). Answer four questions:

1. **What are the current ongoing incidents/outages affecting my customers?** — Active outages by severity, service, impact level, and status
2. **What escalations and CritSits are open?** — Active escalations with severity, type, and ICM status
3. **How are outage trends looking?** — Month-over-month and year-over-year outage counts, high-impact incidents, and quality-critical outages
4. **What is the reactive support health?** — IR Met %, CritSit %, reopen rate, days to close, and service request volume trends

## Configuration

> **Managers**: Fork this file and update these values for your team's model and scope.

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `12fb7532-a0c0-47f7-9ce6-024a32ce71ca` | AA&MSXI in CESBIDataset_CMI_PROD |
| **Report ID** | `96730c9c-2c59-41fa-8718-21ecc09b3be7` | [Open in Power BI](https://msit.powerbi.com/groups/54eb4a30-34be-4c6c-af6f-c682c68f375f/reports/96730c9c-2c59-41fa-8718-21ecc09b3be7) |
| **Account Roster** | *(user-provided or `.docs/AccountReference.md`)* | Optional — if not set, prompt asks interactively |

## Workflow

### Step 0 — Power BI Auth Pre-Check

```dax
EVALUATE TOPN(1, 'DimMonth')
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

> **To scope your incident review, tell me:**
> 1. **Which customers?** (names, TPIDs, "all my assigned accounts", or an ATU/territory)
> 2. **Time window?** (default: current fiscal year)

**Required — pick at least one:**

| Filter | Column | Example |
|---|---|---|
| Customer name(s) | `'DimCustomer'[CustomerName]` | "Contoso", "Fabrikam" |
| TPID(s) | `'DimCustomer'[ParentTPID]` or `'DimCustomer'[ChildTPID]` | 12345, 67890 |
| ATU / Territory | `'DimCustomer'[ATUName]` or `'DimCustomer'[ATUGroup]` | "US East Healthcare" |
| Segment | `'DimCustomer'[Segment]` or `'DimCustomer'[SegmentGroup]` | "Enterprise", "S500" |
| Area | `'DimCustomer'[AreaName]` | "Americas" |
| Region | `'DimCustomer'[RegionName]` or `'DimCustomer'[BigRegionName]` | "West US" |

**Optional refinements:**

| Filter | Column | Example |
|---|---|---|
| Fiscal year | `'DimMonth'[IsCurrentFY]` | `1` = current FY |
| Fiscal quarter | `'DimMonth'[IsCurrentQuarter]` | `1` = current quarter |
| Outage severity | `'FactOutage'[Severity]` | 0, 1, 2, 3, 4 |
| Customer type | `'DimCustomer'[IsS500]`, `'DimCustomer'[IsUnified]` | "Yes" |

If user says **"all my assigned accounts"**:
- Use `msx:crm_whoami` to get alias
- Use vault roster (`.docs/AccountReference.md`) to get TPID list
- Or ask user for TPIDs / customer names directly

Build a `<SCOPE_FILTER>` from the user's choices. For incident/outage queries, always filter to the customer's TPIDs to avoid timeout on this large model.

### Step 2 — Current Active Outages

Pull active and recent outages impacting scoped customers. The `FactOutage` table joins to customers through `BridgeICMOutageToCustomer` → `DimCustomer`.

```dax
EVALUATE
SELECTCOLUMNS(
    TOPN(
        50,
        CALCULATETABLE(
            'FactOutage',
            <SCOPE_FILTER>,
            'DimMonth'[IsCurrentFY] = 1
        ),
        'FactOutage'[CreatedDate], DESC
    ),
    "IncidentId", [IncidentId],
    "Severity", [Severity],
    "Status", [Status],
    "IncidentType", [IncidentType],
    "ServiceName", [ServiceName],
    "OutageImpactLevel", [OutageImpactLevel],
    "CreatedDate", [CreatedDate],
    "Mitigation", [Mitigation],
    "ImpactedRegions", [ImpactedRegions],
    "TTN_min", [TTN],
    "TTD_min", [TTD],
    "TTE_min", [TTE],
    "TTM_min", [TTM],
    "RootCauseCategory", [RootCauseCategory],
    "IsHighImpact", [IsHighImpactOutage],
    "IsQualityCritical", [IsQualityCritical],
    "OwningTeamName", [OwningTeamName],
    "SupportTicketsCount", [SupportTicketsCount]
)
```

Present results in a table:

| Incident ID | Sev | Status | Service | Impact Level | Created | Regions | TTM (min) | Root Cause | High Impact? |
|---|---|---|---|---|---|---|---|---|---|

Highlight:
- **Active (non-resolved)** incidents prominently
- **Severity 0–2** in bold
- **High-impact** or **quality-critical** outages flagged

### Step 3 — Active Escalations & CritSits

Pull open escalations from the `EscalateNow` table (direct TPID join to `DimCustomer`):

```dax
EVALUATE
SELECTCOLUMNS(
    TOPN(
        50,
        CALCULATETABLE(
            'EscalateNow',
            <SCOPE_FILTER>,
            'DimMonth'[IsCurrentFY] = 1
        ),
        'EscalateNow'[CreatedDateTime], DESC
    ),
    "TPID", [TPID],
    "SRNumber", [ServiceRequestNumber],
    "ICMNumber", [ICMNumber],
    "Severity", [ICMSeverity],
    "State", [State],
    "EscalationType", [EscalationType],
    "IsCritSit", [IsCritSit],
    "ICMStatus", [ICMStatus],
    "IsIRMet", [IsIRMet],
    "ServiceLevel", [ServiceLevel],
    "Created", [CreatedDateTime],
    "ICMTeam", [ICMPublicTeamName],
    "EscReason", [EscalationReason]
)
```

Present results in a table:

| Customer | SR # | ICM # | Sev | State | Type | CritSit? | ICM Status | Created | Team | Reason |
|---|---|---|---|---|---|---|---|---|---|---|

Join with `DimCustomer` context to display customer name alongside TPID.

Highlight:
- **CritSits** (`IsCritSit = TRUE`) in bold
- **Open** state items prominently
- **Sev 1** escalations flagged

### Step 4 — Outage Trend Summary

Pull aggregate outage metrics per customer for trend analysis. Use pre-built measures from `FactOutage`:

```dax
EVALUATE
TOPN(
    25,
    ADDCOLUMNS(
        CALCULATETABLE(
            VALUES('DimCustomer'[CustomerName]),
            <SCOPE_FILTER>
        ),
        "CurrentMonthOutages", [Current Month Outages],
        "PreviousMonthOutages", [Previous Month Outages],
        "MoMDiff", [MoM Outages Diff],
        "MoMPct", [% MoM Outages],
        "YoYDiff", [YoY Outages Diff],
        "YoYPct", [% YoY Outages],
        "HighImpactOutages", [High Impact Outages],
        "QualityCriticalOutages", [Outages Quality Critical],
        "CRI_Count", [CRI Count],
        "TTN_P75", [TTN P75],
        "TTE_P75", [TTE P75],
        "TTM_P75", [TTM P75]
    ),
    [CurrentMonthOutages], DESC
)
```

Present results in a table with MoM/YoY arrows (↑/↓):

| Customer | This Month | Last Month | MoM % | YoY % | High Impact | Quality Critical | TTN P75 | TTE P75 | TTM P75 |
|---|---|---|---|---|---|---|---|---|---|

Flag customers where:
- MoM outage increase > 20%
- High-impact outage count > 0
- TTM P75 is above segment benchmark

### Step 5 — Reactive Support Health

Pull service request metrics per customer:

```dax
EVALUATE
TOPN(
    25,
    ADDCOLUMNS(
        CALCULATETABLE(
            VALUES('DimCustomer'[CustomerName]),
            <SCOPE_FILTER>
        ),
        "SRCount", [Current Month SRCount],
        "PrevSRCount", [Previous Month SRCount],
        "MoMSRPct", [MoM SRCount %],
        "IRMetPct", [% IRMet],
        "CritSitPct", [% CritSits],
        "CritSitCount", [CritSit Count],
        "ReopenPct", [% Reopen],
        "DaysToClose", [Average Days to Close],
        "DSAT_Pct", [DSAT%],
        "PGEngagementPct", [PG Engagement %],
        "AzureIncidents", [Current month Azure Incidents],
        "NIR", [NIR]
    ),
    [SRCount], DESC
)
```

Present results in a table:

| Customer | SRs (This Month) | MoM % | IR Met % | CritSit % | CritSits # | Reopen % | Avg Days to Close | DSAT % | PG Engagement % |
|---|---|---|---|---|---|---|---|---|---|

Flag customers where:
- **IR Met % < 80%** — initial response SLA at risk
- **CritSit % > 5%** — elevated critical situation rate
- **Reopen % > 10%** — quality concern
- **DSAT % > 15%** — satisfaction risk

### Step 6 — Report

Assemble findings into a structured summary:

#### Incident Summary for [Customer Scope]

**Active Incidents & Outages**
- Count of active (non-resolved) incidents: _X_
- Highest severity active: Sev _N_ — _[service name]_ — _[brief description]_
- Customer-impacting outages in last 30 days: _X_

**Escalation & CritSit Status**
- Open escalations: _X_ (of which _Y_ are CritSits)
- Key escalation: _[SR#]_ — Sev _N_ — _[reason]_ — _[status]_

**Trend Signals**
- Customers with increasing outages (MoM): _[list]_
- Customers with high-impact outages: _[list]_
- Segment comparison: _[above/below/at]_ benchmark for TTM/TTE

**Reactive Support Health**
- Customers below IR Met target: _[list]_
- Customers with elevated CritSit rate: _[list]_
- Customers with high reopen rate: _[list]_
- Customers with high DSAT: _[list]_

**Recommended Actions**
1. _[Most urgent action — e.g., escalation follow-up, proactive outreach for high-impact customer]_
2. _[Second priority — e.g., review root cause pattern for recurring service]_
3. _[Third priority — e.g., schedule health review for customers with degrading metrics]_

### Step 7 — CRM Correlation (Optional)

If user wants deeper context, correlate incident data with CRM:
- Use `msx:get_my_active_opportunities` to check if affected customers have active pipeline
- Use `msx:get_milestones` to check if delivery milestones are at risk from incidents
- Use vault (`oil:get_customer_context`) for prior engagement notes on affected customers

Surface any pipeline or delivery risk caused by active incidents.
