---
title: Common Issues
description: Detailed solutions for frequently encountered problems.
tags:
  - faq
  - troubleshooting
hide:
  - toc
---

# Common Issues

Detailed solutions organized by category.

---

## Authentication

### Token Expired Mid-Session

**Symptom:** Things were working, then suddenly authentication errors.

**Cause:** Azure CLI tokens expire after ~1 hour.

**Fix:** Run `az login` again. You don't need to restart MCP servers — they'll pick up the new token automatically.

### Wrong Tenant

**Symptom:** Authenticated but CRM returns "access denied" or no data.

**Fix:**
```bash
az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
```

### CRM Token Test

Verify CRM access directly:
```bash
az account get-access-token --resource https://microsoftsales.crm.dynamics.com
```

If this fails, the problem is Azure auth, not the MCP server.

---

## MCP Servers

### Server Starts but Shows 0 Tools

**Cause:** Auth failure during tool registration.

**Fix:**
1. Verify Azure login
2. Stop and restart the server in `.vscode/mcp.json`

### WorkIQ Not Available

**Cause:** WorkIQ requires the `@microsoft/workiq` package and may not be available in all regions.

**Fix:** This is optional — everything else works without it.

### PowerBI Server Fails

**Cause:** Usually authentication or Fabric API access.

**Fix:** Verify `az login` is current and you have Power BI access in your tenant.

---

## Copilot Behavior

### Skills Don't Activate

**Cause:** The prompt doesn't match the skill's `description` keywords strongly enough.

**Fix:** Either:
- Add more trigger phrases to the skill's `description`
- Be more explicit in your prompt: _"Run the milestone health review skill"_

### Copilot Uses Generic Knowledge Instead of MCP

**Cause:** Copilot decided MCP tools weren't relevant for your prompt.

**Fix:** Be explicit about wanting CRM data:
```
Use the MSX CRM tools to show me my active opportunities.
```

### Responses Are Too Long/Short

**Fix:** Edit `.github/copilot-instructions.md` and adjust the response style section.

### Responses Get Slower or Less Accurate Over Time

**Cause:** The context window is filling up. Every tool call, CRM response, and Copilot reply accumulates in the session context. As it grows, Copilot has less room for reasoning and may start dropping important details, repeating itself, or ignoring instructions.

**How to manage it:**

#### 1. Export before you clear

Before resetting, ask Copilot to produce a durable artifact from the session:

```
Summarize everything we've discussed into a brief status report.
```

```
Export the pipeline triage results as a markdown table I can save.
```

```
Write a handoff note capturing the key decisions and next actions from this session.
```

Save the output to a file, paste it into your vault, or copy it to a doc — whatever fits your workflow.

#### 2. Use `/clear` to reset

Once you've exported what you need, type:

```
/clear
```

This resets the conversation context to zero. Your MCP servers stay running, your instruction files reload automatically, and you're back to a fresh, fast session.

#### 3. Know the warning signs

Watch for these signals that the context is getting heavy:

| Signal | What It Means |
|--------|--------------|
| Copilot stops calling MCP tools it was using earlier | Context crowding out tool-selection reasoning |
| Responses repeat information you already have | Model is losing track of what's been covered |
| Skill chains that worked earlier now produce partial results | Insufficient room for multi-step orchestration |
| Latency increases noticeably | Larger context = slower inference |

#### 4. Structure sessions around natural breakpoints

Rather than one marathon session, break your work into focused rounds:

| Round | Purpose | Then |
|-------|---------|------|
| Morning brief | Pipeline state + today's priorities | `/clear` |
| Deal deep-dive | Full triage on a specific opportunity | Export findings, `/clear` |
| Governance prep | Milestone review + evidence pack | Export report, `/clear` |
| End-of-day | Update vault notes + CRM task hygiene | Done |

!!! tip "Rule of thumb"
    If you've made more than ~15–20 tool calls in a session, or the conversation is 30+ messages deep, it's a good time to export and `/clear`.

---

## Environment

### Node.js Version Mismatch

**Required:** Node.js 18+

```bash
node --version    # Check current
brew upgrade node # Upgrade (macOS)
```

### npm Permission Errors

```bash
sudo chown -R $(whoami) ~/.npm
```

### PowerShell Execution Policy (Windows)

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
