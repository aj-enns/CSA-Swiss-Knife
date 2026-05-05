#!/usr/bin/env node

/**
 * M365 Auth — zero-dependency device-code authentication for agent365 MCP servers.
 *
 * VS Code authenticates to agent365 servers via its built-in Microsoft auth
 * provider. Copilot CLI has no equivalent, so this module replicates the flow
 * using MSAL's device-code grant with the VS Code client ID.
 *
 * Usage as CLI (login/status):
 *   node scripts/m365-auth.js --login            # Interactive device-code login
 *   node scripts/m365-auth.js --status            # Show cached token info
 *   node scripts/m365-auth.js --logout            # Clear cached tokens
 *
 * Usage as module (from http-proxy.js):
 *   import { getM365Token } from './m365-auth.js';
 *   const token = await getM365Token(scopes);     # Returns cached/refreshed token
 *
 * Token cache: <repo-root>/.auth-cache/m365-tokens.json (gitignored)
 * The cache stores refresh tokens so subsequent startups are silent.
 *
 * Security note: On Windows, POSIX file modes (0o600) are not enforced by NTFS.
 * The .auth-cache directory is gitignored to prevent credential leaks, but the
 * token file is accessible to any process running as the same Windows user.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = resolve(ROOT, ".auth-cache");
const CACHE_FILE = resolve(CACHE_DIR, "m365-tokens.json");

// VS Code's public client ID — preauthorized for agent365 scopes
const CLIENT_ID = "aebc6443-996d-45c2-90f0-388ff96faa56";
const DEFAULT_TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";

function getAuthority(tenant) {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
}

// —— All known agent365 scopes ——————————————————————————
// Requesting all at once so the user authenticates only once.
const ALL_M365_SCOPES = [
  "https://agent365.svc.cloud.microsoft/McpServers.Calendar.All",
  "https://agent365.svc.cloud.microsoft/McpServers.Teams.All",
  "https://agent365.svc.cloud.microsoft/McpServers.Mail.All",
  "https://agent365.svc.cloud.microsoft/McpServers.ODSP.All",
  "https://agent365.svc.cloud.microsoft/McpServers.Word.All",
  "https://agent365.svc.cloud.microsoft/McpServers.M365Copilot.All",
  "offline_access",
];

function log(msg) {
  process.stderr.write(`[m365-auth] ${msg}\n`);
}

// —— Cache operations ———————————————————————————————————
function readCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    }
  } catch { /* ignore corrupt cache */ }
  return null;
}

function writeCache(data) {
  mkdirSync(CACHE_DIR, { recursive: true });
  // Note: mode 0o600 is best-effort. On Windows/NTFS it is not enforced —
  // the file is protected only by the user's Windows profile ACLs.
  // The .auth-cache directory is gitignored to prevent credential leaks.
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function clearCache() {
  try {
    if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE);
    log("Token cache cleared.");
  } catch { /* ignore */ }
}

