/**
 * Trace Harness — capture, promote, and regression-check golden traces.
 *
 * Modes:
 *   --review <file>         Show trace summary
 *   --promote <file>        Move captured trace to golden/
 *   --regression            Re-run golden traces and compare
 *   --quality <good|acceptable|poor>   Quality rating for --promote
 *   --notes <text>          Notes for --promote
 */

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { AgentTrace } from "./types.js";

const TRACES_DIR = resolve(import.meta.dirname);
const GOLDEN_DIR = join(TRACES_DIR, "golden");
const CAPTURED_DIR = join(TRACES_DIR, "captured");

// ── Schema version from actual MOCK_TOOLS ───────────────────────────────────

/**
 * Compute a deterministic hash of the MOCK_TOOLS schema.
 * Reads tool names from the live-harness MOCK_TOOLS export when available,
 * falls back to extracting names from the source file.
 */
export function computeSchemaVersion(): string {
  let toolNames: string[];

  try {
    // Try reading live-harness.ts source to extract tool names
    // (avoids circular import issues when used from both CLI and test contexts)
    const harnessPath = join(resolve(import.meta.dirname, "../live"), "live-harness.ts");
    const content = readFileSync(harnessPath, "utf-8");
    toolNames = [];
    const nameRe = /name:\s*"([^"]+)"/g;
    let match;
    while ((match = nameRe.exec(content)) !== null) {
      if (match[1].includes("__")) {
        toolNames.push(match[1]);
      }
    }
  } catch {
    // Fallback: hardcoded list if source file not accessible
    toolNames = [
      "msx_crm__crm_whoami", "msx_crm__crm_auth_status",
      "msx_crm__get_my_active_opportunities", "msx_crm__get_milestones",
      "msx_crm__crm_query", "msx_crm__update_milestone",
      "msx_crm__create_task", "msx_crm__get_milestone_activities",
      "msx_crm__get_milestone_field_options", "msx_crm__get_task_status_options",
      "msx_crm__crm_get_record", "msx_crm__list_opportunities",
      "msx_crm__find_milestones_needing_tasks",
      "msx_crm__execute_operation", "msx_crm__execute_all",
      "msx_crm__list_pending_operations", "msx_crm__create_milestone",
      "msx_crm__update_task", "msx_crm__close_task",
      "msx_crm__manage_deal_team", "msx_crm__manage_milestone_team",
      "oil__get_vault_context", "oil__get_customer_context",
      "oil__search_vault", "oil__read_note", "oil__write_note",
      "oil__query_notes", "oil__query_graph", "oil__patch_note",
      "oil__promote_findings", "oil__draft_meeting_note", "oil__apply_tags",
      "workiq__ask_work_iq",
    ];
  }

  return createHash("sha256").update(toolNames.sort().join(",")).digest("hex").slice(0, 12);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const mode = {
  review: getFlag("review"),
  promote: getFlag("promote"),
  regression: args.includes("--regression"),
  quality: getFlag("quality") as "good" | "acceptable" | "poor" | undefined,
  notes: getFlag("notes"),
};

// ── Review ──────────────────────────────────────────────────────────────────

