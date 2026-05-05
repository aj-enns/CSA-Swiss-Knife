#!/usr/bin/env node

/**
 * setup-vault.js — Scaffold an Obsidian vault for OIL and sync .github/ → sidekick/.
 *
 * Two jobs:
 *   1. **Scaffold**: Create the base OIL folder structure if missing
 *   2. **Sync**: Copy repo .github/{agents,instructions,skills,prompts} → vault/sidekick/
 *
 * The sync is additive — it copies repo artifacts into sidekick/ but never
 * deletes local-only files the user created there. Files from the repo
 * overwrite their counterparts in sidekick/ (repo is source-of-truth for
 * shared artifacts; local overrides live alongside them).
 *
 * Usage:
 *   node scripts/setup-vault.js                  # scaffold + sync (auto-detects vault)
 *   node scripts/setup-vault.js /path/to/vault   # explicit vault path
 *   node scripts/setup-vault.js --sync-only       # skip scaffold, just sync sidekick
 *   node scripts/setup-vault.js --scaffold-only   # skip sync, just create folders
 *   node scripts/setup-vault.js --check            # dry-run: show what would be created/synced
 *
 * Also importable:
 *   import { scaffoldVault, syncSidekick } from './setup-vault.js';
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  copyFileSync,
} from "node:fs";
import { resolve, join, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVaultRoot, assertWithinVault } from "./lib/secure-path.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function ok(msg) { console.log(`  ✔ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function info(msg) { console.log(`  → ${msg}`); }

// ── OIL vault base folders ──────────────────────────────────────────

const VAULT_FOLDERS = [
  "Customers",
  "People",
  "Meetings",
  "Daily",
  "Weekly",
  "Projects",
  "Inbox",
  "Resources",
  "Tags",
  "Dashboard",
  "_agent-log",
  ".connect/hooks",
  "sidekick",
  "sidekick/agents",
  "sidekick/instructions",
  "sidekick/skills",
  "sidekick/prompts",
  "sidekick/tools",
  "sidekick/triggers",
];

// ── Sidekick sync sources (.github/ → sidekick/) ───────────────────

const SYNC_MAP = [
  { src: ".github/agents",      dest: "sidekick/agents" },
  { src: ".github/instructions", dest: "sidekick/instructions" },
  { src: ".github/skills",      dest: "sidekick/skills" },
  { src: ".github/prompts",     dest: "sidekick/prompts" },
];

// ── Helpers ─────────────────────────────────────────────────────────

function resolveVaultPath(explicit) {
  if (explicit) return explicit;
  // Try live env vars
  if (process.env.OBSIDIAN_VAULT) return process.env.OBSIDIAN_VAULT;
  if (process.env.OBSIDIAN_VAULT_PATH) return process.env.OBSIDIAN_VAULT_PATH;
  // Try .env file
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^OBSIDIAN_VAULT_PATH\s*=\s*(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/**
 * Recursively collect all files under `dir`, returning paths relative to `dir`.
 */
function walkFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Skip hidden dirs like .DS_Store, .space, .git
    if (entry.name.startsWith(".")) continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const child of walkFiles(full)) {
        results.push(join(entry.name, child));
      }
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

// ── Scaffold ────────────────────────────────────────────────────────

/**
 * Create the base OIL folder structure in the vault.
 * @param {string} vaultPath
 * @param {{ dryRun?: boolean }} opts
 * @returns {{ created: string[], existed: string[] }}
 */
export function scaffoldVault(vaultPath, opts = {}) {
  const vaultRoot = resolveVaultRoot(vaultPath);
  const created = [];
  const existed = [];

  for (const folder of VAULT_FOLDERS) {
    const target = join(vaultRoot, folder);
    assertWithinVault(target, vaultRoot);
    if (existsSync(target)) {
      existed.push(folder);
    } else {
      if (!opts.dryRun) {
        mkdirSync(target, { recursive: true });
      }
      created.push(folder);
    }
  }

  return { created, existed };
}

// ── Sync ────────────────────────────────────────────────────────────

