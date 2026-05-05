---
title: Troubleshooting Setup
description: Fix common installation and setup issues.
tags:
  - troubleshooting
  - setup
hide:
  - toc
---

# Troubleshooting Setup

Can't get things running? This page covers every common issue, organized by symptom.

!!! tip "Quick diagnostic"
    Run the automated check first — it catches most problems:
    ```bash
    npm run check
    ```
    Or in VS Code: ++cmd+shift+p++ → **"Tasks: Run Task"** → **"Setup: Check Environment"**

---

## Installation Problems

??? failure "Git not found / `git clone` fails"
    **Symptom:** `git: command not found` or `'git' is not recognized`.
    
    **Cause:** Git is not pre-installed on all systems. Having GitHub CLI (`gh`) does **not** mean `git` is available — they are separate tools.
    
    **Fix:**
    ```bash
    # macOS (installs Xcode CLT which includes git)
    xcode-select --install
    # or: brew install git
    ```
    ```powershell
    # Windows
    winget install Git.Git --silent --accept-package-agreements --accept-source-agreements
    ```
    After installing, **close and reopen VS Code entirely** so the terminal picks up the new PATH.

??? failure "Newly installed tool not found in VS Code terminal"
    **Symptom:** You just installed Git, Node, `gh`, or `az` but the VS Code terminal says "command not found".
    
    **Cause:** VS Code terminals inherit the system PATH from when VS Code was launched. New PATH entries from installers are not picked up until VS Code restarts.
    
    **Fix:** Close VS Code completely (not just the terminal tab), then reopen it. Opening a new terminal tab inside the same VS Code window is **not sufficient**.

??? failure "Optional local tooling install fails with EACCES permission errors"
    **Symptom:** Error messages about missing write permissions to `~/.npm` or `node_modules`.
    
    **Fix (macOS/Linux):**
    ```bash
    sudo chown -R $(whoami) ~/.npm
    npm install
    ```
    
    **Fix (Windows):** Run your terminal as Administrator, or use:
    ```powershell
    npm install --no-optional
    ```

??? failure "Optional local tooling install fails on Windows with execution policy error"
    **Symptom:** PowerShell blocks script execution during install.
    
    **Fix:**
    ```powershell
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    ```
    Then retry `npm install`.

??? failure "`npm install` fails with Node.js version error on Windows / PowerShell"
    **Symptom:** `npm install` fails during the `postinstall` step with a cryptic error like:
    ```
    TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received undefined
    ```

    **Cause:** Some setup scripts used a Node.js 21+ API (`import.meta.dirname`) that is not available on Node 18 or 20. This was fixed in a recent update.

    **Fix:** Update Node.js to v20 LTS (or newer) and pull the latest repo changes:
    ```powershell
    # Check your Node version
    node --version

    # Update via winget (Windows)
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements

    # Or via nvm-windows
    nvm install lts
    nvm use lts
    ```
    Then re-run:
    ```powershell
    npm install
    ```

??? failure "`mcaps` command not found after install in PowerShell"
    **Symptom:** Setup completed but running `mcaps` in PowerShell gives "command not found" or a `.ps1 cannot be loaded` error.

    **Cause 1 — Execution policy:** npm creates a `.ps1` shim for `mcaps` but PowerShell's default `Restricted` policy blocks all `.ps1` files.
    ```powershell
    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
    ```

    **Cause 2 — npm global bin not in PATH:** The npm global `bin` directory may not be on your PATH.
    ```powershell
    # Find where npm installs global bins
    npm config get prefix

    # Add it to PATH for this session
    $env:PATH += ";$(npm config get prefix)"

    # Or add permanently via System Properties → Environment Variables
    ```

    **Cause 3 — Use the PowerShell function alias instead:**
    ```powershell
    # Add to your PowerShell profile ($PROFILE)
    Add-Content $PROFILE 'function mcaps { node "C:\path\to\mcaps-iq\bin\mcaps.js" @args }'
    . $PROFILE
    ```

??? failure "npx package fetch hangs or fails"
    **Cause:** Usually a proxy or VPN issue blocking npm registry access.
    
    **Fix:**
    ```bash
    # Check if npm can reach a registry
    npm ping
    
    # If behind a proxy
    npm config set proxy http://your-proxy:port
    npm config set https-proxy http://your-proxy:port
    ```

??? failure "Node.js version too old"
    **Symptom:** Error about unsupported Node.js version or missing features.
    
    **Fix:**
    ```bash
    node --version  # check current
    
    # Upgrade via Homebrew (macOS)
    brew upgrade node
    
    # Or use nvm
    nvm install 18 && nvm use 18
    ```

---

## Authentication Problems

??? failure "`az login` opens browser but fails"
    **Cause:** Usually means you're not on VPN, or the browser is blocking the redirect.
    
    **Fix:**
    1. Verify VPN is connected
    2. Try device code flow instead:
       ```bash
       az login --use-device-code
       ```
    3. If you need a specific tenant:
       ```bash
       az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
       ```

