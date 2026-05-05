---
title: Copilot CLI
description: Run MCAPS IQ from your terminal without opening VS Code.
tags:
  - integrations
  - cli
hide:
  - toc
---

# Copilot CLI

[GitHub Copilot CLI](https://github.com/features/copilot/cli/) runs the same MCP tools, agents, and skills directly in your terminal — no VS Code required.

For the best overall experience, we recommend using VS Code Copilot Chat with this repository checked out locally.

Plugin deployment in Copilot CLI is fully supported, but it is not the ideal default for most users because it does not include this repo's `.github/prompts/` and `.github/instructions/` files.

That said, Copilot CLI + the `mcaps-iq` plugin is a great power-user pattern for terminal-first workflows.

---

## Install

### Option 1: Plugin Install (Supported, Power-User Friendly)

Install MCAPS IQ as a Copilot CLI plugin — no cloning required:

```bash
copilot plugin install microsoft/MCAPS-IQ
```

This registers the MSX CRM MCP server, Power BI analytics, 43 skills, and 4 custom agents. The server builds automatically on first run.

!!! warning "Plugin tradeoff"
    Plugin deployment currently does not include this repo's `.github/prompts/` and `.github/instructions/` files. If you want the most complete guided experience, use VS Code Copilot Chat (or run Copilot CLI from a local clone via Option 2).

!!! note "Prerequisites"
    - [Copilot CLI](https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli) installed
    - Node.js 20+
    - Azure CLI signed in (`az login`) on VPN

Manage your plugin:

```bash
copilot plugin list              # Verify installation
copilot plugin update mcaps-iq   # Update to latest
copilot plugin uninstall mcaps-iq  # Remove
```

!!! warning "VS Code-only features"
    Some skills (e.g., `morning-brief`, `customer-evidence-pack`) depend on Calendar, Mail, and Teams MCP servers that are only available in VS Code. These skills gracefully skip those steps in CLI.

### Option 2: Run from Cloned Repo

If you've already cloned the repo for VS Code, Copilot CLI works from the same checkout:

The `mcaps` command is the easiest way to start. It is registered globally when you run optional local setup (`npm install`, or `npm link --ignore-scripts`) in this repo.

```bash
# From anywhere — your home directory, a project folder, etc.
mcaps
```

This launches Copilot CLI with the repo's MCP servers, agents, and skills auto-loaded. You don't need to `cd` into the repo first — `mcaps` handles that for you.

??? info "What `mcaps` does under the hood"
    The `mcaps` command runs `copilot --allow-all-tools --add-dir <repo-root>`, pointing Copilot CLI at the mcaps-iq repo wherever it lives on your machine. If you have the `OBSIDIAN_VAULT` environment variable set, it also adds your vault as an additional directory.

    If Copilot CLI isn't installed, `mcaps` falls back to opening the repo in VS Code.

??? tip "Re-register the alias if needed"
    If `mcaps` isn't found after setup (for example PATH refresh delay):
    ```bash
    cd mcaps-iq
    npm link --ignore-scripts
    ```

Alternatively, if you prefer to run Copilot CLI manually:

```bash
cd mcaps-iq
copilot
```

This picks up all configuration automatically — MCP servers from `.vscode/mcp.json`, agents, skills, and instructions.

Built-in CLI commands:

| Command | Purpose |
|---------|---------|
| `/plan` | Outline work before executing |
| `/model` | Switch between models |
| `/fleet` | Parallelize across subagents |
| `/agent` | Select a custom agent |
| `/skills` | Browse available skills |
| `/resume` | Pick up a previous session |

!!! info "Slash commands"
    The custom `/daily`, `/weekly`, etc. from `.github/prompts/` are a VS Code feature. In CLI, describe what you need in natural language or paste prompt content directly.

---

## Example Prompts

Same prompts work in CLI:

```
Who am I in MSX?
Show me my active opportunities.
Run my weekly pipeline review.
```

Write operations still use Stage → Review → Execute with explicit approval.
