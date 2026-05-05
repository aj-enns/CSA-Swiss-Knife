---
description: "Role-aware daily routine. Runs your morning hygiene checks, surfaces what needs attention today, and suggests your top 3 actions."
---

# Daily

Run my morning routine based on my MCAPS role. Check what needs attention, flag risks, and give me a prioritized short list of actions for today.

## Steps

1. **Identify role** — first read `Reference/MyRoleDescriptions.md` from the Obsidian vault (`oil:search_vault` for "My Role"). If found, use that. If vault is unavailable, fall back to `crm_whoami`. Skip if already known this session.
2. **Prepare meeting notes for today** — retrieve today's calendar and ensure a vault meeting note exists for each meeting.
   - **Calendar retrieval** — try `m365-actions` first, fall back to WorkIQ if unavailable:
     - **Primary**: Delegate to `m365-actions` → `calendar:ListCalendarView` (start/end = today, UTC bounds).
     - **Fallback** (m365 MCP unavailable or errors): Use `ask_work_iq` directly from the parent agent:
       > "List all my meetings for today ({YYYY-MM-DD}). For each: title, start time, end time, attendees, organizer, customer/project if identifiable."
       Parse the WorkIQ response to build the same meeting list. Note: WorkIQ results may lack calendar metadata (response status, recurrence) — treat all returned meetings as accepted.
   - For each meeting on the calendar:
     a. `oil:search_vault({ query: "<Meeting Title>", filter_folder: "Meetings" })` — check if a note already exists for today's date + title.
     b. **No note found** → run meeting **Prep mode** (per `meeting.prompt.md`): gather vault customer context, recent M365 activity via WorkIQ, CRM pipeline state, then create `Meetings/<YYYY-MM-DD> - <Meeting Title>.md` via `oil:create_note` with pre-meeting context, carried-forward actions, suggested agenda, and attendees.
     c. **Note exists** → refresh: re-check carried-forward action items from prior meetings and update the Pre-Meeting Context section via `oil:atomic_replace` if stale.
   - Skip declined meetings and all-day events without agendas.
   - Output line in the summary: "N meeting notes prepared for today (M new, K refreshed)."
3. **Run role-specific checks** (execute the appropriate chain below):

### Specialist daily
- Run **pipeline-hygiene-triage**: flag stale opps, missing fields, close-date slippage.
- Run **risk-surfacing** on any Stage 2-3 opportunities with activity in the last 7 days.
- Output: a prioritized punch list — what needs my attention today, ordered by urgency.

### Solution Engineer daily
- Run **task-hygiene-flow**: check task records for stale, orphaned, or ownerless items.
- Run **vault-sync** Mode 5: Task Sync (batch): reconcile CRM task activity with vault milestone notes so the activity log is current.
- Run **execution-monitoring**: scan committed milestones for constraint breaches or blockers.
- Run **unified-constraint-check**: flag dispatch/eligibility gaps.
- Output: a categorized list — "Fix now", "Follow up", "On track".

### Cloud Solution Architect daily
- Run **execution-monitoring**: audit architecture decisions against dependency state.
- Check committed milestones for date drift via **milestone-health-review** (scoped to my milestones only).
- Output: a risk-ranked list of items needing intervention.

### CSAM daily
- Run **milestone-health-review**: scan committed milestones for drift, overdue items, stalled work.
- Run **risk-surfacing**: flag relationship decay or silent stakeholders.
- Output: "Customer-safe bullets" (shareable) + "Internal actions" (my to-do list).

4. **Present results** as a short, scannable summary:
   - **Today's meetings** — count and links to vault notes. Flag any meeting missing customer context.
   - **Top 3 actions** — numbered, with the actual prompt to run if I want to drill deeper.
   - **All clear items** — one line: "N milestones/opps on track, no action needed."
   - **Risks** — any early warnings, one sentence each.

## Tone

Morning briefing energy. Quick, direct, actionable. If everything looks good, say so and suggest something proactive instead.