??? failure "`az login` succeeds but CRM says 'Not authenticated'"
    **Cause:** Your Azure token doesn't include MSX CRM scope, or it expired.
    
    **Fix:**
    ```bash
    # Check if you can get a CRM token
    az account get-access-token --resource https://microsoftsales.crm.dynamics.com
    
    # If this fails, re-login with the Microsoft tenant
    az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
    ```

??? failure "Token expires mid-session"
    **Symptom:** Things were working, then suddenly you get authentication errors.
    
    **Cause:** Azure CLI tokens expire after ~1 hour.
    
    **Fix:** Run `az login` again. You don't need to restart the MCP servers — they'll use the new token automatically.

??? failure "`az account show` shows wrong subscription"
    **Fix:**
    ```bash
    az account list --output table
    az account set --subscription "Your-Subscription-Name"
    ```

---

## MCP Server Problems

??? failure "'Start' / 'Stop' buttons not visible in mcp.json"
    **Symptom:** You open `.vscode/mcp.json` but don't see any CodeLens (Start/Stop) buttons above the server definitions.
    
    **Requirements:**
    
    - **GitHub Copilot Chat extension v0.25+** — check your version in Extensions → GitHub Copilot Chat.
    - **Agent mode enabled** — Copilot Chat must be in Agent mode (not just Chat mode). Look for the agent icon in the Copilot panel header or toggle via the model picker.
    - **`mcp.json` must be the active editor tab** — CodeLens only renders on the focused file.
    
    **Fix:**
    
    1. Update the Copilot Chat extension if it's below v0.25
    2. Close `mcp.json`, reload VS Code (++cmd+shift+p++ → "Developer: Reload Window"), then reopen the file
    3. Confirm Agent mode is active in the Copilot panel

??? failure "Server won't start — 'Start' button does nothing"
    **Check:**
    1. Is Node.js installed? (`node --version`)
     2. Bootstrap GitHub Packages auth:
         ```bash
         npm run auth:packages
         ```
     3. Can npx resolve the server package?
       ```bash
       npx -y --registry https://npm.pkg.github.com @microsoft/msx-mcp-server@latest
       ```
     4. Try starting manually in terminal:
       ```bash
       node scripts/msx-start.js
       ```
       This shows the actual error.

??? failure "Server starts but shows 0 tools"
    **Cause:** The server started but failed to register tools (usually an auth issue).
    
    **Fix:**
    1. Check Azure login: `az account get-access-token --resource https://microsoftsales.crm.dynamics.com`
    2. Restart the server (click **Stop** then **Start** in `mcp.json`)

??? failure "Copilot doesn't see the MCP tools"
    **Fix:**
    1. Verify the server shows as **"Running"** in `.vscode/mcp.json`
    2. Try reloading VS Code: ++cmd+shift+p++ → **"Developer: Reload Window"**
    3. Check that your Copilot extension is up to date

??? failure "Typo'd the Obsidian vault path during setup"
    **Symptom:** You entered an incorrect vault path when prompted during `npm install` or `npm run setup`.
    
    **Fix:** Re-run the vault configuration prompt:
    ```bash
    npm run vault:reconfigure
    ```
    This lets you re-enter the path (with validation) and updates both `.env` and your shell profile.
    
    Or edit `.env` directly:
    ```bash
    # Open .env and fix the OBSIDIAN_VAULT_PATH line
    code .env
    ```

??? failure "`workiq` server fails to start"
    **Cause:** WorkIQ requires the `@microsoft/workiq` npm package.
    
    **Fix:**
    ```bash
    npm run auth:packages
    npx -y @microsoft/workiq mcp
    ```
    If this fails, either your GitHub account lacks package access or WorkIQ is not available to your tenant yet.

---

## Copilot Chat Problems

??? failure "Copilot doesn't respond to MSX-related prompts"
    **Checklist:**
    
    1. Is the `msx` server running? (check `.vscode/mcp.json`)
    2. Is Copilot Chat open? (++cmd+shift+i++)
    3. Try a simple test: `Who am I in MSX?`
    4. If no response: reload VS Code (++cmd+shift+p++ → **"Developer: Reload Window"**)

??? failure "Copilot ignores my custom instructions or skills"
    **Cause:** The `description` field in the YAML frontmatter doesn't match your prompt's keywords.
    
    **Fix:** Check the `description` in the file's YAML front matter. Copilot matches your prompt text against these keywords. Add more trigger phrases to the description.
    
    **Example:** If your skill has `description: "milestone health review"` but you ask "how are my milestones doing?" — the match may be weak. Add variations:
    ```yaml
    description: "milestone health review, how are my milestones, milestone status, governance prep"
    ```

??? failure "Copilot gives generic answers instead of using MCP tools"
    **Cause:** Copilot may not be recognizing that MCP tools are relevant.
    
    **Fix:** Be explicit about wanting CRM data:
    ```
    # Instead of:
    "How's my pipeline?"
    
    # Try:
    "Use the MSX CRM tools to show me my active opportunities."
    ```

---

## Still Stuck?

1. Run the full diagnostic: `node scripts/init.js --check`
2. Check the [FAQ](../faq/index.md) for more answers
3. Open an issue: [GitHub Issues](https://github.com/microsoft/MCAPS-IQ/issues)
