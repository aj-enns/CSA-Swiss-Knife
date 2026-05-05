---
name: morning-brief
description: 'Speed-optimized morning briefing: launches parallel vault, CRM, and M365 retrieval to produce a consolidated daily action plan in one pass. Assembles pipeline state, milestone health, today''s meetings, overdue tasks, and risk signals into a single prioritized view. Triggers: morning brief, daily brief, start my day, what do I need to know, daily standup, morning prep, daily dashboard, catch me up.'
argument-hint: 'Optionally scope to a customer name, or run unscoped for full portfolio view'
---

## Purpose

Delivers a single, prioritized morning view across all mediums — vault context, CRM pipeline state, and M365 communication signals — optimized for speed via parallel retrieval. Acts as a personalized daily operating system kickoff.

## Freedom Level

**High** — Synthesis and prioritization require judgment; retrieval patterns are structured.

## Trigger

- Start of work session
- User asks "morning brief", "catch me up", "what do I need to know today"
- Daily standup preparation

## Design Principles

1. **Speed over completeness** — launch all independent retrievals in parallel; don't wait for one medium to finish before starting the next.
2. **Vault-first** — the vault is local and fast; use it to seed CRM/WorkIQ queries with known identifiers.
3. **Focused WorkIQ** — small, bounded queries only (today's meetings, last-24h flagged emails); never unbounded M365 sweeps.
4. **Graceful degradation** — any unavailable medium is skipped with a one-line gap notice; the brief still renders from whatever is available.
5. **Customizable** — users fork this skill to match their own morning rhythm (see § Customization below).

## Flow

### Phase 1 — Parallel Medium Probe + Vault Seed (simultaneous)

Launch all three probes at once. These have no dependencies on each other.

| Lane | Tool Call | Purpose |
|---|---|---|
| **Vault** | `oil:get_vault_context()` | Confirm vault online, get shape + scale |
| **CRM** | `msx:crm_auth_status` | Confirm CRM reachable |
| **WorkIQ** | `workiq:accept_eula` (if needed) | Confirm M365 queryable |

Record which mediums are available. If a medium fails, mark it `unavailable` and continue.

### Phase 2 — Parallel Data Retrieval (simultaneous)

Launch all available lanes in parallel. Use vault data to focus CRM/WorkIQ queries.

| Lane | Depends on | Tool Calls | What it produces |
|---|---|---|---|
| **A: Vault Context** | Vault available | `oil:get_customer_context({ customer })` per active customer (or `oil:query_notes({ query: "action items OR risk OR blocked", limit: 20 })` for unscoped) | Customer context, known opp GUIDs, open action items, risk flags, stale notes |
| **B: CRM Pipeline** | CRM available | `msx:get_my_active_opportunities({ maxResults: 75 })` → `msx:get_milestones({ opportunityIds: [...], statusFilter: 'active', format: 'summary', includeTasks: true })` | Pipeline snapshot, milestone health, overdue tasks |
| **C: Today's Calendar** | WorkIQ available | `workiq:ask_work_iq` — "What meetings do I have today? Include attendees, time, and any attached agendas or pre-reads." | Today's meeting schedule with context |
| **D: Recent Signals** | WorkIQ available | `workiq:ask_work_iq` — "What emails or Teams messages in the last 24 hours were flagged, urgent, or mention [customer names from Lane A]?" | Urgent comms requiring morning attention |

**Scoped mode**: If the user provided a customer name, Lane A uses `oil:get_customer_context({ customer })` and Lanes C/D filter to that customer's contacts. Lane B scopes via `customerKeyword`.

**Unscoped mode**: Lane A uses `oil:query_notes` for broad vault signals. Lane B retrieves full portfolio. Lanes C/D use a broad 24-hour window.

### Phase 3 — Synthesis (sequential, fast)

1. **Merge** — Combine results from all lanes. Cross-reference vault action items with CRM task state. Match today's meetings with their associated opportunities/milestones.
2. **Classify** — Apply priority tiers (see Decision Logic).
3. **Render** — Produce the brief in Output Schema format.

## Decision Logic

### Priority Classification

| Tier | Criteria | Action |
|---|---|---|
| **🔴 Act Now** | Overdue milestone tasks, blocked items with no owner, meeting in <2 hours with no prep, urgent flagged comms | Surface first with specific action |
| **🟡 Today** | Tasks due today, meetings later today, at-risk milestones (<14 days, incomplete tasks), stale vault notes (>30 days) | Surface second with timeline |
| **🟢 Awareness** | Pipeline state changes, new opp activity, informational emails, vault context for upcoming meetings | Surface third as context |
| **⚪ Quiet** | On-track items, no-action-needed signals | Omit from brief (available on drill-down) |

### Cross-Medium Correlation

- Meeting today + associated opportunity has overdue tasks → promote to 🔴
- Vault risk flag + no recent CRM activity → promote to 🟡 with "silent risk" label
- CRM milestone committed + no recent customer communication → flag as communication gap
- **SE role + HoK**: Opportunities with no HoK positioning → promote to 🟡 with "HoK not positioned" label. HoK tasks without legal coverage → promote to 🔴 with "legal gate missing" label. Cusp customers (uncertain next steps) → surface in Gaps & Risks with leadership escalation note.

## Output Schema

```markdown
# Morning Brief — {date}

**Mediums**: ✅ Vault | ✅ CRM | ✅ WorkIQ  (or ⚠️ unavailable)

## 🔴 Act Now
- {item}: {one-line context} → {specific action}

## 🟡 Today
- {item}: {one-line context} | {timeline}

## 🟢 Awareness
- {item}: {one-line context}

## Today's Meetings
| Time | Meeting | Customer | Prep Notes |
|------|---------|----------|------------|
| {time} | {title} | {customer} | {opp state, open risks, action items} |

## Pipeline Snapshot
- **Active opportunities**: {count}
- **At-risk milestones**: {count} — {names}
- **Overdue tasks**: {count}
- **Upcoming commits**: {milestones due <30 days}
- **HoK status** (SE role): {active_hok_count} active | {positioned_count} positioned | {not_positioned_count} not yet positioned | {cusp_count} cusp customers

## Gaps & Risks
- {risk}: {evidence} → {role to act} | {minimum intervention}
```

- `mediums_available`: list of confirmed mediums
- `priority_items`: array of classified items with tier, context, and action
- `meetings_today`: structured meeting list with prep context
- `pipeline_snapshot`: summary counts and at-risk items
- `gaps_and_risks`: proactive risk flags with evidence
- `next_action`: "Morning brief complete. Drill into any item, or run `pipeline-hygiene-triage` for full portfolio cleanup." | SE role: "Morning brief complete. {cusp_count} cusp customers flagged — run `hok-readiness-check` for HoK portfolio review, or drill into any item."
- `connect_hook_hint`: Impact Area(s): Culture & Collaboration — "Morning brief synthesized {n} items across {mediums_count} mediums — {act_now_count} requiring immediate action, {today_count} for today"

## Customization

This skill is designed as a **template** that users should fork and personalize. Common customizations:

| Preference | How to Customize |
|---|---|
| **Different WorkIQ queries** | Edit Lanes C/D prompts in Phase 2 to match your communication patterns |
| **Customer priority list** | Add a `priority_customers` list to Phase 2 Lane A to always check specific accounts first |
| **Skip WorkIQ** | Remove Lanes C/D if you prefer calendar + CRM only (faster) |
| **Add vault query patterns** | Customize the `oil:query_notes` query in Lane A for your tagging conventions |
| **Change priority thresholds** | Adjust the 2-hour/14-day/30-day thresholds in Decision Logic |
| **Role-specific lens** | Combine with your role card — a Specialist might weight pipeline health; a CSAM might weight adoption metrics |

To customize: copy this skill to `.github/skills/morning-brief/` in your own workspace fork and edit the Flow and Decision Logic sections.

## Performance Notes

- **Target**: Brief should render in a single agent turn, not multiple back-and-forth exchanges.
- **Parallelism**: Phases 1 and 2 are designed for maximum concurrent tool execution. The agent should launch all independent tool calls simultaneously.
- **Token budget**: Vault and CRM responses are pre-shaped (`format: 'summary'`, `limit: 20`) to keep context windows lean.
- **Fallback**: If all three mediums are unavailable, return a brief stating "No mediums reachable — check VPN, Azure CLI login, and vault path."
