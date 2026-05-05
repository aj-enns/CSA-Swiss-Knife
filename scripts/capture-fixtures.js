#!/usr/bin/env node
/**
 * Fixture Capture Tool
 *
 * Connects to live MCP servers (MSX CRM, OIL vault) via the MCP SDK stdio
 * transport, calls read-only tools, and saves the responses as JSON fixtures
 * for the eval framework.
 *
 * Usage:
 *   npm run fixtures:capture                  # Capture all available servers
 *   npm run fixtures:capture -- --server crm  # CRM only
 *   npm run fixtures:capture -- --server oil  # OIL only
 *   npm run fixtures:capture -- --dry-run     # Preview what would be captured
 *   npm run fixtures:capture -- --customer Contoso  # Customer filter
 *
 * Prerequisites:
 *   - `az login` for CRM (Azure RBAC auth)
 *   - OBSIDIAN_VAULT_PATH in .env for OIL
 *
 * Output:
 *   evals/fixtures/crm-responses/*.json
 *   evals/fixtures/oil-responses/*.json
 *   evals/fixtures/m365-responses/*.json
 *   evals/fixtures/capture-manifest.json  (metadata about the capture run)
 *
 * Safety:
 *   - ONLY calls read tools — never writes, updates, or deletes
 *   - Redacts email addresses and user GUIDs with configurable patterns
 *   - All PII removal is opt-in via --redact flag
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";

// ── Paths ───────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES_DIR = join(ROOT, "evals", "fixtures");
const CRM_DIR = join(FIXTURES_DIR, "crm-responses");
const OIL_DIR = join(FIXTURES_DIR, "oil-responses");
const M365_DIR = join(FIXTURES_DIR, "m365-responses");
const MANIFEST_PATH = join(FIXTURES_DIR, "capture-manifest.json");

// ── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    servers: /** @type {string[]} */ ([]),
    dryRun: false,
    redact: false,
    customers: /** @type {string[]} */ ([]),
    verbose: false,
    help: false,
    nonInteractive: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--redact") flags.redact = true;
    else if (arg === "--verbose" || arg === "-v") flags.verbose = true;
    else if (arg === "--no-interactive" || arg === "--ci") flags.nonInteractive = true;
    else if (arg === "--server" && args[i + 1]) {
      flags.servers.push(args[++i]);
    }
    else if (arg === "--customer" && args[i + 1]) {
      flags.customers.push(args[++i]);
    }
  }

  // Default: capture all available servers
  if (flags.servers.length === 0) {
    flags.servers = ["crm", "oil", "m365"];
  }

  return flags;
}

// ── Redaction (V2 — spec §4.3) ──────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SCRUB_MAP_PATH = join(FIXTURES_DIR, "scrub-map.json");

let _scrubMap = null;
function loadScrubMap() {
  if (_scrubMap) return _scrubMap;
  try {
    if (existsSync(SCRUB_MAP_PATH)) {
      _scrubMap = JSON.parse(readFileSync(SCRUB_MAP_PATH, "utf-8"));
    }
  } catch {
    // scrub-map not available — skip customer name mapping
  }
  return _scrubMap;
}

function redactCustomerNames(str, scrubMap) {
  if (!scrubMap?.customerMap) return str;
  let result = str;
  // Sort by length descending so longer names are replaced first
  const entries = Object.entries(scrubMap.customerMap)
    .sort(([a], [b]) => b.length - a.length);
  for (const [real, fictional] of entries) {
    // Case-insensitive whole-word replacement
    const escaped = real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), fictional);
  }
  return result;
}

function redactValue(value, redact) {
  if (!redact) return value;
  const scrubMap = loadScrubMap();
  return _redactValueInner(value, scrubMap);
}

function _redactValueInner(value, scrubMap) {
  if (typeof value === "string") {
    let result = value
      .replace(EMAIL_RE, "redacted@example.com")
      .replace(GUID_RE, (match) => {
        // Keep first 8 chars for recognizability, zero the rest
        return match.slice(0, 8) + "-0000-0000-0000-000000000000";
      });
    // Apply customer name mapping if available
    result = redactCustomerNames(result, scrubMap);
    return result;
  }
  if (Array.isArray(value)) return value.map((v) => _redactValueInner(v, scrubMap));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = _redactValueInner(v, scrubMap);
    }
    return out;
  }
  return value;
}

// ── MCP Client Factory ──────────────────────────────────────────────────────

