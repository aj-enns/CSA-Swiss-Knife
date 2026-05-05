---
title: Adding MCP Servers
description: Connect additional data sources to Copilot with security best practices.
tags:
  - customization
  - mcp
  - security
hide:
  - toc
---

# Adding MCP Servers

Edit `.vscode/mcp.json` to connect additional data sources. Each server gets its own tools that Copilot can call.

---

## Security Checklist

!!! danger "Read this before adding any server"
    This workspace handles live MSX sales data — customer names, deal values, pipeline status, internal stakeholders, and engagement history. **Treat every MCP server you connect as having full visibility into that data.**

Before adding any MCP server, verify **ALL** of the following:

- [x] **Runs locally.** Prefer `stdio` servers that execute on your machine. A local process never sends data to a third party.
- [x] **No network-facing servers.** Do NOT expose MCP servers over HTTP/SSE to the network.
- [x] **Trusted source only.** Only install from publishers you trust — your own org, Microsoft, or packages you've personally reviewed.
- [x] **Review what it does.** Before running `npx some-unknown-package`, read its source or README.
- [x] **No secrets in plain text.** Never hardcode API keys in `mcp.json`. Use `${input:...}` prompts or environment variables.
- [x] **Principle of least privilege.** Only connect servers that need access to what you're working on.

!!! quote ""
    **If you wouldn't paste your pipeline data into a random website, don't pipe it through a random MCP server.**

---

## Adding a Server

```jsonc
{
  "servers": {
    // Existing servers...

    "my-custom-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@my-org/my-mcp-server"],
      "env": {
        "API_KEY": "${input:myApiKey}"
      }
    }
  }
}
```

After saving, you'll see a **Start** button appear above the new server in VS Code.

---

## Where to Find Servers

- [MCP Server Registry](https://github.com/modelcontextprotocol/servers) — community servers
- [MCP Specification](https://spec.modelcontextprotocol.io/) — build your own
- Always vet servers against the security checklist above
