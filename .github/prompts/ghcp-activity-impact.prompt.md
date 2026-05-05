---
description: "Measure engagement-to-growth causality: correlates your customer activities (meetings, VBDs, POCs) with GHCP seat movement and Azure ACR delta. Answers 'did my engagement actually drive growth?' Trigger: activity impact, engagement impact, did it work, growth correlation, meeting impact, VBD impact, cause and effect, before after, impact scoring."
---

# GHCP Activity Impact Scoring

Correlate your customer engagement activities with measurable GHCP seat growth and Azure ACR movement. This answers the critical question: **"Did my meetings and VBDs actually drive license sales and deployment growth?"**

## Why This Exists

> You run workshops, VBDs, and POCs. You have meetings. But did any of it move the needle? MSXI has the before/after seat data. The vault has your engagement history. This prompt connects the two — proving causality between your activities and GitHub growth.

## Configuration

| Setting | Value | Notes |
|---|---|---|
| **MSXI Semantic Model** | `a0239518-1109-45a3-a3eb-1872dc10ac15` | GHCP seat + ACR data |
| **Lookback** | 6 months | Activity window |
| **Growth Window** | +1M, +2M after activity | Lag for seat procurement |
| **Vault Source** | Meeting notes, customer files | Engagement log |
| **M365 Source** | `m365-actions` subagent | Validation |

---

## Step 0 — Scope

1. **Role + vault**: Read vault `Reference/MyRoleDescriptions.md` (`oil:search_vault` for "My Role") → identify name and role. Fall back to `crm_whoami`.
2. **Account roster**: Read vault `AccountReference.md` → extract tracked accounts with TPIDs.
3. **User scope**: If user names specific accounts → use those. Otherwise → all tracked accounts.

## Step 1 — Discover Activities from Vault

For each scoped account, pull engagement history:

1. `oil:get_customer_context({ customer: "<Name>", lookback_days: 180 })` → recent meetings, action items, team composition.
2. `oil:search_vault({ query: "<account name> VBD workshop POC demo pilot", filter_folder: "Meetings" })` → find high-impact engagement notes.
3. `oil:read_note` on each match → extract: date, type (VBD/Workshop/POC/Meeting), attendees, customer contacts involved, key outcome.

**Activity classification:**

| Type | Description | Expected Impact |
|---|---|---|
| **VBD** | Value-Based Delivery engagement | High — direct enablement |
| **Workshop** | Hands-on customer workshop | High — adoption acceleration |
| **POC/Pilot** | Proof of concept or pilot | High — decision driver |
| **Strategy Meeting** | Account planning, QBR, exec alignment | Medium — pipeline influence |
| **Technical Meeting** | Architecture review, troubleshooting | Medium — adoption support |
| **Check-in** | Status update, routine sync | Low — relationship maintenance |

## Step 2 — Validate Against M365

Delegate to `m365-actions` subagent to validate discovered activities:
> "For each of these activities, verify they occurred in M365: {activity list with dates and attendees}. Search calendar events and email threads. Return: confirmed/partial/not-found per activity, plus any additional customer meetings not captured in vault."

Activities found in M365 but not in vault → flag as **uncaptured engagement** (still score them).

## Step 3 — Measure Growth Impact via PBI

Delegate to `pbi-analyst` subagent for before/after measurement:

- Prompt: Read `.github/prompts/ghcp-activity-impact.prompt.md` Step 3
- Semantic Model: `a0239518-1109-45a3-a3eb-1872dc10ac15`
- For each account with activities, query MSXI for the **month of activity** (baseline), **+1 month**, and **+2 months**:
  - `GHCP_Seats` — seat count
  - `GHCP_ACR_Dollar` — billed ACR
  - `GHE_Lic_Seats` + `GHE_Metered_Seats` — total TAM seats
  - `GHCP_Attach` — attach rate
  - `GHCP_WAU_Pct` — weekly active usage
  - `Azure_ACR` — Azure consumption (if available)
- TPID is **quoted text** in MSXI: `"10427242"`
- Filter: `RelativeFM` based on activity month relative to current month
- If activity is within the last 2 months → mark as **"Too early"** (insufficient post-activity data)

