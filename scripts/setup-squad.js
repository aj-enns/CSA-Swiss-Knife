#!/usr/bin/env node

/**
 * Squad setup helper for MCAPS IQ.
 *
 * Installs the Squad CLI globally (if not already present),
 * runs `squad init` in the workspace, and prints guidance on
 * setting up the recommended sales/SA agent team.
 *
 * Usage:
 *   node scripts/setup-squad.js          # interactive setup
 *   node scripts/setup-squad.js --check  # verify squad is installed
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const isWindows = process.platform === "win32";

// ── helpers ─────────────────────────────────────────────────────────
function tryRun(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function run(cmd, cwd) {
  execSync(cmd, {
    cwd: cwd || ROOT,
    stdio: "inherit",
    shell: isWindows ? true : "/bin/sh",
  });
}

function heading(text) {
  const bar = "─".repeat(60);
  console.log(`\n${bar}\n  ${text}\n${bar}`);
}

function ok(msg) {
  console.log(`  ✔ ${msg}`);
}
function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}
function fail(msg) {
  console.log(`  ✖ ${msg}`);
}

// ── check if Squad CLI is installed ────────────────────────────────
function isSquadInstalled() {
  const version = tryRun("squad --version");
  return version !== null;
}

// ── check if squad is already initialized ──────────────────────────
function isSquadInitialized() {
  return existsSync(resolve(ROOT, ".squad", "team.md"));
}

// ── check-only mode ─────────────────────────────────────────────────
function checkOnly() {
  heading("Checking Squad installation");

  if (isSquadInstalled()) {
    const version = tryRun("squad --version");
    ok(`Squad CLI installed: ${version}`);
  } else {
    fail("Squad CLI is not installed.");
    console.log("  Install with: npm install -g @bradygaster/squad-cli");
    console.log("  Or run:       npm run squad:setup");
  }

  if (isSquadInitialized()) {
    ok("Squad is initialized in this workspace (.squad/ exists)");
  } else {
    warn("Squad is not yet initialized in this workspace.");
    console.log("  Run: npm run squad:setup");
  }

  return isSquadInstalled();
}

// ── install Squad CLI ───────────────────────────────────────────────
function installSquadCli() {
  heading("Installing Squad CLI");

  if (isSquadInstalled()) {
    const version = tryRun("squad --version");
    ok(`Squad CLI already installed: ${version}`);
    return true;
  }

  console.log("  Installing @bradygaster/squad-cli globally...\n");
  try {
    run("npm install -g @bradygaster/squad-cli");
    ok("Squad CLI installed successfully!");
    return true;
  } catch {
    fail("Failed to install Squad CLI.");
    console.log();
    console.log("  Try installing manually:");
    console.log("    npm install -g @bradygaster/squad-cli");
    if (!isWindows) {
      console.log("    # or with sudo:");
      console.log("    sudo npm install -g @bradygaster/squad-cli");
    }
    return false;
  }
}

// ── initialize squad ────────────────────────────────────────────────
function initSquad() {
  heading("Initializing Squad in workspace");

  if (isSquadInitialized()) {
    ok("Squad is already initialized (.squad/ exists)");
    console.log("  Your existing team state is preserved.");
    console.log("  To upgrade Squad files: squad upgrade");
    return true;
  }

  console.log("  Running squad init...\n");
  try {
    run("squad init", ROOT);
    ok("Squad initialized! .squad/ directory created.");
    return true;
  } catch {
    fail("squad init failed.");
    console.log("  Try running manually: squad init");
    return false;
  }
}

// ── print team setup guidance ───────────────────────────────────────
function printTeamGuidance() {
  heading("Recommended Team for Sales & Solution Architecture");

  console.log(`
  MCAPS IQ recommends a 5+1 agent team for sellers and solution architects.
  Open Copilot Chat or the Squad shell and describe your team:

  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  "Set up my team with these roles:                              │
  │                                                                 │
  │   1. Experience Orchestrator — routes work to specialists       │
  │      and assembles seller-ready experience bundles              │
  │                                                                 │
  │   2. Data & Signal Synthesizer — pulls and normalizes           │
  │      signals from Power BI, CRM, and M365                      │
  │                                                                 │
  │   3. Sales Excellence & Win Strategy Lead — converts            │
  │      signals into winning plays, programs, and positioning      │
  │                                                                 │
  │   4. Artifact Builder — produces demos, POV decks,              │
  │      scripts, one-pagers, and workshop kits                     │
  │                                                                 │
  │   5. Contrarian Coach — red-teams the plan and coaches          │
  │      seller readiness with objection handling                   │
  │                                                                 │
  │  Optional 6th:                                                  │
  │   6. Work Context Comms Agent — drafts briefs, follow-ups,      │
  │      recaps, and exec-ready messages"                           │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘

  Squad will propose named agents from a theme. Type 'yes' to confirm.

  Additional optional roles (add any that fit your workflow):
    •  7. Portfolio Strategist — account prioritization & landscape
    •  8. Deal Governance & Stage Authority — MCEM exit criteria
    •  9. Financial & Pricing Advisor — Azure cost modeling
    • 10. BI & Consumption Analytics Specialist — Power BI deep dives
    • 11. Impact & Evidence Curator — Connect hooks & nominations
    • 12. Partner & Co-Sell Coordinator — partner delivery motions
    • 13. Enablement & Readiness Coach — HoK, skilling, sales skills

  Theme ideas (include in your prompt to pick one):
    • "Use a heist crew theme"
    • "Use a space mission theme"
    • "Use a kitchen brigade theme"
    • "Use a war room theme"

  Learn more:
    • Roles:   https://microsoft.github.io/MCAPS-IQ/squads/roles/
    • Themes:  https://microsoft.github.io/MCAPS-IQ/squads/themes/
`);
}

// ── main ────────────────────────────────────────────────────────────
const checkMode = process.argv.includes("--check");

if (checkMode) {
  const ok = checkOnly();
  process.exit(ok ? 0 : 1);
} else {
  const installed = installSquadCli();

  if (!installed) {
    process.exit(1);
  }

  const initialized = initSquad();

  if (initialized) {
    printTeamGuidance();
    heading("Squad is ready! 🎯");
    console.log(`
  Next steps:
    1. Open the Squad shell:     squad
    2. Or use Copilot Chat:      Select the Squad agent in VS Code
    3. Describe your team using the template above
    4. Pick a theme and confirm your agents
    5. Start working: "Prep my account plan for [Customer]"
`);
  } else {
    heading("Setup incomplete — see errors above");
    process.exit(1);
  }
}
