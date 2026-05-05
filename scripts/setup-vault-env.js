#!/usr/bin/env node

/**
 * setup-vault-env.js — Persist OBSIDIAN_VAULT to the user's shell profile.
 *
 * Ensures the vault path is available as an environment variable across
 * all contexts: VS Code MCP servers, Copilot CLI, terminal sessions, etc.
 *
 * Sets both:
 *   OBSIDIAN_VAULT       — used by .vscode/mcp.json defaults and bin/mcaps.js
 *   OBSIDIAN_VAULT_PATH  — used by the OIL MCP server and helper scripts
 *
 * Supports:
 *   - zsh        → ~/.zshrc
 *   - bash       → ~/.bashrc (or ~/.bash_profile)
 *   - fish       → ~/.config/fish/config.fish
 *   - PowerShell → $PROFILE
 *
 * Usage:
 *   node scripts/setup-vault-env.js                   # reads from .env or prompts
 *   node scripts/setup-vault-env.js /path/to/vault    # explicit path
 *   node scripts/setup-vault-env.js --check            # show current state
 *   node scripts/setup-vault-env.js --remove           # remove block from profile
 *
 * Also importable:
 *   import { persistVaultToShellProfile } from './setup-vault-env.js';
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const isWindows = process.platform === "win32";

const BLOCK_START = "# >>> mcaps-iq vault config >>>";
const BLOCK_END = "# <<< mcaps-iq vault config <<<";

function ok(msg) { console.log(`  ✔ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }

// ── Shell profile detection ─────────────────────────────────────────

/**
 * Detect the user's shell profile file path.
 * @returns {{ profilePath: string, shell: string, format: 'posix'|'fish'|'powershell' }}
 */
function detectShellProfile() {
  if (isWindows) {
    let profilePath;
    try {
      profilePath = execSync(
        'powershell -NoProfile -Command "echo $PROFILE"',
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    } catch {
      profilePath = join(
        homedir(),
        "Documents",
        "PowerShell",
        "Microsoft.PowerShell_profile.ps1",
      );
    }
    return { profilePath, shell: "PowerShell", format: "powershell" };
  }

  const shell = process.env.SHELL || "/bin/zsh";
  const home = homedir();

  if (shell.includes("zsh")) {
    return { profilePath: join(home, ".zshrc"), shell: "zsh", format: "posix" };
  }

  if (shell.includes("bash")) {
    const bashrc = join(home, ".bashrc");
    const bashProfile = join(home, ".bash_profile");
    // Prefer .bashrc; fall back to .bash_profile if it's the only one
    if (!existsSync(bashrc) && existsSync(bashProfile)) {
      return { profilePath: bashProfile, shell: "bash", format: "posix" };
    }
    return { profilePath: bashrc, shell: "bash", format: "posix" };
  }

  if (shell.includes("fish")) {
    return {
      profilePath: join(home, ".config", "fish", "config.fish"),
      shell: "fish",
      format: "fish",
    };
  }

  // Default to zsh (macOS default since Catalina)
  return { profilePath: join(home, ".zshrc"), shell: "zsh", format: "posix" };
}

// ── Export block builders ───────────────────────────────────────────

function buildExportBlock(vaultPath, format) {
  const lines = [BLOCK_START];

  if (format === "powershell") {
    lines.push(`$env:OBSIDIAN_VAULT = "${vaultPath}"`);
    lines.push(`$env:OBSIDIAN_VAULT_PATH = "${vaultPath}"`);
  } else if (format === "fish") {
    lines.push(`set -gx OBSIDIAN_VAULT "${vaultPath}"`);
    lines.push(`set -gx OBSIDIAN_VAULT_PATH "${vaultPath}"`);
  } else {
    lines.push(`export OBSIDIAN_VAULT="${vaultPath}"`);
    lines.push(`export OBSIDIAN_VAULT_PATH="${vaultPath}"`);
  }

  lines.push(BLOCK_END);
  return lines.join("\n");
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Persist the vault path to the user's shell profile.
 * Idempotent — updates the managed block if it already exists.
 *
 * @param {string} vaultPath — Absolute path to the Obsidian vault
 * @returns {{ profilePath: string, shell: string, updated: boolean, created: boolean }}
 */
export function persistVaultToShellProfile(vaultPath) {
  const { profilePath, shell, format } = detectShellProfile();
  const exportBlock = buildExportBlock(vaultPath, format);

  let content = "";
  let created = false;

  if (existsSync(profilePath)) {
    content = readFileSync(profilePath, "utf-8");
  } else {
    created = true;
    mkdirSync(dirname(profilePath), { recursive: true });
  }

  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing managed block
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + BLOCK_END.length);
    const newContent = before + exportBlock + after;

    if (newContent === content) {
      return { profilePath, shell, updated: false, created: false };
    }

    writeFileSync(profilePath, newContent, "utf-8");
    return { profilePath, shell, updated: true, created: false };
  }

  // Append new block with a blank line separator
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n\n" : "\n";
  writeFileSync(profilePath, content + separator + exportBlock + "\n", "utf-8");
  return { profilePath, shell, updated: true, created };
}

