---
title: Error Reference
description: Specific error messages and their solutions.
tags:
  - faq
  - errors
hide:
  - toc
---

# Error Reference

Look up specific error messages you encounter.

---

## Authentication Errors

??? failure "`AADSTS50076: Due to a configuration change made by your administrator...`"
    **Cause:** Multi-factor authentication (MFA) required.
    
    **Fix:**
    ```bash
    az login --use-device-code
    ```
    This forces device code flow which works better with MFA.

??? failure "`AADSTS700016: Application with identifier was not found`"
    **Cause:** Wrong tenant or app registration issue.
    
    **Fix:**
    ```bash
    az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
    ```

??? failure "`The token expired` or `401 Unauthorized`"
    **Cause:** Azure CLI token expired (happens every ~1 hour).
    
    **Fix:** Run `az login` again.

---

## MCP Server Errors

??? failure "`npx` fails to launch `@microsoft/msx-mcp-server`"
    **Cause:** Package fetch/auth issue (registry access, VPN, or npm auth config).
    
    **Fix:**
    ```bash
    npm ping
    npx -y --registry https://npm.pkg.github.com @microsoft/msx-mcp-server@latest
    ```

??? failure "`ECONNREFUSED` or `Connection refused`"
    **Cause:** Server not running or VPN disconnected.
    
    **Fix:**
    1. Check VPN connection
    2. Click **Start** on the server in `.vscode/mcp.json`

??? failure "`TypeError: fetch failed`"
    **Cause:** Network issue — usually VPN or proxy.
    
    **Fix:** Verify VPN is connected and try `az account get-access-token --resource https://microsoftsales.crm.dynamics.com`

---

## npm Errors

??? failure "`EACCES: permission denied`"
    **Fix (macOS/Linux):**
    ```bash
    sudo chown -R $(whoami) ~/.npm
    ```

??? failure "`ERR_MODULE_NOT_FOUND`"
    **Cause:** Missing dependencies or wrong Node.js version.
    
    **Fix:**
    ```bash
    node --version  # Verify 18+
    npm install     # Reinstall dependencies
    ```

??? failure "`ERESOLVE: unable to resolve dependency tree`"
    **Fix:**
    ```bash
    npm install --legacy-peer-deps
    ```