/**
 * Connect to an MCP server via stdio transport.
 * Returns a connected Client instance.
 */
async function connectMcpServer(name, command, args, env = {}) {
  const transport = new StdioClientTransport({
    command,
    args,
    env: { ...process.env, ...env },
  });

  const client = new Client(
    { name: `fixture-capture-${name}`, version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  return { client, transport };
}

/**
 * Call a tool and return the result content.
 * Throws on MCP errors so the caller can skip writing bad data.
 */
async function callTool(client, toolName, params = {}) {
  const result = await client.callTool({ name: toolName, arguments: params });

  // Check for MCP-level errors
  if (result.isError) {
    const msg = result.content?.[0]?.text ?? "Unknown MCP error";
    throw new Error(msg);
  }

  // MCP SDK returns content as an array of content blocks
  if (result.content && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block.type === "text") {
        try {
          const parsed = JSON.parse(block.text);
          // Detect error payloads returned as "success" (e.g. auth failures)
          if (typeof parsed === "string" && parsed.includes("MCP error")) {
            throw new Error(parsed);
          }
          return parsed;
        } catch (e) {
          // If it was our re-throw, propagate
          if (e.message?.includes("MCP error") || e.message?.includes("403")) throw e;
          return block.text;
        }
      }
    }
  }
  return result;
}

// ── Interactive Prompt ──────────────────────────────────────────────────────

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Discover available customers from CRM and let user pick which to capture.
 * Falls back to provided flag values or defaults if non-interactive.
 */
async function promptForCustomers(client, flags) {
  // If customers were explicitly provided via CLI, use them
  if (flags.customers.length > 0) return flags.customers;
  if (flags.nonInteractive) return ["Contoso"];

  // Try to discover customers from active opportunities
  console.log("\n📋 Discovering customers from active opportunities...");
  let discoveredCustomers = [];
  try {
    const opps = await callTool(client, "get_my_active_opportunities", { maxResults: 50 });
    if (opps?.value && Array.isArray(opps.value)) {
      const names = new Set();
      for (const opp of opps.value) {
        // Extract customer name from opportunity name ("Customer — Deal Name" pattern)
        const name = opp.name ?? "";
        const dashIdx = name.indexOf(" — ");
        if (dashIdx > 0) {
          names.add(name.slice(0, dashIdx).trim());
        } else if (opp._parentaccountid_value_FormattedValue) {
          names.add(opp._parentaccountid_value_FormattedValue);
        }
      }
      discoveredCustomers = [...names].sort();
    }
  } catch {
    // Discovery failed — fall through to manual entry
  }

  if (discoveredCustomers.length > 0) {
    console.log("\n   Found customers:");
    discoveredCustomers.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));
    console.log();

    const answer = await ask(
      "Enter customer numbers (comma-separated), names, or press Enter for all: ",
    );

    if (!answer) return discoveredCustomers;

    // Parse selection — could be numbers or names
    const selections = answer.split(",").map((s) => s.trim()).filter(Boolean);
    const result = [];
    for (const sel of selections) {
      const num = parseInt(sel, 10);
      if (!isNaN(num) && num >= 1 && num <= discoveredCustomers.length) {
        result.push(discoveredCustomers[num - 1]);
      } else {
        result.push(sel); // Treat as customer name
      }
    }
    return result.length > 0 ? result : discoveredCustomers;
  }

  // No discoveries — ask for manual input
  const answer = await ask("Enter customer name(s) to capture (comma-separated) [Contoso]: ");
  if (!answer) return ["Contoso"];
  return answer.split(",").map((s) => s.trim()).filter(Boolean);
}

// ── Capture Definitions ─────────────────────────────────────────────────────

/**
 * Each capture definition specifies:
 * - tool: the MCP tool name to call
 * - params: parameters to pass
 * - file: output filename
 * - description: human-readable description for the manifest
 */
