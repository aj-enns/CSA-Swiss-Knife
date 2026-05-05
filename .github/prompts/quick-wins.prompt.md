---
description: "5-minute pipeline cleanup — fix the low-hanging CRM hygiene issues that accumulate. Run anytime to keep your data clean."
---

# Quick Wins

Find and fix CRM hygiene issues I can knock out in under 5 minutes. No deep analysis — just cleanup.

## Steps

1. **Identify role** — first read `Reference/MyRoleDescriptions.md` from the Obsidian vault (`oil:search_vault` for "My Role"). If found, use that. If vault is unavailable, fall back to `crm_whoami`. Skip if already known.
2. **Scan for hygiene issues**:
   - `get_my_active_opportunities` → check each for: missing close date, no solution play, stale stage (no activity > 30 days), empty description.
   - For CSAM/CSA: `get_milestones({ mine: true })` → overdue milestones, milestones with no tasks, tasks with no owner.
   - For SE: check task records → overdue, no status update in 14+ days, missing blocker notes on blocked items.
3. **Present as a checklist** — max 5 items, each with:
   - What's wrong (one line)
   - The fix (one line)
   - Offer to do it: *"Want me to update this?"* (triggers the staged write flow)

## Example output

```
⬜ Contoso AI Migration — close date is 45 days past. Update or push?
⬜ Fabrikam Pilot — no solution play set. Should I set it to "Azure AI"?
⬜ Northwind task "Env Setup" — marked In Progress but due date was Feb 15. Close or reschedule?
```

## After fixes

Say: *"Done — [N] items cleaned up. Run `/daily` tomorrow to catch new ones."*

## Tone

Checkbox energy. Fast, satisfying, no analysis paralysis.