function reviewTrace(filePath: string): void {
  const fullPath = filePath.startsWith("/") ? filePath : join(TRACES_DIR, filePath);
  if (!existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const trace: AgentTrace = JSON.parse(readFileSync(fullPath, "utf-8"));

  console.log(`\n# Trace Review: ${trace.id}`);
  console.log(`  Model:     ${trace.model}`);
  console.log(`  Captured:  ${trace.capturedAt}`);
  console.log(`  Scenario:  ${trace.scenarioId ?? "N/A"}`);
  console.log(`  Utterance: "${trace.userUtterance}"`);
  console.log(`  Context:   role=${trace.context.role ?? "?"} customer=${trace.context.customer ?? "?"}`);
  console.log(`  Schema:    ${trace.schemaVersion}`);
  console.log(`  Verified:  ${trace.verified ? `${trace.verified.quality} by ${trace.verified.by}` : "not verified"}`);
  console.log(`\n  Tool Calls (${trace.toolCalls.length}):`);
  for (const tc of trace.toolCalls) {
    const params = Object.keys(tc.params).length > 0 ? ` ${JSON.stringify(tc.params)}` : "";
    console.log(`    ${tc.tool}${params} (${tc.durationMs}ms)`);
  }
  console.log(`\n  Output (${trace.agentOutput.length} chars):`);
  console.log(`    ${trace.agentOutput.slice(0, 200)}${trace.agentOutput.length > 200 ? "..." : ""}`);

  if (trace.scores) {
    console.log(`\n  Scores: overall=${(trace.scores.overall * 100).toFixed(1)}%`);
  }
}

// ── Promote ─────────────────────────────────────────────────────────────────

function promoteTrace(filePath: string, quality: "good" | "acceptable" | "poor", notes?: string): void {
  const fullPath = filePath.startsWith("/") ? filePath : join(TRACES_DIR, filePath);
  if (!existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const trace: AgentTrace = JSON.parse(readFileSync(fullPath, "utf-8"));
  trace.verified = {
    by: process.env.USER ?? "unknown",
    date: new Date().toISOString().slice(0, 10),
    quality,
    notes,
  };

  mkdirSync(GOLDEN_DIR, { recursive: true });

  const goldenName = trace.scenarioId
    ? `${trace.scenarioId}.trace.json`
    : basename(fullPath);
  const goldenPath = join(GOLDEN_DIR, goldenName);

  writeFileSync(goldenPath, JSON.stringify(trace, null, 2));
  console.log(`✅ Promoted to golden: ${goldenName}`);
  console.log(`   Quality: ${quality} | Verified by: ${trace.verified.by}`);
}

// ── Regression ──────────────────────────────────────────────────────────────

interface RegressionResult {
  traceId: string;
  scenarioId: string;
  stale: boolean;
  toolSetMatch: boolean;
  toolOrderMatch: boolean;
  missingTools: string[];
  extraTools: string[];
}

function runRegression(): void {
  if (!existsSync(GOLDEN_DIR)) {
    console.log("No golden traces found. Capture and promote some first.");
    process.exit(0);
  }

  const goldenFiles = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".trace.json"));
  if (goldenFiles.length === 0) {
    console.log("No golden traces found.");
    process.exit(0);
  }

  console.log(`\n# Golden Trace Regression Check (${goldenFiles.length} traces)\n`);

  const results: RegressionResult[] = [];
  let hasRegression = false;

  for (const file of goldenFiles) {
    const trace: AgentTrace = JSON.parse(readFileSync(join(GOLDEN_DIR, file), "utf-8"));

    // Staleness check — compare schema version
    const currentSchemaVersion = computeSchemaVersion();
    const stale = trace.schemaVersion !== currentSchemaVersion;

    // We compare the golden trace's tool set against the "expected" pattern.
    // In a full implementation, this would re-run the scenario against mocks
    // seeded with the trace's responses. For now, we validate structural integrity.
    const goldenTools = trace.toolCalls.map((tc) => tc.tool);
    const uniqueTools = [...new Set(goldenTools)];

    const result: RegressionResult = {
      traceId: trace.id,
      scenarioId: trace.scenarioId ?? "unknown",
      stale,
      toolSetMatch: true,
      toolOrderMatch: true,
      missingTools: [],
      extraTools: [],
    };

    results.push(result);

    const statusIcon = stale ? "⚠️" : "✅";
    const staleNote = stale ? " (STALE — schema changed)" : "";
    console.log(`  ${statusIcon} ${trace.scenarioId ?? trace.id}${staleNote}`);
    console.log(`     Tools: ${uniqueTools.join(", ")}`);
    console.log(`     Quality: ${trace.verified?.quality ?? "unverified"}`);
    if (trace.scores) {
      console.log(`     Score: ${(trace.scores.overall * 100).toFixed(1)}%`);
    }
    console.log();

    if (stale) hasRegression = true;
  }

  // Summary
  const staleCount = results.filter((r) => r.stale).length;
  console.log(`\n  Total: ${results.length} | Stale: ${staleCount} | Fresh: ${results.length - staleCount}`);

  if (hasRegression) {
    console.error(`\n⚠️  ${staleCount} trace(s) are stale. Re-capture or update them.`);
    process.exit(1);
  }

  console.log(`\n✅ All golden traces are current.`);
}

// ── Trace creation helper (used by live harness) ────────────────────────────

export function createTraceFromLiveResult(
  liveResult: {
    scenario: { id: string; userUtterance: string; context?: { role?: string; customer?: string; mediums?: string[] } };
    toolCalls: Array<{ tool: string; params: Record<string, unknown>; response: unknown; timestamp: number }>;
    agentOutput: string;
    evalResult: {
      overallScore: number;
      dimensions: {
        toolCorrectness?: { score: number } | undefined;
        antiPatterns?: { score: number } | undefined;
        outputFormat?: { score: number } | undefined;
        [key: string]: unknown;
      };
    };
    model: string;
  },
): AgentTrace {
  const startTime = liveResult.toolCalls[0]?.timestamp ?? 0;

  return {
    id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capturedAt: new Date().toISOString(),
    model: liveResult.model,
    userUtterance: liveResult.scenario.userUtterance,
    scenarioId: liveResult.scenario.id,
    context: {
      role: liveResult.scenario.context?.role,
      customer: liveResult.scenario.context?.customer,
      mediums: liveResult.scenario.context?.mediums as string[] | undefined,
    },
    toolCalls: liveResult.toolCalls.map((tc, i) => ({
      tool: tc.tool,
      params: tc.params,
      response: tc.response,
      durationMs: i < liveResult.toolCalls.length - 1
        ? liveResult.toolCalls[i + 1].timestamp - tc.timestamp
        : 0,
    })),
    agentOutput: liveResult.agentOutput,
    verified: null,
    schemaVersion: computeSchemaVersion(),
    scores: {
      overall: liveResult.evalResult.overallScore,
      toolCorrectness: liveResult.evalResult.dimensions.toolCorrectness?.score,
      antiPatterns: liveResult.evalResult.dimensions.antiPatterns?.score,
      outputFormat: liveResult.evalResult.dimensions.outputFormat?.score,
    },
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

if (mode.review) {
  reviewTrace(mode.review);
} else if (mode.promote) {
  const quality = mode.quality ?? "acceptable";
  promoteTrace(mode.promote, quality, mode.notes);
} else if (mode.regression) {
  runRegression();
} else {
  console.log(`Usage:
  npx tsx evals/traces/trace-harness.ts --review <file>
  npx tsx evals/traces/trace-harness.ts --promote <file> --quality good --notes "..."
  npx tsx evals/traces/trace-harness.ts --regression`);
}
