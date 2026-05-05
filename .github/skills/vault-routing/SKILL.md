---
name: vault-routing
description: "Obsidian vault integration — local knowledge layer, customer roster, durable storage, CRM prefetch context, Connect hook routing. Triggers: vault reads, customer defaults, durable memory, Obsidian notes, OIL tools, customer roster, vault-first storage, cross-medium context assembly, vault prefetch, vault promote, vault correlate, vault lookup, local knowledge store, vault file retrieval, prefetch data, customer notes file, create project, new project note, project creation."
---

# Obsidian Vault — Operational Contract

The vault is the local context layer. CRM is system-of-record for live state.

## Core Rules

- Vault scopes who/what to query; CRM validates current status.
- Run VAULT-PREFETCH before broad CRM retrieval when OIL is available.
- Persist only validated findings to vault (no speculative writes).
- Treat vault-listed customers as active roster for proactive workflows.
- If OIL is unavailable, continue statelessly and state the gap.

## OIL Tools (Primary)

### Read and scope

- `get_vault_context`
- `get_customer_context`
- `oil_get_opportunity_context`
- `oil_get_milestone_context`
- `prepare_crm_prefetch`
- `search_vault`
- `query_notes`

### Correlate and promote

- `resolve_people_to_customers`
- `correlate_with_vault`
- `promote_findings`
- `capture_connect_hook`

### Entity sync writes (gated)

- `oil_create_opportunity`
- `oil_update_opportunity`
- `oil_create_milestone`
- `oil_update_milestone`
- `manage_pending_writes`

## Vault Entity Icon & Link Standards

All vault entries for CRM entities MUST use these standard icons and include MSX record links. This applies everywhere — skill output, vault notes, tables, frontmatter headers, and section headings.

### Entity Icons (Mandatory)

| Entity | Icon | Usage |
|--------|------|-------|
| Opportunity | 🎯 | Headings, table rows, frontmatter references |
| Milestone | 📋 | Headings, table rows, frontmatter references |
| Project | 🔧 | Headings, table rows, frontmatter references |
| Task | ✅ / 🔄 / ➕ / ❌ / ⏸️ | State-based (see vault-sync skill Mode 5 icon table) |
| Deal Team member | 👤 | Table rows |
| ACR / Revenue | 💰 | Section headings, value callouts |
| CRM Link | 🔗 | Inline link prefix |
| Risk / Warning | ⚠️ | Flags, alerts |
| Customer / Account | 🏢 | Customer-scoped headings |

### File Icons via Iconize (Mandatory)

All vault notes created by agent skills MUST include an `icon` frontmatter property for the Obsidian Iconize plugin. This renders a custom icon in the file explorer sidebar.

| Note type | `icon` value | Lucide icon |
|-----------|-------------|-------------|
| Opportunity | `LiTarget` | Crosshair/target |
| Milestone | `LiFlag` | Flag |
| Project | `LiWrench` | Wrench |
| Task log (milestone note with tasks) | `LiClipboardList` | Clipboard list |
| Person / People | `LiUser` | User silhouette |
| Customer | `LiBuilding2` | Building |
| Meeting | `LiCalendar` | Calendar |

### MSX Record Links (Mandatory)

Every opportunity and milestone entry in the vault MUST include an MSX record link:

```
https://microsoftsales.crm.dynamics.com/main.aspx?etn=<entityLogicalName>&id=<GUID>&pagetype=entityrecord
```

| Entity | `etn` value | GUID source |
|--------|-------------|-------------|
| Opportunity | `opportunity` | `opportunityid` |
| Milestone | `msp_engagementmilestone` | `msp_engagementmilestoneid` |
| Task | `task` | `activityid` |

Format in vault notes: `[🔗 MSX](url)` or `[Record Name](url)`. Prefer `recordUrl` from tool output when available.

### Minimum Required Data for Vault Entity Writes

When calling `oil_create_opportunity`, `oil_update_opportunity`, `oil_create_milestone`, or `oil_update_milestone`, the caller MUST include these fields. Missing fields produce incomplete vault entries that lose value over time.

**Opportunity writes — required fields:**

| Field | CRM Source | Why |
|-------|-----------|-----|
| Name | `name` | Identity |
| Opp # | `msp_opportunitynumber` | User recognition |
| GUID | `opportunityid` | Dedup + MSX link |
| Stage | `msp_activesalesstage` | Pipeline position |
| Est. Close | `msp_estcompletiondate` | Timeline |
| Deal Value | `estimatedvalue` | 💰 ACR context |
| Recurring ACR | `msp_consumptionconsumedrecurring` | 💰 Actual consumption |
| Solution Play | `msp_salesplay` | Solution context |
| MSX Link | Constructed from GUID | 🔗 One-click access |
| Deal Team | `msp_dealteams` → resolved `systemusers` | 👤 Who's on the deal |
| Description | `description` | Notes/context |

**Milestone writes — required fields:**

