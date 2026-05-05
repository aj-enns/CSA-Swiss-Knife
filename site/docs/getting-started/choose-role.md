---
title: Choose Your Role
description: Tell Copilot your MCAPS role so it tailors its behavior to your workflows.
tags:
  - getting-started
  - roles
hide:
  - toc
---

# Choose Your Role

<div class="timeline-nav">
<a href="../" class="tl-step done"><div class="tl-node"><span class="tl-num">1</span></div><div class="tl-label">Getting Started</div></a>
<a href="../start-servers/" class="tl-step done"><div class="tl-node"><span class="tl-num">2</span></div><div class="tl-label">Verify Installation</div></a>
<a href="../first-chat/" class="tl-step done"><div class="tl-node"><span class="tl-num">3</span></div><div class="tl-label">First Chat</div></a>
<a href="./" class="tl-step active"><div class="tl-node"><span class="tl-num">4</span></div><div class="tl-label">Choose Role</div></a>
</div>

Copilot automatically detects your role from CRM, but you can also tell it explicitly. This takes 30 seconds and dramatically improves the relevance of its guidance.

---

## Auto-Detect (Recommended)

Just type:

```
/my-role
```

Copilot calls `crm_whoami`, looks at your role assignments, and confirms what it found. It then shows you a menu of actions tailored to your role.

---

## Or Tell It Directly

If auto-detection doesn't work or you want to set context explicitly:

```
I'm a Specialist. What should I focus on today?
```

---

## What Each Role Gets

<div class="grid cards" markdown>

-   :material-briefcase-outline:{ .lg .middle } __[Account Executive (AE)](../prompts/by-role.md#account-executive)__

    ---

    **Customer relationship owner & strategic orchestrator**

    - Account planning & MACC execution
    - Pipeline generation & commercial excellence
    - Cross-team account leadership
    - Executive sponsor engagement

-   :material-factory:{ .lg .middle } __[Industry Advisor (IA)](../prompts/by-role.md#industry-advisor)__

    ---

    **Industry-focused opportunity creator & pipeline accelerator**

    - Industry use case specialization
    - Proactive Stage 1 pipeline creation
    - Industry partner sales & co-innovation
    - Multi-account ROTH expansion

-   :material-chart-line:{ .lg .middle } __[Specialist (STU)](../prompts/by-role.md#specialist)__

    ---

    **Pipeline builder & deal driver**

    - Opportunity qualification
    - Forecast hygiene
    - Stage 2–3 progression
    - STU-to-CSU handoff checklists

-   :material-wrench:{ .lg .middle } __[Solution Engineer (SE)](../prompts/by-role.md#solution-engineer)__

    ---

    **Technical proof executor & HoK driver**

    - POC/Pilot/Demo/HoK management
    - Task-record hygiene
    - BANT qualification support
    - SE-to-CSU handoff

-   :material-vector-polygon:{ .lg .middle } __[Cloud Solution Architect (CSA)](../prompts/by-role.md#cloud-solution-architect)__

    ---

    **Architecture & execution owner**

    - Technical proof oversight
    - Guardrail enforcement
    - Value-realization validation
    - Architecture handoff documents

-   :material-shield-check:{ .lg .middle } __[CSAM](../prompts/by-role.md#csam)__

    ---

    **Customer-success orchestrator**

    - Governance cadence
    - Success-plan alignment
    - Adoption tracking
    - Commit-readiness gates

-   :material-compass-outline:{ .lg .middle } __[Account Technology Strategist (ATS)](../prompts/by-role.md#account-technology-strategist)__

    ---

    **AI & Security strategy leader**

    - Customer technology relationship management
    - AI and Security strategy alignment
    - Technical team orchestration
    - Consumption growth through technology adoption

-   :material-account-tie:{ .lg .middle } __[ATU Sales Director](../prompts/by-role.md#atu-sales-director)__

    ---

    **Sales leader & coaching orchestrator**

    - Pipeline governance & coverage
    - MACC budget execution
    - Team coaching & people leadership
    - Red Carpet compliance

</div>

---

## You're All Set! :tada:

You've completed the setup. Here's what to do next:

| What | Where |
|------|-------|
| **Follow the guided experience** | [Day 1: Hello MCAPS IQ →](../guided/day-1-hello.md) |
| **Explore prompts for your role** | [Prompts by Role →](../prompts/by-role.md) |
| **Try multi-skill chains** | [Multi-Skill Chains →](../prompts/multi-skill-chains.md) |
| **Set up Obsidian vault** | [Obsidian Integration →](../integrations/obsidian.md) |

!!! tip "Recommended: Follow the Guided Experience"
    The [Guided Experience](../guided/index.md) walks you through progressively powerful scenarios over 5 days — from basic reads to multi-skill orchestration chains that will change how you work. This is the fastest path to your **lightbulb moment**.

[:octicons-rocket-16: Start the Guided Experience](../guided/index.md){ .md-button .md-button--primary }
[:octicons-list-unordered-16: Browse All Prompts](../prompts/index.md){ .md-button }
