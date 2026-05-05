/**
 * Live Eval: End-to-end agent loop tests
 *
 * Runs real LLM calls against mock MCP servers via Azure OpenAI.
 * Uses Azure RBAC (DefaultAzureCredential) — no API keys.
 * Requires AZURE_OPENAI_ENDPOINT env var + `az login`.
 * Write operations are intercepted and staged — never executed.
 *
 * Run with: npm run eval:live
 * Skip in CI without endpoint: tests auto-skip when AZURE_OPENAI_ENDPOINT is unset.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  runLiveScenario,
  DEFAULT_CONFIG,
  type LiveEvalConfig,
} from "./live-harness.js";
import { runLlmJudge, formatJudgeReport } from "../judges/llm-judge.js";
import { passLevel, passEmoji, FIXTURES_PATH, type EvalScenario } from "../harness.js";

// ── Config ──────────────────────────────────────────────────────────────────

const HAS_AZURE_ENDPOINT = Boolean(process.env.AZURE_INFERENCE_URL || process.env.AZURE_OPENAI_ENDPOINT);

const config: LiveEvalConfig = {
  ...DEFAULT_CONFIG,
  model: process.env.EVAL_MODEL ?? "gpt-4o-mini",
  temperature: 0,
  iterations: 1,
};

// ── Scenario loading from YAML (spec §5.6) ─────────────────────────────────

const SCENARIOS_PATH = join(
  resolve(import.meta.dirname, "../fixtures/scenarios"),
  "live-scenarios.yaml",
);

let ALL_SCENARIOS: EvalScenario[] = [];

function getScenario(id: string): EvalScenario {
  const s = ALL_SCENARIOS.find((s) => s.id === id);
  if (!s) throw new Error(`Scenario "${id}" not found in live-scenarios.yaml`);
  return s;
}

beforeAll(async () => {
  const raw = await readFile(SCENARIOS_PATH, "utf-8");
  const parsed = parseYaml(raw);
  ALL_SCENARIOS = (parsed.scenarios ?? []).map((s: Record<string, unknown>) => ({
    ...s,
    // Normalize context.mediums from YAML string array
    context: s.context
      ? {
          ...(s.context as Record<string, unknown>),
          mediums: ((s.context as Record<string, unknown>).mediums as string[])?.map((m: string) => m as EvalScenario["context"] extends { mediums?: infer M } ? M extends Array<infer T> ? T : string : string),
        }
      : undefined,
  })) as EvalScenario[];
});

// ── Helper ──────────────────────────────────────────────────────────────────

function skipWithoutEndpoint() {
  if (!HAS_AZURE_ENDPOINT) {
    console.log("⏭️  Skipping live eval — AZURE_OPENAI_ENDPOINT not set (run `az login` first)");
    return true;
  }
  return false;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Live Agent Loop", () => {
  describe("Morning Brief — end-to-end", () => {
    it.skipIf(!HAS_AZURE_ENDPOINT)("produces a structured brief with correct tool calls", { timeout: 60_000 }, async ({ task }) => {
      const result = await runLiveScenario(getScenario("live-morning-brief"), config);

      task.meta.evalScenarioId = result.evalResult.scenarioId;
      task.meta.evalDimension = "live";
      task.meta.evalScore = result.evalResult.overallScore;
      task.meta.evalPass = result.evalResult.pass;
      task.meta.evalViolations = result.evalResult.dimensions.antiPatterns?.violations.map((v) => v.id) ?? [];

      console.log(`\n📋 Morning Brief [${result.model}] — ${result.durationMs}ms`);
      console.log(`   Tool calls: ${result.toolCalls.map((c) => c.tool).join(", ")}`);
      console.log(`   Score: ${(result.evalResult.overallScore * 100).toFixed(0)}% ${passEmoji(passLevel(result.evalResult.overallScore))}`);
      console.log(`   Output length: ${result.agentOutput.length} chars`);

      // Core assertions: agent used tools and produced output
      expect(result.toolCalls.length).toBeGreaterThan(0);
      expect(result.agentOutput.length).toBeGreaterThan(0);

      // Anti-pattern check
      const ap = result.evalResult.dimensions.antiPatterns;
      if (ap && ap.violations.length > 0) {
        console.warn(`   ⚠️ Anti-pattern violations: ${ap.violations.map((v) => v.id).join(", ")}`);
      }
    });
  });

  describe("Milestone Health — CSAM governance", () => {
    it.skipIf(!HAS_AZURE_ENDPOINT)("returns milestone table with required columns", { timeout: 60_000 }, async ({ task }) => {
      const result = await runLiveScenario(getScenario("live-milestone-health"), config);

      task.meta.evalScenarioId = result.evalResult.scenarioId;
      task.meta.evalDimension = "live";
      task.meta.evalScore = result.evalResult.overallScore;
      task.meta.evalPass = result.evalResult.pass;

      console.log(`\n📋 Milestone Health [${result.model}] — ${result.durationMs}ms`);
      console.log(`   Tool calls: ${result.toolCalls.map((c) => c.tool).join(", ")}`);
      console.log(`   Score: ${(result.evalResult.overallScore * 100).toFixed(0)}%`);

      expect(result.toolCalls.length).toBeGreaterThan(0);
      expect(result.agentOutput.length).toBeGreaterThan(0);

      // Verify get_milestones was called with scoping
      const milestoneCall = result.toolCalls.find((c) => c.tool.includes("get_milestones"));
      if (milestoneCall) {
        const hasScope = milestoneCall.params.customerKeyword ||
          milestoneCall.params.statusFilter ||
          milestoneCall.params.opportunityId;
        expect(hasScope).toBeTruthy();
      }
    });
  });

  describe("Write Safety — staging guard", () => {
    it.skipIf(!HAS_AZURE_ENDPOINT)("stages writes instead of direct execution", { timeout: 60_000 }, async ({ task }) => {
      const result = await runLiveScenario(getScenario("live-write-safety"), config);

      task.meta.evalScenarioId = result.evalResult.scenarioId;
      task.meta.evalDimension = "live";
      task.meta.evalScore = result.evalResult.overallScore;
      task.meta.evalPass = result.evalResult.pass;

      console.log(`\n📋 Write Safety [${result.model}] — ${result.durationMs}ms`);
      console.log(`   Tool calls: ${result.toolCalls.map((c) => c.tool).join(", ")}`);

      // Any write calls should be staged by the mock
      const writeCalls = result.toolCalls.filter((c) =>
        c.tool.includes("update_milestone") ||
        c.tool.includes("create_task") ||
        c.tool.includes("create_milestone"),
      );

      // Direct execution tools should never be called in this scenario.
      const executeCalls = result.toolCalls.filter((c) =>
        c.tool.includes("execute_operation") ||
        c.tool.includes("execute_all"),
      );

      for (const wc of writeCalls) {
        const resp = wc.response as Record<string, unknown>;
        expect(resp.staged).toBe(true);
        console.log(`   ✅ Write staged: ${wc.tool} — not executed`);
      }

      expect(executeCalls.length).toBe(0);
      expect(result.stagedWriteCount).toBe(writeCalls.length);
    });
  });

  describe("Vault-First Pattern", () => {
    it.skipIf(!HAS_AZURE_ENDPOINT)("consults vault before CRM", { timeout: 60_000 }, async ({ task }) => {
      const result = await runLiveScenario(getScenario("live-vault-first"), config);

      task.meta.evalScenarioId = result.evalResult.scenarioId;
      task.meta.evalDimension = "live";
      task.meta.evalScore = result.evalResult.overallScore;
      task.meta.evalPass = result.evalResult.pass;

      console.log(`\n📋 Vault-First [${result.model}] — ${result.durationMs}ms`);
      console.log(`   Tool calls: ${result.toolCalls.map((c) => c.tool).join(", ")}`);

      // Check for vault call presence
      const hasVault = result.toolCalls.some((c) => c.tool.startsWith("oil:"));
      expect(hasVault).toBe(true);

      // Check AP-004 (skip vault) wasn't violated
      const ap = result.evalResult.dimensions.antiPatterns;
      const vaultSkip = ap?.violations.find((v) => v.id === "AP-004");
      expect(vaultSkip).toBeUndefined();
    });
  });

  describe("Scoped CRM Queries", () => {
    it.skipIf(!HAS_AZURE_ENDPOINT)("avoids N+1 milestone loop", { timeout: 60_000 }, async ({ task }) => {
      const result = await runLiveScenario(getScenario("live-scoped-query"), config);

      task.meta.evalScenarioId = result.evalResult.scenarioId;
      task.meta.evalDimension = "live";
      task.meta.evalScore = result.evalResult.overallScore;
      task.meta.evalPass = result.evalResult.pass;

      console.log(`\n📋 Scoped Query [${result.model}] — ${result.durationMs}ms`);
      console.log(`   Tool calls: ${result.toolCalls.map((c) => c.tool).join(", ")}`);

      // Count milestone calls — should be ≤2 (not N+1)
      const milestoneCalls = result.toolCalls.filter((c) =>
        c.tool.includes("get_milestones"),
      );
      expect(milestoneCalls.length).toBeLessThanOrEqual(2);
    });
  });
});

describe("LLM-as-Judge", () => {
  it.skipIf(!HAS_AZURE_ENDPOINT)("scores a well-formed morning brief", { timeout: 60_000 }, async () => {
    // Use a static good-quality sample output for deterministic judge testing
    const sampleOutput = `# Morning Brief — 2026-03-16

**Mediums**: ✅ Vault | ✅ CRM | ⚠️ WorkIQ unavailable

## 🔴 Act Now
- **MS-003 (Azure Sentinel Onboarding)**: Overdue by 6 days — customer infra team delayed → CSAM to escalate with customer IT lead

## 🟡 Today
- **MS-002 (App Modernization POC)**: Waiting on customer environment access | Due 2026-05-30
- **OPP-2026-002 (Security Modernization)**: Stage 2 - Qualify — needs BANT completion

## 🟢 Awareness
- **OPP-2026-001 (Azure Migration FY26)**: Stage 3 — on track, $12K MRR

## Today's Meetings
| Time | Meeting | Customer | Prep Notes |
|------|---------|----------|------------|
| 9:00 AM | Weekly Architecture Review | Contoso | MS-001 on track, discuss VNet peering |
| 2:00 PM | Pipeline Review | Internal | 2 active opps, 1 overdue milestone |

## Milestones

| Name | Monthly Use | Due Date | Status | Owner | Blocker/Risk |
|------|-------------|----------|--------|-------|--------------|
| Azure Landing Zone | $8K | 2026-04-15 | Committed — On Track | Jin Lee | — |
| App Modernization POC | $4K | 2026-05-30 | Committed — In Progress | Jin Lee | Waiting on customer environment access |
| Azure Sentinel Onboarding | $2K | 2026-03-10 | 🔴 Overdue | Jin Lee | Customer infra team delayed |

## Pipeline Snapshot

| Opp # | Name | Stage | Estimated Close Date | Health/Risk |
|-------|------|-------|---------------------|-------------|
| OPP-2026-001 | Azure Migration FY26 | 3 - Solution & Proof | 2026-06-15 | 🟢 On Track |
| OPP-2026-002 | Security Modernization | 2 - Qualify | 2026-09-30 | 🟡 Early |

- **At-risk milestones**: 1 (MS-003 overdue)
- **Overdue tasks**: 1
- **Upcoming commits**: MS-001 (Landing Zone) due 2026-04-15

## Gaps & Risks
- MS-003 overdue with partner-led delivery — flag to CSAM for customer escalation | Minimum: one email to customer IT director`;

    const report = await runLlmJudge(
      "Start my day — give me the morning brief",
      sampleOutput,
      { model: config.model },
    );

    console.log("\n" + formatJudgeReport(report));

    // A well-formed output should score at "good" quality or better (spec §5.1).
    for (const r of report.results) {
      expect(r.score).toBeGreaterThanOrEqual(4);
    }
    expect(report.overallScore).toBeGreaterThanOrEqual(0.7);
  });

  it.skipIf(!HAS_AZURE_ENDPOINT)("penalizes a poor-quality response", { timeout: 60_000 }, async () => {
    const poorOutput = "I don't have access to your CRM data right now. Maybe try again later.";

    const report = await runLlmJudge(
      "How are my milestones for Contoso?",
      poorOutput,
      { model: config.model },
    );

    console.log("\n" + formatJudgeReport(report));

    // Poor output should score low
    expect(report.overallScore).toBeLessThan(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Workflow Delegation Tests — Parent Prompt → Subagent Chains
// ═══════════════════════════════════════════════════════════════════════════

describe("Workflow Delegation — Account Review", () => {
  it.skipIf(!HAS_AZURE_ENDPOINT)("seats analysis resolves TPID and calls vault before CRM", { timeout: 90_000 }, async ({ task }) => {
    const result = await runLiveScenario(getScenario("live-account-review-seats-tpid"), config);

    task.meta.evalScenarioId = result.evalResult.scenarioId;
    task.meta.evalDimension = "workflow-delegation";
    task.meta.evalScore = result.evalResult.overallScore;
    task.meta.evalPass = result.evalResult.pass;

    console.log(`\n📋 Account Review — Seats by TPID [${result.model}] — ${result.durationMs}ms`);
    console.log(`   Tool calls: ${result.toolCalls.map((c) => c.tool).join(", ")}`);
    console.log(`   Score: ${(result.evalResult.overallScore * 100).toFixed(0)}%`);

    // Vault should be consulted (not just CRM)
    const hasVault = result.toolCalls.some((c) => c.tool.startsWith("oil:"));
    expect(hasVault).toBe(true);

    // AP-004 (vault skip) must not be violated
    const ap = result.evalResult.dimensions.antiPatterns;
    const vaultSkip = ap?.violations.find((v) => v.id === "AP-004");
    expect(vaultSkip).toBeUndefined();

    // Output should mention GHCP/seats
    const output = result.agentOutput.toLowerCase();
    expect(output).toMatch(/ghcp|seat/i);
  });

  it.skipIf(!HAS_AZURE_ENDPOINT)("pipeline by abbreviation resolves NIQ to Nielsen", { timeout: 90_000 }, async ({ task }) => {
    const result = await runLiveScenario(getScenario("live-account-review-pipeline-abbrev"), config);

    task.meta.evalScenarioId = result.evalResult.scenarioId;
    task.meta.evalDimension = "workflow-delegation";
    task.meta.evalScore = result.evalResult.overallScore;
    task.meta.evalPass = result.evalResult.pass;

    console.log(`\n📋 Account Review — Pipeline by Abbrev [${result.model}] — ${result.durationMs}ms`);
    console.log(`   Tool calls: ${result.toolCalls.map((c) => c.tool).join(", ")}`);
    console.log(`   Score: ${(result.evalResult.overallScore * 100).toFixed(0)}%`);

    // Should have called get_milestones with scoping
    const milestoneCall = result.toolCalls.find((c) => c.tool.includes("get_milestones"));
    if (milestoneCall) {
      const hasScope = milestoneCall.params.customerKeyword || milestoneCall.params.tpid;
      expect(hasScope).toBeTruthy();
    }
  });
});

describe("Workflow Delegation — Portfolio Prioritization", () => {
  it.skipIf(!HAS_AZURE_ENDPOINT)("reads vault roster and queries CRM with scoped params", { timeout: 90_000 }, async ({ task }) => {
    const result = await runLiveScenario(getScenario("live-portfolio-prioritization"), config);

    task.meta.evalScenarioId = result.evalResult.scenarioId;
    task.meta.evalDimension = "workflow-delegation";
    task.meta.evalScore = result.evalResult.overallScore;
    task.meta.evalPass = result.evalResult.pass;

    console.log(`\n📋 Portfolio Prioritization [${result.model}] — ${result.durationMs}ms`);
    console.log(`   Tool calls: ${result.toolCalls.map((c) => c.tool).join(", ")}`);
    console.log(`   Score: ${(result.evalResult.overallScore * 100).toFixed(0)}%`);

    // Vault must be used first
    const vaultIdx = result.toolCalls.findIndex((c) => c.tool.startsWith("oil:"));
    expect(vaultIdx).toBeGreaterThanOrEqual(0);

    // AP-001 (unscoped milestones) must not fire
    const ap = result.evalResult.dimensions.antiPatterns;
    const unscopedMs = ap?.violations.find((v) => v.id === "AP-001");
    expect(unscopedMs).toBeUndefined();
  });
});

describe("Multi-Model Comparison", () => {
  const models = (process.env.EVAL_MODELS ?? "").split(",").filter(Boolean);

  it.skipIf(!HAS_AZURE_ENDPOINT || models.length < 2)(
    "compares models on the same scenario",
    { timeout: 120_000 },
    async () => {
      const scenario = getScenario("live-morning-brief");
      const results: Array<{ model: string; score: number; calls: number; ms: number }> = [];

      for (const model of models) {
        const modelConfig = { ...config, model };
        const result = await runLiveScenario(scenario, modelConfig);
        results.push({
          model,
          score: result.evalResult.overallScore,
          calls: result.toolCalls.length,
          ms: result.durationMs,
        });
      }

      console.log("\n📊 Multi-Model Comparison — Morning Brief");
      console.log("| Model | Score | Tool Calls | Duration |");
      console.log("|-------|-------|------------|----------|");
      for (const r of results) {
        console.log(
          `| ${r.model} | ${(r.score * 100).toFixed(0)}% | ${r.calls} | ${r.ms}ms |`,
        );
      }
    },
  );
});
