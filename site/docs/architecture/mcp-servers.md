---
title: MCP Servers & Tools
description: The data bridges that connect Copilot to MSX CRM, M365, Obsidian, and Power BI.
tags:
  - architecture
  - mcp
  - tools
hide:
  - toc
---

# MCP Servers & Tools

MCP (Model Context Protocol) servers are the bridges between Copilot and your data. Each server exposes **tools** that Copilot can call on your behalf.

---

## Available Servers

| Server | Status | Purpose | # Tools |
|--------|--------|---------|---------|
| `msx` | **Enabled** | MSX CRM operations | ~23 |
| `workiq` | **Enabled** | M365 evidence retrieval | 2 |
| `powerbi-remote` | **Enabled** | Power BI analytics | 4 |
| `oil` | Commented out | Obsidian vault integration | 22 |

---

## MSX CRM Tools

The core tools for interacting with your MSX pipeline:

### Read Tools

| Tool | What It Does |
|------|-------------|
| `crm_whoami` | Checks who you are in MSX (validates authentication) |
| `crm_query` | Runs read-only OData queries against CRM |
| `crm_get_record` | Fetches a specific CRM record by ID |
| `list_opportunities` | Lists opportunities, filterable by customer |
| `get_milestones` | Lists milestones for an opportunity or owner |
| `find_milestones_needing_tasks` | Finds milestones that need task attention |
| `view_milestone_timeline` | Returns a timeline view of milestones |
| `view_opportunity_cost_trend` | Returns cost trend data for an opportunity |
| `get_milestone_field_options` | Returns valid field values for milestones |
| `get_task_status_options` | Returns valid task statuses |
| `list_accounts_by_tpid` | Lists accounts by TPID |
| `get_my_active_opportunities` | Quick access to your pipeline |

### Write Tools :material-alert:

All write tools use the **Stage → Review → Execute** pattern. Nothing is written to CRM without your explicit approval.

| Tool | What It Does |
|------|-------------|
| `create_task` | Creates a new task under a milestone |
| `update_task` | Updates an existing task |
| `close_task` | Closes a task |
| `update_milestone` | Updates milestone status or details |
| `create_milestone` | Creates a new milestone |

### Staged Operation Tools

| Tool | What It Does |
|------|-------------|
| `list_pending_operations` | Shows what's staged but not yet executed |
| `execute_operation` | Executes a single staged change |
| `execute_all` | Executes all staged changes |
| `cancel_operation` | Cancels a staged change |
| `cancel_all` | Cancels all staged changes |
| `view_staged_changes_diff` | Shows before/after diff of staged changes |

---

## WorkIQ Tools (M365)

| Tool | What It Does |
|------|-------------|
| `ask_work_iq` | Searches across Teams, Outlook, SharePoint, and meeting transcripts |
| `accept_eula` | Accepts the WorkIQ EULA (required on first use) |

WorkIQ can search:

- **Teams** — chat/thread decisions, channel updates, action ownership
- **Meetings** — transcript evidence, decisions, blockers, next steps
- **Outlook** — stakeholder communication trail, commitments, follow-ups
- **SharePoint/OneDrive** — proposals, design docs, revision context

---

## Power BI Tools

| Tool | What It Does |
|------|-------------|
| `DiscoverArtifacts` | Lists available workspaces, reports, and semantic models |
| `GetSemanticModelSchema` | Returns table/column structure of a model |
| `GenerateQuery` | Generates DAX queries from natural language |
| `ExecuteQuery` | Runs a DAX query against a semantic model |

---

## OIL Tools (Obsidian Vault)

See [Obsidian Integration](../integrations/obsidian.md) for the full 22-tool reference.

---

## Server Configuration

Servers are defined in `.vscode/mcp.json`. Each entry specifies:

- **type** — `stdio` (local process) or `sse` (network)
- **command** — what to run (for example `npx` with a published MCP package)
- **env** — environment variables (CRM URL, tenant ID, etc.)

!!! warning "Security"
    Prefer `stdio` servers that run locally. Never expose MCP servers over the network. See [Adding MCP Servers](../customization/mcp-servers.md) for the full security checklist.