// —— Token refresh via refresh_token grant ——————————————
async function refreshToken(cache, tenant) {
  const authority = getAuthority(tenant);
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: cache.refresh_token,
    scope: ALL_M365_SCOPES.join(" "),
  });

  const resp = await fetch(`${authority}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const err = await resp.text();
    // If refresh token is expired/revoked, user needs to re-login
    if (err.includes("AADSTS") || err.includes("invalid_grant")) {
      return null;
    }
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await resp.json();
  const newCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || cache.refresh_token,
    expires_on: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    scope: data.scope || cache.scope,
    tenant,
  };
  writeCache(newCache);
  return newCache.access_token;
}

// —— Device code flow (interactive) —————————————————————
async function deviceCodeLogin(tenant) {
  const authority = getAuthority(tenant);

  // Step 1: Request device code
  const dcBody = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: ALL_M365_SCOPES.join(" "),
  });

  const dcResp = await fetch(`${authority}/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: dcBody,
  });

  if (!dcResp.ok) {
    const err = await dcResp.text();
    throw new Error(`Device code request failed: ${err}`);
  }

  const dcData = await dcResp.json();
  const { device_code, user_code, verification_uri, interval, expires_in } = dcData;

  // Show user instructions on stderr (doesn't interfere with stdio MCP transport)
  log("");
  log("════════════════════════════════════════════════════════════════");
  log("  M365 Authentication Required");
  log("");
  log(`  1. Open: ${verification_uri}`);
  log(`  2. Enter code: ${user_code}`);
  log(`  3. Sign in with your Microsoft account`);
  log("");
  log("  Waiting for authentication...");
  log("════════════════════════════════════════════════════════════════");
  log("");

  // Step 2: Poll for token
  const pollInterval = (interval || 5) * 1000;
  const deadline = Date.now() + (expires_in || 900) * 1000;

  const tokenBody = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code,
  });

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const tokenResp = await fetch(`${authority}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    const tokenData = await tokenResp.json();

    if (tokenData.error === "authorization_pending") {
      continue;
    }
    if (tokenData.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (tokenData.error) {
      throw new Error(`Auth failed: ${tokenData.error_description || tokenData.error}`);
    }

    // Success!
    const cache = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_on: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
      scope: tokenData.scope,
      tenant,
    };
    writeCache(cache);
    log("Authentication successful! Token cached for future sessions.");
    return cache.access_token;
  }

  throw new Error("Device code login timed out. Please try again.");
}

// —— Public API —————————————————————————————————————————

/**
 * Get a valid access token for agent365 M365 MCP servers.
 * Uses cached token → refresh token → device code flow (interactive).
 *
 * @param {Object} [options]
 * @param {string} [options.tenant] - Entra ID tenant (defaults to Microsoft corp)
 * @param {boolean} [options.interactive] - Allow device code prompt if needed (default: true)
 * @returns {Promise<string>} Bearer token
 */
export async function getM365Token(options = {}) {
  const tenant = options.tenant || DEFAULT_TENANT;
  const interactive = options.interactive !== false;

  const cache = readCache();

  // Try cached access token (with 2 min buffer)
  if (cache?.access_token && cache.expires_on > Date.now() / 1000 + 120) {
    return cache.access_token;
  }

  // Try refresh token
  if (cache?.refresh_token) {
    try {
      const token = await refreshToken(cache, tenant);
      if (token) return token;
    } catch (err) {
      log(`Token refresh failed: ${err.message}`);
    }
  }

  // Need interactive login
  if (!interactive) {
    throw new Error(
      "M365 auth required. Run: node scripts/m365-auth.js --login"
    );
  }

  return await deviceCodeLogin(tenant);
}

// —— CLI interface ——————————————————————————————————————
const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename);

if (isMain) {
  const { values } = parseArgs({
    options: {
      login:  { type: "boolean" },
      status: { type: "boolean" },
      logout: { type: "boolean" },
      tenant: { type: "string" },
    },
    strict: false,
  });

  if (values.logout) {
    clearCache();
    process.exit(0);
  }

  if (values.status) {
    const cache = readCache();
    if (!cache) {
      console.log("No cached tokens. Run: node scripts/m365-auth.js --login");
      process.exit(1);
    }
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = cache.expires_on - now;
    console.log(`Tenant:      ${cache.tenant}`);
    console.log(`Scopes:      ${cache.scope}`);
    console.log(`Expires in:  ${expiresIn > 0 ? `${Math.floor(expiresIn / 60)}m` : "EXPIRED"}`);
    console.log(`Refresh:     ${cache.refresh_token ? "Available" : "None"}`);
    process.exit(0);
  }

  if (values.login) {
    try {
      await deviceCodeLogin(values.tenant || DEFAULT_TENANT);
      process.exit(0);
    } catch (err) {
      log(`Login failed: ${err.message}`);
      process.exit(1);
    }
  }

  console.log("Usage:");
  console.log("  node scripts/m365-auth.js --login   # Authenticate via device code");
  console.log("  node scripts/m365-auth.js --status   # Show cached token info");
  console.log("  node scripts/m365-auth.js --logout   # Clear cached tokens");
  process.exit(0);
}
