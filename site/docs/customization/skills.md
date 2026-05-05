---
title: Writing Skills
description: Create new domain skills for your team's specific workflows.
tags:
  - customization
  - skills
hide:
  - toc
---

# Writing Skills

Skills are focused domain playbooks in `.github/skills/*/SKILL.md`. Each skill teaches Copilot a specific workflow — how to check milestone health, qualify a deal, run a risk review, etc.

---

## Skill Structure

```
.github/skills/my-new-skill/
└── SKILL.md
```

Every skill needs YAML frontmatter:

```yaml
---
name: my-new-skill
description: 'What this skill does and when to activate it. 
  Triggers: keyword1, keyword2, keyword3, when to use it.'
argument-hint: 'What inputs to ask the user for.'
---
```

### Key Fields

| Field | Purpose | Tips |
|-------|---------|------|
| `name` | Internal identifier | Kebab-case, descriptive |
| `description` | **The trigger.** Copilot matches your prompt against this. | Make it keyword-rich. Include variations of how users might phrase requests. |
| `argument-hint` | Tells Copilot what inputs to gather | e.g., "Provide opportunityId(s) or customer name" |

---

## Skill Body

After the frontmatter, write the workflow as a step-by-step guide:

```markdown
## Flow

1. **Gather context** — Use `list_opportunities` to get active pipeline.
2. **Check hygiene** — For each opportunity, verify:
   - Close date is within the quarter
   - Stage matches last activity date
   - Required fields are populated
3. **Classify issues** — Group by severity (blocking, degraded, minor).
4. **Output** — Produce an exception report per the Output Schema below.

## Decision Logic

- If close date is >30 days past: **blocking**
- If stage hasn't changed in >14 days: **degraded**
- If description is empty: **minor**

## Output Schema

| Field | Description |
|-------|-------------|
| opportunity_name | Name of the flagged opportunity |
| issue_type | blocking / degraded / minor |
| recommended_action | What to fix |
```

---

## Tips

1. **Keep it under 150 lines.** Copilot's context window is limited.
2. **Make the description keyword-rich.** This is the single most important line.
3. **Include chain declarations.** If your skill chains with others, mention it:
   ```markdown
   ## Chains With
   - `risk-surfacing` (after this skill completes)
   - `pipeline-hygiene-triage` (before this skill)
   ```
4. **Test with varied phrasing.** Ask the same question 3–4 different ways and see if the skill activates each time.

---

## Example: Team-Specific Skill

```markdown
---
name: fasttrack-milestone-review
description: 'FastTrack-specific milestone review with delivery timeline 
  constraints. Triggers: FastTrack review, FT milestone, FastTrack health.'
argument-hint: 'Provide customer name or opportunity ID.'
---

## Flow

1. Get milestones using `get_milestones` for the specified opportunity.
2. Apply FastTrack delivery timeline rules:
   - Architecture review must complete within 2 weeks of kickoff
   - POC must have exit criteria defined before start
3. Flag violations and produce remediation list.
```
