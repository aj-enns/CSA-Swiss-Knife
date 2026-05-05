---
description: "Rank and prioritize tracked accounts by GHCP whitespace, pipeline readiness, adoption health, and Azure ACR alignment. Surfaces where to focus GHCP sales effort for maximum seat growth. Classifies accounts into 5 tiers: Greenfield, Stagnant/Declining, Whitespace, High Performers, Low Utilization. Trigger: prioritize accounts, rank accounts, where to focus, whitespace ranking, account prioritization, opportunity ranking, best accounts, highest potential, account tiers, portfolio ranking."
---

# Portfolio Prioritization — GHCP Growth Focus

Rank your tracked accounts by expansion potential: **where should you spend time to grow GHCP seats and Azure ACR?** Combines whitespace analysis, pipeline readiness, adoption health, and engagement recency into a prioritized action list.

## Why This Exists

> You have 15+ tracked accounts. You can't work them all equally. This prompt tells you which accounts have the most realistic GHCP seat growth potential — factoring in whitespace (room to grow), pipeline coverage (deals in motion), adoption health (are they actually using it), and engagement recency (are you still in the conversation).

## Configuration

| Setting | Value | Notes |
|---|---|---|
| **MSXI Semantic Model** | `a0239518-1109-45a3-a3eb-1872dc10ac15` | GHCP seat + pipeline data |
| **OctoDash Semantic Model** | `ecdbfb59-7a8f-44fb-9102-727598416571` | Per-org granularity |
| **Vault Source** | `AccountReference.md` + customer files | Account roster + engagement |
| **CRM Source** | `msx` tools | Pipeline coverage |
| **Calendar Filter** | `RelativeFM = -1` | Last completed fiscal month |

---

## Step 0 — Scope

1. **Role**: Read vault `Reference/MyRoleDescriptions.md` → identify role. Fall back to `crm_whoami`.
2. **Account roster**: Read vault `AccountReference.md` → all tracked accounts with TPIDs.
3. **User scope**: If user names specific accounts → use those. Otherwise → all tracked accounts with valid TPIDs.
4. **Scope guard**: If > 20 accounts, confirm before proceeding.

## Step 1 — GHCP Seat Metrics via PBI

Delegate to `pbi-analyst`:
- Prompt: `pbi-ghcp-seats-analysis` — Portfolio Ranking workflow (Q3 → Q1)
- Semantic Model: `a0239518-1109-45a3-a3eb-1872dc10ac15`
- TPIDs from Step 0 (quoted text for MSXI)
- Return per-account: `GHCP_Seats`, `Seat_Opportunity`, `Remaining_Opportunity`, `GHCP_Attach`, `GHCP_ACR_Dollar`, `ARPU`, `WAU_Pct`, `MoM_Seat_Delta` (3-month), `Qualified_Pipeline`, `Unqualified_Pipeline`

## Step 2 — CRM Pipeline Coverage

For each account:
- `msx:list_opportunities({ customerKeyword: "<account>", format: "summary", includeDealTeam: true })` → pipeline stages, values, deal team.
- `msx:get_milestones({ customerKeyword: "<account>", format: "triage" })` → milestone health.
- Extract: active opp count, total pipeline $, highest stage reached, blocked milestones.

## Step 3 — Engagement Recency from Vault

For each account:
- `oil:get_customer_context({ customer: "<name>", lookback_days: 90 })` → last meeting date, open action items, team activity.
- Classify engagement recency:
  - **Active**: meeting or action item within 14 days
  - **Warm**: activity within 30 days
  - **Cold**: no activity in 30+ days
  - **Silent**: no vault engagement history at all

## Step 4 — 5-Tier Classification

Classify each account using PBI metrics + CRM + engagement data:

### Tier 1 — Greenfield 🏗️
- **Criteria**: Zero GHCP seats AND TAM (Seat Opportunity) > 0
- **Priority flag**: `🔴 CRITICAL` if TAM > 500, `🟡 HIGH` if TAM > 100, `🟢 STANDARD` otherwise
- **Action**: Net-new opportunity creation — land motion

### Tier 2 — Stagnant or Declining 📉
- **Criteria**: MoM seat delta negative for 2+ of last 3 months, OR seats > 0 but flat for 3+ months
- **Priority flag**: `🔴 CRITICAL` if large seat base declining (>50 seats AND negative), `🟡 HIGH` otherwise
- **Action**: Retention intervention — identify churn cause, re-engage champion

