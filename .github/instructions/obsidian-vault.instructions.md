---
description: "Obsidian vault integration — local knowledge layer, customer roster, durable storage, CRM prefetch context, Connect hook routing. Use when reasoning about vault reads, customer defaults, durable memory, Obsidian notes, OIL tools, customer roster filtering, vault-first storage, or cross-medium context assembly."
applyTo: "mcp/oil/**"
---

# Obsidian Vault — Operational Contract

The vault is the local context layer. CRM is system-of-record for live state.

## Core Rules

- Vault scopes who/what to query; CRM validates current status.
- Run VAULT-PREFETCH before broad CRM retrieval when OIL is available.
- Persist only validated findings to vault (no speculative writes).
- Treat vault-listed customers as active roster for proactive workflows.
- If OIL is unavailable, continue statelessly and state the gap.

## Minimal Structure Model

- Customer note: `Customers/<Name>.md`
- Preferred layout: `Customers/<Name>/<Name>.md` with `opportunities/`, `milestones/`, and `MCAPS-IQ-Artifacts/` subdirs
- People note: `People/<Name>.md`
- General deliverables: `MCAPS-IQ-Artifacts/` (vault root) for non-customer-scoped artifacts
- Customer summaries link to entity sub-notes; canonical IDs live in entity frontmatter

### Agent-Generated Deliverables

All generated documents (docx, xlsx, pptx, pdf, excalidraw, PBI reports) are stored in the vault when OIL is available:

- **Customer-scoped**: `MCAPS-IQ-Artifacts/<Name>/<artifact>.<ext>`
- **General**: `MCAPS-IQ-Artifacts/<artifact>.<ext>` (vault root)
- **Fallback** (OIL unavailable): `.copilot/docs/` in workspace root

See `shared-patterns` skill § Artifact Output Directory for the full resolution order and path table.

### Customer Root Note — Canonical Sections

Every customer root note (`Customers/<Name>/<Name>.md`) should have these sections in order:

1. `## 🏢 Pipeline` — dataview query listing opportunities from `Customers/<Name>/opportunities/` sorted by ACR desc
2. `## 📋 Milestones` — dataview query listing active milestones from `Customers/<Name>/milestones/` sorted by due date asc
3. `## Microsoft Team` — STU / ATU / CSU roster
4. `## Stakeholders` — customer-side contacts table
5. `## Summary` — account context
6. `## Notes` — user-authored (never overwritten by sync)
7. `## Agent Insights` — agent-managed; consolidated by `vault-sync` skill Mode 4: Customer Hygiene (≤ 15 entries)
8. `## Connect Hooks` — evidence captures for Connect attribution

**Customer note template and hygiene workflow**: See `vault-sync` skill (Mode 4: Customer Hygiene) for the full template and consolidation rules.

**Frontmatter**: `tags: [customer]`, `icon: LiBuilding2`, `sticker: lucide//building-2`, `aliases`, `MSX.account`, `MSX.accountId`, `has_unified`, `last_validated`.

**Agent Insights discipline**: Entries accumulate from workflows (morning briefs, pipeline reviews, account reviews). The `vault-sync` skill (Mode 4: Customer Hygiene) consolidates them — merging duplicates by theme, archiving entries > 90 days, and capping at ~15 active entries. Raw data is always recoverable from meeting notes and CRM.

## Flat-To-Nested Migration

- Detect with `check_vault_health()` (`structuralIssues`).
- Propose `migrate_customer_structure({ customer })`.
- Confirm with user before execution.

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

## Vault Protocol Phases

### Availability guard

1. Call `get_vault_context()` once per workflow.
2. Cache availability for the current turn.
3. If unavailable, skip vault phases and continue with CRM-only flow.

### VAULT-PREFETCH

- Use `get_customer_context({ customer })` and/or `prepare_crm_prefetch({ customers })`.
- Reuse GUIDs/TPIDs from vault instead of rediscovering through broad CRM search.
- **TPID auto-resolution**: `get_customer_context` and `prepare_crm_prefetch` accept TPIDs (numeric IDs) directly — they auto-resolve to the matching customer name via frontmatter lookup. Pass either the customer name or their TPID and the tool handles it.
- **Prefer customer names when known**: TPID resolution scans all customer notes — passing the name directly is faster. Use TPIDs only when the name is unknown.

### Vault Exhaustion Protocol (mandatory before live-system fallback)

Before querying Teams, Outlook, CRM, or WorkIQ for data, exhaust the vault using this tiered search strategy. **Do not skip tiers** — a shallow `search_vault` miss does not mean the vault lacks the data.

