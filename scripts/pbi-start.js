#!/usr/bin/env node

/**
 * Power BI MCP Proxy — stdio ↔ Streamable HTTP bridge.
 *
 * The Fabric Power BI MCP endpoint uses Streamable HTTP transport with
 * Microsoft auth. VS Code handles auth natively via its built-in provider,
 * but Copilot CLI does not — so this proxy bridges the gap.
 *
 * How it works:
 *   1. Gets a bearer token from Azure CLI (Power BI resource)
 *   2. Connects upstream to the Fabric endpoint as an MCP client
 *   3. Exposes all remote tools locally via stdio transport (MCP server)
 *   4. Forwards tool calls from the host through to Fabric
 *
 * Works identically in VS Code and Copilot CLI.
 *
 * Token lifecycle: tokens are cached in memory and refreshed automatically
 * before expiry. Each upstream HTTP request uses a fresh-or-cached token.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, delimiter } from "node:path";
import { homedir, platform } from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const isWin = platform() === "win32";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(ROOT, ".env");

const FABRIC_URL =
  process.env.PBI_MCP_URL ||
  "https://api.fabric.microsoft.com/v1/mcp/powerbi";
const PBI_RESOURCE = "https://analysis.windows.net/powerbi/api";
const DEFAULT_TENANT_ID = "72f988bf-86f1-41af-91ab-2d7cd011db47";

// ── Load .env (simple key=value, no dependency on dotenv) ──────────
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

const TENANT_ID = process.env.MSX_TENANT_ID || DEFAULT_TENANT_ID;

// ── Ensure PATH includes common tool locations ─────────────────────
const home = homedir();
const extraDirs = isWin
  ? [
      resolve(
        process.env.ProgramFiles || "C:\\Program Files",
        "Microsoft SDKs",
        "Azure",
        "CLI2",
        "wbin"
      ),
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

// ── Resolve az CLI path ────────────────────────────────────────────
let _azPath;
function getAz() {
  if (_azPath) return _azPath;
  if (isWin) {
    _azPath = "az.cmd";
    return _azPath;
  }
  const candidates = [
    `${home}/miniconda3/bin/az`,
    `${home}/anaconda3/bin/az`,
    "/opt/homebrew/bin/az",
    "/usr/local/bin/az",
    "/usr/bin/az",
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      _azPath = p;
      return _azPath;
    }
  }
  _azPath = "az";
  return _azPath;
}

// ── Token cache ────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

function getToken() {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;

  const az = getAz();
  let token;
  try {
    token = execSync(
      `"${az}" account get-access-token --resource "${PBI_RESOURCE}" --tenant "${TENANT_ID}" --query accessToken -o tsv`,
      { encoding: "utf-8", timeout: 30_000, shell: true, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch (err) {
    const msg = err.stderr || err.message || "";
    if (msg.includes("AADSTS") || msg.includes("login")) {
      throw new Error(
        `Azure CLI session expired. Run:\n  az login --tenant ${TENANT_ID}\nThen restart the Power BI MCP server.`
      );
    }
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      throw new Error(
        "Azure CLI not found. Install it from https://learn.microsoft.com/cli/azure/install-azure-cli"
      );
    }
    throw new Error(`Azure CLI error: ${msg}`);
  }

  if (!token) throw new Error("Azure CLI returned an empty token.");

  // Parse expiry from JWT payload
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    );
    tokenExpiry = payload.exp * 1000;
  } catch {
    // If we can't parse expiry, use 50 minutes from now
    tokenExpiry = Date.now() + 50 * 60_000;
  }
  cachedToken = token;
  return token;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  // Validate auth before connecting
  try {
    getToken();
  } catch (err) {
    console.error("Power BI MCP proxy: auth failed on startup.");
    console.error(err.message);
    console.error("");
    console.error("Troubleshooting:");
    console.error(`  1. Run 'az login --tenant ${TENANT_ID}'`);
    console.error("  2. Run 'node scripts/init.js' to install dependencies.");
    process.exit(1);
  }

  // Dynamic imports from root dependencies.
  const { Server } = await import(
    "@modelcontextprotocol/sdk/server/index.js"
  );
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const { Client } = await import(
    "@modelcontextprotocol/sdk/client/index.js"
  );
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListPromptsRequestSchema,
  } = await import("@modelcontextprotocol/sdk/types.js");

  // ── Upstream client (Fabric endpoint) ──────────────────────────
  const upstreamTransport = new StreamableHTTPClientTransport(
    new URL(FABRIC_URL),
    {
      // Inject a fresh token on every HTTP request
      fetch: async (url, init) => {
        const token = getToken();
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${token}`);
        return globalThis.fetch(url, { ...init, headers });
      },
    }
  );

  const upstream = new Client(
    { name: "pbi-proxy", version: "1.0.0" },
    { capabilities: {} }
  );
  await upstream.connect(upstreamTransport);

  // ── Discover upstream capabilities ─────────────────────────────
  const serverCapabilities = upstream.getServerCapabilities();
  const capabilities = {};
  if (serverCapabilities?.tools) capabilities.tools = {};
  if (serverCapabilities?.resources) capabilities.resources = {};
  if (serverCapabilities?.prompts) capabilities.prompts = {};

  // Fall back to tools-only if we can't read capabilities
  if (Object.keys(capabilities).length === 0) {
    capabilities.tools = {};
  }

  // ── Local server (stdio, facing the host) ──────────────────────
  const server = new Server(
    { name: "powerbi-remote", version: "1.0.0" },
    { capabilities }
  );

  // Forward tools/list
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    return await upstream.listTools(request.params);
  });

  // Forward tools/call
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return await upstream.callTool(request.params);
  });

  // Forward resources/list if supported
  if (capabilities.resources) {
    server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      return await upstream.listResources(request.params);
    });
  }

  // Forward prompts/list if supported
  if (capabilities.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      return await upstream.listPrompts(request.params);
    });
  }

  // ── Connect stdio transport ────────────────────────────────────
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);

  // Graceful shutdown
  const shutdown = async () => {
    await server.close();
    await upstream.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Power BI MCP proxy failed to start:", err.message || err);
  console.error("");
  console.error("Troubleshooting:");
  console.error(`  1. Run 'az login --tenant ${DEFAULT_TENANT_ID}'`);
  console.error("  2. Run 'node scripts/init.js' to install dependencies.");
  process.exit(1);
});