### Tier 3 — Whitespace 🎯
- **Criteria**: GHCP seats > 0 AND `Remaining_Opportunity` > 0 (room to grow)
- **Sub-sort**: By `Remaining_Opportunity * (1 - GHCP_Attach)` descending — biggest gaps first
- **Priority flag**: `🟢 PIPELINE` if qualified pipeline covers >50% of whitespace, `🟡 HIGH` if <50% coverage, `🔴 CRITICAL` if zero pipeline against large whitespace
- **Action**: Expansion motion — upsell conversations, VBDs, workshops

### Tier 4 — High Performers ⭐
- **Criteria**: MoM positive 2+ of 3 months AND `Attach > 50%` AND `WAU_Pct > 40%`
- **Action**: Success story candidate — reference, case study, Connects evidence

### Tier 5 — Low Utilization ⚠️
- **Criteria**: `WAU_Pct < 30%` AND GHCP seats > 0
- **Risk levels**:
  - `🔴 HIGH RISK`: WAU < 15% — likely shelfware, churn imminent
  - `🟡 MEDIUM RISK`: WAU 15-25% — adoption stalling
  - `🟢 LOW RISK`: WAU 25-30% — slight underperformance
- **Action**: Adoption intervention — enablement sessions, VBDs, stakeholder re-engagement

## Step 5 — Composite Ranking

Within each tier, sort by **composite priority score**:

```
Priority = (Remaining_Opportunity * 0.4) + (Pipeline_Coverage * 0.2) + (Engagement_Recency * 0.2) + (WAU_Pct * 0.2)
```

Where:
- `Pipeline_Coverage` = qualified_pipeline / remaining_opportunity (capped at 1.0)
- `Engagement_Recency` = 1.0 (Active), 0.6 (Warm), 0.3 (Cold), 0.0 (Silent)
- Higher score = higher priority to act on

## Step 6 — Azure ACR Alignment

For accounts with Azure consumption data:
- Flag accounts where **GHCP is growing but Azure ACR is flat** → GHCP isn't translating to deployments yet
- Flag accounts where **Azure ACR is growing but GHCP is stagnant** → deployment velocity without Copilot = missed opportunity
- Highlight accounts where **both are growing** → success pattern, candidate for case study

## Output

### Priority Matrix

```
📊 Portfolio Health Distribution
┌──────────────────────┬───────┬────────────────┐
│ Tier                 │ Count │ Total Whitespace│
├──────────────────────┼───────┼────────────────┤
│ 🏗️ Greenfield        │  {N}  │   {seats}      │
│ 📉 Stagnant/Declining│  {N}  │   —            │
│ 🎯 Whitespace        │  {N}  │   {seats}      │
│ ⭐ High Performers   │  {N}  │   —            │
│ ⚠️ Low Utilization   │  {N}  │   —            │
└──────────────────────┴───────┴────────────────┘
```

### Prioritized Account Table

| Rank | Account | Tier | GHCP Seats | Attach % | Remaining Opp | WAU% | MoM Δ | Pipeline $ | Engagement | Priority Score | Recommended Action |
|------|---------|------|-----------|----------|---------------|------|-------|-----------|------------|---------------|-------------------|
| 1 | {name} | 🎯 | {seats} | {pct} | {opp} | {wau} | {delta} | {$} | Active | {score} | {action} |

### Top 5 Actions

For the top 5 accounts by priority score, provide specific next steps:

```
### 1. {Account} — {Tier} — Priority: {score}
- **Situation:** {1-sentence current state}
- **Gap:** {what's missing — seats, pipeline, engagement, adoption}
- **Recommended action:** {specific next step with who should do it}
- **Expected impact:** {estimated seat growth or ACR delta}
```

### Vault Persistence

- `oil:promote_findings` — append prioritization results to each customer's `## Agent Insights`.
- Offer: "Save full prioritization report to vault?"

---

## Rules

1. **Never fabricate metrics** — all data from MSXI via `pbi-analyst`. Unavailable = `N/A`.
2. **Tier assignment is deterministic** — use the criteria above, not vibes.
3. **Conservative priority scoring** — engagement recency breaks ties, not projection.
4. **PBI guardrail**: *"Custom portfolio analysis from SE tooling — not official Microsoft reports."*
5. **Source + date on every table** — MSXI fiscal month, vault freshness.
6. **Scope guard**: Max 20 accounts per run without explicit user confirmation.

## Performance Budget

- **PBI**: 1 `pbi-analyst` delegation — all accounts in one batch.
- **CRM**: Batch by account. `format: "summary"` for all.
- **Vault**: All reads in Step 0 + Step 3. No re-reads during classification.
