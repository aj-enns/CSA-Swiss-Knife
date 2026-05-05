---
name: workiq-operations
description: "WorkIQ read-only operations: meeting action items, channel digest and audit, daily Outlook triage, email analytics, meeting cost, Planner search, org chart, and SharePoint exploration — all via ask_work_iq. Triggers: action items from meeting, meeting follow-ups, channel digest, channel audit, inactive Teams channels, daily triage, inbox analytics, email patterns, meeting cost, meeting hours, Planner search, org chart, manager chain, reporting structure, SharePoint browse, site explorer, what happened in my channels, what does my day look like, who emails me most, how much time in meetings, what tasks are assigned."
---

# WorkIQ Operations

All operations use `workiq:ask_work_iq`. For targeted single-source M365 ops (specific email, Teams thread, calendar event), use the `m365-query-patterns` skill and delegate to `@m365-actions` instead.

## Meeting Action Items

Extract structured follow-ups from a meeting.

1. Locate the target meeting by title, keyword, or `latest` (default: today).
2. Pull Teams meeting chat messages.
3. Extract action language, owners, due dates, and unresolved asks.
4. Return structured list grouped by owner: `Action Item`, `Owner`, `Due Date`, `Priority`, `Evidence Snippet`.

**Guardrails**: Mark ambiguous owners as unresolved. Unlabeled due dates → `TBD`. Read-only — do not create tasks.

## Channel Digest

Summarize Teams channel activity over a bounded time range (default: last 24 hours).

1. Discover relevant teams and channels.
2. Pull messages for the lookback period.
3. Summarize: `Decisions`, `Key Discussions`, `Action Items`, `Announcements / Files` — grouped by channel.

**Guardrails**: Always state the lookback window. Narrow to active channels first. For specific thread retrieval, use `@m365-actions`.

## Channel Audit

Inventory teams and channels, flag inactivity (default lookback: 30 days).

1. List teams and their channels.
2. Retrieve recent activity windows.
3. Flag inactive, low-signal, or duplicate-looking channels.
4. Return: `Team / Channel`, `Type`, `Last Activity`, `Observed Signal`, `Audit Note`.

**Guardrails**: Do not recommend automated deletion. Distinguish inactive from low-volume-but-important.

## Daily Outlook Triage

Summarize email inbox + today's calendar for day planning.

1. Pull unread and recent inbox emails (default: last 24 hours).
2. Pull today's meetings.
3. Return: `Priority Emails`, `Today's Meetings`, `Risks / Conflicts`, `Suggested Next Focus`.

**Guardrails**: State the time window. For send/reply, hand off to `@m365-actions`.

## Email Analytics

Inbox pattern analysis over a bounded time range (default: last 7 days).

1. Pull received and sent emails for the period.
2. Aggregate volume, top senders, unread count, flagged items, attachment patterns.
3. Return: `Volume Summary`, `Top Senders`, `Unread / Flagged Backlog`, `Notable Patterns`.

**Guardrails**: Include date range. Don't claim exact response-time metrics without sufficient data. For individual emails, use `@m365-actions`.

## Meeting Cost Calculator

Estimate calendar load and meeting cost (default: current week).

1. Get user profile, timezone, and working hours.
2. Pull meetings for the time window.
3. Sum duration, attendee counts, and overlap against working hours.
4. Return: `Meeting Hours`, `Hours Inside vs Outside Working Time`, `Heaviest Days`, `Largest Meetings`, `Load Observations`.

**Guardrails**: Present as estimates unless user provides cost basis.

## Planner Search

Search tasks across Planner plans by person, keyword, due date, or status.

1. Retrieve available plans.
2. Query matching tasks with bounded filters.
3. Return grouped by plan: `Plan`, `Task`, `Assigned To`, `Due Date`, `Status`.

**Guardrails**: Filter before broadening. If too many results, recommend narrower filter.

## Org Chart

People hierarchy lookup by name or email.

1. Resolve the person.
2. Retrieve manager, direct reports, and nearby hierarchy.
3. Return: `Person`, `Manager`, `Direct Reports`, `Relevant Org Context`.

**Guardrails**: Ambiguous name → ask for disambiguator. Don't infer hierarchy not returned by WorkIQ.

## SharePoint / OneDrive Explorer

Discover sites, lists, libraries, folders, and file contents.

1. Discover sites by name or list accessible sites.
2. Explore lists and libraries on a chosen site.
3. Drill into schemas, items, folders, or files.

Navigation: Site discovery → Library inventory → Schema/contents → File preview.

**Guardrails**: Start broad only when site is unknown. For file changes or sharing, use `@m365-actions`.
