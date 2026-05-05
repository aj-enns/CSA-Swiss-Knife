---
name: crm-query-strategy
description: "CRM read query scoping strategy for MSX/MCEM. Scope-Before-Retrieve pattern: VAULT-PREFETCH, composite tools, crm_query filters, get_milestones usage. Triggers: CRM query construction, milestone lookup, opportunity scoping, get_milestones usage, crm_query filters, oversized payload, unscoped query, query strategy."
---

# CRM Query Strategy (Scope-Before-Retrieve)

**Never call `msx:get_milestones` without a scoping parameter.** The tool now rejects unscoped calls — `mine` no longer defaults to `true`. Always provide at least one of: `customerKeyword`, `opportunityKeyword`, `opportunityId`, `opportunityIds`, `milestoneNumber`, `milestoneId`, `ownerId`, or explicit `mine: true`.

**Always pass `statusFilter`.** A scoped call without `statusFilter` still returns every milestone for that scope — hundreds of completed, cancelled, and irrelevant records. Default to `statusFilter: 'active'` unless the user explicitly asks for completed or all milestones. This is the single highest-impact filter for reducing payload size.

### Intent-to-Filter Mapping (apply before every `get_milestones` call)

Before calling `get_milestones`, map the user's intent to the tightest filter set:

| User Intent | `statusFilter` | Other Params | Rationale |
|---|---|---|---|
| "What do I need to do?" / "my action items" | `active` | `mine: true`, `includeTasks: true` | Only actionable milestones |
| "Morning brief" / "catch me up" | `active` | `format: 'triage'`, `includeTasks: true` | Active pipeline only |
| "Milestone health" / "governance prep" | `active` | `format: 'triage'`, `includeTasks: true` | Excludes completed |
| "What's overdue?" / "at risk" | `active` | `format: 'triage'` | Triage buckets already classify overdue/blocked |
| "Pipeline review" / "hygiene check" | `active` | `format: 'summary'` | No need for completed |
| "Show me all milestones" / "full history" | `all` | — | Only when explicitly requested |
| "Completed milestones" / "what did we finish" | `all` + post-filter | Filter for `msp_milestonestatus = 861980003` | Rare — explicit ask only |
| "Milestone X" (by number or name) | omit | `milestoneNumber` or `keyword` | Direct lookup — status irrelevant |

**Default rule**: If the user's intent doesn't clearly require completed milestones, use `statusFilter: 'active'`.

## Step 0 — SESSION CACHE CHECK + VAULT-PREFETCH

Before asking scoping questions or calling any CRM tool, check for existing session data first:

### 0a — Session Cache Check (always first)

Check `/memories/session/` for an existing CRM cache file matching the customer or scope:

- **View** `/memories/session/` directory to see existing cache files.
- If a file like `crm-<customer>.md` or `crm-portfolio.md` exists and covers the needed scope, **read it and skip CRM calls entirely**.
- Session memory auto-clears when the conversation ends — zero bloat, always fresh per session.

### 0b — Vault-Prefetch (when OIL is available and cache missed)

1. Call `oil:get_vault_context()` to confirm vault availability and get the vault map.
2. If customer is named/inferable, call `oil:get_customer_context({ customer: "<Name>" })` — returns opportunities with GUIDs, team, action items.
3. For CRM-ready OData filters, use `oil:prepare_crm_prefetch({ customers: ["<Name>"] })`.
4. If vault has opportunity GUIDs, **skip Step 1** and go directly to Step 2/3 with vault-provided IDs.
5. If OIL unavailable or customer has no vault file, fall through to Step 1.

Do NOT skip vault-prefetch when OIL is available. The vault is the primary source for customer→opportunity ID mapping.

### 0c — Session Cache Write (after any CRM fetch)

After completing a CRM retrieval (composite tool, batch query, or `crm_query`), persist a **structured summary** to session memory for reuse by downstream skills:

```
memory create /memories/session/crm-<customer-or-scope>.md
```

**Cache file format:**
```markdown
# CRM Cache: <Customer or Scope>
<!-- Fetched: <timestamp> | Tools: <tool names used> -->

## Opportunities
| Opp # | Name | Stage | Est Close | GUID |
|---|---|---|---|---|

## Active Milestones
| Name | Status | Due Date | Owner | Opp GUID | Milestone GUID |
|---|---|---|---|---|---|

## Tasks (if fetched)
| Task | Status | Due | Owner | Milestone GUID |
|---|---|---|---|---|
```

**Cache rules:**
- **Granularity**: One file per customer (`crm-contoso.md`) or one portfolio file (`crm-portfolio.md`) for broad sweeps like `get_my_active_opportunities`.
- **Scope tags**: Include the tool call parameters in the HTML comment so downstream consumers know what's covered.
- **Invalidation**: If a write-intent operation (create/update/close task, update milestone) is confirmed and executed for a customer, delete that customer's cache file — the data is stale.
- **Never cache full payloads**: Store the structured summary table, not raw tool output. Keep cache files under 2KB.

## Step 1 — Clarify Intent (if vault didn't resolve scope)

Ask clarifying questions:
- Which opportunity or customer? (name or ID)
- Which milestone status? (active, at risk, overdue, completed)
- What time range? (this quarter, next 30 days)
- What information is needed? (milestone names, tasks, dates)

## Step 2 — Composite and Batch Tools First