/** Captures that run once regardless of customer selection. */
function getCrmGlobalCaptures() {
  return [
    {
      tool: "crm_whoami",
      params: {},
      file: "whoami.json",
      description: "Current user identity and role",
    },
    {
      tool: "get_my_active_opportunities",
      params: { maxResults: 50 },
      file: "opportunities-mine.json",
      description: "Active opportunities where user is owner or deal team",
    },
    {
      tool: "get_milestones",
      params: { mine: true, statusFilter: "active" },
      file: "milestones-mine-active.json",
      description: "All active milestones owned by current user",
    },
    // get_milestone_field_options requires a specific field param
    ...[
      { field: "workloadType", optional: false },
      { field: "deliveredBy", optional: false },
      { field: "preferredAzureRegion", optional: false },
      // Some tenants do not expose this attribute metadata.
      { field: "azureCapacityType", optional: true },
    ].map(({ field, optional }) => ({
      tool: "get_milestone_field_options",
      params: { field },
      file: `milestone-field-options-${field}.json`,
      description: `Picklist metadata for milestone field: ${field}`,
      optional,
    })),
    {
      tool: "get_task_status_options",
      params: {},
      file: "task-status-options.json",
      description: "Task status code metadata",
    },
  ];
}

async function captureCrmTasksFromActiveMilestones(conn, flags) {
  const capture = {
    tool: "get_milestone_activities",
    file: "tasks-active.json",
    description: "Tasks linked to active milestones owned by current user",
  };

  const label = `   📥 ${capture.tool}`;
  if (flags.dryRun) {
    console.log(`${label} → ${capture.file} (dry run — skipped)`);
    return { ...capture, status: "skipped", dryRun: true };
  }

  try {
    const milestoneData = await callTool(conn.client, "get_milestones", {
      mine: true,
      statusFilter: "active",
    });

    const milestoneIds = (milestoneData?.milestones ?? [])
      .map((m) => m?.msp_engagementmilestoneid)
      .filter(Boolean);

    let data;
    if (milestoneIds.length === 0) {
      data = { count: 0, byMilestone: {} };
    } else {
      if (flags.verbose) {
        console.log(`${label} (${JSON.stringify({ milestoneIds })})...`);
      } else {
        console.log(`${label}...`);
      }

      data = await callTool(conn.client, "get_milestone_activities", {
        milestoneIds,
      });
    }

    const redacted = redactValue(data, flags.redact);
    await mkdir(CRM_DIR, { recursive: true });
    const outPath = join(CRM_DIR, capture.file);
    await writeFile(outPath, JSON.stringify(redacted, null, 2) + "\n", "utf-8");

    const recordCount = redacted?.count ?? redacted?.tasks?.length ?? 0;
    console.log(`      ✅ → ${capture.file} (${recordCount} records)`);
    return { ...capture, status: "ok", recordCount };
  } catch (err) {
    console.error(`      ❌ ${capture.tool} failed: ${err.message.split("\n")[0]}`);
    return { ...capture, status: "error", error: err.message.split("\n")[0] };
  }
}

/** Captures that run once per selected customer. */
function getCrmCustomerCaptures(customer) {
  const slug = customer.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return [
    {
      tool: "get_milestones",
      params: { customerKeyword: customer, statusFilter: "active", includeTasks: true },
      file: `milestones-${slug}.json`,
      description: `Active milestones for ${customer} with tasks`,
    },
  ];
}

/** Per-opportunity deep captures (spec §4.2). */
function getCrmOpportunityCaptures(opportunityId, slug) {
  return [
    {
      tool: "get_milestones",
      params: { opportunityId, statusFilter: "active", includeTasks: true },
      file: `milestones-opp-${slug}.json`,
      description: `Active milestones for opportunity ${slug}`,
    },
  ];
}

/** M365 capture definitions — read-only (spec §4.2). */
function getM365Captures(customer) {
  const slug = customer.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return [
    {
      tool: "ListCalendarView",
      params: {
        startDateTime: new Date().toISOString().slice(0, 10) + "T00:00:00Z",
        endDateTime: new Date().toISOString().slice(0, 10) + "T23:59:59Z",
      },
      file: "calendar-today.json",
      description: "Today's calendar events",
      server: "calendar",
    },
    {
      tool: "SearchMessages",
      params: { query: `${customer} received:this week`, top: 10 },
      file: `mail-${slug}.json`,
      description: `Recent emails mentioning ${customer}`,
      server: "mail",
    },
    {
      tool: "SearchTeamsMessages",
      params: { query: customer, top: 10 },
      file: `teams-${slug}.json`,
      description: `Teams messages mentioning ${customer}`,
      server: "teams",
    },
  ];
}

