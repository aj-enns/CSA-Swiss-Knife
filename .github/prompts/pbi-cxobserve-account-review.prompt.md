---
description: "CXObserve-equivalent account support experience review using AA&MSXI (CMI). Answers: customer support health, active incidents and escalations, satisfaction trends, reactive support metrics, and outage impact — all scoped to a single TPID. Replaces the CXObserve portal lookup. Triggers: CXObserve, CXP, support experience, customer health, customer support review, support overview, TPID lookup, account support, customer experience."
---

# CXObserve Account Support Experience Review

Provide a full **CXObserve-equivalent** support experience summary for a customer, scoped by TPID. Pulls all data from the **AA&MSXI** Power BI model — the same backend that feeds the CXObserve portal at `cxp.azure.com/cxobserve`.

This prompt replaces opening the CXObserve portal for a TPID lookup. One command gives you the same view: customer identity, support health, active incidents, escalations, satisfaction, and reactive support metrics.

## Configuration

> **Managers**: Fork this file and update these values for your team's model and scope.

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `12fb7532-a0c0-47f7-9ce6-024a32ce71ca` | AA&MSXI in CESBIDataset_CMI_PROD |
| **Report ID** | `96730c9c-2c59-41fa-8718-21ecc09b3be7` | [Open in Power BI](https://msit.powerbi.com/groups/54eb4a30-34be-4c6c-af6f-c682c68f375f/reports/96730c9c-2c59-41fa-8718-21ecc09b3be7) |

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

### Step 1 — Get TPID

If the user hasn't provided a TPID, ask:

> **Which customer?** Provide a TPID, customer name, or say "resolve from CRM" to look it up.

Resolution paths:
- **TPID provided** → use directly as `<TPID>` in all queries
- **Customer name** → resolve via `msx:list_accounts_by_tpid` or DAX lookup on `'DimCustomer'[CustomerName]`
- **"Resolve from CRM"** → use `msx:crm_whoami` + `msx:list_accounts_by_tpid` to find the account

Set `<TPID_FILTER>` to: `'DimCustomer'[ParentTPID] = <TPID> || 'DimCustomer'[ChildTPID] = <TPID>`

### Step 2 — Customer Identity & Account Context

Pull the customer's identity and account team context from `DimCustomer`:

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        'DimCustomer',
        "CustomerName", [CustomerName],
        "ParentTPID", [ParentTPID],
        "ChildTPID", [ChildTPID],
        "Segment", [Segment],
        "SegmentGroup", [SegmentGroup],
        "ATUName", [ATUName],
        "ATUGroup", [ATUGroup],
        "AreaName", [AreaName],
        "RegionName", [RegionName],
        "BigRegionName", [BigRegionName],
        "IsS500", [IsS500],
        "IsUnified", [IsUnified]
    ),
    <TPID_FILTER>
)
```

Present as a header card:

> **[CustomerName]** | TPID: `[ParentTPID]` | Segment: `[Segment]` (`[SegmentGroup]`) | ATU: `[ATUName]` | Area: `[AreaName]` | Region: `[RegionName]` | S500: `[IsS500]` | Unified: `[IsUnified]`

### Step 3 — Support Health Scorecard

Pull aggregate health metrics for the customer. These measures are pre-built in the model and give the same KPI view as CXObserve's summary cards:

```dax
EVALUATE
ADDCOLUMNS(
    CALCULATETABLE(
        VALUES('DimCustomer'[CustomerName]),
        <TPID_FILTER>
    ),
    "ActiveOutages", [Current Month Outages],
    "HighImpactOutages", [High Impact Outages],
    "QualityCriticalOutages", [Outages Quality Critical],
    "CRI_Count", [CRI Count],
    "ActiveSRs", [Current Month SRCount],
    "IRMetPct", [% IRMet],
    "CritSitPct", [% CritSits],
    "CritSitCount", [CritSit Count],
    "ReopenPct", [% Reopen],
    "AvgDaysToClose", [Average Days to Close],
    "DSAT_Pct", [DSAT%],
    "NIR", [NIR],
    "PGEngagementPct", [PG Engagement %]
)
```

Present as a health scorecard:

| Metric | Value | Status |
|---|---|---|
| Active Outages | _X_ | 🔴 if > 0 Sev 0-2, 🟡 if Sev 3-4 only, 🟢 if 0 |
| High Impact Outages | _X_ | 🔴 if > 0, 🟢 if 0 |
| Active Service Requests | _X_ | (context only) |
| IR Met % | _X%_ | 🔴 < 80%, 🟡 80-90%, 🟢 > 90% |
| CritSit Count | _X_ | 🔴 if > 0, 🟢 if 0 |
| CritSit % | _X%_ | 🔴 > 5%, 🟡 2-5%, 🟢 < 2% |
| Reopen % | _X%_ | 🔴 > 10%, 🟡 5-10%, 🟢 < 5% |
| Avg Days to Close | _X_ | 🔴 > 14, 🟡 7-14, 🟢 < 7 |
| DSAT % | _X%_ | 🔴 > 15%, 🟡 5-15%, 🟢 < 5% |
| PG Engagement % | _X%_ | (context only) |

### Step 4 — Active Incidents & Outages

Pull active and recent outages for this customer:

```dax
EVALUATE
SELECTCOLUMNS(
    TOPN(
        30,
        CALCULATETABLE(
            'FactOutage',
            <TPID_FILTER>,
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

Present as a table sorted by severity then date:

| Incident ID | Sev | Status | Service | Impact | Created | Regions | TTM (min) | Root Cause | High Impact? | Quality Critical? |
|---|---|---|---|---|---|---|---|---|---|---|

Highlight:
- **Active (non-resolved)** incidents at the top
- **Severity 0–2** in bold
- **High-impact** or **quality-critical** outages flagged with 🔴

If no incidents → display: *"No incidents recorded this fiscal year."*

### Step 5 — Active Escalations & CritSits

Pull open escalations for this customer:

```dax
EVALUATE
SELECTCOLUMNS(
    TOPN(
        30,
        CALCULATETABLE(
            'EscalateNow',
            <TPID_FILTER>,
            'DimMonth'[IsCurrentFY] = 1
        ),
        'EscalateNow'[CreatedDateTime], DESC
    ),
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

Present as a table:

| SR # | ICM # | Sev | State | Type | CritSit? | ICM Status | IR Met? | Created | Team | Reason |
|---|---|---|---|---|---|---|---|---|---|---|

Highlight:
- **CritSits** (`IsCritSit = TRUE`) in bold with 🔴
- **Open** state items prominently
- **Sev 1** escalations flagged

If no escalations → display: *"No escalations recorded this fiscal year."*

### Step 6 — Support Trends (MoM / YoY)

Pull month-over-month and year-over-year trend metrics:

```dax
EVALUATE
ADDCOLUMNS(
    CALCULATETABLE(
        VALUES('DimCustomer'[CustomerName]),
        <TPID_FILTER>
    ),
    "OutagesThisMonth", [Current Month Outages],
    "OutagesLastMonth", [Previous Month Outages],
    "OutagesMoMDiff", [MoM Outages Diff],
    "OutagesMoMPct", [% MoM Outages],
    "OutagesYoYDiff", [YoY Outages Diff],
    "OutagesYoYPct", [% YoY Outages],
    "HighImpactOutages", [High Impact Outages],
    "QualityCriticalOutages", [Outages Quality Critical],
    "TTN_P75", [TTN P75],
    "TTE_P75", [TTE P75],
    "TTM_P75", [TTM P75],
    "SRsThisMonth", [Current Month SRCount],
    "SRsLastMonth", [Previous Month SRCount],
    "SRsMoMPct", [MoM SRCount %],
    "AzureIncidents", [Current month Azure Incidents]
)
```

Present trend indicators using arrows:

| Metric | This Month | Last Month | MoM Trend | YoY Trend |
|---|---|---|---|---|
| Outages | _X_ | _Y_ | ↑/↓ N% | ↑/↓ N% |
| Service Requests | _X_ | _Y_ | ↑/↓ N% | — |
| High Impact Outages | _X_ | — | — | — |
| Azure Incidents | _X_ | — | — | — |
| TTN P75 (min) | _X_ | — | — | — |
| TTE P75 (min) | _X_ | — | — | — |
| TTM P75 (min) | _X_ | — | — | — |

Flag:
- **Outage MoM increase > 20%** — 🔴 worsening
- **SR volume MoM increase > 30%** — 🟡 watch
- **TTM P75 above target** — note if response times are degrading

### Step 7 — Synthesize: CXObserve Account Summary

Assemble all data into a single structured report matching the CXObserve portal layout:

---

#### 🏢 [CustomerName] — Support Experience Summary

**TPID**: `[ParentTPID]` | **Segment**: `[Segment]` | **ATU**: `[ATUName]` | **Region**: `[RegionName]`
**CXObserve portal**: [`Open in CXObserve`](https://cxp.azure.com/cxobserve/customers/ch:customer::tpid:<TPID>/support/experience)

**Health Scorecard** *(from Step 3)*
*(Insert scorecard table)*

**Active Incidents** *(from Step 4)*
- Total active: _X_ | Highest severity: Sev _N_
- *(Insert incidents table — or "No active incidents")*

**Active Escalations** *(from Step 5)*
- Open escalations: _X_ | CritSits: _Y_
- *(Insert escalations table — or "No active escalations")*

**Trends** *(from Step 6)*
- *(Insert trend table with MoM/YoY arrows)*

**Risk Assessment**
Based on the data above, provide a one-paragraph risk assessment:
- Is support health improving, stable, or degrading?
- Are there patterns in root causes or services?
- Which metrics are outside acceptable thresholds?
- What should the account team do next?

---

### Step 8 — CRM Correlation (Optional, Automatic if CRM Available)

If CRM is reachable this session, enrich the report:
1. `msx:list_accounts_by_tpid` with the TPID → get account name, active opportunities
2. `msx:get_milestones` for active opportunities → check if delivery milestones are at risk from incidents
3. Surface any **pipeline or delivery risk** caused by active support issues

Add a section:

**CRM Context**
- Active opportunities: _X_ | Total pipeline: $_Y_
- At-risk milestones (incident overlap): *(list any milestones whose customers have active Sev 0-2 incidents or CritSits)*
- Recommendation: *(e.g., "Proactively notify customer on opp #1234 about the Sev 1 outage affecting their Azure region.")*

### Step 9 — Vault Persistence (If Vault Available)

If OIL vault is available, persist key findings:
- Use `oil:promote_findings` to save the support health snapshot
- Tag with TPID, date, and "cxobserve-review" for future recall

Skip silently if vault is unavailable.

## Downstream Operations (Optional)

With the report complete, you can now:
- **"Check CRM for this customer"** → reads report TPID, runs `list_accounts_by_tpid` + `get_milestones`
- **"Any recent comms about these incidents?"** → delegates to `m365-actions` to search email/Teams for incident IDs
- **"Compare with last month"** → re-runs with `'DimMonth'[IsCurrentQuarter] = 1` filter for quarterly view
- **"Run full incident review for my portfolio"** → chains to `pbi-customer-incident-review` prompt with multi-TPID scope

> **Context note**: This prompt runs 5 DAX queries against one model.
> If you plan downstream CRM/WorkIQ correlation, run this prompt as a
> subagent first, then use the persisted report for downstream operations.
