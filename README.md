# CSA Swiss Knife — MCAPS IQ Mission Control Dashboard

> Browser-based **Mission Control** for the MCAPS IQ Copilot CLI plugin.
> Real-time session monitoring, pipeline (CRM) management, skills explorer,
> MCP server toggles, and scheduled prompt execution — all served locally at
> `http://127.0.0.1:3850`.

This repo is a fork of [microsoft/MCAPS-IQ](https://github.com/microsoft/MCAPS-IQ),
packaged for personal CSA workflow use. The dashboard is the Copilot CLI extension
located at [.github/extensions/mcaps-iq-dashboard/](.github/extensions/mcaps-iq-dashboard/).

---

## Prerequisites

- **Microsoft corporate VPN** connected
- **Microsoft corp account** (`alias@microsoft.com`)
- **GitHub Copilot License** (https://aka.ms/copilot)
- **Node.js 18+** (Node 20+ recommended)
- **Git** + **GitHub CLI** (`gh`)
- **PowerShell 7** on Windows (`pwsh`)
- **GitHub Copilot CLI** — install with:
  ```powershell
  npm install -g @github/copilot
  ```

---

## One-Time Setup

### 1. Authenticate

```powershell
gh auth login          # use personal GitHub account, NOT *_microsoft EMU
az login               # Microsoft corp account, on VPN
```

### 2. Install dependencies

```powershell
npm install
```

If you get 401/403/404 errors fetching private packages:

```powershell
npm run auth:packages
```

### 3. Verify environment

```powershell
npm run check
```

### 4. Install the plugin into Copilot CLI

Replace `<owner>` with the GitHub org or username that hosts your fork:

```powershell
copilot plugin install <owner>/CSA-Swiss-Knife
```

Confirm it registered:

```powershell
copilot plugin list
```

You should see `mcaps-iq` listed.

> **Note:** The `plugin.json` → `extension` field wires in the dashboard, but
> Copilot CLI extension loading requires a server-side `EXTENSIONS` feature
> flag that may not be enabled for your account yet. If the dashboard does not
> auto-launch (see below), use the manual start method.

---

## Start the Dashboard

### Option A — Automatic (requires `EXTENSIONS` flag)

If your Copilot CLI account has the `EXTENSIONS` feature flag enabled, the
dashboard launches automatically with any prompt:

```powershell
copilot -i "morning brief"
```

The Copilot SDK loads
[extension.mjs](.github/extensions/mcaps-iq-dashboard/extension.mjs),
starts an Express + WebSocket server on **port 3850**, and opens your browser.

### Option B — Manual start (works for everyone)

From the repo root:

```powershell
npm run dashboard
```

Then open **http://127.0.0.1:3850** in your browser.

Subsequent `copilot -i ...` commands attach as additional live sessions visible
under **Mission Control → Live**.

### Stop the dashboard

The shared server shuts down when the last attached CLI session exits. To force
stop, end the `node` process holding port 3850:

```powershell
Get-NetTCPConnection -LocalPort 3850 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Optional: Start MCP Servers (for richer data)

The dashboard pulls live CRM and vault data through MCP servers defined in
[.mcp.json](.mcp.json) and [.vscode/mcp.json](.vscode/mcp.json). Start them in
VS Code Copilot Chat (Agent mode):

1. Open [.vscode/mcp.json](.vscode/mcp.json) in VS Code
2. Click **Start** above each server you want active:
   - `msx` — MSX CRM (required for Pipeline / Opportunities / Accounts views)
   - `workiq` — M365 search (optional)
   - `oil` — Obsidian vault (optional)
   - `powerbi-remote` — Power BI (optional)

---

## Dashboard Views

| Route | Description |
|---|---|
| `#/home` | Role-contextual landing page with quick-action prompts |
| `#/opportunities` | Live MSX pipeline table with MCEM stage badges |
| `#/accounts` | Account-level pipeline aggregation |
| `#/skills` | 3-tab explorer: Roles · All Skills · Agents |
| `#/mcp-servers` | Toggle MCP servers; see connection status |
| `#/mission-control` | Live session stream + history + delegation tracking |
| `#/schedules` | Cron jobs for scheduled prompts |
| `#/sessions` | Split-panel activity stream |
| `#/settings` | Role, priority accounts, display prefs |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser doesn't open | Visit `http://127.0.0.1:3850` manually |
| `EADDRINUSE` on 3850 | Another instance is already running — open the URL directly, or kill the process (see *Stop* above) |
| Empty pipeline / `whoami` fails | Start the `msx` MCP server in VS Code, ensure VPN + `az login` |
| `401/403/404` installing deps | `npm run auth:packages` |
| Plugin not discovered | Re-run `copilot plugin install <owner>/CSA-Swiss-Knife` |
| Dashboard doesn't auto-launch | Your account may lack the `EXTENSIONS` feature flag — use `npm run dashboard` instead |
| Settings or runtime files appearing as untracked | `.copilot/`, `.vault/`, `.mcaps-iq-settings.json` are runtime artifacts — already in `.gitignore` |

---

## Repository Layout

```
.github/
  extensions/mcaps-iq-dashboard/   # ← The dashboard (extension + server + SPA)
    extension.mjs                  # Copilot SDK entry point
    lib/                           # Server, session client, CRM/OIL bridges
    public/                        # Vanilla-JS SPA (no build step)
    tests/                         # Node test runner suite
  skills/                          # 40+ workflow skills
  prompts/                         # Reusable prompt files
  agents/                          # Subagent definitions
  instructions/                    # Domain rules (CRM, M365, vault)
.vscode/mcp.json                   # MCP server registry for VS Code
plugin.json                        # Copilot CLI plugin manifest
package.json                       # npm scripts (setup, check, eval, lint)
```

---

## Test the Dashboard

Run the bundled extension test suite:

```powershell
npm run dashboard:test
```

Smoke-test the live server (after launching with `npm run dashboard` or `copilot -i "morning brief"`):

```powershell
Invoke-RestMethod http://127.0.0.1:3850/api/health
```

Expected: a JSON response with `{ status: "ok", ... }`.

---

## License

Inherits MIT license from upstream [microsoft/MCAPS-IQ](https://github.com/microsoft/MCAPS-IQ).
See [LICENSE.md](LICENSE.md).
