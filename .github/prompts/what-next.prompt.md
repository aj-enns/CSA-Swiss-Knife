---
description: "Not sure what to do? Scans your pipeline and milestones to suggest the highest-impact action right now. Great for context-switching or idle moments."
---

# What Next

I have a few minutes — what's the most valuable thing I can do right now?

## Steps

1. **Identify role** — first read `Reference/MyRoleDescriptions.md` from the Obsidian vault (`oil:search_vault` for "My Role"). If found, use that. If vault is unavailable, fall back to `crm_whoami`. Skip if already known.
2. **Quick scan** — based on role, run a lightweight check:

### Specialist
- `get_my_active_opportunities` → sort by close date proximity and stage.
- Flag: any opp closing within 14 days missing required fields? Any Stage 2 deal idle > 7 days?

### Solution Engineer
- `get_milestones({ mine: true, format: 'triage', includeTasks: true })` → pre-classified into overdue/due_soon/blocked/on_track.
- Flag: overdue tasks, unassigned tasks, proofs approaching deadline.

### Cloud Solution Architect
- `get_milestones({ mine: true, format: 'triage', includeTasks: true })` → focus on blocked/overdue buckets.
- Flag: proofs concluding soon that need architecture review.

### CSAM
- `get_milestones({ mine: true, format: 'triage', includeTasks: true })` → focus on overdue and due_soon buckets.
- Flag: milestones pending commit-gate flip, customers with zero touchpoints this week.

3. **Recommend exactly 3 actions** — numbered, ordered by urgency:
   - **Action 1**: The most time-sensitive item (deadline, overdue, or blocked).
   - **Action 2**: A quick win that improves data quality (field cleanup, task update, etc.).
   - **Action 3**: A proactive move (risk check, evidence capture, stakeholder outreach).

   For each action:
   - One sentence: what and why.
   - The exact prompt to run (or offer to run it directly).
   - Estimated effort: "~2 min", "~5 min", "~15 min".

4. **If nothing is urgent**: Say *"Your pipeline looks healthy. Here's something proactive:"* and suggest one of:
   - Run a risk review on your largest deal
   - Check adoption health on a deployed engagement
   - Prep for your next governance meeting

## Tone

Concise and decisive. Don't list everything — curate. The user wants to be told what to do, not shown a dashboard.