function getOilCaptures(customer) {
  return [
    {
      tool: "get_vault_context",
      params: {},
      file: "vault-context.json",
      description: "Vault overview: shape, customer list, recent notes",
    },
    {
      tool: "get_customer_context",
      params: { customer, include_open_items: true },
      file: `customer-context-${customer.toLowerCase()}.json`,
      description: `Full customer dossier for ${customer}`,
    },
    {
      tool: "search_vault",
      params: { query: customer, limit: 10 },
      file: `search-${customer.toLowerCase()}.json`,
      description: `Vault search results for "${customer}"`,
    },
    {
      tool: "query_notes",
      params: { where: { customer }, limit: 20 },
      file: `notes-${customer.toLowerCase()}.json`,
      description: `Notes tagged with customer "${customer}"`,
    },
  ];
}

// ── Capture Runner ──────────────────────────────────────────────────────────

async function runCaptures(conn, captures, outDir, flags) {
  const results = [];
  for (const capture of captures) {
    const label = `   📥 ${capture.tool}`;
    if (flags.dryRun) {
      console.log(`${label} → ${capture.file} (dry run — skipped)`);
      results.push({ ...capture, status: "skipped", dryRun: true });
      continue;
    }

    try {
      if (flags.verbose) {
        console.log(`${label} (${JSON.stringify(capture.params)})...`);
      } else {
        console.log(`${label}...`);
      }

      const data = await callTool(conn.client, capture.tool, capture.params);
      const redacted = redactValue(data, flags.redact);

      await mkdir(outDir, { recursive: true });
      const outPath = join(outDir, capture.file);
      await writeFile(outPath, JSON.stringify(redacted, null, 2) + "\n", "utf-8");

      const recordCount = redacted?.value?.length ?? (Array.isArray(redacted) ? redacted.length : 1);
      console.log(`      ✅ → ${capture.file} (${recordCount} records)`);
      results.push({ ...capture, status: "ok", recordCount });
    } catch (err) {
      if (capture.optional) {
        console.warn(`      ⚠️ Optional capture skipped (${capture.tool}): ${err.message.split("\n")[0]}`);
        results.push({ ...capture, status: "skipped", optional: true, error: err.message.split("\n")[0] });
        continue;
      }
      console.error(`      ❌ ${capture.tool} failed: ${err.message.split("\n")[0]}`);
      results.push({ ...capture, status: "error", error: err.message.split("\n")[0] });
    }
  }
  return results;
}

async function captureCrm(flags) {
  const results = [];

  console.log("\n🔌 Connecting to MSX CRM server...");
  let conn;
  try {
    conn = await connectMcpServer(
      "msx",
      "node",
      [join(ROOT, "scripts", "msx-start.js")],
    );
  } catch (err) {
    console.error("❌ Failed to connect to MSX CRM server:", err.message);
    console.error("   Make sure you've run `az login` and the server builds successfully.");
    return results;
  }

  console.log("✅ Connected to MSX CRM server");

  try {
    // Interactive customer selection (unless --customer was provided)
    const customers = await promptForCustomers(conn.client, flags);
    console.log(`\n   📌 Customers: ${customers.join(", ")}`);

    // 1. Global captures (run once)
    console.log("\n── Global captures ──");
    const globalCaptures = getCrmGlobalCaptures();
    const globalResults = await runCaptures(conn, globalCaptures, CRM_DIR, flags);
    results.push(...globalResults);

    // 1b. Derived capture: tasks for active milestones (tool requires milestoneId(s))
    const taskCaptureResult = await captureCrmTasksFromActiveMilestones(conn, flags);
    results.push(taskCaptureResult);

    // 2. Per-customer captures
    for (const customer of customers) {
      console.log(`\n── ${customer} ──`);
      const customerCaptures = getCrmCustomerCaptures(customer);
      const customerResults = await runCaptures(conn, customerCaptures, CRM_DIR, flags);
      results.push(...customerResults);
    }

    // 3. Per-opportunity deep captures (spec §4.2)
    console.log("\n── Per-opportunity deep captures ──");
    try {
      const opps = await callTool(conn.client, "get_my_active_opportunities", { maxResults: 20 });
      const oppList = opps?.value ?? opps?.opportunities ?? [];
      for (const opp of oppList.slice(0, 10)) {
        const oppId = opp.opportunityid ?? opp.msp_opportunityid;
        if (!oppId) continue;
        const oppName = opp.name ?? opp.msp_opportunitynumber ?? oppId;
        const slug = oppName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
        const oppCaptures = getCrmOpportunityCaptures(oppId, slug);
        const oppResults = await runCaptures(conn, oppCaptures, CRM_DIR, flags);
        results.push(...oppResults);
      }
    } catch (err) {
      console.warn(`   ⚠️ Per-opportunity capture skipped: ${err.message.split("\n")[0]}`);
    }
  } finally {
    try {
      await conn.transport.close();
    } catch {
      // Ignore cleanup errors
    }
  }

  return results;
}

