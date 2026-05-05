#!/usr/bin/env node

/**
 * Cross-platform environment initializer for mcaps-iq.
 *
 * Usage:
 *   node scripts/init.js          # optional local tooling setup + environment bootstrap
 *   node scripts/init.js --check  # verify runtime prerequisites and local tooling status
 *
 * Exit codes:
 *   0 — success
 *   1 — one or more steps failed
 */

import { execSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { ensureGithubPackagesAuth } from "./github-packages-auth.js";
import { persistVaultToShellProfile } from "./setup-vault-env.js";
import { scaffoldVault, syncSidekick } from "./setup-vault.js";

// ── repo root (scripts/ lives one level below) ──────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Package-based MCP server definitions ────────────────────────────
// These servers are launched on-demand from npm via npx and do not
// require local source checkout in this repo.
const PACKAGE_SERVERS = [
  {
    name: "msx",
    package: "@microsoft/msx-mcp-server@latest",
  },
  {
    name: "oil (Obsidian Intelligence Layer)",
    package: "@jinlee794/obsidian-intelligence-layer@latest",
    note: "Requires OBSIDIAN_VAULT_PATH to use vault tools.",
  },
];

// ── prerequisite checks ─────────────────────────────────────────────
const PREREQS = [
  { cmd: "git --version", label: "Git" },
  { cmd: "node --version", label: "Node.js", minMajor: 18 },
  { cmd: "npm --version", label: "npm" },
];

// ── helpers ─────────────────────────────────────────────────────────
const isWindows = process.platform === "win32";

function run(cmd, cwd) {
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    shell: isWindows ? true : "/bin/sh",
  });
}

