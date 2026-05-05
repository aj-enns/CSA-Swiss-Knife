---
description: "Multi-signal account review with section selector. Combines GHCP seat metrics (MSXI + OctoDash PBI), M365 engagement signals, and CRM pipeline state into a scored health dashboard. Users pick sections: Health Card, Seat Analysis, Engagement, Pipeline, or Full Review. Replaces account-health-card.prompt.md. Triggers: account review, account health, health card, full account view, multi-signal review, combined view, relationship health, account overview, account check."
---

# Account Review — Multi-Signal Account Analysis

Surface the full picture for tracked accounts by combining **PBI adoption metrics**, **M365 engagement signals**, and **CRM pipeline state**. Section selector lets users run specific analyses or the full multi-source review.

## Configuration

| Setting | Value | Notes |
|---|---|---|
| **Account Roster** | Vault → `AccountReference.md` | Master list with TPIDs |
| **MSXI Semantic Model** | `a0239518-1109-45a3-a3eb-1872dc10ac15` | GHCP seat data (Dim_Metrics) |
| **OctoDash Semantic Model** | `ecdbfb59-7a8f-44fb-9102-727598416571` | Per-org/per-subscription |
| **M365 Source** | `m365-actions` subagent | Email, Teams, Calendar |
| **CRM Source** | `msx` MCP tools | Opportunities, milestones |
| **Calendar Filter** | `RelativeFM = -1` | Last completed fiscal month |
| **M365 Lookback** | 30 days | Engagement window |

## Section Selector — MANDATORY GATE

**⛔ STOP after Step 0.** If the user's prompt does NOT explicitly name a section (e.g., "health card", "seats", "pipeline", "full review"), you MUST present the table below and wait for the user to choose before executing ANY section. Do NOT default to Full Review. Do NOT proceed silently.

| # | Section | Sources | What You Get |
|---|---------|---------|--------------|
| 1 | **Health Card** | PBI + M365 + CRM | Scored overview: Adoption, Whitespace, Engagement, Pipeline, Risk |
| 2 | **Seat Analysis** | PBI (MSXI + OctoDash) | Full GHCP: cohort, MoM trends, NPSA, whitespace + per-org breakdown, industry benchmarks |
| 3 | **Engagement** | M365 + vault | Email, Teams, Calendar signals with follow-up tracking |
| 4 | **Pipeline** | CRM | Opps, milestones, deal team, CSU roles, deep-dive escalation |
| 5 | **Full Review** | All | Sections 1–4, with scored Health Card as the summary layer |

Ask: **"Which sections? (e.g., '1 and 2', 'health card and seats', 'full review')"** — then STOP and WAIT for the user's response.

**Skip rule**: Only skip this gate if the user's original prompt already named a specific section (e.g., "run health card for TPID X", "seat analysis for Windstream", "full review for 10427242").

**Cross-section optimization** — detail sections supersede Health Card lanes for shared sources:

- Section 2 selected → skip Health Card PBI lane (superset)
- Section 3 selected → skip Health Card M365 lane (superset)
- Section 4 selected → skip Health Card CRM lane (superset)

Health Card scoring still runs — it uses the richer data from detail sections.

---

## Step 0 — Shared Infrastructure

Runs once regardless of sections selected.

**0A — Role + Scope**

