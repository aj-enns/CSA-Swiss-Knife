#!/usr/bin/env node

/**
 * Generic stdio ↔ Streamable HTTP MCP proxy.
 *
 * Bridges remote MCP servers (Streamable HTTP transport) into a local
 * stdio MCP server so Copilot CLI can consume them — it doesn't support
 * remote HTTP MCP servers with auth natively.
 *
 * Auth: acquires a bearer token from Azure CLI for the specified resource
 * and tenant, caches it, and refreshes before expiry.
 *
 * Usage (from .mcp.json or command line):
 *   node scripts/http-proxy.js --url <REMOTE_URL> --resource <AUTH_RESOURCE> [--tenant <TENANT_ID>] [--name <SERVER_NAME>]
 *
 * Examples:
 *   node scripts/http-proxy.js \
 *     --url https://api.fabric.microsoft.com/v1/mcp/powerbi \
 *     --resource https://analysis.windows.net/powerbi/api
 *
 *   node scripts/http-proxy.js \
 *     --url https://agent365.svc.cloud.microsoft/agents/tenants/.../servers/mcp_CalendarTools \
 *     --resource https://agent365.svc.cloud.microsoft
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, delimiter } from "node:path";
import { homedir, platform } from "node:os";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

// —— Parse CLI arguments ————————————————————————————————
const { values: args } = parseArgs({
  options: {
    url:      { type: "string" },
    resource: { type: "string" },
    auth:     { type: "string" },   // "m365" for device-code flow, omit for az CLI
    tenant:   { type: "string" },
    name:     { type: "string" },
  },
  strict: false,
});

if (!args.url) {
  console.error("Usage: http-proxy.js --url <REMOTE_URL> [--resource <AUTH_RESOURCE> | --auth m365] [--tenant <TENANT_ID>]");
  process.exit(1);
}

const REMOTE_URL = args.url;
const AUTH_RESOURCE = args.resource;
const AUTH_MODE = args.auth;  // "m365" or undefined
const DEFAULT_TENANT_ID = "72f988bf-86f1-41af-91ab-2d7cd011db47";

const isWin = platform() === "win32";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(ROOT, ".env");

// —— Load .env ——————————————————————————————————————————
if (existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const TENANT_ID = args.tenant || process.env.MSX_TENANT_ID || DEFAULT_TENANT_ID;
const SERVER_NAME = args.name || new URL(REMOTE_URL).pathname.split("/").pop() || "http-proxy";

// —— Ensure PATH includes common tool locations ———————————
const home = homedir();
const extraDirs = isWin
  ? [
      resolve(process.env.ProgramFiles || "C:\\Program Files", "Microsoft SDKs", "Azure", "CLI2", "wbin"),
      resolve(home, "AppData", "Local", "Programs", "Azure CLI"),
      resolve(home, "miniconda3", "Scripts"),
      resolve(home, "anaconda3", "Scripts"),
    ]
  : [
      `${home}/miniconda3/bin`,
      `${home}/anaconda3/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ];

const existing = extraDirs.filter((d) => existsSync(d));
if (existing.length) {
  const current = process.env.PATH || "";
  const parts = current.split(delimiter);
  const missing = existing.filter((d) => !parts.includes(d));
  if (missing.length) {
    process.env.PATH = [...missing, current].join(delimiter);
  }
}

// —— Resolve az CLI path ————————————————————————————————
let _azPath;
function getAz() {
  if (_azPath) return _azPath;
  if (isWin) { _azPath = "az.cmd"; return _azPath; }
  const candidates = [
    `${home}/miniconda3/bin/az`,
    `${home}/anaconda3/bin/az`,
    "/opt/homebrew/bin/az",
    "/usr/local/bin/az",
    "/usr/bin/az",
  ];
  for (const p of candidates) {
    if (existsSync(p)) { _azPath = p; return _azPath; }
  }
  _azPath = "az";
  return _azPath;
}

// —— Token management ———————————————————————————————————
// Two auth modes:
//   --resource <URL>  → az CLI token (for Power BI, etc.)
//   --auth m365       → device-code flow via m365-auth.js (for agent365 servers)

let cachedToken = null;
let tokenExpiry = 0;

// az CLI token (synchronous) — uses execFileSync (no shell) to avoid injection
function getAzToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;

  const az = getAz();
  let token;
  try {
    token = execFileSync(
      az,
      [
        "account", "get-access-token",
        "--resource", AUTH_RESOURCE,
        "--tenant", TENANT_ID,
        "--query", "accessToken",
        "-o", "tsv",
      ],
      { encoding: "utf-8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch (err) {
    const msg = err.stderr || err.message || "";
    if (msg.includes("AADSTS") || msg.includes("login")) {
      throw new Error(
        `Azure CLI session expired. Run:\n  az login --tenant ${TENANT_ID}\nThen restart this proxy.`
      );
    }
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      throw new Error(
        "Azure CLI not found. Install from https://learn.microsoft.com/cli/azure/install-azure-cli"
      );
    }
    throw new Error(`Azure CLI error: ${msg}`);
  }

  if (!token) throw new Error("Azure CLI returned an empty token.");

  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    );
    tokenExpiry = payload.exp * 1000;
  } catch {
    tokenExpiry = Date.now() + 50 * 60_000;
  }
  cachedToken = token;
  return token;
}

// M365 device-code token (async)
let _getM365Token;
async function getM365TokenCached() {
  if (!_getM365Token) {
    const mod = await import("./m365-auth.js");
    _getM365Token = mod.getM365Token;
  }
  return _getM365Token({ tenant: TENANT_ID });
}

// Unified token getter
async function getToken() {
  if (AUTH_MODE === "m365") return getM365TokenCached();
  if (AUTH_RESOURCE) return getAzToken();
  return null;
}

// —— Main ———————————————————————————————————————————————
function log(msg) {
  process.stderr.write(`[http-proxy:${SERVER_NAME}] ${msg}\n`);
}

async function main() {
  // Validate auth before connecting
  if (AUTH_MODE === "m365" || AUTH_RESOURCE) {
    try {
      await getToken();
    } catch (err) {
      log(`Auth failed: ${err.message}`);
      log("");
      log("Troubleshooting:");
      if (AUTH_MODE === "m365") {
        log("  1. Run 'node scripts/m365-auth.js --login' to authenticate.");
      } else {
        log(`  1. Run 'az login --tenant ${TENANT_ID}'`);
      }
      log("  2. Run 'node scripts/init.js' to install dependencies.");
      process.exit(1);
    }
  }

  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListPromptsRequestSchema,
  } = await import("@modelcontextprotocol/sdk/types.js");

  // —— Upstream client (remote HTTP endpoint) ———————————
  const upstreamTransport = new StreamableHTTPClientTransport(
    new URL(REMOTE_URL),
    {
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        const token = await getToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return globalThis.fetch(url, { ...init, headers });
      },
    }
  );

  const upstream = new Client(
    { name: `proxy-${SERVER_NAME}`, version: "1.0.0" },
    { capabilities: {} }
  );
  await upstream.connect(upstreamTransport);
  log(`Connected to upstream: ${REMOTE_URL}`);

  // —— Discover upstream capabilities ———————————————————
  const serverCapabilities = upstream.getServerCapabilities();
  const capabilities = {};
  if (serverCapabilities?.tools) capabilities.tools = {};
  if (serverCapabilities?.resources) capabilities.resources = {};
  if (serverCapabilities?.prompts) capabilities.prompts = {};
  if (Object.keys(capabilities).length === 0) capabilities.tools = {};

  // —— Local stdio server ———————————————————————————————
  const server = new Server(
    { name: SERVER_NAME, version: "1.0.0" },
    { capabilities }
  );

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    return await upstream.listTools(request.params);
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return await upstream.callTool(request.params);
  });

  if (capabilities.resources) {
    server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      return await upstream.listResources(request.params);
    });
  }

  if (capabilities.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      return await upstream.listPrompts(request.params);
    });
  }

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  log("stdio proxy ready");

  const shutdown = async () => {
    await server.close();
    await upstream.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log(`Failed to start: ${err.message || err}`);
  log("");
  log("Troubleshooting:");
  log(`  1. Run 'az login --tenant ${args.tenant || DEFAULT_TENANT_ID}'`);
  log("  2. Run 'node scripts/init.js' to install dependencies.");
  process.exit(1);
});