function tryRun(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
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

// ── prerequisite validation ─────────────────────────────────────────
function checkPrereqs() {
  heading("Checking prerequisites");
  let passed = true;

  for (const { cmd, label, minMajor } of PREREQS) {
    const version = tryRun(cmd);
    if (!version) {
      fail(`${label} not found — install it before continuing.`);
      passed = false;
      continue;
    }
    if (minMajor) {
      const major = parseInt(version.replace(/^v/, ""), 10);
      if (major < minMajor) {
        fail(`${label} ${version} found — need v${minMajor}+`);
        passed = false;
        continue;
      }
    }
    ok(`${label} ${version}`);
  }

  // Azure CLI — optional but recommended
  const azVersion = tryRun("az version --query '\"azure-cli\"' -o tsv");
  if (azVersion) {
    ok(`Azure CLI ${azVersion}`);

    // Check if the user is actually signed in
    const account = tryRun("az account show --query user.name -o tsv");
    if (account) {
      ok(`Signed in as ${account}`);
    } else {
      warn("Azure CLI installed but not signed in — run: az login");
    }
  } else {
    warn("Azure CLI not found — needed for CRM authentication.");
    warn("  Install: https://learn.microsoft.com/cli/azure/install-azure-cli");
  }

  const ghVersion = tryRun("gh --version");
  if (ghVersion) {
    ok(`GitHub CLI ${ghVersion.split("\n")[0].replace("gh version ", "")}`);
    const ghStatus = tryRun("gh auth status");
    if (ghStatus && ghStatus.includes("read:packages")) {
      ok("GitHub Packages auth available via GitHub CLI");
    } else if (ghStatus) {
      warn("GitHub CLI is signed in, but no account with read:packages was detected.");
      warn("  Run: npm run auth:packages");
    } else {
      warn("GitHub CLI installed but not signed in.");
      warn("  Run: npm run auth:packages");
    }
  } else {
    console.log();
    console.log("  \x1b[1m\x1b[31m╔══════════════════════════════════════════════════════════╗\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║   GitHub CLI (gh) is NOT installed.                      ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║   It is required for private MCP package auth.           ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║   It will be installed automatically during setup,       ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║   or install manually:                                   ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m");
    console.log("  \x1b[1m\x1b[33m║     macOS:    brew install gh                            ║\x1b[0m");
    console.log("  \x1b[1m\x1b[33m║     Windows:  winget install --id GitHub.cli             ║\x1b[0m");
    console.log("  \x1b[1m\x1b[33m║     Linux:    https://github.com/cli/cli#installation    ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m╚══════════════════════════════════════════════════════════╝\x1b[0m");
    console.log();
  }

  return passed;
}

// ── server initialization ───────────────────────────────────────────
function initServers() {
  heading("Package-based MCP servers (npx)");
  for (const server of PACKAGE_SERVERS) {
    ok(`${server.name} — resolved at runtime via npx (${server.package})`);
    if (server.note) {
      console.log(`    ${server.note}`);
    }
  }
  console.log("    Private GitHub Packages can be bootstrapped with: npm run auth:packages");

  return true;
}

// ── check-only mode ─────────────────────────────────────────────────
function checkOnly() {
  const prereqsOk = checkPrereqs();

  heading("Checking package-based MCP servers");
  for (const server of PACKAGE_SERVERS) {
    ok(`${server.name} — configured for npx package launch (${server.package})`);
    if (server.note) {
      console.log(`    ${server.note}`);
    }
  }
  console.log("    Private GitHub Packages bootstrap: npm run auth:packages");

  // Check Agency CLI status
  heading("Checking Agency CLI");
  const agencyCheck = tryRun("agency --help");
  if (agencyCheck) {
    ok("Agency CLI is installed.");
  } else {
    warn("Agency CLI is not installed.");
    if (isWindows) {
      warn('  Install: iex "& { $(irm aka.ms/InstallTool.ps1)} agency"');
    } else {
      warn("  Install: curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency");
    }
    warn("  Details: https://aka.ms/agency");
  }

  if (prereqsOk) {
    heading("Runtime environment is ready ✔");
  } else {
    heading("Runtime prerequisites have issues — fix the errors above");
  }
  return prereqsOk;
}

// ── global alias registration ───────────────────────────────────────
function printAliasFallback() {
  const binPath = join(ROOT, "bin", "mcaps.js");
  if (isWindows) {
    const escaped = binPath.replace(/\\/g, "\\\\");
    console.log();
    warn("  Alternatives for PowerShell:");
    warn("");
    warn("  Option 1 — Add a function to your PowerShell profile:");
    warn(`    Add-Content $PROFILE 'function mcaps { node "${escaped}" @args }'`);
    warn("    . $PROFILE   # reload your profile");
    warn("");
    warn("  Option 2 — Use from the repo directory:");
    warn("    node bin\\mcaps.js");
    warn("");
    warn("  Option 3 — Retry from an elevated terminal:");
    warn("    npm link --ignore-scripts");
  } else {
    warn("  Try: sudo npm link --ignore-scripts");
    warn("  Or with nvm/fnm (no sudo): npm link --ignore-scripts");
  }
}

function registerAlias() {
  heading("Registering 'mcaps' CLI alias");

  // Ensure bin script is executable on Unix
  if (!isWindows) {
    const binScript = join(ROOT, "bin", "mcaps.js");
    try {
      execSync(`chmod +x "${binScript}"`, { stdio: "pipe" });
    } catch { /* best-effort */ }
  }

  // Check if mcaps is already linked and working
  const whichCmd = isWindows ? "where mcaps" : "which mcaps";
  const existing = tryRun(whichCmd);

  try {
    // --ignore-scripts prevents recursive postinstall
    // --force overwrites if already linked (avoids EEXIST on re-install)
    // Use pipe stdio to suppress noisy npm force/warn output
    execSync("npm link --ignore-scripts --force", {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows ? true : "/bin/sh",
    });
  } catch {
    // If link failed but mcaps already exists and works, that's fine
    if (existing) {
      ok("'mcaps' is already registered globally — no changes needed.");
      return true;
    }
    warn("Could not register global alias automatically.");
    printAliasFallback();
    return false;
  }

  // Verify the command is actually reachable after linking
  const found = tryRun(whichCmd);

  if (found) {
    ok("'mcaps' is now available globally — try it from any directory!");
    return true;
  }

  // npm link appeared to succeed but the command isn't callable
  warn("npm link succeeded, but 'mcaps' was not found in your PATH.");

  if (isWindows) {
    const npmPrefix = tryRun("npm config get prefix");
    if (npmPrefix) {
      warn(`  npm global bin directory: ${npmPrefix}`);
      warn("");
      warn("  Add it to your PATH for this session:");
      warn(`    $env:PATH += ";${npmPrefix}"`);
      warn("");
      warn("  Or make it permanent:");
      warn(`    [Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";${npmPrefix}", "User")`);
    }

    // Check PowerShell execution policy (common blocker for .ps1 shims)
    const policy = tryRun('powershell -NoProfile -Command "Get-ExecutionPolicy"');
    if (policy && policy.toLowerCase() === "restricted") {
      warn("");
      warn("  PowerShell execution policy is 'Restricted' — .ps1 scripts are blocked.");
      warn("  Fix:  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser");
    }

    printAliasFallback();
  } else {
    warn("  Check: npm config get prefix");
    warn("  Make sure <prefix>/bin is in your PATH.");
  }

  return false;
}

// ── .env configuration ──────────────────────────────────────────────
function parseEnvFile(filePath) {
  const vars = {};
  if (!existsSync(filePath)) return vars;
  const lines = readFileSync(filePath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function configureEnv({ force = false } = {}) {
  const envPath = join(ROOT, ".env");
  const existing = parseEnvFile(envPath);

  if (existing.OBSIDIAN_VAULT_PATH && !force) {
    ok(`Vault path already configured: ${existing.OBSIDIAN_VAULT_PATH}`);
    return;
  }

  if (existing.OBSIDIAN_VAULT_PATH && force) {
    warn(`Current vault path: ${existing.OBSIDIAN_VAULT_PATH}`);
    console.log("  Re-entering vault configuration.\n");
  }

  // Skip prompt in non-interactive environments (CI, piped stdin)
  if (!process.stdin.isTTY) {
    warn("Non-interactive shell — skipping vault path prompt.");
    warn("Set OBSIDIAN_VAULT_PATH in .env manually for the OIL MCP server.");
    return;
  }

  heading("Obsidian Vault Configuration");
  console.log("  The OIL MCP server needs the path to your Obsidian vault.");
  console.log("  This is stored in .env (gitignored) — not committed.\n");

  let vaultPath = "";
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    vaultPath = await ask("  Obsidian vault path (or press Enter to skip): ");

    if (!vaultPath) {
      warn("Skipped — OIL server won't start without a vault path.");
      warn("You can set it later:  echo 'OBSIDIAN_VAULT_PATH=/your/path' >> .env");
      warn("Or re-run:  npm run vault:env /your/path");
      return;
    }

    if (existsSync(vaultPath)) break;

    warn(`Path does not exist: ${vaultPath}`);
    if (attempt < MAX_ATTEMPTS) {
      console.log("  Please check the path and try again.\n");
    } else {
      warn("Saving anyway — make sure the vault is created before starting OIL.");
    }
  }

  // Write to .env (replace existing value or append)
  const envLine = `OBSIDIAN_VAULT_PATH=${vaultPath}`;
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  if (content.match(/^OBSIDIAN_VAULT_PATH\s*=/m)) {
    content = content.replace(/^OBSIDIAN_VAULT_PATH\s*=.*$/m, envLine);
  } else {
    content = content + (content.length > 0 && !content.endsWith("\n") ? "\n" : "") + envLine + "\n";
  }
  writeFileSync(envPath, content, "utf-8");
  ok(`Saved to .env: OBSIDIAN_VAULT_PATH=${vaultPath}`);

  // Persist to shell profile so it's available system-wide
  try {
    const result = persistVaultToShellProfile(vaultPath);
    if (result.updated) {
      ok(`Exported OBSIDIAN_VAULT to ${result.shell} profile: ${result.profilePath}`);
      console.log("    New terminals will have OBSIDIAN_VAULT and OBSIDIAN_VAULT_PATH set.");
      console.log(`    Activate now:  source ${result.profilePath}`);
    } else {
      ok(`Shell profile already up to date (${result.profilePath})`);
    }
  } catch (err) {
    warn(`Could not update shell profile: ${err.message}`);
    warn("Set OBSIDIAN_VAULT manually in your shell profile for system-wide access.");
  }
}

// ── Agency CLI installation ─────────────────────────────────────
async function installAgencyCli() {
  heading("Agency CLI");

  // Check if agency is already installed
  const agencyVersion = tryRun("agency --help");
  if (agencyVersion) {
    ok("Agency CLI is already installed.");
    return;
  }

  warn("Agency CLI is not installed.");

  // Skip prompt in non-interactive environments
  if (!process.stdin.isTTY) {
    warn("Non-interactive shell — skipping Agency CLI prompt.");
    warn("Install manually: https://aka.ms/InstallTool.sh (macOS) or https://aka.ms/InstallTool.ps1 (Windows)");
    warn("Details: https://aka.ms/agency");
    return;
  }

  const answer = await ask("  Would you like to install Agency CLI? (yes/no): ");
  if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
    warn("Skipped — you can install Agency CLI later.");
    if (isWindows) {
      warn('  Windows: iex "& { $(irm aka.ms/InstallTool.ps1)} agency"');
    } else {
      warn("  macOS/Linux: curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency");
    }
    warn("  Details: https://aka.ms/agency");
    return;
  }

  console.log("  Installing Agency CLI...\n");

  try {
    if (isWindows) {
      // Use pwsh (PowerShell 7+) if available, fall back to powershell.exe
      const psExe = tryRun("pwsh -v") ? "pwsh" : "powershell.exe";
      const psScript = [
        'iex "& { $(irm aka.ms/InstallTool.ps1)} agency"',
        '$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")',
      ].join("; ");
      execFileSync(psExe, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
        cwd: ROOT,
        stdio: "inherit",
      });
    } else {
      run("curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency && exec $SHELL -l", ROOT);
    }

    // Verify installation
    const verifyResult = tryRun("agency --help");
    if (verifyResult) {
      ok("Agency CLI installed and verified successfully.");
    } else {
      warn("Agency CLI install completed, but 'agency --help' did not succeed.");
      warn("You may need to restart your terminal or refresh your PATH.");
    }
  } catch (err) {
    warn(`Agency CLI installation failed: ${err.message}`);
    if (isWindows) {
      warn('  Retry manually: iex "& { $(irm aka.ms/InstallTool.ps1)} agency"');
    } else {
      warn("  Retry manually: curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency");
    }
    warn("  Details: https://aka.ms/agency");
  }
}