## Step 4 — Score Impact

For each activity, compute growth delta and assign a score:

| Score | GHCP Seats Δ | ACR Δ | Attach Rate Δ | Definition |
|---|---|---|---|---|
| **Strong Positive** | +10%+ | +10%+ | +5pp+ | Clear causal growth |
| **Positive** | +1-10% | +1-10% | +1-5pp | Growth signal present |
| **Mixed** | Mixed direction across metrics | | | Some metrics up, others down |
| **Flat** | <1% change across metrics | | | No measurable movement |
| **Negative** | Decline in any metric | | | Decline detected — investigate |
| **Too Early** | Activity within 2 months | | | Insufficient data for scoring |
| **Unmapped** | No TPID match in MSXI | | | Account not in PBI data |

**Weekly Usage % modifier** (from msix-analyst pattern):
- If `WAU_Pct > 60%` AND seats grew → **upgrade** one tier (e.g., Positive → Strong Positive). They're both buying AND using.
- If `WAU_Pct < 30%` AND seats grew → **downgrade** one tier. Growth without adoption = shelfware risk.

## Step 5 — Azure ACR Correlation

For accounts with Azure presence:
- Compare Azure ACR baseline vs. +1M/+2M after GHCP engagement
- Flag accounts where **both GHCP seats AND Azure ACR grew** after engagement → strongest success signal
- Flag accounts where **GHCP grew but Azure ACR flat/declined** → adoption may not be translating to deployment

This correlation answers: "Is GHCP driving more Azure deployments?"

## Step 6 — Output

### Impact Summary Table

| Account | Activity | Date | Type | GHCP Seats Δ | ACR Δ | Attach Δ | WAU% | Azure ACR Δ | Score |
|---------|----------|------|------|-------------|-------|----------|------|-------------|-------|
| {name} | {title} | {date} | VBD | +15 (+12%) | +$2.4K | +3pp | 65% | +$1.2K | 🟢 Strong |

### Impact Distribution

```
🟢 Strong Positive: {count}
🟢 Positive:        {count}
🟡 Mixed:           {count}
⚪ Flat:            {count}
🔴 Negative:        {count}
⏳ Too Early:       {count}
❓ Unmapped:        {count}
```

### Key Findings

For each Strong Positive / Positive:
```
### {Activity Title} — {Account} — 🟢 {Score}
- **Date:** {date} | **Type:** {VBD/Workshop/POC}
- **GHCP Growth:** {baseline} → {+2M} seats ({delta}%)
- **Azure ACR:** {baseline} → {+2M} ({delta}%)
- **WAU:** {pct}% — {healthy/at-risk}
- **Why it worked:** {brief analysis of what drove the growth}
```

For each Negative:
```
### ⚠️ {Activity Title} — {Account} — 🔴 Negative
- **Decline:** {seats/ACR delta}
- **Possible cause:** {churn, contract end, competitor, wrong stakeholder}
- **Recommended action:** {next step}
```

### Vault Persistence

After output, persist findings:
- `oil:promote_findings` — append impact summary to each customer's `## Agent Insights` section.
- `oil:capture_connect_hook` — for Strong Positive results, create a Connect hook entry (evidence for performance review).

---

## Rules

1. **Never fabricate growth data** — all deltas come from MSXI via `pbi-analyst`. If data is unavailable, show `N/A`.
2. **"Too early" is a valid result** — don't force a score when post-activity data doesn't exist yet.
3. **Conservative scoring** — when in doubt, score lower. The user needs to trust the scores.
4. **PBI guardrail**: Include disclaimer: *"Custom engagement analysis from SE tooling — not official Microsoft reports."*
5. **Source + date on every metric** — always attribute data to MSXI and specific fiscal month.
6. **M365 validation is supplementary** — if m365-actions fails, proceed with vault-only activities. Note the gap.

## Performance Budget

- **PBI**: 1 `pbi-analyst` delegation — batch all accounts in one DAX query with multi-month window.
- **M365**: 1 `m365-actions` delegation — batch all activity validations.
- **Vault**: All reads in Step 1. No re-reads during scoring.