1. Read vault `Reference/MyRoleDescriptions.md` (`oil:search_vault` for "My Role") → identify name and role. Fall back to `crm_whoami`. Skip if known this session.
2. Read vault `AccountReference.md` → extract tracked accounts (names, TPIDs, contacts).
3. User-scoped accounts → use those. All accounts → scope guard at 15 (confirm before proceeding).
4. **Account resolution** — resolve every user-provided identifier to a canonical vault customer name. Use the AccountReference.md table parsed in step 2 as the **primary** resolution source — it has Account Name, TPID, OppID, MilestoneID, and contacts for all tracked accounts.

   **Resolution order** (stop at first match):

   | Input pattern | Step A: AccountReference.md match | Step B: Vault fallback | Example |
   |---|---|---|---|
   | **TPID** (pure numeric like `10427242`) | Match TPID column → row's Account Name | `oil:query_notes({ where: { tpid: "<TPID>" } })` → customer folder from path | `10427242` → Windstream Communications |
   | **Abbreviation** (2-4 uppercase chars) | Match `(ABBREV)` in Account Name column | `oil:search_vault("<abbrev>", { filter_folder: "GHCP-FY26-Q3" })` → trend note filename → read TPID from body → retry TPID path | `NIQ` → matches `NIELSEN CONSUMER LLC (NIQ)` |
   | **Exact name** (matches an Account Name row) | Case-insensitive match on Account Name | `oil:search_vault("<name>", { filter_folder: "Customers" })` | `WINDSTREAM COMMUNICATIONS` |
   | **Partial name** (≥3 chars, substring of a row) | Substring match on Account Name column | `oil:search_vault("<partial>", { filter_folder: "Customers" })` | `NIELSEN` → matches `NIELSEN CONSUMER LLC (NIQ)` |
   | **TPID + name combo** | Split on whitespace, match TPID (authoritative) | — | `638502 WBD` → TPID wins |

   **Critical: Do NOT use `oil:search_vault` directly for abbreviations or short inputs.** Fuzzy search on 2-3 char inputs produces false positives (e.g., "NIQ" fuzzy-matches "Equinix", not Nielsen). Always resolve abbreviations through AccountReference.md's parenthesized aliases first.

   **Disambiguation**: If any step returns **2+ equally valid** matches (e.g., "WARNER" matches both Warner Bros Discovery AND Warner Music Group in AccountReference.md), **ask the user**. Show the candidates with TPIDs. Do NOT silently pick one.

   **AccountReference.md → vault folder mapping**: AccountReference.md uses legal names (e.g., `NIELSEN CONSUMER LLC (NIQ)`). Vault folders use shortened names (e.g., `Nielsen Consumer`). Strip parenthesized abbreviations, legal suffixes (LLC, INC, CORP, LTD), and normalize case. When uncertain, confirm with `oil:get_customer_context({ customer: "<stripped name>" })` — if it returns data, the name is correct.

   **Hard rule**: Never derive vault customer names from CRM `list_accounts_by_tpid` — CRM returns sub-account names (e.g., "Windstream" not "Windstream Communications"). CRM is for opportunity/milestone scoping only. The vault resolution order is: **AccountReference.md → vault search → get_customer_context**. Do NOT call `get_customer_context` with any name derived from CRM — always resolve through AccountReference.md or vault search first.

   **Not found**: If no match in AccountReference.md AND vault fallback returns empty → tell the user the account is not in the tracked portfolio. Do NOT fabricate a customer context.

5. **GHCP trend note lookup** (per resolved account): `oil:search_vault("<TPID>", { filter_folder: "GHCP-FY26-Q3" })` — trend notes contain prior OctoDash analysis and assessment. Cache for Section 2.

**0B — Vault Deep Scan** (skip block if vault unavailable)

6. `oil:get_customer_context({ customer })` per account — use the vault-resolved name from 0A.4, NOT CRM account names → team, opportunities, milestones, linked people.
7. `oil:query_notes({ where: { customer, tags: "contacts" } })` → read contacts note. Extract:
   - **Microsoft Team** → roles (SSP, SE, CSA, CSAM, Specialist)
   - **V-Team Roles** → alias lists by solution area
   - **Customer Contacts** → names, emails, domains
   - **GitHub Team** → GH AE
   - **Teams Channels** → channel names/IDs
8. Vault contacts are **authoritative** for team composition — CRM deal teams are supplementary.

**0C — Freshness + Historical Context**

9. Classify vault note freshness: **Fresh** (modified today) → cache reusable. **Stale** (> 1 day) → live M365.
10. **Override keywords** ("fresh data", "new data", "enrich", "refresh", "live data") → ALL accounts Stale. Affects cache-vs-live only.
11. **Always-read vault history**: `oil:query_notes({ where: { customer, tags: "teams-chat|meeting-notes|analysis|action-items|email-thread" } })`. Fallback: `oil:search_vault("<account> teams chat")`. Extract prior email thread subjects + participant emails as search seeds.
12. Cache per-account: freshness, channels, history, contacts, thread seeds.

---

## Section 1 — Health Card

Three parallel lanes → merge → score → output.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Lane 1: PBI │  │ Lane 2: M365│  │ Lane 3: CRM │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       └────────┬───────┴────────────────┘
                ▼
         Merge + Score