// ── main ────────────────────────────────────────────────────────────
const checkMode = process.argv.includes("--check");
const reconfigureVault = process.argv.includes("--reconfigure-vault");

if (checkMode) {
  const ok = checkOnly();
  process.exit(ok ? 0 : 1);
} else if (reconfigureVault) {
  heading("Reconfigure Obsidian Vault Path");
  await configureEnv({ force: true });
  process.exit(0);
} else {
  const prereqsOk = checkPrereqs();
  if (!prereqsOk) {
    console.log("\nFix prerequisite issues above, then re-run this script.");
    process.exit(1);
  }

  // ── risk acknowledgement ────────────────────────────────────────
  heading("⚠  Important — Please Read");
  console.log(`
  This toolkit uses agentic AI (GitHub Copilot + MCP servers) to read
  and write CRM records, query M365 data, and suggest strategic actions.

  AI models can produce incorrect, incomplete, or misleading outputs.
  YOU are responsible for reviewing and validating every action.

  By proceeding you acknowledge that:
    • All AI-generated outputs are drafts requiring human judgment.
    • Write operations require your explicit confirmation before executing.
    • You will not rely on AI outputs without independent verification.
`);

  if (process.stdin.isTTY) {
    const consent = await ask("  Type 'yes' to accept and continue installation: ");
    if (consent.toLowerCase() !== "yes") {
      console.log("\n  Setup cancelled. Re-run when you're ready.\n");
      process.exit(0);
    }
  } else {
    warn("Non-interactive shell — proceeding with installation.");
    warn("By using this toolkit you accept the risks described above.");
  }

  const serversOk = initServers();
  if (serversOk) {
    // ── GitHub Packages auth ────────────────────────────────────
    heading("GitHub Packages authentication");
    try {
      await ensureGithubPackagesAuth();
    } catch (err) {
      warn(err.message);
      warn("You can retry later with: npm run auth:packages");
      warn("Or open Copilot Chat (Cmd+Shift+I) and ask: 'Help me debug my MCP package auth setup'");
    }

    // ── Agency CLI ────────────────────────────────────────────
    await installAgencyCli();

    await configureEnv();

    // ── Vault scaffold + sidekick sync ──────────────────────────
    const vaultDir =
      process.env.OBSIDIAN_VAULT ||
      process.env.OBSIDIAN_VAULT_PATH ||
      parseEnvFile(join(ROOT, ".env")).OBSIDIAN_VAULT_PATH;

    if (vaultDir && existsSync(vaultDir)) {
      heading("Vault scaffold + sidekick sync");
      try {
        const { created } = scaffoldVault(vaultDir);
        if (created.length > 0) {
          ok(`Created ${created.length} vault folder(s).`);
        } else {
          ok("Vault folders already in place.");
        }

        const { copied } = syncSidekick(vaultDir);
        if (copied.length > 0) {
          ok(`Synced ${copied.length} file(s) to sidekick/.`);
        } else {
          ok("Sidekick already up to date.");
        }
      } catch (err) {
        warn(`Vault setup failed: ${err.message}`);
        warn("Run manually later: npm run vault:init");
      }
    } else if (vaultDir) {
      warn(`Vault path set but does not exist: ${vaultDir}`);
      warn("Create the vault in Obsidian, then run: npm run vault:init");
    }

    const aliasOk = registerAlias();
    heading("All done ✔");

    // Prominent mcaps alias banner
    if (aliasOk) {
      console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   ★  The 'mcaps' command is now available globally.         │
  │                                                             │
  │   Open any terminal, from any directory, and type:          │
  │                                                             │
  │       mcaps                                                 │
  │                                                             │
  │   This launches Copilot CLI with all MCAPS IQ servers,      │
  │   agents, and skills loaded — no need to cd into the repo.  │
  │                                                             │
  │   Requires: Copilot CLI (brew install copilot-cli)          │
  │   Fallback: opens VS Code if Copilot CLI isn't installed.   │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
`);
    }

    // Check if already signed in to provide the right next step
    const account = tryRun("az account show --query user.name -o tsv");
    if (account) {
      console.log(`
  You're signed in as ${account}. Everything is ready!

  Next steps:
    1. Open this repo in VS Code:  code .
    2. MCP servers auto-start via .vscode/mcp.json
    3. Open Copilot chat (Cmd+Shift+I) and try: "Who am I in MSX?"
    4. Or just run 'mcaps' from any terminal!
`);
    } else {
      console.log(`
  Next steps:
    1. Connect to Microsoft VPN
    2. Sign in to Azure:        az login
    3. Open this repo in VS Code:  code .
    4. MCP servers auto-start via .vscode/mcp.json
    5. Open Copilot chat (Cmd+Shift+I) and try: "Who am I in MSX?"
    6. Or just run 'mcaps' from any terminal!
`);
    }
  } else {
    heading("Some steps failed — see errors above");
    process.exit(1);
  }
}
