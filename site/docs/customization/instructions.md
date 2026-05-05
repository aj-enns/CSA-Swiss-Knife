---
title: Editing Instructions
description: Change Copilot's behavior by editing Markdown files.
tags:
  - customization
  - instructions
hide:
  - toc
---

# Editing Instructions

## How Copilot Custom Instructions Work

GitHub Copilot looks for special files in `.github/` and loads them automatically:

| File / Folder | What Copilot Does |
|--------------|-------------------|
| `.github/copilot-instructions.md` | **Always loaded.** The "system prompt" — top-level rules. |
| `.github/instructions/*.instructions.md` | **Loaded when relevant.** Matched by `description` keywords. |
| `.github/skills/*/SKILL.md` | **Loaded on demand.** Deep role/domain playbooks. |
| `.github/prompts/*.prompt.md` | **Reusable templates.** Slash commands in VS Code. |

No registration needed — just create or edit files and Copilot picks them up.

---

## Example 1: Change Response Style

Edit `.github/copilot-instructions.md`:

```markdown
## Response Expectations

- Keep outputs concise and action-oriented.
- Use bullet points, not paragraphs.
- Lead with the answer, then context.
```

---

## Example 2: Add Workflow Rules

Create `.github/instructions/deal-review-checklist.instructions.md`:

```markdown
---
description: "Deal review checklist and qualification gates. 
  Triggers: deal review, pipeline call, qualification."
---

# Deal Review Checklist

Before any deal review, verify:
- [ ] Customer pain confirmed in their own words
- [ ] Technical win plan documented
- [ ] Competitor landscape noted
- [ ] Next steps have owners and dates
```

---

## Example 3: Customize Role Cards

Role cards in `.github/instructions/role-card-*.instructions.md` define each role's identity. You can:

- Add team-specific accountability rules
- Adjust boundary definitions between roles
- Include your org's specific escalation patterns

---

## Example 4: Create Reusable Prompts

Files in `.github/prompts/` become slash commands:

```markdown
---
description: "Prepare a quarterly business review deck."
---

# Quarterly Review Prep

1. Use `list_opportunities` for {customer}
2. Use `get_milestones` for each — summarize status
3. Use `ask_work_iq` — find recent executive communications
4. Format as QBR summary: pipeline, delivery, risks, asks
```

After saving, type `/` in Copilot chat to see it.
