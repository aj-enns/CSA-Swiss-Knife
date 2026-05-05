---
title: Skills & Instructions
description: How Copilot knows what to do — the 4-tier context loading model.
tags:
  - architecture
  - skills
  - instructions
hide:
  - toc
---

# Skills & Instructions

Copilot's domain expertise comes from plain Markdown files in `.github/`. These files teach Copilot the MCEM process model, role accountability rules, CRM query patterns, and domain playbooks.

---

## The 4-Tier Context Model

| Tier | Location | When Loaded | Best For |
|------|----------|-------------|----------|
| **Tier 0** | `copilot-instructions.md` | Every single turn | Global rules, routing, response style (~80 lines max) |
| **Tier 1** | `instructions/*.instructions.md` | When request matches `description` keywords | Operational contracts, workflow gates, schemas |
| **Tier 2** | `skills/*/SKILL.md` | When request matches `name`/`description` | Deep role playbooks, domain expertise |
| **Tier 3** | `documents/` | Only when explicitly read via tool call | Large reference material, specs, protocol docs |

**Rule of thumb:** Put universals in Tier 0, conditionals in Tier 1, role-specific depth in Tier 2, and bulky references in Tier 3.

---

## How Keyword Matching Works

Each instruction and skill file has YAML frontmatter with a `description` field. Copilot matches your prompt text against these descriptions to decide which files to load.

**Example:**

```yaml
---
name: milestone-health-review
description: 'Reviews committed milestone health, date drift, overdue 
  completions. Triggers: milestone health, governance prep, how are my 
  milestones, weekly status.'
---
```

When you ask _"How are my milestones doing?"_, Copilot sees the keyword overlap and loads this skill.

!!! tip "If a skill isn't activating"
    Check the `description` field. Does it contain words you'd actually use in your prompt? Add more trigger phrases.

---

## Role Cards (Tier 1)

Role cards define each MCAPS role's identity, accountability, and boundaries. These live as skills in `.github/skills/` for portability across all Copilot surfaces:

| Role Card | Who It's For |
|-----------|-------------|
| `role-specialist/SKILL.md` | Pipeline creation, opportunity qualification |
| `role-se/SKILL.md` | Technical proof execution, task hygiene |
| `role-csa/SKILL.md` | Architecture oversight, delivery ownership |
| `role-csam/SKILL.md` | Customer success, adoption, governance |

---

## Atomic Skills (Tier 2)

27 domain skills that activate on demand:

??? abstract "Full skill list"
    
    | Skill | Purpose |
    |-------|---------|
    | `pipeline-qualification` | Qualify new opportunities (Stages 1-2) |
    | `pipeline-hygiene-triage` | Flag pipeline issues for forecast prep |
    | `milestone-health-review` | Review committed milestone health |
    | `proof-plan-orchestration` | Build technical proof plans |
    | `risk-surfacing` | Proactive risk identification |
    | `handoff-readiness-validation` | Cross-role handoff quality |
    | `mcem-stage-identification` | Identify current MCEM stage |
    | `exit-criteria-validation` | Check stage exit criteria |
    | `commit-gate-enforcement` | Pre-commit readiness check |
    | `non-linear-progression` | Stage regression advisor |
    | `role-orchestration` | Next-action team routing |
    | `execution-authority-clarification` | Authority tie-breaking |
    | `delivery-accountability-mapping` | RACI classification |
    | `execution-monitoring` | CSA guardrail scanning |
    | `task-hygiene-flow` | SE task-record inspector |
    | `unified-constraint-check` | Unified dispatch readiness |
    | `customer-outcome-scoping` | KPI definition workshop |
    | `customer-evidence-pack` | Communication evidence assembly |
    | `adoption-excellence-review` | Usage telemetry audit |
    | `value-realization-pack` | Outcome measurement validation |
    | `expansion-signal-routing` | Upsell/cross-sell routing |
    | `architecture-feasibility-check` | Build feasibility review |
    | `architecture-execution-handoff` | Handoff document generator |
    | `partner-motion-awareness` | Partner-led motion adjustments |
    | `account-landscape-awareness` | Cross-role pipeline visibility |
    | `account-structure-diagram` | Excalidraw visual diagrams |
    | `morning-brief` | Daily briefing with parallel retrieval |
    | `workiq-query-scoping` | M365 search optimization |
    | `pbi-prompt-builder` | Power BI prompt builder |

---

## Skill Chaining

Skills can chain together. Each skill's documentation specifies which other skills it chains with:

<div class="grid cards" markdown>

-   :material-chart-timeline:{ .lg .middle } **Weekly Pipeline Review**

    ---

    `pipeline-hygiene-triage` :octicons-arrow-right-16: `handoff-readiness-validation` :octicons-arrow-right-16: `risk-surfacing`

-   :material-shield-check:{ .lg .middle } **Pre-Governance Prep**

    ---

    `mcem-stage-identification` :octicons-arrow-right-16: `milestone-health-review` :octicons-arrow-right-16: `customer-evidence-pack`

-   :material-gate:{ .lg .middle } **Commit Decision**

    ---

    `commit-gate-enforcement` :octicons-arrow-right-16: `non-linear-progression` :octicons-arrow-right-16: `delivery-accountability-mapping`

</div>

You don't need to specify chains — just describe the outcome you want and Copilot orchestrates the right sequence.
