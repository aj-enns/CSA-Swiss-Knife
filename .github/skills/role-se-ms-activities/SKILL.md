---
name: role-se-ms-activities
description: "Born-closed activity-record protocol. Classifies completed engagements into 11 record types, constructs subject + description per formatting rules, and produces a paired open-then-close operation against a milestoneId. Outputs a structured confirmation packet with scheduledEnd date. Triggers: record activity, log activity, log completed work, activity creation, milo."
---

# SE Activity Creation

Operational companion to `role-se`. Handles the concrete workflow of recording SE activities as CRM task records — from signal discovery through classification, confirmation, CRM write, and vault capture.

**Tone**: Structured, precise, transparent in reasoning. Pragmatic and outcome-oriented. No fluff.

## Freedom Level

**Low–Medium** — Field mapping and write protocol are rule-based. Activity classification and signal bundling require judgment; all CRM writes are gated by `write-gate`.

## Prerequisites (checked before any task creation)

1. **Role confirmed as SE** — via `crm_auth_status` / `crm_whoami` + `role-se` mapping.
2. **Milestone identified** — `milestoneId` (GUID) resolved. If the user names a milestone, resolve via `get_milestones`.
3. **Write-gate §2a passed** — SE is allowed to `create_task` / `close_task` on milestones they actively contribute to.
4. **HoK legal gate** (if activity type is HoK) — legal coverage must be confirmed before creating the task. If not confirmed → STOP, chain to `hok-readiness-check`.

## Core Principle: Tasks Are Activity Records

SE tasks document **completed actions** — not open work items.

- Every `create_task` is immediately paired with `close_task` in a single atomic confirmation packet.
- Tasks are **born closed**. There is no open-task state for SE.
- If the activity is **future/planned**: do NOT create a task. Record intent in vault milestone notes; create the task only when the activity is performed.
- **Quality over quantity**: Prefer one high-quality consolidated activity over multiple small entries for the same theme. Never create noise in MSX.

## Signal-Driven Discovery

Before asking the user for activity details, **use tools to collect evidence first**.

For batch scans ("scan last week", "record my activities"), load the full discovery protocol:
→ `read_file("references/signal-discovery.md")`

**Summary**: Stage A (parallel: `get_milestones(mine:true, statusFilter:"active")` + `ListCalendarView`) → Stage A′ (FY filter: drop milestones with `msp_milestonedate` before FY−2 cutoff) → Stage B (build customer filter list from milestones + run `normalize-calendar.js | score-meetings.js` pipeline) → Stage C (batched mail via `m365-actions` with 5–7 domains per KQL call + single `ask_work_iq` sweep for all customers) → Stage D (correlate signals to milestones → classify → present).

**Key rules**:
- Do **not** call `get_my_active_opportunities` — milestones already embed opportunity name, GUID, and customer context.
- Calendar: **always** use helper-script pipeline, never parse raw JSON inline.
- Mail: batch domains into 2–3 KQL calls, never search without domain filters, delegate to `m365-actions`.
- Teams: one WorkIQ call replaces N per-customer searches. Fall back to targeted `SearchTeamsMessages` only on WorkIQ failure.
- Deduplicate: group signals by `{customer × milestone × topic}` — multiple signals for the same theme = one activity.
- Every proposed activity must cite source signals (meeting subject/date, email thread, Teams context).

## Activity Classification

For the full catalog, classification rules, subject/description construction, and milestone mapping:
→ `read_file("references/activity-types.md")`

**Key rules**:
- Only record **significant** activities (ADS, POC, Pilot, Demo, HoK, Workshop, Escalation, RFP, WinPlan, Consumption, Handoff).
- Minor activities (single calls, internal meetings, quick emails, status syncs) are **not recorded** unless escalation rule applies: ≥2 related signals + ≥2h effort → consolidate into one significant activity.
- Subject: `{Customer} — {Brief Description}` (≤60 chars). Description: summary + outcome only — no fields already in CRM metadata.
- Milestone mapping: PoC/Pilot/demo/scoping signals → PoC/Pilot milestone; go-live/deployment/ops signals → Production milestone. If ambiguous, ask one question.

## Field Mapping (CRM → Tool Parameters)

| CRM Field | Tool Parameter | Value |
|---|---|---|
| `subject` | `subject` | Constructed per Subject Construction Rule |
| `description` | `description` | Constructed per Description Construction Rule |
| `scheduledend` | `scheduledEnd` | ISO 8601 date of activity completion (not a future due date) |
| `_regardingobjectid_value` | `milestoneId` | Milestone GUID |
| `duration` | `duration` | Estimated effort in hours (display only in packet, but pass as parameter for CRM) |
| `_ownerid_value` | *(auto-set)* | Current user (set by CRM) |
| `msp_taskcategory` | *(auto-set)* | Set by CRM default |

## Create-and-Close Protocol

### Step 1 — Gather Context

