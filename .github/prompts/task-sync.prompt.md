---
description: "Sync MSX task activity to vault milestone notes. Reconciles CRM task records with Obsidian vault to maintain a durable SE activity log per milestone. Triggers: sync tasks, task sync, update task log, task activity, SE activity log, what have I done, milestone task history."
---

# Task Sync

Reconcile my CRM task records with the vault so each customer milestone note has an up-to-date activity log of what SEs have actually done.

## Steps

1. **Identify role and user** — vault `Reference/MyRoleDescriptions.md` (`oil:search_vault` for "My Role"), fallback `crm_whoami`. Capture display name and email for owner matching.

2. **Scope** — If user specified a customer name, scope to that customer. Otherwise, sweep all active customers from the vault roster.

3. **Gather CRM task data** — For each in-scope customer:
   1. `get_customer_context({ customer })` → extract opportunity GUIDs and milestone metadata from vault.
   2. `get_milestones({ opportunityIds: [...], statusFilter: 'active', includeTasks: true, format: 'triage' })` → retrieve milestones with inline tasks.
   3. For milestones with completed tasks of interest, also call `get_milestone_activities({ milestoneId })` if the triage payload lacks task detail (description, completion date, owner).

4. **Read existing vault activity log** — For each milestone with tasks:
   1. Resolve the vault note path: `Customers/<CustomerName>/milestones/<MilestoneName>.md` (preferred nested) or `Customers/<CustomerName>.md` (flat — check `## Milestones` section).
   2. `oil:read_note_section({ path, section: "Task Activity Log" })` — if the section exists, parse the existing table rows to determine which tasks are already logged (match by CRM task ID or task name + date).

5. **Diff and prepare appends** — For each milestone, compare CRM tasks against vault log:
   - **New tasks** (in CRM but not in vault log) → stage for append.
   - **Updated tasks** (status changed, e.g., reopened → closed) → stage for update.
   - **Already logged** → skip.

6. **Write to vault** — For each milestone note with new entries:
   1. If `## Task Activity Log` section does not exist, create it with the table header.
   2. Append new rows using `oil:atomic_append({ path, section: "Task Activity Log", content })`.
   3. Format per the schema below.

7. **Summary** — Present a table showing what was synced:

   | Customer | Milestone | Tasks Synced | New | Updated | Already Logged |
   |----------|-----------|-------------|-----|---------|----------------|

   End with: *"Task activity log is current. Run `/task-sync` anytime to re-sync, or use `/daily` which includes this check."*

## Task Activity Log Schema (Vault Note)

Append this section to each milestone note. Each row is one CRM task record.

```markdown
## Task Activity Log

<!-- Auto-synced from MSX CRM. Do not manually edit rows — use /task-sync to refresh. -->

| Date | Action | Task | Owner | Link |
|------|--------|------|-------|------|
| 2026-04-01 | ✅ Completed | POC: Copilot demo — initial setup | Jin Lee | [CRM](https://sales.microsoft.com/...) |
| 2026-03-28 | ✅ Completed | Technical review — architecture alignment | Jin Lee | [CRM](https://sales.microsoft.com/...) |
| 2026-03-25 | 🔄 Updated | Environment prep — HoK legal confirmed | Jin Lee | [CRM](https://sales.microsoft.com/...) |
```

### Column Definitions

| Column | Source | Format |
|--------|--------|--------|
| **Date** | Task `actualend` (closed) or `modifiedon` (updated) | `YYYY-MM-DD` |
| **Action** | Derived from task state | `✅ Completed`, `🔄 Updated`, `➕ Created`, `⏸️ On Hold` |
| **Task** | `subject` field from CRM task | Brief description |
| **Owner** | `_ownerid_value@OData.Community.Display.V1.FormattedValue` | Display name |
| **Link** | Deep link to CRM task record | `[CRM](https://sales.microsoft.com/...)` |

### Action Icons

| CRM State | Icon | When |
|-----------|------|------|
| Completed / Closed | ✅ Completed | `statecode = 1` or `statuscode = 5` |
| Active + recently modified | 🔄 Updated | `statecode = 0` and `modifiedon` within sync window |
| Newly created | ➕ Created | `createdon` within sync window |
| On Hold / Waiting | ⏸️ On Hold | `statuscode = 3` or `statuscode = 7` |

## Conflict Resolution

- **Duplicate detection**: Match on CRM task GUID (`activityid`). If the vault log has a `<!-- taskid:GUID -->` HTML comment after the row, use that. Otherwise, fuzzy-match on task subject + date ± 1 day.
- **Stale vault entry**: If a vault row shows a task that no longer exists in CRM (deleted), leave it but append `(removed from CRM)` to the Task column.
- **Manual vault entries**: Rows without a `<!-- taskid:... -->` marker are treated as manually authored — never overwrite or remove them.

## Tone

Utility. Report what was synced, flag any discrepancies, move on.
