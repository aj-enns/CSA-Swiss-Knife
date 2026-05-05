---
title: FAQ & Troubleshooting
description: Answers to common questions and solutions for frequent issues.
tags:
  - faq
  - troubleshooting
hide:
  - toc
---

# FAQ & Troubleshooting

---

## General

??? question "Do I need to know how to code?"
    No. The primary interface is the Copilot chat window — you type in plain English and Copilot does the rest. The code in this repo powers the tools behind the scenes.

??? question "Is it safe? Will it change my CRM data without asking?"
    No write operation happens without your explicit approval. Every create, update, or close action shows you a confirmation prompt first. See [Safety & Write Operations](../architecture/safety.md).

??? question "What if I don't have an Obsidian vault?"
    Everything works fine without it. Obsidian integration is entirely optional. See [Obsidian Setup](../integrations/obsidian.md) if you want to enable it later.

??? question "Can I use this outside VS Code?"
    Yes — [GitHub Copilot CLI](../integrations/copilot-cli.md) runs the same MCP tools in your terminal. The MCP servers also work with any MCP-compatible client.

??? question "How do I write a good skill or instruction file?"
    See [Writing Skills](../customization/skills.md) for a full guide. Short version: keep the `description` keyword-rich, structure as step-by-step workflow, don't exceed ~150 lines.

??? question "Copilot is getting slow or forgetting things mid-session"
    The context window fills up as you work. Export what you need (ask Copilot for a summary, report, or handoff note), then type `/clear` to reset. Your MCP servers stay running and instructions reload automatically. See [Context Window Management](common-issues.md#responses-get-slower-or-less-accurate-over-time) for details.

---

## Troubleshooting

??? failure "I edited a file in `.github/` but Copilot doesn't use it"
    Check the `description` field in the YAML frontmatter. Copilot matches against those keywords. If the description doesn't overlap with your request phrasing, it won't load. Add more trigger phrases.

??? failure "`az login` fails or my token expires"
    Run `az login` again. The MCP server uses Azure CLI tokens — keeping your session active is all you need. Tokens expire after ~1 hour.

??? failure "Something's broken and I don't know where to start"
    Run the environment check:
    ```bash
    npm run check
    ```
    Or in VS Code: ++cmd+shift+p++ → **"Tasks: Run Task"** → **"Setup: Check Environment"**

For setup-specific issues, see [Troubleshooting Setup](../getting-started/troubleshooting.md).

For detailed error reference, see [Common Issues](common-issues.md).
