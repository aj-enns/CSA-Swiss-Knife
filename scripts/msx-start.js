#!/usr/bin/env node

/**
 * MSX CRM MCP Server launcher (package mode).
 *
 * Starts the published MSX MCP server package via npx so this repo no
 * longer depends on a local mcp/msx source checkout.
 */

import { spawnSync, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(ROOT, ".env");

function loadEnv() {
  if (!existsSync(envFile)) return;
  const lines = readFileSync(envFile, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function preflightAzAuth() {
  try {
    execSync("az account show", {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 10_000,
    });
  } catch {
    process.stderr.write("[msx] Azure CLI is not authenticated. Run: az login\n");
  }
}

loadEnv();
preflightAzAuth();

const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";
const passthrough = process.argv.slice(2);

const result = spawnSync(
  npx,
  [
    "-y",
    "--@microsoft:registry=https://npm.pkg.github.com",
    "@microsoft/msx-mcp-server@latest",
    ...passthrough,
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_loglevel: process.env.npm_config_loglevel || "error",
    },
    shell: false,
  },
);

if (result.error) {
  process.stderr.write(`[msx] Failed to start package: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