| Field | CRM Source | Why |
|-------|-----------|-----|
| Name | `msp_name` | Identity |
| Milestone # | `msp_milestonenumber` | User recognition |
| GUID | `msp_engagementmilestoneid` | Dedup + MSX link |
| Monthly Use (ACR) | `msp_monthlyuse` | 💰 Revenue delta |
| Status | `msp_milestonestatus` | Health |
| Commitment | `msp_commitmentrecommendation` | Forecast impact |
| Due Date | `msp_milestonedate` | Timeline |
| Owner | `_ownerid_value` | Accountability |
| MSX Link | Constructed from GUID | 🔗 One-click access |
| Parent Opp GUID | `_msp_opportunityid_value` | Linking |
| Forecast Comments | `msp_forecastcomments` | 📝 Latest status context |

If ACR fields return `0`, `null`, or are absent, write `—` (em-dash) — never omit the field entirely.

## Vault Protocol Phases

### Availability guard

1. Call `get_vault_context()` once per workflow.
2. Cache availability for the current turn.
3. If unavailable, skip vault phases and continue with CRM-only flow.

### VAULT-PREFETCH

- Use `get_customer_context({ customer })` and/or `prepare_crm_prefetch({ customers })`.
- Reuse GUIDs/TPIDs from vault instead of rediscovering through broad CRM search.

### Vault Exhaustion Protocol (mandatory before live-system fallback)

Before querying Teams, Outlook, CRM, or WorkIQ for data, exhaust the vault using this tiered search strategy. **Do not skip tiers** — a shallow `search_vault` miss does not mean the vault lacks the data.

| Tier | Tool | What it finds | When to use |
|---|---|---|---|
| **1. Customer context** | `get_customer_context({ customer })` | Full note: opportunities, milestones, team, action items, connect hooks, agent insights, linked people, meetings | Always first for customer-scoped queries |
| **2. Frontmatter query** | `query_notes({ where: { tags: "<topic>" }, folder: "Customers" })` | Notes matching structured metadata (tags, tpid, status, customer) | Cross-customer discovery |
| **3. Vault search** | `search_vault({ query: "<terms>", filter_folder: "Customers" })` | Title, tag, heading, and body content matches (lexical + fuzzy) | Free-text search when customer name isn't known |
| **4. Graph traversal** | `query_graph({ path: "<note>", direction: "neighborhood" })` | Related notes via wikilinks (2-hop) | Finding related context around a known note |
| **5. Read specific note** | `read_note` on path from Tier 1–4 results | Full body content, sections, inline data | Deep-read when you know the note exists but need specific section content |

**Escalation rule**: Only go to live systems (CRM, M365, WorkIQ) after Tiers 1–3 return no relevant results.

### VAULT-CORRELATE

- After M365/WorkIQ retrieval, run `resolve_people_to_customers` and `correlate_with_vault`.
- Keep vault query date window aligned to source retrieval window.

### VAULT-PROMOTE

- Persist validated outcomes via `promote_findings`.
- Capture measurable impact with `capture_connect_hook`.

### VAULT-SYNC

1. Read current vault entities.
2. Diff against CRM retrieval.
3. Write only new/changed entities with `oil_create_*`/`oil_update_*`.
4. Confirm writes through pending queue.

## Write Safety

- One entity per write call.
- Do not manually synthesize entity markdown when entity tools exist.
- Confirm large sync batches before execution.

## Fallback (No Vault)

- Ask user for customer scope or use `crm_whoami` context.
- Skip vault correlation and promotion.
- Connect hook fallback target: `.connect/hooks/hooks.md`.

## Anti-Patterns

- CRM-wide retrieval without vault scoping when vault is available.
- Treating cached vault status as live CRM truth.
- Persisting unvalidated assumptions.
- Creating customer files for one-off transient lookups.

## Vault Entity Templates

All vault note templates live in the `vault-sync` skill at `.github/skills/vault-sync/references/`. When creating new vault notes, use these templates — do not synthesize markdown structure inline.

| Entity | Template | Skill Mode |
|--------|----------|------------|
| Customer | [`vault-sync/references/customer-note.template.md`](../vault-sync/references/customer-note.template.md) | vault-sync Mode 4 (Customer Hygiene) |
| Opportunity | [`vault-sync/references/opportunity-note.template.md`](../vault-sync/references/opportunity-note.template.md) | vault-sync Mode 1 (Opp Sync) |
| Milestone | [`vault-sync/references/milestone-note.template.md`](../vault-sync/references/milestone-note.template.md) | vault-sync Mode 2 (Milestone Sync) |
| People | [`vault-sync/references/people-note.template.md`](../vault-sync/references/people-note.template.md) | vault-sync Mode 3 (People Sync) |
| Project | [`vault-sync/references/project-note.template.md`](../vault-sync/references/project-note.template.md) | vault-sync Mode 6 (Project Sync) |

Placeholders use `{CRM_FIELD}` syntax. Sections marked `<!-- end-crm-sync -->` or `<!-- end-managed -->` are never overwritten on subsequent syncs.
