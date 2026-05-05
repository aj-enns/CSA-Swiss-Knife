---
title: Integrations
description: Optional data sources to extend MCAPS IQ's capabilities.
tags:
  - integrations
hide:
  - toc
---

# Integrations

MCAPS IQ works with just the MSX CRM server, but you can extend it with additional data sources for richer, cross-medium intelligence.

| Integration | What It Adds | Required? |
|------------|-------------|-----------|
| [**Obsidian Vault (OIL)**](obsidian.md) | Persistent memory, customer context, meeting history, interactive dashboards, offline access | :material-star:{ .rec } **Strongly recommended** |
| [**Power BI**](powerbi.md) | ACR telemetry, consumption scorecards, incentive tracking | Optional |
| [**Copilot CLI**](copilot-cli.md) | Terminal-native interface (no VS Code needed) | Optional |
| [**Squads**](squads.md) | Multi-agent teams with persistent roles and accumulated knowledge | :material-flask:{ .exp } **Experimental** |

!!! tip "Start with Obsidian"
    If you only enable one optional integration, make it Obsidian. The vault is what gives the agent **persistent memory** — it accumulates knowledge across sessions, bootstraps from your existing notes (OneNote, Evernote, Notion), and provides an agentic sandbox with HTML/JavaScript rendering for interactive dashboards and visualizations. See the [Obsidian setup guide](obsidian.md) for details.