/**
 * Remove the managed vault block from the shell profile.
 * @returns {{ profilePath: string, shell: string, removed: boolean }}
 */
export function removeVaultFromShellProfile() {
  const { profilePath, shell } = detectShellProfile();

  if (!existsSync(profilePath)) {
    return { profilePath, shell, removed: false };
  }

  const content = readFileSync(profilePath, "utf-8");
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END);

  if (startIdx === -1 || endIdx === -1) {
    return { profilePath, shell, removed: false };
  }

  // Remove the block plus surrounding blank lines
  let before = content.slice(0, startIdx);
  let after = content.slice(endIdx + BLOCK_END.length);

  // Clean up extra blank lines left behind
  if (before.endsWith("\n\n")) before = before.slice(0, -1);
  if (after.startsWith("\n")) after = after.slice(1);

  writeFileSync(profilePath, before + after, "utf-8");
  return { profilePath, shell, removed: true };
}

// ── Helpers ─────────────────────────────────────────────────────────

function readVaultFromEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return null;
  const content = readFileSync(envPath, "utf-8");
  const match = content.match(/^OBSIDIAN_VAULT_PATH\s*=\s*(.+)$/m);
  if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  return null;
}

function checkState() {
  const { profilePath, shell } = detectShellProfile();

  console.log("\n  OBSIDIAN_VAULT environment variable status:\n");

  // .env (repo-local)
  const envValue = readVaultFromEnv();
  if (envValue) {
    ok(`.env (repo-local): OBSIDIAN_VAULT_PATH=${envValue}`);
  } else {
    warn(".env (repo-local): OBSIDIAN_VAULT_PATH not set");
  }

  // Current process environment
  const v1 = process.env.OBSIDIAN_VAULT;
  const v2 = process.env.OBSIDIAN_VAULT_PATH;
  v1 ? ok(`Current shell: OBSIDIAN_VAULT=${v1}`) : warn("Current shell: OBSIDIAN_VAULT not set");
  v2 ? ok(`Current shell: OBSIDIAN_VAULT_PATH=${v2}`) : warn("Current shell: OBSIDIAN_VAULT_PATH not set");

  // Shell profile
  if (existsSync(profilePath)) {
    const content = readFileSync(profilePath, "utf-8");
    const startIdx = content.indexOf(BLOCK_START);
    const endIdx = content.indexOf(BLOCK_END);
    if (startIdx !== -1 && endIdx !== -1) {
      const block = content.slice(startIdx, endIdx);
      const match = block.match(/OBSIDIAN_VAULT="([^"]+)"/);
      ok(`${shell} profile (${profilePath}): configured${match ? ` → ${match[1]}` : ""}`);
    } else {
      warn(`${shell} profile (${profilePath}): no mcaps-iq vault block found`);
    }
  } else {
    warn(`${shell} profile (${profilePath}): file does not exist`);
  }

  console.log();
}

function printReloadHint(shell, profilePath) {
  console.log("\n  To activate in your current terminal:");
  if (shell === "PowerShell") {
    console.log("    . $PROFILE");
  } else {
    console.log(`    source ${profilePath}`);
  }
  console.log();
}

// ── CLI entry point ─────────────────────────────────────────────────
const isCLI =
  process.argv[1] &&
  resolve(process.argv[1]).replace(/\.js$/, "") ===
    resolve(__dirname, "setup-vault-env").replace(/\.js$/, "");

if (isCLI) {
  const args = process.argv.slice(2);

  if (args.includes("--check")) {
    checkState();
    process.exit(0);
  }

  if (args.includes("--remove")) {
    const result = removeVaultFromShellProfile();
    if (result.removed) {
      ok(`Removed vault config block from ${result.shell} profile: ${result.profilePath}`);
      printReloadHint(result.shell, result.profilePath);
    } else {
      warn("No mcaps-iq vault block found in shell profile — nothing to remove.");
    }
    process.exit(0);
  }

  // Accept explicit path as first non-flag argument, .env, or live env var
  let vaultPath = args.find((a) => !a.startsWith("--"))
    || readVaultFromEnv()
    || process.env.OBSIDIAN_VAULT
    || process.env.OBSIDIAN_VAULT_PATH;

  if (!vaultPath) {
    console.log("\n  No vault path found in arguments, .env, or environment.");
    console.log("  Usage: node scripts/setup-vault-env.js /path/to/vault");
    console.log("  Or run: npm run setup   (interactive prompt)\n");
    process.exit(1);
  }

  if (!existsSync(vaultPath)) {
    warn(`Path does not exist: ${vaultPath}`);
    warn("Proceeding anyway — make sure the vault is created.\n");
  }

  const result = persistVaultToShellProfile(vaultPath);

  if (!result.updated) {
    ok(`Shell profile already up to date (${result.profilePath})`);
  } else {
    ok(`Wrote vault config to ${result.shell} profile: ${result.profilePath}`);
    console.log();
    console.log("  Both variables are now exported:");
    console.log(`    OBSIDIAN_VAULT=${vaultPath}`);
    console.log(`    OBSIDIAN_VAULT_PATH=${vaultPath}`);
    printReloadHint(result.shell, result.profilePath);
  }

  process.exit(0);
}