Prefer composite tools over chaining primitives:
- **`msx:get_milestones({ customerKeyword: "Contoso" })`** — resolves customer name → accounts → opportunities → milestones in one call. Add `statusFilter: 'active'` and/or `includeTasks: true` for filtered results with inline tasks. This is the preferred tool for customer-scoped milestone queries.
- **`msx:get_milestones({ opportunityKeyword: "Azure Migration" })`** — resolves opportunity name → milestones in one call. No need to call `list_opportunities` first.
- `msx:get_milestones({ opportunityIds: [...], statusFilter: 'active', format: 'summary' })` — batch mode with status filtering and compact output.
- `msx:find_milestones_needing_tasks({ customerKeywords: [...] })` — specialized: finds milestones *without* tasks.
- `msx:list_opportunities({ customerKeyword: "...", includeDealTeam: true, format: "full" })` — opportunity-level view with stage/estimated close/deal-team enrichment.
- `msx:list_opportunities({ opportunityKeyword: "..." })` or `msx:list_opportunities({ opportunityIds: [...] })` — use these when customer keyword/account mapping is weak.
- `msx:get_milestone_activities({ milestoneIds: [...] })` — batch task retrieval grouped by milestone (or use `get_milestones` with `includeTasks: true`).

## Step 3 — crm_query for Filtered Lookups

Preferred tool for milestone queries needing filtering. See `crm-entity-schema` skill for full schema.

**Guardrails**: `crm_query` enforces an entity allowlist and a 500-record pagination ceiling. Only entity sets in `ALLOWED_ENTITY_SETS` are permitted. Queries to unlisted entities are rejected with a descriptive error.

- Entity set: `msp_engagementmilestones` (NOT `msp_milestones` or `msp_milestoneses`)
- Use `$filter` for status, date range, opportunity, or owner
- Use `$select` for only needed fields (avoid full-record payloads)
- Use `$top` to limit results (default 10–25)
- Use `$orderby` for date/status relevance
- Multi-opportunity: OData `or` in `$filter` (`_msp_opportunityid_value eq '<GUID1>' or _msp_opportunityid_value eq '<GUID2>'`)
- Status filtering: `msp_milestonestatus eq 861980000` (On Track), `ne 861980003` (exclude Completed)

## Step 4 — get_milestones (Full-Featured Tool)

`get_milestones` is the primary milestone retrieval tool. It supports:

| Parameter | Type | Description |
|---|---|---|
| `customerKeyword` | string | Resolves customer name → accounts → opportunities → milestones in one call |
| `opportunityKeyword` | string | Resolves opportunity name → milestones in one call |
| `opportunityId` | string (GUID) | Filter by single opportunity |
| `opportunityIds` | string[] | Batch mode: array of opportunity GUIDs |
| `milestoneId` | string (GUID) | Direct milestone lookup |
| `milestoneNumber` | string | e.g. "7-123456789" |
| `ownerId` | string (GUID) | Filter by owner |
| `mine` | boolean | Current user's milestones (**must be explicit** — no default) |
| `statusFilter` | 'active' \| 'all' | Filter by status group |
| `keyword` | string | Case-insensitive keyword filter |
| `format` | 'full' \| 'summary' | Response format |
| `taskFilter` | 'all' \| 'with-tasks' \| 'without-tasks' | Filter by task presence |
| `includeTasks` | boolean | Embed linked tasks inline on each milestone |

Use `crm_query` only for queries that `get_milestones` cannot express (e.g., custom date range filters, arbitrary OData predicates).

## Step 5 — Drill Down Incrementally

For "which milestones need tasks":
1. Prefer `msx:find_milestones_needing_tasks` for full chain.
2. Or `msx:crm_query` with `entitySet: "msp_engagementmilestones"` and filters.
3. `msx:get_milestone_activities({ milestoneIds: [...] })` for batch task detail.
4. Do not call `get_milestone_activities` one milestone at a time in a loop.

## Good vs Bad Patterns

| Pattern | Status |
|---|---|
| `get_milestones(mine: true)` → "which ones need attention?" | Bad — Unscoped — use customerKeyword or opportunityId instead |
| `get_milestones({})` or `get_milestones()` with no params | Bad — Rejected — scoping required |
| `get_milestones({ customerKeyword: "Contoso", format: "triage", includeTasks: true })` — no statusFilter | Bad — Returns ALL milestones (hundreds of completed/cancelled) — always add `statusFilter: 'active'` |
| `crm_query({ entitySet: "msp_milestones" })` | Bad — Wrong entity set |
| `crm_query` with `msp_forecastedconsumptionrecurring` | Bad — Field doesn't exist |
| `crm_query` with `msp_estimatedcompletiondate` | Bad — Use `msp_milestonedate` |
| Loop: list_opportunities per customer → get_milestones per opp → get_milestone_activities per ms | Bad — ~30 calls |
| Skipping vault when OIL is available | Bad — Wastes API calls |
| `get_milestones({ customerKeyword: "Contoso", statusFilter: "active" })` | Good — **1 call** (best) |
| `get_milestones({ customerKeyword: "Contoso", statusFilter: "active", includeTasks: true })` | Good — **1 call** with inline tasks + status filter |
| `get_milestones({ opportunityKeyword: "Azure Migration", statusFilter: "active" })` | Good — **1 call** (name resolution + filter) |
| `get_milestones({ opportunityIds: [...], statusFilter: "active" })` | Good — Batch with filtering |
| `oil:get_customer_context("Contoso")` → use GUID → `get_milestones({ opportunityId, statusFilter: "active" })` | Good — Vault-first (2 calls) |
| `oil:prepare_crm_prefetch({ customers: [...] })` → paste into `crm_query` | Good — CRM-ready prefetch |
| `find_milestones_needing_tasks({ customerKeywords: [...] })` | Good — 1 call |
| `crm_query` with proper `$filter`/`$select`/`$top` | Good — Filtered, efficient |
| `get_milestone_activities({ milestoneIds: ["ms1","ms2","ms3"] })` | Good — Batch (1 call) |
