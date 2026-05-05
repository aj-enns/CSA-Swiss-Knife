---
description: "Automated morning prep — populates today's daily note and creates meeting prep skeletons using WorkIQ, OIL, and msx. Designed for non-interactive copilot CLI execution."
---

# Morning Prep — {{TODAY}}

You are running the user's automated morning prep routine. Today is **{{TODAY}}**. First, read `Reference/MyRoleDescriptions.md` from the Obsidian vault (`oil:search_vault` for "My Role") to identify the user's name and role. If vault is unavailable, fall back to `crm_whoami`. Use their name and role throughout this workflow.

Your job: populate today's daily note and create pre-filled meeting prep notes for each meeting on today's calendar. Use all available MCP tools.

## Step 1: Get today's meetings via m365-actions

Delegate to the `m365-actions` subagent to retrieve today's calendar events:
> "Use ListCalendarView to get today's meetings and calls. For each event, return: meeting title, start time, attendees (names and emails), and any meeting body/description text."

For each event, extract:
- Meeting title
- Start time
- Attendees (names and emails)
- Any meeting body/description text

## Step 2: Identify customers and projects for each meeting

For each meeting:
1. **Match attendees/title to vault entities** — use OIL tools (`search_vault`, `get_customer_context`) to identify which Customer and Project each meeting relates to.
2. If a customer or project can't be identified, note it as "Unlinked" so Jin can triage manually.

## Step 3: Pull msx context for linked meetings

For each meeting that maps to a known customer:
1. Use `list_opportunities({ customerKeyword: "<customer>", format: "full", includeDealTeam: true })` to get active opportunities with stage/estimated close/deal-team context.
2. If customer-keyword lookup returns empty but milestones exist, derive opportunity IDs from milestone payload and call `list_opportunities({ opportunityIds: ["<guid>"], format: "full", includeDealTeam: true })`.
2. Use `get_milestones` to get milestones approaching their dates (next 30 days) or flagged as Blocked.
3. Note any milestones missing tasks (use `find_milestones_needing_tasks` scoped to the customer).

## Step 4: Pull vault context via OIL

For each meeting's customer/project:
1. Get the last 3 meetings with that customer (from `Meetings/` folder via OIL search).
2. Get open action items from those meetings.
3. Get current project status from the project note.

## Step 5: Create the daily note

Create or update the file `Daily/{{TODAY}}.md` in the vault with this structure:

```markdown
---
tags: [dailyNote]
date: {{TODAY}}
---

# {{TODAY}} — {Day of Week}

[[{yesterday's date}]] | [[{tomorrow's date}]]

## Schedule Overview

| Time | Meeting | Customer | Priority |
|------|---------|----------|----------|
| {time} | [[{{TODAY}} - {Meeting Title}]] | [[{Customer}]] | {🔴 High / 🟡 Medium / 🟢 Low} |

> Assign priority based on: customer-facing = 🔴, cross-team with action items = 🟡, informational/optional = 🟢

## Focus

- {Top 1-3 priorities based on meetings, upcoming milestones, and open actions}

## Meetings Today

{For each meeting, a brief one-liner with the wiki-link and key context}

## MSX Alerts

{Any milestones due this week, blocked items, or opportunities needing attention — pulled from msx}

## Notes

-

## Tasks
- [ ]
```

## Step 6: Create individual meeting prep notes

For each meeting today, create a file at `Meetings/{{TODAY}} - {Clean Meeting Title}.md`:

```markdown
---
tags:
  - meeting
date: {{TODAY}}
customer: {Customer name or null}
project: {Project name or null}
summary:
status: open
action_owners: []
---

# {Meeting Title}

**Date:** [[{{TODAY}}]]
**Customer:** [[{Customer}]]
**Project:** [[{Project}]]
**Time:** {Start time}

## Pre-Meeting Context
> **Customer:** {1-2 sentence customer context from vault}
> **Project Status:** {current status from project note}
> **Last Meeting:** [[{last meeting file}]] — {one-line summary}

## MSX Context
> **Active Opportunities:** {count} — {list top 2-3 by priority}
> **Upcoming Milestones:** {milestones due in next 30 days for this customer}
> **Blocked Items:** {any blocked milestones}
> **Milestones Needing Tasks:** {count}

## Carried-Forward Action Items
- [ ] {open action from previous meetings} (@{Owner})

## Suggested Agenda
1. Review action items from [[{last meeting}]]
2. {topic based on project status or milestone alerts}
3. {topic based on open items}

## Attendees
- [[{Known Person}]] — {role/title}
- {Unknown attendee name} ({email}) — ⚠️ Not in vault

## Notes
-

## Action Items
- [ ]

## Key Decisions
-
```

## Rules

1. **Wiki-links everywhere**: `[[Person]]`, `[[Customer]]`, `[[Project]]`, `[[Meeting]]`
2. **Don't overwrite existing notes**: If a daily note or meeting note already exists, read it first and merge — don't clobber manual edits.
3. **Frontmatter must be valid YAML**: No tabs, proper quoting.
4. **Meeting titles**: Clean up auto-generated titles — remove prefixes like "INT", "Int –", "MSFT -" for readability but keep them recognizable.
5. **Skip non-meeting events**: Ignore focus time blocks, OOF, or all-day events without attendees.
6. **Flag unknowns**: If an attendee isn't in the `People/` folder, note their name and email with a ⚠️ marker.
7. **Be concise**: Each section should be scannable. Bullet points, not paragraphs.
