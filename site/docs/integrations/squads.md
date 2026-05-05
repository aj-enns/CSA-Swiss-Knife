---
title: Squads — Multi-Agent Teams
description: Add a persistent AI agent team to your MCAPS IQ workspace using Squad CLI. Experimental integration for advanced multi-agent workflows.
tags:
  - integrations
  - squads
  - agents
  - experimental
---

# Squads — Multi-Agent Teams

!!! warning "Experimental"
    Squads is a **highly experimental** integration. Multi-agent orchestration can deliver real benefits — parallel workstreams, role-specialized reasoning, accumulated per-agent knowledge — but it comes with significant trade-offs. Without a clear understanding of *what you want each agent to do*, you can easily end up with unnecessary complexity, unpredictable routing, slow execution, and inflated token costs. **Start with single-agent MCAPS IQ first.** Only reach for Squads when you've hit a ceiling that single-agent workflows can't address.

---

## What Is Squad?

[Squad](https://github.com/bradygaster/squad) gives you a **persistent team of AI agents** that live in your repo as files. Each agent has a role, a name, accumulated knowledge, and shared decision history — they get better the more you use them.

Squad agents use the same MCP servers (MSX CRM, M365, Power BI, OIL) that MCAPS IQ already provides. They just divide the work across specialized roles.

---

## Why Consider It

<div class="grid cards" markdown>

-   :material-account-group:{ .lg .middle } __Parallel Workstreams__

    ---

    Ask your squad to "prep for the QBR" and multiple agents work simultaneously — one pulls pipeline data, another builds the deck, a third drafts follow-ups.

-   :material-brain:{ .lg .middle } __Accumulated Knowledge__

    ---

    Each agent writes learnings to its `history.md`. After a few sessions, they know your accounts, your talk tracks, and your preferences.

-   :material-git:{ .lg .middle } __Version-Controlled Team__

    ---

    The whole squad lives in `.squad/` — commit it, and anyone who clones the repo gets the same team with the same knowledge.

-   :material-account-cog:{ .lg .middle } __Role-Specialized Reasoning__

    ---

    Instead of one generalist agent doing everything, each squad member focuses on what they do best — data synthesis, win strategy, artifact building, deal coaching.

</div>

---

## When NOT to Use Squads

Multi-agent setups carry real costs. Avoid Squads if:

- **You haven't mastered single-agent MCAPS IQ yet.** Learn what the agent can do before splitting it into multiple agents.
- **Your workflows are sequential.** If tasks run one-at-a-time anyway, multiple agents add latency and routing overhead with no benefit.
- **You can't articulate what each agent should own.** Vague role boundaries cause agents to duplicate work, contradict each other, or spin on routing decisions.
- **Performance matters.** Multi-agent orchestration multiplies LLM round-trips. A single complex request can generate 10–20× more API calls than the same request through a single agent.
- **You want deterministic output.** Agent-to-agent handoffs introduce non-determinism at every boundary. The more agents, the harder to reproduce results.

---

## Recommended Role Configuration

If you do adopt Squads, MCAPS IQ recommends a **core 5 + optional 6th** agent team:

| # | Role | What They Do |
|---|------|-------------|
| 1 | **Experience Orchestrator** | Routes work to specialists, assembles seller-ready bundles |
| 2 | **Data & Signal Synthesizer** | Builds truth sets from CRM + PBI + M365 signals |
| 3 | **Sales Excellence & Win Strategy Lead** | Converts signals into winning plays, programs, and positioning |
| 4 | **Artifact Builder** | Produces demos, POV decks, scripts, workshop kits |
| 5 | **Contrarian Coach** | Red-teams the plan, surfaces objections, coaches readiness |
| 6 | **Work Context Comms Agent** _(optional)_ | Drafts briefs, follow-ups, recaps, and action lists |

Plus **7 additional optional roles** mapped to existing MCAPS IQ skills — portfolio strategy, deal governance, pricing, BI analytics, impact evidence, partner motions, and enablement coaching.

??? note "Detailed role descriptions"

    ### Experience Orchestrator
    Routes work to the right specialists and assembles a "seller-ready experience bundle." The front door for complex requests — breaks parallel workstreams and returns one coherent output.

    ### Data & Signal Synthesizer
    Builds the data model / truth set by pulling and normalizing signals from Power BI, CRM pipeline state, and M365 activity into a single source of truth.

    ### Sales Excellence & Win Strategy Lead
    Converts truth-set signals into the best way to win: positioning, plays, programs, incentives, and packaging.

    ### Artifact Builder
    Takes strategy from the Win Strategy Lead and produces the actual deliverables — decks, scripts, one-pagers, and workshop kits.

    ### Contrarian Coach
    Reviews the work of other agents, identifies gaps, and prepares you for tough questions. The agent that says "not so fast."

    ### Work Context Comms Agent (optional)
    Turns work context into crisp briefs, follow-ups, and action lists grounded in the truth set.

---

## Quick Setup

### Prerequisites

- [x] MCAPS IQ installed and working ([Getting Started](../getting-started/index.md))
- [x] Node.js 18+
- [x] GitHub CLI (`gh`)

### Install & Initialize

```bash
# Automated (recommended)
npm run squad:setup

# Manual
npm install -g @bradygaster/squad-cli
cd mcaps-iq
squad init
```

This creates a `.squad/` directory with your team configuration, agent charters, and shared decision history.

### Verify

```bash
squad status
# or in the interactive shell:
squad > /agents
```

### Usage

=== "VS Code"

    Open Copilot Chat and select the **Squad** agent:
    ```
    Prep my account plan for Contoso — pull pipeline, build a deck, and draft follow-ups.
    ```

=== "Terminal"

    ```bash
    squad
    squad > @Orchestrator, run a weekly pipeline review for my top 5 accounts
    ```

=== "Copilot CLI"

    ```bash
    copilot --agent squad
    ```

---

## Themes

Squad uses a **casting system** — each agent gets a persistent name from a thematic universe. Themes are cosmetic (names and personality flavor), not functional.

Built-in themes that work well for sales teams:

| Theme | Vibe |
|-------|------|
| **The Heist Crew** | Mastermind, Hacker, Face, Forger, Inside Man |
| **Space Mission Control** | Flight Director, Telemetry Officer, Mission Specialist, Engineer, Flight Surgeon |
| **The Kitchen Brigade** | Head Chef, Sous Chef, Saucier, Pastry Chef, Critic |

Choose during `squad init` or change later with `squad > Switch to the heist crew theme`.

---

## Further Reading

- [Squad CLI documentation](https://github.com/bradygaster/squad)
- [MCAPS IQ Skills & Instructions](../architecture/skills-instructions.md) — what powers each agent role
