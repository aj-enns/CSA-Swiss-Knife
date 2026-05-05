---
title: Power BI Integration
description: Connect Copilot to Power BI for ACR telemetry and consumption analytics.
tags:
  - integrations
  - powerbi
hide:
  - toc
---

# Power BI Integration

The **Power BI Remote MCP** connects Copilot to your Power BI semantic models. Pull ACR telemetry, incentive baselines, consumption scorecards, and pipeline analytics — all from the chat window.

!!! info "No DAX knowledge required"
    The Power BI tools handle DAX query generation. You describe what data you need in plain English.

---

## Setup

### 1. Start the Server

The `powerbi-remote` server is pre-configured in `.vscode/mcp.json`. Click **Start** on it in VS Code.

### 2. Authenticate

Power BI uses your Azure CLI session — make sure `az login` is current.

---

## Creating a Custom PBI Prompt

The **pbi-prompt-builder** skill walks you through it interactively:

```
I want to build a Power BI prompt to track my gap to target across 
my Azure accounts.
```

The builder:

1. **Discovers** available semantic models
2. **Maps** your questions to tables and measures
3. **Generates** and validates DAX queries with live data
4. **Outputs** a ready-to-use prompt file in `.github/prompts/`

---

## Included Prompts

| Prompt | Use Case |
|--------|----------|
| `pbi-azure-portfolio-review` | ACR vs. budget, gap ranking, priority opportunities |
| `pbi-ghcp-new-logo-incentive` | GHCP incentive eligibility tracking |
| `pbi-ghcp-seats-analysis` | GHCP seat composition, attach rates, whitespace, MoM trends |

---

## Available Tools

| Tool | What It Does |
|------|-------------|
| `DiscoverArtifacts` | Lists workspaces, reports, and semantic models |
| `GetSemanticModelSchema` | Shows table/column structure |
| `GenerateQuery` | Creates DAX from natural language |
| `ExecuteQuery` | Runs DAX against a semantic model |
