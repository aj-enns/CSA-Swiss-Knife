#!/usr/bin/env node

/**
 * mcaps — launch a GitHub Copilot CLI session in the mcaps-iq repo.
 *
 * Installed globally via `npm link` so it works from any directory.
 * Prefers `agency copilot` if Agency CLI is available, otherwise falls
 * back to bare `copilot`. Sets the working directory to the repo root
 * so MCP servers, agents, and skills are auto-detected.
 *
 * Falls back to opening VS Code if neither CLI is installed.
 */

import { spawnSync, execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVaultRoot } from "../scripts/lib/secure-path.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const isWindows = process.platform === "win32";
const args = process.argv.slice(2);

// Build copilot args: always enable all tools and add the repo dir
const copilotArgs = ["--experimental", "--allow-all-tools", "--add-dir", ROOT];

// If OBSIDIAN_VAULT env var is set, validate and include the vault as an additional dir
const rawVaultDir = process.env.OBSIDIAN_VAULT || process.env.OBSIDIAN_VAULT_PATH;
if (rawVaultDir) {
  try {
    const vaultDir = resolveVaultRoot(rawVaultDir);
    copilotArgs.push("--add-dir", vaultDir);
  } catch (err) {
    console.error(`⚠ Vault path rejected: ${err.message}`);
    console.error("  Continuing without vault directory.\n");
  }
}

copilotArgs.push(...args);

// Detect whether Agency CLI is available
function hasAgency() {
  try {
    execSync("agency --help", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

let result;

if (hasAgency()) {
  // Use `agency copilot` — Agency wraps Copilot CLI with MCP servers
  result = spawnSync("agency", ["copilot", ...copilotArgs], {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWindows,
  });
} else {
  // Fall back to bare `copilot`
  result = spawnSync("copilot", copilotArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWindows,
  });
}

if (result.error && result.error.code === "ENOENT") {
  // Neither CLI found — try opening VS Code as fallback
  console.log("Agency CLI ('agency') and Copilot CLI ('copilot') are both required.\n");
  console.log("1. Install Agency CLI:");
  if (isWindows) {
    console.log('     iex "& { $(irm aka.ms/InstallTool.ps1)} agency"');
  } else {
    console.log("     curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency");
  }
  console.log("\n2. Install Copilot CLI:");
  console.log("     macOS:  brew install copilot-cli");
  console.log("     npm:    npm install -g @github/copilot\n");
  console.log("Detailed instructions: https://aka.ms/agency\n");
  console.log("Falling back to VS Code...\n");

  result = spawnSync("code", [ROOT], {
    stdio: "inherit",
    shell: isWindows,
  });

  if (result.error) {
    console.error("VS Code ('code') also not found in PATH.");
    console.error("Open this repo manually: " + ROOT);
    process.exit(1);
  }
}

process.exit(result.status ?? 1);
