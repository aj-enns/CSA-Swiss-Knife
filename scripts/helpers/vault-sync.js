#!/usr/bin/env node

/**
 * vault-sync.js — Bulk CRM → vault sync engine
 *
 * Reads assembled CRM data (opportunities, milestones, deal teams) as JSON,
 * renders vault note templates, diffs against existing vault files, and
 * writes only changed entities. Bypasses OIL MCP round-trips for bulk operations.
 *
 * Usage:
 *   node scripts/helpers/vault-sync.js /tmp/crm-sync.json --vault "$OBSIDIAN_VAULT"
 *   cat /tmp/crm-sync.json | node scripts/helpers/vault-sync.js --vault "$OBSIDIAN_VAULT"
 *
 * Options:
 *   --vault <path>       Obsidian vault root (default: $OBSIDIAN_VAULT)
 *   --config <path>      Sync config file (scopes which customers/entities to sync)
 *   --dry-run            Show what would change without writing
 *   --entities <list>    Comma-separated entity types to sync (default: all)
 *                        Options: opportunities,milestones,people,customers
 *   --quiet              Suppress per-entity details, output summary only
 *
 * Input JSON shape:
 *   {
 *     "syncDate": "ISO date",
 *     "user": { "email": "...", "fullname": "..." },
 *     "customers": [
 *       {
 *         "name": "Customer Name",
 *         "tpid": 12345,
 *         "accountId": "guid",
 *         "opportunities": [
 *           {
 *             "opportunityid": "guid",
 *             "name": "Opportunity Name",
 *             "msp_opportunitynumber": "OPP-123",
 *             "msp_activesalesstage": "Qualify",
 *             "msp_estcompletiondate": "2026-06-30",
 *             "estimatedvalue": 50000,
 *             "msp_consumptionconsumedrecurring": 1200,
 *             "msp_salesplay": "Data & AI",
 *             "description": "...",
 *             "statecode": 0,
 *             "dealTeam": [
 *               { "systemuserid": "guid", "fullname": "Name", "internalemailaddress": "e@m.com", "title": "SE", "isOwner": true }
 *             ],
 *             "milestones": [
 *               {
 *                 "msp_engagementmilestoneid": "guid",
 *                 "msp_name": "Milestone Name",
 *                 "msp_milestonenumber": "MS-456",
 *                 "msp_monthlyuse": 500,
 *                 "msp_milestonestatus": "Active",
 *                 "msp_commitmentrecommendation": "Committed",
 *                 "msp_milestonedate": "2026-05-15",
 *                 "msp_milestoneworkload": "Azure",
 *                 "msp_deliveryspecifiedfield": "Microsoft",
 *                 "msp_forecastcomments": "On track.",
 *                 "msp_forecastcommentsjsonfield": [],
 *                 "owner": { "fullname": "Owner Name", "internalemailaddress": "o@m.com" }
 *               }
 *             ]
 *           }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Sync config shape (optional):
 *   {
 *     "customers": ["Customer A", "Customer B"],
 *     "excludeOpportunities": ["OPP-999"],
 *     "excludeMilestones": ["MS-001"],
 *     "syncEntities": ["opportunities", "milestones", "people"]
 *   }
 *
 * Output: JSON summary to stdout.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVaultRoot, assertWithinVault } from "../lib/secure-path.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Parse args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null;
let vaultPath = process.env.OBSIDIAN_VAULT || null;
let configPath = null;
let templateDir = resolve(__dirname, "../../.github/skills/vault-sync/references");
let dryRun = false;
let entityFilter = null;
let quiet = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--vault" && args[i + 1]) {
    vaultPath = args[++i];
  } else if (args[i] === "--config" && args[i + 1]) {
    configPath = args[++i];
  } else if (args[i] === "--templates" && args[i + 1]) {
    templateDir = resolve(args[++i]);
  } else if (args[i] === "--dry-run") {
    dryRun = true;
  } else if (args[i] === "--entities" && args[i + 1]) {
    entityFilter = new Set(args[++i].split(",").map((s) => s.trim().toLowerCase()));
  } else if (args[i] === "--quiet") {
    quiet = true;
  } else if (!args[i].startsWith("--")) {
    inputFile = args[i];
  }
}

// ── Validate vault ──────────────────────────────────────────────────
if (!vaultPath) {
  console.error("ERROR: Vault path required. Use --vault or set $OBSIDIAN_VAULT.");
  process.exit(1);
}

let vaultRoot;
try {
  vaultRoot = resolveVaultRoot(vaultPath);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}

// ── Validate templates ──────────────────────────────────────────────
if (!existsSync(templateDir)) {
  console.error(`ERROR: Template directory not found: ${templateDir}`);
  process.exit(1);
}

// ── Read input ──────────────────────────────────────────────────────
let rawText;
if (inputFile) {
  rawText = readFileSync(resolve(inputFile), "utf8");
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  rawText = Buffer.concat(chunks).toString("utf8");
}

let input;
try {
  input = JSON.parse(rawText);
} catch {
  console.error("ERROR: Input is not valid JSON.");
  process.exit(1);
}

// ── Read config (optional) ──────────────────────────────────────────
let config = {};
if (configPath) {
  try {
    config = JSON.parse(readFileSync(resolve(configPath), "utf8"));
  } catch (err) {
    console.error(`ERROR: Cannot read config: ${err.message}`);
    process.exit(1);
  }
}

const syncEntities = entityFilter || (config.syncEntities ? new Set(config.syncEntities) : null);
const shouldSync = (type) => !syncEntities || syncEntities.has(type);
const configCustomers = config.customers ? new Set(config.customers.map((c) => c.toLowerCase())) : null;
const excludeOpps = new Set((config.excludeOpportunities || []).map((s) => s.toUpperCase()));
const excludeMs = new Set((config.excludeMilestones || []).map((s) => s.toUpperCase()));

const syncDate = input.syncDate || new Date().toISOString();

// ── Formatting helpers ──────────────────────────────────────────────

function formatCurrency(val) {
  if (val == null || val === 0) return "\u2014";
  return "$" + Number(val).toLocaleString("en-US");
}

function formatACRMonthly(val) {
  if (val == null || val === 0) return "\u2014";
  return "$" + Number(val).toLocaleString("en-US") + "/mo";
}

function escapePipes(s) {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
}

function msxLink(etn, guid) {
  return `https://microsoftsales.crm.dynamics.com/main.aspx?etn=${etn}&id=${guid}&pagetype=entityrecord`;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
}

// ── Template engine ─────────────────────────────────────────────────

const templateCache = new Map();

function loadTemplate(name) {
  if (templateCache.has(name)) return templateCache.get(name);
  const tplPath = join(templateDir, name);
  if (!existsSync(tplPath)) {
    throw new Error(`Template not found: ${tplPath}`);
  }
  let content = readFileSync(tplPath, "utf8");
  content = content.replace(/^<!--\s*vault-sync template[\s\S]*?-->\s*\n/, "");
  templateCache.set(name, content);
  return content;
}

function resolveField(context, fieldPath) {
  const parts = fieldPath.split(".");
  let val = context;
  for (const p of parts) {
    if (val == null) return null;
    val = val[p];
  }
  return val;
}

function applyFormat(val, formatStr) {
  if (formatStr.startsWith("default:")) {
    const fallback = formatStr.slice(8);
    return val != null && val !== "" ? String(val) : fallback;
  }
  switch (formatStr) {
    case "currency":
      return formatCurrency(val);
    case "acrMonthly":
      return formatACRMonthly(val);
    case "escapePipes":
      return escapePipes(String(val != null ? val : ""));
    default:
      return String(val != null ? val : "");
  }
}

const trimBlock = (s) => s.replace(/^\n+/, "").replace(/\n+$/, "");

function processEachBlocks(text, context) {
  const EACH_OPEN = "{{#each ";
  const EACH_CLOSE = "{{/each}}";
  const EMPTY_CLOSE = "{{/empty}}";

  const eachStart = text.indexOf(EACH_OPEN);
  if (eachStart === -1) return text;

  // Extract field name
  const nameEnd = text.indexOf("}}", eachStart + EACH_OPEN.length);
  if (nameEnd === -1) return text;
  const field = text.slice(eachStart + EACH_OPEN.length, nameEnd);

  // Find {{/each}}
  const closeStart = text.indexOf(EACH_CLOSE, nameEnd);
  if (closeStart === -1) return text;
  const closeEnd = closeStart + EACH_CLOSE.length;

  // Block content between {{#each field}}\n and {{/each}}
  let blockStart = nameEnd + 2; // after "}}"
  if (text[blockStart] === "\n") blockStart++;
  const block = text.slice(blockStart, closeStart);

  // Eat trailing newline after {{/each}}
  let afterClose = closeEnd;
  if (text[afterClose] === "\n") afterClose++;

  // Check for {{#empty field}}...{{/empty}} immediately after
  let emptyBlock = null;
  let finalEnd = afterClose;
  const emptyTag = `{{#empty ${field}}}`;
  if (text.slice(afterClose, afterClose + emptyTag.length) === emptyTag) {
    const emptyContentStart = afterClose + emptyTag.length + (text[afterClose + emptyTag.length] === "\n" ? 1 : 0);
    const emptyCloseStart = text.indexOf(EMPTY_CLOSE, emptyContentStart);
    if (emptyCloseStart !== -1) {
      emptyBlock = text.slice(emptyContentStart, emptyCloseStart);
      finalEnd = emptyCloseStart + EMPTY_CLOSE.length;
      if (text[finalEnd] === "\n") finalEnd++;
    }
  }

  // Render
  const arr = resolveField(context, field);
  let replacement;
  if (!Array.isArray(arr) || arr.length === 0) {
    replacement = emptyBlock ? trimBlock(emptyBlock) + "\n" : "";
  } else {
    replacement = arr
      .map((item) => {
        const itemCtx = { ...context, ...item };
        return processTemplate(trimBlock(block), itemCtx);
      })
      .join("\n") + "\n";
  }

  return text.slice(0, eachStart) + replacement + text.slice(finalEnd);
}

function processTemplate(template, context) {
  let result = template;

  // Pass 1: {{#each}} / {{#empty}} blocks — process as pairs via indexOf
  let safety = 10;
  let prev;
  do {
    prev = result;
    result = processEachBlocks(result, context);
  } while (result !== prev && --safety > 0);

  // Pass 2: {{field|format}} placeholders
  result = result.replace(/\{\{([\w.]+)\|([^}]+)\}\}/g, (_, field, format) => {
    const val = resolveField(context, field);
    return applyFormat(val, format);
  });

  // Pass 3: {{field}} placeholders
  result = result.replace(/\{\{([\w.]+)\}\}/g, (_, field) => {
    const val = resolveField(context, field);
    return String(val != null ? val : "");
  });

  return result;
}

// ── Context builders ────────────────────────────────────────────────

function buildOppContext(customer, opp) {
  const oppUrl = msxLink("opportunity", opp.opportunityid);
  const milestones = (opp.milestones || []).map((ms) => ({
    ...ms,
    milestoneUrl: msxLink("msp_engagementmilestone", ms.msp_engagementmilestoneid),
  }));
  const totalMilestoneACR = milestones.reduce((sum, ms) => sum + (ms.msp_monthlyuse || 0), 0);
  const dealTeam = (opp.dealTeam || []).map((m) => ({
    ...m,
    ownerMark: m.isOwner ? "\u2705" : "",
  }));

  const forecastComments = [];
  for (const ms of milestones) {
    if (ms.msp_forecastcommentsjsonfield && Array.isArray(ms.msp_forecastcommentsjsonfield)) {
      for (const fc of ms.msp_forecastcommentsjsonfield.slice(0, 1)) {
        forecastComments.push({
          milestoneName: ms.msp_name,
          comment: (fc.comment || "").slice(0, 200),
          userId: fc.userId,
          modifiedOn: fc.modifiedOn,
          milestoneUrl: ms.milestoneUrl,
        });
      }
    } else if (ms.msp_forecastcomments) {
      forecastComments.push({
        milestoneName: ms.msp_name,
        comment: (ms.msp_forecastcomments || "").slice(0, 200),
        milestoneUrl: ms.milestoneUrl,
      });
    }
  }

  return {
    customerName: customer.name,
    ...opp,
    oppUrl,
    syncDate,
    milestones,
    totalMilestoneACR,
    dealTeam,
    forecastComments,
  };
}

function buildMilestoneContext(customer, opp, ms) {
  const forecastComments = [];
  if (ms.msp_forecastcommentsjsonfield && Array.isArray(ms.msp_forecastcommentsjsonfield)) {
    for (const fc of ms.msp_forecastcommentsjsonfield) {
      forecastComments.push({
        modifiedOn: fc.modifiedOn,
        userId: fc.userId,
        comment: (fc.comment || "").slice(0, 300),
      });
    }
  }

  return {
    customerName: customer.name,
    opportunityName: opp.name,
    opportunityNoteName: sanitizeFilename(opp.name),
    opportunityid: opp.opportunityid,
    ...ms,
    msUrl: msxLink("msp_engagementmilestone", ms.msp_engagementmilestoneid),
    oppUrl: msxLink("opportunity", opp.opportunityid),
    syncDate,
    forecastComments,
  };
}

function buildPeopleContext(person, customerNames, oppNames) {
  return {
    ...person,
    customerList: customerNames.map((c) => ({ name: c })),
    oppLinks: oppNames.map((o) => `[[${o}]]`).join(", ") || "CRM sync",
  };
}

function buildCustomerContext(customer) {
  return {
    name: customer.name,
    accountId: customer.accountId || "",
    safeName: sanitizeFilename(customer.name),
    syncDate,
  };
}


// ── Vault path resolution ───────────────────────────────────────────

function resolveCustomerDir(customerName) {
  const safe = sanitizeFilename(customerName);
  const nestedDir = join(vaultRoot, "Customers", safe);
  const flatNote = join(vaultRoot, "Customers", `${safe}.md`);

  // Prefer nested: Customers/<Name>/<Name>.md
  if (existsSync(nestedDir) && statSync(nestedDir).isDirectory()) {
    return { dir: nestedDir, layout: "nested" };
  }
  // Flat: Customers/<Name>.md
  if (existsSync(flatNote)) {
    return { dir: join(vaultRoot, "Customers"), layout: "flat" };
  }
  // Default to nested (create new)
  return { dir: nestedDir, layout: "nested" };
}

function resolveOppPath(customerName, oppName) {
  const { dir, layout } = resolveCustomerDir(customerName);
  const safe = sanitizeFilename(oppName);
  if (layout === "nested") {
    return join(dir, "opportunities", `${safe}.md`);
  }
  return join(dir, customerName, "opportunities", `${safe}.md`);
}

function resolveMilestonePath(customerName, milestoneName) {
  const { dir, layout } = resolveCustomerDir(customerName);
  const safe = sanitizeFilename(milestoneName);
  if (layout === "nested") {
    return join(dir, "milestones", `${safe}.md`);
  }
  return join(dir, customerName, "milestones", `${safe}.md`);
}

function resolveCustomerNotePath(customerName) {
  const safe = sanitizeFilename(customerName);
  const nestedDir = join(vaultRoot, "Customers", safe);
  // Nested layout: Customers/<Name>/<Name>.md
  if (existsSync(nestedDir) && statSync(nestedDir).isDirectory()) {
    return join(nestedDir, `${safe}.md`);
  }
  // Flat: Customers/<Name>.md (check if it exists)
  const flatNote = join(vaultRoot, "Customers", `${safe}.md`);
  if (existsSync(flatNote)) {
    return flatNote;
  }
  // Default to nested
  return join(nestedDir, `${safe}.md`);
}

function resolvePeoplePath(fullname) {
  return join(vaultRoot, "People", `${sanitizeFilename(fullname)}.md`);
}

// ── Diff + write logic ──────────────────────────────────────────────

const CRM_SYNC_BOUNDARY = "<!-- end-crm-sync -->";

function extractCrmSection(content) {
  // Return the CRM-managed section (above <!-- end-crm-sync -->)
  const idx = content.indexOf(CRM_SYNC_BOUNDARY);
  if (idx === -1) return content;
  return content.slice(0, idx);
}

function extractUserSection(content) {
  // Return user-authored section (below <!-- end-crm-sync -->) including the boundary
  const idx = content.indexOf(CRM_SYNC_BOUNDARY);
  if (idx === -1) return "";
  return content.slice(idx);
}

function mergeContent(rendered, existingContent) {
  // For milestone notes: preserve user content below <!-- end-crm-sync -->
  const userSection = extractUserSection(existingContent);
  if (!userSection) return rendered;

  // Find the CRM sync boundary in rendered content
  const renderedBoundaryIdx = rendered.indexOf(CRM_SYNC_BOUNDARY);
  if (renderedBoundaryIdx === -1) return rendered;

  // Replace everything from boundary onward with the existing user content
  return rendered.slice(0, renderedBoundaryIdx) + userSection;
}

function preserveTaskActivityLog(rendered, existingContent) {
  const marker = "## Task Activity Log";
  const existingIdx = existingContent.indexOf(marker);
  if (existingIdx === -1) return rendered;
  const renderedIdx = rendered.indexOf(marker);
  if (renderedIdx === -1) return rendered;
  return rendered.slice(0, renderedIdx) + existingContent.slice(existingIdx);
}

function hasContentChanged(rendered, existing) {
  // Compare CRM-managed portions only (ignore user-authored sections and whitespace)
  const renderedCrm = extractCrmSection(rendered).replace(/\s+/g, " ").trim();
  const existingCrm = extractCrmSection(existing).replace(/\s+/g, " ").trim();
  // Also ignore last_*_sync timestamps for diff purposes
  const stripTimestamps = (s) =>
    s.replace(/last_(opp|milestone)_sync:\s*"[^"]*"/g, "last_sync: STRIPPED");
  return stripTimestamps(renderedCrm) !== stripTimestamps(existingCrm);
}

function safeWrite(filePath, content) {
  assertWithinVault(filePath, vaultRoot);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content, "utf8");
}

// ── Main sync loop ──────────────────────────────────────────────────

const summary = {
  syncDate,
  dryRun,
  vault: vaultRoot,
  customers: [],
  totals: { customers: { created: 0, updated: 0, skipped: 0 }, opportunities: { created: 0, updated: 0, skipped: 0 }, milestones: { created: 0, updated: 0, skipped: 0 }, people: { created: 0, updated: 0, skipped: 0 } },
  errors: [],
};

const customers = input.customers || [];
const seenPeople = new Map(); // systemuserid → { person, customers, opportunities }

for (const customer of customers) {
  // Config filter
  if (configCustomers && !configCustomers.has(customer.name.toLowerCase())) {
    continue;
  }

  const customerSummary = {
    name: customer.name,
    tpid: customer.tpid,
    customerNote: null,
    opportunities: [],
    milestones: [],
    people: [],
  };

  // ── Sync customer root note (scaffold only — never overwrites) ───
  if (shouldSync("customers")) {
    const custNotePath = resolveCustomerNotePath(customer.name);
    try {
      if (existsSync(custNotePath)) {
        customerSummary.customerNote = { path: relative(vaultRoot, custNotePath), action: "skipped-exists" };
        summary.totals.customers.skipped++;
      } else {
        const rendered = processTemplate(
          loadTemplate("customer-note.template.md"),
          buildCustomerContext(customer)
        );
        if (!dryRun) safeWrite(custNotePath, rendered);
        customerSummary.customerNote = { path: relative(vaultRoot, custNotePath), action: "created" };
        summary.totals.customers.created++;
      }
    } catch (err) {
      summary.errors.push({ entity: "customer", name: customer.name, error: err.message });
    }
  }

  const opps = customer.opportunities || [];

  for (const opp of opps) {
    // Exclusion filter
    if (excludeOpps.has((opp.msp_opportunitynumber || "").toUpperCase())) continue;

    // Skip inactive opps
    if (opp.statecode != null && opp.statecode !== 0) {
      if (!quiet) customerSummary.opportunities.push({ name: opp.name, oppNumber: opp.msp_opportunitynumber, action: "skipped-inactive" });
      summary.totals.opportunities.skipped++;
      continue;
    }

    // ── Sync opportunity note ───────────────────────────────────
    if (shouldSync("opportunities")) {
      const oppPath = resolveOppPath(customer.name, opp.name);
      try {
        const rendered = processTemplate(
          loadTemplate("opportunity-note.template.md"),
          buildOppContext(customer, opp)
        );
        let action;

        if (existsSync(oppPath)) {
          const existing = readFileSync(oppPath, "utf8");
          if (hasContentChanged(rendered, existing)) {
            if (!dryRun) safeWrite(oppPath, rendered);
            action = "updated";
            summary.totals.opportunities.updated++;
          } else {
            action = "skipped-unchanged";
            summary.totals.opportunities.skipped++;
          }
        } else {
          if (!dryRun) safeWrite(oppPath, rendered);
          action = "created";
          summary.totals.opportunities.created++;
        }

        customerSummary.opportunities.push({
          name: opp.name,
          oppNumber: opp.msp_opportunitynumber,
          path: relative(vaultRoot, oppPath),
          action,
        });
      } catch (err) {
        summary.errors.push({ entity: "opportunity", name: opp.name, error: err.message });
      }
    }

    // ── Sync milestone notes ────────────────────────────────────
    if (shouldSync("milestones")) {
      for (const ms of opp.milestones || []) {
        if (excludeMs.has((ms.msp_milestonenumber || "").toUpperCase())) continue;

        const msPath = resolveMilestonePath(customer.name, ms.msp_name);
        try {
          let rendered = processTemplate(
            loadTemplate("milestone-note.template.md"),
            buildMilestoneContext(customer, opp, ms)
          );
          let action;

          if (existsSync(msPath)) {
            const existing = readFileSync(msPath, "utf8");
            // Preserve user-authored content and task activity log
            rendered = mergeContent(rendered, existing);
            rendered = preserveTaskActivityLog(rendered, existing);

            if (hasContentChanged(rendered, existing)) {
              if (!dryRun) safeWrite(msPath, rendered);
              action = "updated";
              summary.totals.milestones.updated++;
            } else {
              action = "skipped-unchanged";
              summary.totals.milestones.skipped++;
            }
          } else {
            if (!dryRun) safeWrite(msPath, rendered);
            action = "created";
            summary.totals.milestones.created++;
          }

          customerSummary.milestones.push({
            name: ms.msp_name,
            msNumber: ms.msp_milestonenumber,
            path: relative(vaultRoot, msPath),
            action,
          });
        } catch (err) {
          summary.errors.push({ entity: "milestone", name: ms.msp_name, error: err.message });
        }
      }
    }

    // ── Collect deal team for people sync ────────────────────────
    if (shouldSync("people")) {
      for (const member of opp.dealTeam || []) {
        if (!member.systemuserid) continue;
        if (!seenPeople.has(member.systemuserid)) {
          seenPeople.set(member.systemuserid, {
            person: member,
            customers: new Set(),
            opportunities: new Set(),
          });
        }
        const entry = seenPeople.get(member.systemuserid);
        entry.customers.add(customer.name);
        entry.opportunities.add(opp.name);
      }
    }
  }

  summary.customers.push(customerSummary);
}

// ── People sync (deduplicated across all customers) ─────────────────
if (shouldSync("people")) {
  // Skip the authenticated user
  const userEmail = (input.user?.email || "").toLowerCase();

  for (const [, entry] of seenPeople) {
    const { person, customers: custSet, opportunities: oppSet } = entry;
    if (person.internalemailaddress?.toLowerCase() === userEmail) continue;

    const peoplePath = resolvePeoplePath(person.fullname);
    try {
      let action;

      if (existsSync(peoplePath)) {
        // People notes are mostly user-managed — only update frontmatter customers list
        const existing = readFileSync(peoplePath, "utf8");
        const customerNames = [...custSet];
        let needsUpdate = false;

        // Check if any customer is missing from frontmatter
        for (const c of customerNames) {
          if (!existing.includes(c)) {
            needsUpdate = true;
            break;
          }
        }

        if (needsUpdate) {
          // Update customers in frontmatter only (find and replace the customers list)
          // Match "customers:" line followed by YAML list items (safe bounded regex)
          const lines = existing.split("\n");
          const custIdx = lines.findIndex((l) => l.startsWith("customers:"));
          if (custIdx !== -1) {
            let endIdx = custIdx + 1;
            while (endIdx < lines.length && /^\s+-\s+"/.test(lines[endIdx])) endIdx++;
            const before = lines.slice(0, custIdx);
            const after = lines.slice(endIdx);
            const updated = [...before, `customers:`, ...customerNames.map((c) => `  - "${c}"`), ...after].join("\n");
            if (updated !== existing) {
              if (!dryRun) safeWrite(peoplePath, updated);
              action = "updated";
              summary.totals.people.updated++;
            } else {
              action = "skipped-unchanged";
              summary.totals.people.skipped++;
            }
          } else {
            action = "skipped-unchanged";
            summary.totals.people.skipped++;
          }
        } else {
          action = "skipped-unchanged";
          summary.totals.people.skipped++;
        }
      } else {
        const rendered = processTemplate(
          loadTemplate("people-note.template.md"),
          buildPeopleContext(person, [...custSet], [...oppSet])
        );
        if (!dryRun) safeWrite(peoplePath, rendered);
        action = "created";
        summary.totals.people.created++;
      }

      // Add to first customer's summary
      const firstCustomer = summary.customers.find(
        (c) => custSet.has(c.name)
      );
      if (firstCustomer) {
        firstCustomer.people.push({
          name: person.fullname,
          email: person.internalemailaddress,
          path: relative(vaultRoot, peoplePath),
          action,
        });
      }
    } catch (err) {
      summary.errors.push({ entity: "people", name: person.fullname, error: err.message });
    }
  }
}

// ── Output ──────────────────────────────────────────────────────────
console.log(JSON.stringify(summary, null, 2));