async function captureOil(flags) {
  const customers = flags.customers.length > 0 ? flags.customers : ["Contoso"];
  const captures = customers.flatMap((c) => getOilCaptures(c));
  const results = [];

  // Check if OBSIDIAN_VAULT_PATH is set
  if (!process.env.OBSIDIAN_VAULT_PATH) {
    // Try loading .env
    try {
      const envPath = join(ROOT, ".env");
      if (existsSync(envPath)) {
        const envContent = await readFile(envPath, "utf-8");
        for (const line of envContent.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const eqIndex = trimmed.indexOf("=");
            const key = trimmed.slice(0, eqIndex).trim();
            const val = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
            if (!process.env[key]) process.env[key] = val;
          }
        }
      }
    } catch {
      // .env not found, continue
    }
  }

  if (!process.env.OBSIDIAN_VAULT_PATH) {
    console.log("\n⏭️  Skipping OIL — OBSIDIAN_VAULT_PATH not set");
    return results;
  }

  console.log("\n🔌 Connecting to OIL (vault) server...");
  let conn;
  try {
    conn = await connectMcpServer(
      "oil",
      "node",
      [join(ROOT, "scripts", "oil-start.js")],
    );
  } catch (err) {
    console.error("❌ Failed to connect to OIL server:", err.message);
    console.error("   Check OBSIDIAN_VAULT_PATH in .env and npm access to @jinlee794/obsidian-intelligence-layer.");
    return results;
  }

  console.log("✅ Connected to OIL server\n");

  try {
    for (const capture of captures) {
      const label = `   📥 ${capture.tool}`;
      if (flags.dryRun) {
        console.log(`${label} → ${capture.file} (dry run — skipped)`);
        results.push({ ...capture, status: "skipped", dryRun: true });
        continue;
      }

      try {
        if (flags.verbose) {
          console.log(`${label} (${JSON.stringify(capture.params)})...`);
        } else {
          console.log(`${label}...`);
        }

        const data = await callTool(conn.client, capture.tool, capture.params);
        const redacted = redactValue(data, flags.redact);

        await mkdir(OIL_DIR, { recursive: true });
        const outPath = join(OIL_DIR, capture.file);
        await writeFile(outPath, JSON.stringify(redacted, null, 2) + "\n", "utf-8");

        console.log(`      ✅ → ${capture.file}`);
        results.push({ ...capture, status: "ok" });
      } catch (err) {
        console.error(`      ❌ ${capture.tool} failed: ${err.message}`);
        results.push({ ...capture, status: "error", error: err.message });
      }
    }
  } finally {
    try {
      await conn.transport.close();
    } catch {
      // Ignore cleanup errors
    }
  }

  return results;
}

// ── M365 Capture (spec §4.2) ────────────────────────────────────────────────

async function captureM365(flags) {
  const customers = flags.customers.length > 0 ? flags.customers : ["Contoso"];
  const results = [];

  // M365 captures are best-effort — these MCP servers may not be available locally
  console.log("\n📅 M365 Captures (Calendar, Mail, Teams)");
  console.log("   ⚠️ M365 MCP servers are optional — failures are non-blocking\n");

  // Calendar capture (no customer filter needed for today's view)
  const calendarCaptures = [{
    tool: "ListCalendarView",
    params: {
      startDateTime: new Date().toISOString().slice(0, 10) + "T00:00:00Z",
      endDateTime: new Date().toISOString().slice(0, 10) + "T23:59:59Z",
    },
    file: "calendar-today.json",
    description: "Today's calendar events",
  }];

  for (const capture of calendarCaptures) {
    if (flags.dryRun) {
      console.log(`   📥 ${capture.tool} → ${capture.file} (dry run — skipped)`);
      results.push({ ...capture, status: "skipped", dryRun: true });
      continue;
    }
    // M365 captures write placeholder fixtures for now —
    // real capture requires M365 MCP servers running
    console.log(`   📥 ${capture.tool} → ${capture.file} (placeholder — M365 MCP not yet wired)`);
    results.push({ ...capture, status: "skipped", reason: "M365 MCP not yet wired" });
  }

  // Per-customer mail + teams captures
  for (const customer of customers) {
    const m365Captures = getM365Captures(customer);
    for (const capture of m365Captures) {
      if (capture.server === "calendar") continue; // Already handled above
      if (flags.dryRun) {
        console.log(`   📥 ${capture.tool} → ${capture.file} (dry run — skipped)`);
        results.push({ ...capture, status: "skipped", dryRun: true });
        continue;
      }
      console.log(`   📥 ${capture.tool} → ${capture.file} (placeholder — M365 MCP not yet wired)`);
      results.push({ ...capture, status: "skipped", reason: "M365 MCP not yet wired" });
    }
  }

  return results;
}