1. **Tools first**: Retrieve milestones and scan M365 signals before asking the user for details (see Signal-Driven Discovery).
2. Identify the customer, opportunity, and milestone from signals and conversation context.
3. If ambiguous, ask **one** concise clarifying question: "Which milestone should this activity be recorded against?" Present top candidates.
4. Classify the activity type and check significance (see Activity Classification).
5. If the activity is not significant and does not meet the escalation rule → do not propose. Inform the user briefly why.

### Step 2 — Build Confirmation Packet

Present a single atomic confirmation block per `write-gate` §3. Include evidence for the user:

```
──────────────────────────────────────
SE Activity Record (create + close)
──────────────────────────────────────
Role:        Solution Engineer
Customer:    {customer name}
Opportunity: {opp name} — Opp #{number} [CRM link]
Milestone:   {milestone name} [CRM link]
Significant: Yes — {short reasoning, 1 line}
Evidence:    {signal references: meeting subject/date, email thread, Teams context}

Action:      Create and immediately close task

  Subject:      {constructed subject}
  Description:  {constructed description}
  Completed on: {scheduledEnd date}
  Effort:       {estimated hours}h (display only — not in description)

[HoK only]
  Environment:    {dev|test|prod}
  Legal coverage: {confirmed|NOT CONFIRMED — BLOCKED}
──────────────────────────────────────
Reply: `approve` to proceed or `revise` to change details.
```

**Rules**:
- Always show create + close as ONE proposed action. Never split.
- If HoK and legal coverage is NOT confirmed → do NOT present the packet. Instead: "HoK legal gate not met. Run `hok-readiness-check` first."
- If the activity is future/planned → do NOT present a packet. Instead: "This activity hasn't been performed yet. I'll record it once it's completed."
- If the user does not approve → this means changes are needed. Revise and re-present. Do not write to CRM until explicit `approve`.

### Step 3 — Execute (on user approval)

1. Call `msx:create_task`:
   - `subject`: from packet
   - `milestoneId`: resolved GUID
   - `description`: from packet
   - `scheduledEnd`: from packet
   - `duration`: from effort estimate (display only in packet, but pass as parameter for CRM)
2. Receive staged response with `operationId`.
3. Call `msx:close_task`:
   - `taskId`: from the staged create response
4. Call `msx:execute_all` to commit both operations.
5. Confirm what was written: milestone reference + activity title + returned IDs.

### Step 4 — Vault Capture Hook

After successful execution, automatically chain to `vault-sync` (Mode 5: Task Sync) per `write-gate` §6:

- Pass: customer name, milestone GUID, opportunity GUID, task subject, completion date.
- No additional user confirmation needed.
- If OIL unavailable → skip silently.

## Batch Activity Recording

When the user requests a scan ("scan last week", "record my activities since Monday"):

1. Run Signal-Driven Discovery across all active milestones for the time window.
2. Classify all candidates. Drop minor activities that don't meet the escalation rule.
3. **Bundle intelligently**: If multiple signals point to the same customer/opportunity/theme, consolidate into one activity.
4. Build one numbered confirmation packet per significant activity.
5. Present ALL packets together for batch approval.
6. On approval, execute all create-and-close pairs, then run vault capture once for all.

If no signals are found for a customer, give no recommendation for that customer.

## Interaction Pattern

- **Start broad** if asked ("scan last week") — collect signals first, then present results concisely.
- **Never ask more than one clarifying question** per turn unless absolutely required to avoid incorrect logging.
- If missing a critical field (customer, opportunity, milestone), ask one short question.
- If the user does not approve, treat that as a request to revise — not a rejection. Adjust and re-present.

## Anti-Patterns (agent must NOT do)

| Anti-pattern | Correct behavior |
|---|---|
| Ask for details before scanning tools | Tools first — retrieve milestones + M365 signals before asking |
| Create task without immediate close | Always pair create + close |
| Create task for future activity | Advise recording after completion |
| Leave task in open state | Flag as anomaly; close immediately |
| Log minor activities as noise | Apply classification rules; only record significant work |
| Create task on milestone SE doesn't touch | Redirect — SE may only create on milestones they contribute to |
| Skip HoK legal gate | STOP and chain to `hok-readiness-check` |
| Guess `milestoneId` | Always resolve via `get_milestones` |
| Skip confirmation packet | Always require explicit `approve` |
| Fabricate dates, attendees, or outcomes | If unknown, ask one concise follow-up question |
| Propose activities without evidence | Every recommendation must cite source signals |

## Chained Skills

| Skill | Chain Condition |
|---|---|
| `write-gate` | Always — §2a authority check + §3 confirmation protocol |
| `hok-readiness-check` | When activity type is HoK |
| `vault-sync` (Mode 5) | Post-write — automatic task capture |
| `se-execution-check` | Upstream — surfaces tasks needing closure |
| `crm-entity-schema` | When field name verification is needed |
| `m365-query-patterns` | Signal discovery — calendar, mail, Teams queries |
| `shared-patterns` | M365 delegation to `m365-actions` subagent |