| Tier | Tool | What it finds | When to use |
|---|---|---|---|
| **1. Customer context** | `get_customer_context({ customer })` | Full note: opportunities, milestones, team, action items, connect hooks, agent insights, linked people, meetings | Always first for customer-scoped queries |
| **2. Frontmatter query** | `query_notes({ where: { tags: "<topic>" }, folder: "Customers" })` | Notes matching structured metadata (tags, tpid, status, customer) | Cross-customer discovery ("which accounts have GHCP data?") |
| **3. Vault search** | `search_vault({ query: "<terms>", filter_folder: "Customers" })` | Title, tag, heading, and body content matches (lexical + fuzzy) | Free-text search when customer name isn't known |
| **4. Graph traversal** | `query_graph({ path: "<note>", direction: "neighborhood" })` | Related notes via wikilinks (2-hop) | Finding related context around a known note |
| **5. Read specific note** | `read_note` on path from Tier 1–4 results | Full body content, sections, inline data | Deep-read when you know the note exists but need specific section content |

**Escalation rule**: Only go to live systems (CRM, M365, WorkIQ) after Tiers 1–3 return no relevant results. If Tier 1 returns a customer context with the data you need, **stop** — do not also query CRM for the same data.

**Common vault-miss patterns to avoid**:
- Searching `search_vault("GHCP seats")` → no results → going to PBI. Fix: Tier 2 `query_notes({ where: { tags: "ghcp" } })` would find the note.
- Searching `search_vault("contacts Contoso")` → no results → going to Teams. Fix: Tier 1 `get_customer_context({ customer: "Contoso" })` returns `linkedPeople` and `team`.
- Searching for a person's email → going to Graph API. Fix: `get_person_context({ name })` returns cached `email` and `teamsId`.

**Scalability note**: As the vault grows to dozens of accounts, prefer Tier 2 (`query_notes`) over Tier 3 (`search_vault`) for structured lookups. Frontmatter queries are O(n) on note count but filter precisely; fuzzy search can produce false positives at scale. Use `filter_folder` and `filter_tags` parameters to narrow scope.

### Person / Entity Deep-Search Protocol

When searching for a **person name**, **email**, or **entity reference** that may live inside note body content (table rows, inline mentions, team rosters), do not rely on a single tool call. Use this deterministic sweep:

1. **`get_person_context({ name })`** — direct hit if a `People/<Name>.md` note exists.
2. **`search_vault({ query: "<name>" })`** — searches titles, tags, headings, and body content. Use `tier: "lexical"` for exact-name matches; default fuzzy for partial/typo-tolerant matches.
3. **`get_customer_context({ customer })`** — if you know which customer the person is associated with, check the `team` and `linkedPeople` fields directly.
4. **`query_notes({ where: { tags: "contacts" } })`** — finds dedicated contact notes across the vault.
5. **`read_note` on candidate paths** — if Tiers 1–4 identify a likely note but the person data is in a table row or inline section, read the full note to extract it.

**Why this matters**: Even with body-content search, some entity references may span aliases, abbreviated names, or non-standard formatting. The multi-tool sweep ensures coverage regardless of how the data was originally authored.

**Do not**: Skip to live systems (M365, CRM deal team lookups) after a single `search_vault` miss. Exhaust the vault sweep first.

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

**Required data on every entity write** (see `vault-routing` skill for full field tables):
- **Opportunities**: GUID, Opp #, stage, close date, `estimatedvalue`, `msp_consumptionconsumedrecurring`, solution play, MSX link, deal team, description.
- **Milestones**: GUID, milestone #, `msp_monthlyuse`, status, commitment, due date, owner, MSX link, parent opp GUID.
- Missing ACR fields → write `—` (em-dash), never omit.
- All entries MUST include an MSX record link and use standard entity icons (🎯 opp, 📋 milestone, 💰 ACR, 👤 team, 🔗 link).

### VAULT-HYGIENE

- Use `check_vault_health` and `get_drift_report`.
- Recommend fixes; do not auto-delete content.
- **Customer note hygiene**: Run `vault-sync` skill (Mode 4: Customer Hygiene) to ensure canonical section structure, add missing dataview queries, and consolidate bloated Agent Insights. Safe to run; preserves user-authored content in `## Notes` and `## Connect Hooks`.

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

## Extended Reference

For detailed schemas, examples, and deeper workflow playbooks, read:
`.github/documents/vault-operations-reference.md`