// ── Manifest ────────────────────────────────────────────────────────────────

async function writeManifest(allResults, flags) {
  const manifest = {
    capturedAt: new Date().toISOString(),
    customers: flags.customers,
    servers: flags.servers,
    redacted: flags.redact,
    dryRun: flags.dryRun,
    results: allResults,
    summary: {
      total: allResults.length,
      ok: allResults.filter((r) => r.status === "ok").length,
      errors: allResults.filter((r) => r.status === "error").length,
      skipped: allResults.filter((r) => r.status === "skipped").length,
    },
  };

  if (!flags.dryRun) {
    await mkdir(FIXTURES_DIR, { recursive: true });
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  }

  return manifest;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();

  if (flags.help) {
    console.log(`
Fixture Capture Tool — Pull live data from MCP servers for eval fixtures

Usage:
  npm run fixtures:capture                        Capture all (prompts for customers)
  npm run fixtures:capture -- --server crm        CRM only
  npm run fixtures:capture -- --server oil        OIL vault only
  npm run fixtures:capture -- --customer Contoso  Specify customer (repeatable)
  npm run fixtures:capture -- --customer Contoso --customer Fabrikam
  npm run fixtures:capture -- --dry-run           Preview without writing
  npm run fixtures:capture -- --redact            Redact emails and GUIDs
  npm run fixtures:capture -- --no-interactive    Skip prompts (CI mode)
  npm run fixtures:capture -- --verbose           Show full params

Prerequisites:
  CRM:  az login + VPN (Azure RBAC auth)
  OIL:  OBSIDIAN_VAULT_PATH in .env

Output:
  evals/fixtures/crm-responses/*.json
  evals/fixtures/oil-responses/*.json
  evals/fixtures/capture-manifest.json
`);
    process.exit(0);
  }

  console.log("🎯 Fixture Capture Tool");
  console.log(`   Servers:  ${flags.servers.join(", ")}`);
  if (flags.customers.length > 0) console.log(`   Customers: ${flags.customers.join(", ")}`);
  else console.log(`   Customers: (will prompt interactively)`);
  console.log(`   Redact:   ${flags.redact ? "yes" : "no"}`);
  if (flags.dryRun) console.log("   Mode:     DRY RUN");

  const allResults = [];

  if (flags.servers.includes("crm")) {
    const crmResults = await captureCrm(flags);
    allResults.push(...crmResults);
  }

  if (flags.servers.includes("oil")) {
    const oilResults = await captureOil(flags);
    allResults.push(...oilResults);
  }

  if (flags.servers.includes("m365")) {
    const m365Results = await captureM365(flags);
    allResults.push(...m365Results);
  }

  // Write manifest
  // OIL needs customers resolved by now (CRM capture may have set them interactively)
  const manifest = await writeManifest(allResults, flags);

  // Summary
  console.log("\n─────────────────────────────────");
  console.log(`📊 Capture Summary`);
  console.log(`   Total:   ${manifest.summary.total}`);
  console.log(`   ✅ OK:    ${manifest.summary.ok}`);
  console.log(`   ❌ Error: ${manifest.summary.errors}`);
  console.log(`   ⏭️  Skip:  ${manifest.summary.skipped}`);

  if (!flags.dryRun && manifest.summary.ok > 0) {
    console.log(`\n📁 Fixtures written to: evals/fixtures/`);
    console.log(`📋 Manifest: evals/fixtures/capture-manifest.json`);
    console.log(`\n💡 Run evals against captured data: npm run eval`);
  }

  process.exit(manifest.summary.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n💥 Capture failed:", err.message);
  process.exit(1);
});
