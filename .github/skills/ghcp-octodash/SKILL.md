---
name: ghcp-octodash
description: "OctoDash per-subscription and per-BU GHCP seat breakdown reference. Covers OctoDash semantic model schema, TPID→slug join pattern, source comparison (MSXI vs OctoDash), presentation guardrails. Triggers: per-subscription breakdown, per-BU seats, enterprise slug, OctoDash enrichment, granular GHCP report, OctoDash, billable_owner_name."
---

# OctoDash Enrichment — Per-Subscription / Per-BU GHCP Seat Reference

MSXI reports GHCP metrics at the **TPID level only** — no visibility into which Azure subscriptions, enterprise orgs, or business units hold the seats. When a stakeholder asks to "break it down by Azure subscription" or "show per-BU seats," MSXI cannot answer this. Use OctoDash.

## Data Source

| Setting | Value |
|---|---|
| **Semantic Model ID** | `ecdbfb59-7a8f-44fb-9102-727598416571` |
| **Workspace** | `GitHub and Microsoft` |

## OctoDash Table Reference

### `Fact_MSFT_Azure_TPID` — TPID-to-Slug Bridge

The **only** OctoDash table that contains `msft_tpid`. This is the entry point for TPID-scoped lookups.

| Column | Type | Description |
|---|---|---|
| `msft_tpid` | **Integer** | Microsoft TPID — **no quotes** (unlike MSXI `Dim_Metrics[TPID]` which is Text) |
| `billable_owner_name` | Text | Enterprise slug — the join key to all other OctoDash tables |
| `salesforce_account_name` | Text | Salesforce account name associated with the slug |
| `azure_subscription_id` | Text | Azure subscription ID for billing |
| `Copilot Product Type` | Text | Business / Enterprise / Standalone per slug |

### `Installed_Vs_Active_Vs_Engaged_Weekly` — Per-Slug Weekly Adoption (Preferred)

| Column | Type | Description |
|---|---|---|
| `billable_owner_name` | Text | Enterprise slug (join key) |
| `week` | Date | Week ending date |
| `weekly_licensed_users` | Integer | Licensed seat count for the week |
| `authenticated_user_ratio` | Double | % licensed users who authenticated |
| `active_user_ratio` | Double | % licensed users who were active |
| `engagement_ratio` | Double | % licensed users who were engaged |
| `industry` | Text | Industry classification |
| `industry_active_user_ratio` | Double | Industry benchmark for active user % |

## Join Pattern

```
TPID → Fact_MSFT_Azure_TPID → slugs → weekly tables via slug
```

Always follow this two-hop pattern. Do not attempt to filter weekly tables by TPID directly.

## What Each Source Provides

| Need | MSXI (TPID-level) | OctoDash (per-slug) |
|---|---|---|
| Total GHCP seats | Yes | Yes (sum of slugs) |
| Seats by Azure subscription | No | Yes |
| Seats by BU / enterprise org | No | Yes |
| Copilot tier per org | No | Yes |
| Active%/Engaged% per org | No | Yes |
| Industry benchmark comparison per org | No | Yes |
| ACR, ARPU, Attach Rate, TAM | Yes | No |
| GHE/GHAS base seats | Yes | No |

## Presentation Guardrails

### 1. Identity — Say What This Is
Every output with OctoDash/MSXI data **must** include: "These are custom account health briefs put together using SE tooling — not Sales Excellence reports, not official Microsoft reports."

### 2. Never Mix MSXI Revenue with CRM Milestone Dollars
- **MSXI ACR** = actual billed revenue (backward-looking)
- **CRM milestone $/mo** = forecasted engagement consumption (forward-looking)

**Never** subtract one from the other. Keep them in separate sections.

### 3. Source and Date Attribution
Label every data table: `OctoDash — Week of YYYY-MM-DD`, `MSXI — Last Completed Month: Mon YYYY`, `MSX/CRM — Queried YYYY-MM-DD`.

## Common Pitfalls

1. OctoDash seat totals ≠ MSXI seat totals. Present both and note discrepancy.
2. `Licensed_User_Weekly` can be stale — prefer `Installed_Vs_Active_Vs_Engaged_Weekly`.
3. Two slugs can share the same Azure Subscription ID.
4. TPID type mismatch: OctoDash = **Integer** (no quotes), MSXI = **Text** (must quote).
