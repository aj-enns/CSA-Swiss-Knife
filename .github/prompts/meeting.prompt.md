---
description: "Unified meeting workflow — prep before or process after. Auto-detects mode from input: meeting name/title → Prep mode (pre-populate from vault/CRM/M365), raw notes/transcript → Process mode (structure into formatted note + update vault). Triggers: meeting, prepare meeting, process meeting, meeting prep, meeting notes, structure notes, pre-meeting, post-meeting."
---

# Meeting — Prep or Process

One prompt for the full meeting lifecycle. **Auto-detects** whether you need pre-meeting prep or post-meeting processing.

## Mode Auto-Detection

| Input | Mode | What Happens |
|---|---|---|
| Meeting title or customer name | **Prep** | Pre-populate note with vault context, CRM state, M365 activity |
| Pasted text, transcript, or screenshot | **Process** | Structure raw notes into formatted meeting note + update vault |
| Ambiguous | **Ask** | "Are you preparing for a meeting, or processing notes from one?" |

**Override keywords**: "prep", "prepare", "before" → Prep mode. "process", "structure", "notes from", "recap" → Process mode.

---

## Shared — Vault Resolution

Both modes start here:
1. `oil:search_vault({ query: "<customer name>", filter_folder: "Customers" })` → match customer
2. `oil:search_vault({ query: "<project name>", filter_folder: "Projects" })` → match project
3. `oil:search_vault({ query: "<attendee name>", filter_folder: "People" })` → identify known attendees

---

## Prep Mode — Before the Meeting

Generate a pre-populated meeting note for an upcoming meeting. Pulls context from vault, CRM, and M365.

### Step 1 — Gather Vault Context

- `oil:get_customer_context({ customer: "<Name>" })` → account summary, team, opportunities, recent notes, agent insights.
- `oil:query_notes({ where: { customer: "<name>", tags: "meeting" }, folder: "Meetings", limit: 5, order_by: "-modified" })` → last 3-5 related meetings.

### Step 2 — M365 Context via WorkIQ

> "Summarize meetings with {customer} or {attendees} in the last 14 days. Include key discussion points, decisions made, and any open questions."

> "Find recent email threads or Teams messages about {customer/project} in the last 14 days. Summarize decisions, asks, or blockers."

### Step 3 — CRM Validation

If customer is tracked:
- `list_opportunities({ customerKeyword: "<customer>", format: "full", includeDealTeam: true })` → current pipeline state.
- `find_milestones_needing_tasks({ customerKeywords: ["<customer>"] })` if relevant.

### Step 4 — Write Meeting Note

Save to `Meetings/<YYYY-MM-DD> - <Meeting Title>.md` via `oil:write_note`:

```markdown
---
tags: [meeting]
date: {YYYY-MM-DD}
customer: {customer name}
project: {project name or null}
summary:
status: open
action_owners: []
---

# {Meeting Title}

**Date:** [[{YYYY-MM-DD}]]
**Customer:** [[{Customer}]]
**Project:** [[{Project}]]

## Pre-Meeting Context
> **Customer:** {brief context from vault}
> **Project Status:** {current status from vault/CRM}
> **Last Meeting:** [[{last meeting}]] — {summary}

## Recent M365 Activity
> {Decisions/commitments from email/chat — last 14 days}

## Carried-Forward Action Items
- [ ] {open action from previous meeting} ([[{Owner}]])

## Suggested Agenda
1. Review action items from [[{last meeting}]]
2. {topic based on project/milestone status}
3. {topic based on open items}

## Attendees
- [[{Known Stakeholder}]] — {role}

## Notes
-

## Action Items
- [ ]

## Key Decisions
-
```

---

## Process Mode — After the Meeting

Structure raw meeting input (transcript, pasted notes, screenshot text, Copilot recap) into a complete meeting note. Update related vault notes.

### Step 1 — Extract & Structure

From raw input, extract:
- **Date** → `date` frontmatter (YYYY-MM-DD)
- **Customer** → match to `Customers/` filename
- **Project** → match to `Projects/` filename
- **Summary** → one sentence
- **Attendees** → `[[wiki-links]]` to People notes
- **Action items** → checkboxes with `([[Owner]])` attribution
- **Key decisions** → bullet list with rationale
- **Technologies** → Azure services, frameworks, tools mentioned

### Step 2 — Write Meeting Note

Save to `Meetings/<YYYY-MM-DD> - <Meeting Title>.md` via `oil:write_note`:

```markdown
---
tags: [meeting]
date: {YYYY-MM-DD}
customer: {customer name}
project: {project name or null}
summary: {one sentence}
status: open
action_owners: [{Person A}, {Person B}]
---

# {Meeting Title}

**Date:** [[{YYYY-MM-DD}]]
**Customer:** [[{Customer}]]
**Project:** [[{Project}]]

## Attendees
- [[Person 1]] — {role/company}
- [[Person 2]]

## Notes
**{Topic 1}**
- Key point
- *Technologies:* {Azure services}

## Action Items
- [ ] {Action} ([[{Owner}]])

## Key Decisions
- {Decision 1}: {rationale}
```

### Step 3 — Enrich via WorkIQ

> "Find the transcript or Copilot recap for the meeting on {date} with {attendees}. Extract action items, decisions, or follow-ups not in the raw notes."

Fill gaps: action items from transcript, context for decisions, contradictions with prior agreements.

### Step 4 — Update Related Notes

1. **Customer file**: `oil:patch_note` → append meeting summary to `## Notes` on `Customers/<Name>.md`
2. **New people**: List attendees without a `People/` note → offer to create via `vault-sync` Mode 3b (create from context)
3. **Action items**: If referencing a project, `oil:patch_note` → append to project's `## Open Items`

---

## Follow-Up Suggestions

After **Prep**: *"After the meeting, paste your notes here and I'll process them."*
After **Process**: *"Want me to create People notes for the new contacts?"* / *"Run `/account-review` for {customer}?"*

## Rules

1. **Wiki-links everywhere**: `[[Person]]`, `[[Customer]]`, `[[Project]]`, `[[Meeting]]`
2. **Don't overwrite**: If a note exists, read first and merge — never clobber manual edits
3. **Valid YAML frontmatter**: No tabs, proper quoting
4. **Clean meeting titles**: Remove prefixes (INT, MSFT -) for readability
5. **Skip non-meetings**: Ignore focus time, OOF, all-day events without attendees
6. **Flag unknowns**: Attendees not in `People/` get ⚠️ marker