/**
 * Sync repo .github/ artifacts into vault/sidekick/.
 * Overwrites matching files; leaves local-only files untouched.
 *
 * @param {string} vaultPath
 * @param {{ dryRun?: boolean }} opts
 * @returns {{ copied: string[], skipped: string[], unchanged: string[] }}
 */
export function syncSidekick(vaultPath, opts = {}) {
  const vaultRoot = resolveVaultRoot(vaultPath);
  const copied = [];
  const skipped = [];
  const unchanged = [];

  for (const { src, dest } of SYNC_MAP) {
    const srcDir = join(ROOT, src);
    const destDir = join(vaultRoot, dest);
    assertWithinVault(destDir, vaultRoot);

    if (!existsSync(srcDir)) {
      skipped.push(`${src} (source missing)`);
      continue;
    }

    const files = walkFiles(srcDir);

    for (const relFile of files) {
      const srcFile = join(srcDir, relFile);
      const destFile = join(destDir, relFile);

      // Check if destination already has identical content
      if (existsSync(destFile)) {
        try {
          const srcContent = readFileSync(srcFile);
          const destContent = readFileSync(destFile);
          if (srcContent.equals(destContent)) {
            unchanged.push(join(dest, relFile));
            continue;
          }
        } catch {
          // If comparison fails, fall through to copy
        }
      }

      if (!opts.dryRun) {
        mkdirSync(dirname(destFile), { recursive: true });
        copyFileSync(srcFile, destFile);
      }
      copied.push(join(dest, relFile));
    }
  }

  return { copied, skipped, unchanged };
}

// ── CLI entry point ─────────────────────────────────────────────────
const isCLI =
  process.argv[1] &&
  resolve(process.argv[1]).replace(/\.js$/, "") ===
    resolve(__dirname, "setup-vault").replace(/\.js$/, "");

if (isCLI) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--check");
  const syncOnly = args.includes("--sync-only");
  const scaffoldOnly = args.includes("--scaffold-only");

  const explicit = args.find((a) => !a.startsWith("--"));
  const rawVaultPath = resolveVaultPath(explicit);

  if (!rawVaultPath) {
    console.log("\n  No vault path found. Set OBSIDIAN_VAULT in your environment,");
    console.log("  or pass it explicitly: node scripts/setup-vault.js /path/to/vault\n");
    process.exit(1);
  }

  let vaultPath;
  try {
    vaultPath = resolveVaultRoot(rawVaultPath);
  } catch (err) {
    warn(`Vault path rejected: ${err.message}`);
    warn("Ensure the path exists and is a valid directory.\n");
    process.exit(1);
  }

  const modeLabel = dryRun ? " (dry run)" : "";

  // ── Scaffold ────────────────────────────────────────────────────
  if (!syncOnly) {
    console.log(`\n  Vault scaffold${modeLabel}: ${vaultPath}\n`);
    const { created, existed } = scaffoldVault(vaultPath, { dryRun });

    for (const f of existed) ok(`${f}/`);
    for (const f of created) info(`${dryRun ? "would create" : "created"} ${f}/`);

    if (created.length === 0) {
      ok("All base folders already exist.");
    } else {
      ok(`${dryRun ? "Would create" : "Created"} ${created.length} folder(s).`);
    }
  }

  // ── Sync ────────────────────────────────────────────────────────
  if (!scaffoldOnly) {
    console.log(`\n  Sidekick sync${modeLabel}: .github/ → ${vaultPath}/sidekick/\n`);
    const { copied, skipped, unchanged } = syncSidekick(vaultPath, { dryRun });

    for (const f of skipped) warn(f);

    if (copied.length > 0) {
      for (const f of copied) info(`${dryRun ? "would copy" : "synced"} ${f}`);
      ok(`${dryRun ? "Would sync" : "Synced"} ${copied.length} file(s).`);
    } else {
      ok("Sidekick is up to date — no files changed.");
    }

    if (unchanged.length > 0) {
      ok(`${unchanged.length} file(s) already identical.`);
    }
  }

  console.log();
  process.exit(0);
}