```

If any lane fails, proceed with remaining — mark failed source `N/A`.

**Lane 1 — PBI** *(skip if Section 2 selected — Seat Analysis is a superset)*

Delegate to `pbi-analyst`: semantic model `a0239518-1109-45a3-a3eb-1872dc10ac15`, TPIDs from Step 0, vault overrides. Instruction: "Return per-TPID: GHCP_Seats, GHCP_Ent/Bus/Standalone_Seats, GHCP_ACR_Dollar, ARPU, TAM, GHCP_attach, Remaining_Seat_Opp, WAU_pct, MoM delta. `RelativeFM = -1`. TPID is text — always quote."

**Lane 2 — M365** *(skip if Section 3 selected — Engagement is a superset)*

- **Fresh**: Use vault cache → `last_email_date`, `email_count_30d`, `last_meeting_date`, `meeting_count_30d`, `teams_mention_count_30d`.
- **Stale**: Delegate to `m365-actions` with account names, vault contact emails, channel IDs, thread subjects from Step 0. Instruct: "Use SearchMessages for email (broad + from:/to: contact + subject: thread patterns), ListCalendarView for meetings, GetChannelMessages for Teams channels. NOT WorkIQ. 30-day window. Return counts + dates only (YYYY-MM-DD)."
- **Persist**: `oil:patch_note` / `oil:promote_findings` (fire-and-forget).

**Lane 3 — CRM** *(skip if Section 4 selected — Pipeline is a superset)*

- `list_opportunities({ customerKeyword, format: "summary", includeDealTeam: true })` per account.
- `get_milestones({ customerKeyword, format: "triage", includeTasks: true })` per account.
- Extract: opp count, pipeline value, stages, next milestone date, blocked milestones, deal team.

**Scoring** — merge all lanes:

| Dimension | Source | 🟢 Healthy | 🟡 Watch | 🔴 Risk |
|---|---|---|---|---|
| Adoption | PBI | Growing MoM, WAU > 40% | Flat or WAU 20–40% | Declining or WAU < 20% |
| Whitespace | PBI | Remaining Opp + pipeline > 0 | Whitespace, no pipeline | Large whitespace, no engagement |
| Engagement | M365 | Email + meeting < 14d | Activity < 30d | No activity 30+ days |
| Pipeline | CRM | Active opps, no blocks | Stale or stage-stuck | No opps or all blocked |
| Risk | All | No 🔴 | 1×🔴 | 2+×🔴 |

Two-source minimum for scoring — single source shows raw data without health rating.

**Output** — summary table sorted by risk (🔴 first):

| Account | GHCP Seats | MoM Δ | Attach % | Whitespace | Last Engagement | Pipeline ($) | CSA | CSAM | Overall |
|---------|-----------|-------|----------|------------|----------------|-------------|-----|------|---------|

For 🔴 / 🟡 accounts, detail block:

```
### ⚠️ [Account] — Risk: [Summary]
- **Adoption** 🔴: [detail]
- **Engagement** 🟡: [detail]
- **Recommended action**: [next step]
```

After output, offer: "Run Section 2 (Seat Analysis) for deep dive on flagged accounts?" / "Save to vault?"

---

## Section 2 — Seat Analysis

Combined MSXI aggregate + OctoDash per-org analysis in a single delegation. MSXI provides the financial/strategic lens (ACR, ARPU, attach, pipeline, cohort, 6-month trend). OctoDash provides the operational/distribution lens (per-org seats, per-subscription mapping, tier per org, industry benchmarks). Running both together lets you cross-reference — e.g., validate pipeline against actual subscription ownership, target Enterprise upsell to the right org, spot shelfware hiding behind aggregate growth.

**Delegation** — single `pbi-analyst` call covers both sources:

- Prompt: `pbi-ghcp-seats-analysis`
- MSXI Semantic Model: `a0239518-1109-45a3-a3eb-1872dc10ac15`
- OctoDash Semantic Model: `ecdbfb59-7a8f-44fb-9102-727598416571`
- TPIDs from Step 0 (MSXI: **quoted text** `"10427242"` · OctoDash: **unquoted integer** `10427242`)
- Vault overrides from Step 0B (EMU migrations, slug renames, decommissioning)
- Include: `.github/documents/ghcp-metric-formulas.md` load instruction
- Read `.github/instructions/ghcp-octodash-enrichment.instructions.md` for OctoDash schema reference
- Instruction: "Run MSXI workflow + OctoDash Enrichment (Q4 + Q5) together. Return MSXI aggregates AND per-org breakdown, Azure subscription mapping, industry benchmarks, source comparison."

**MSXI Workflow selection** (determines which MSXI queries run alongside OctoDash):

| User Intent | Workflow |
|---|---|
| Default / "seat analysis" | Combined Report (Q3 + Q2 + Q4 + Q5) |
| "Rank" / "whitespace" | Portfolio Ranking (Q3 → Q1) + OctoDash (Q4 + Q5) |
| "Compare" / "trend" | MoM Trend (Q2) + OctoDash (Q4 + Q5) |
| "Movement" / "grew/churned" | Seat Movement (Q2) + OctoDash (Q4 + Q5) |
| "Cohort" / "classify" | Cohort Classification (Q3) + OctoDash (Q4 + Q5) |
| Single account named | Single Account Deep Dive (Q1) + OctoDash (Q4 + Q5) |

If OctoDash auth fails → present MSXI results and note: "OctoDash unavailable this session — per-org breakdown skipped." Continue with MSXI-only.

Consume the report. If Section 1 scoring needs PBI data, use Seat Analysis output (superset of Lane 1).

---

## Section 3 — Engagement Deep Dive

Full M365 signal analysis. Uses Step 0C freshness and vault historical context.

**Fresh accounts** — present vault-cached engagement directly.

**Stale accounts** — delegate to `m365-actions` with:

- Account names + vault contact emails + Teams channel IDs + thread subject seeds (all from Step 0)
- 30-day window

**Query patterns** (mandatory in delegation prompt):

| Signal | Tool | Query |
|---|---|---|
| Email (broad) | `SearchMessages` | `received:>={{30D_AGO}} "{{ACCOUNT}}"` |
| Email (contact) | `SearchMessages` | `from:{{CONTACT}} received:>={{30D_AGO}}` + `to:{{CONTACT}}...` |
| Email (thread) | `SearchMessages` | `subject:"{{THREAD}}" received:>={{30D_AGO}}` |
| Calendar | `ListCalendarView` | 30-day window, filter by account/contacts |
| Teams (broad) | `SearchMessages` | `"{{ACCOUNT}}"` in chats/channels |
| Teams (targeted) | `GetChannelMessages` | Vault channel ID, 30 days |

> Use targeted M365 tools — NOT WorkIQ. Exact dates (YYYY-MM-DD). Prefer `GetChannelMessages` when channel ID available.
>
> **Fallback**: If `m365-actions` delegation fails (subagent unavailable), fall back to `ask_work_iq` with a broad multi-source query scoped to the account name + 30-day window. Note the degradation in output — WorkIQ may miss header fidelity and thread structure.

**Output** per account: last email/meeting dates + counts, Teams mentions, active thread status (awaiting reply / responded / closed), key contacts engaged vs. silent.

**Persist**: `oil:patch_note` / `oil:promote_findings` (fire-and-forget).

---

## Section 4 — Pipeline Deep Dive

Full CRM analysis. Calls `msx` directly.

**Opportunities**: `list_opportunities({ customerKeyword, format: "summary", includeDealTeam: true })` per account.

**Milestones**: `get_milestones({ customerKeyword, format: "triage", includeTasks: true })` per account. Always scope by `customerKeyword` — never unscoped `mine: true`.

**Deep-dive escalation**: If summary reveals At Risk / overdue / blocked → re-query with `format: "full"` for those specific opportunities only.

**CSU Role Resolution** — vault-first chain, stop at first confirmed source:

1. **Vault contacts** (Step 0B) → Microsoft Team table + V-Team Roles subsections.
2. **CRM deal teams** → `systemusers` (fullname, title). Match "CSA"/"Cloud Solution Architect" and "CSAM"/"Customer Success". Check across ALL account opportunities.
3. **Vault handoff tracker** → `Reference/Committed-Milestone-Handoff-Tracker.md`.
4. **PBI WhoIsTheCSAM** → delegate `pbi-analyst` (Report: `8be168b9-0ba6-415a-bba8-8cbfa2a9e381`, Dataset: `SSDMSelfServeOpenAccess`, filter TPID).

> Never infer CSA/CSAM from deal team alone — cross-reference vault contacts. Flag accounts with no CSA/CSAM as team coverage gaps.

**Output** — Opportunities:

| Opp # | Name | Stage | Est Close | Health | Next Step | Deal Team |
|-------|------|-------|-----------|--------|-----------|-----------|

Milestones:

| Name | Monthly Use | Due Date | Status | Owner | Blocker/Risk |
|------|------------|----------|--------|-------|--------------|

---

## Section 5 — Full Review

Execute all sections with parallel optimization:

1. Launch in parallel: Section 2 (`pbi-analyst` — MSXI + OctoDash combined) + Section 3 (`m365-actions`) + Section 4 (CRM inline).
2. Wait for all to return.
3. Run Section 1 scoring using data from Sections 2/3/4 — all three Health Card lanes are skipped (superseded).
4. Present **Health Card summary table first** (scored dashboard), then detail blocks from each section.

---

## Rules

1. **Vault is the account roster** — start from `AccountReference.md`, never ask user for account list.
2. **Parallel execution** — sections and lanes with no cross-dependencies run simultaneously.
3. **Never fabricate data** — unavailable source → `N/A`, note which source failed.
4. **PBI guardrails** — include: *"Custom account briefs from SE tooling — not official Microsoft reports."* Source + date on every table.
5. **Never mix revenue** — MSXI ACR (billed) and CRM $/mo (forecast) must be in separate tables.

## Performance Budget

- **PBI**: 1 `pbi-analyst` delegation for Seat Analysis (MSXI + OctoDash combined). Batch all TPIDs in one call.
- **M365**: 1 `m365-actions` delegation. Batch all stale accounts.
- **CRM**: Batch by account. `format: "summary"` initial sweep, `"full"` only for flagged.
- **Vault**: All reads in Step 0. No re-reads during section execution.
