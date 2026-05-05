/**
 * Vitest Custom Reporter — persists eval results as JSON.
 *
 * Writes evals/results/latest.json after each run.
 * Appends a timestamped copy to evals/results/history/.
 *
 * Tests attach metadata via `context.task.meta`:
 *   meta.evalScenarioId — scenario identifier
 *   meta.evalScore      — 0-1 normalized score
 *   meta.evalDimension  — which dimension this test covers
 *   meta.evalPass       — boolean pass/fail
 *   meta.evalViolations — string[] of violation IDs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reporter, TestModule, TestCase, TestSuite } from "vitest/reporters";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const RESULTS_DIR = resolve(__dirname, "../results");
const HISTORY_DIR = join(RESULTS_DIR, "history");

interface ScenarioResult {
  id: string;
  score: number;
  level: "pass" | "review" | "fail";
  dimensions: Record<string, { pass: boolean; score: number; violations?: string[] }>;
}

export interface EvalRunResult {
  timestamp: string;
  commit: string;
  branch: string;
  phase: "offline" | "live" | "both";
  model: string | null;
  summary: {
    overallScore: number;
    level: "pass" | "review" | "fail";
    scenarioCount: number;
    passed: number;
    review: number;
    failed: number;
  };
  scenarios: ScenarioResult[];
}

function gitInfo(): { commit: string; branch: string } {
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
    return { commit, branch };
  } catch {
    return { commit: "unknown", branch: "unknown" };
  }
}

function scoreLevel(score: number): "pass" | "review" | "fail" {
  if (score >= 0.85) return "pass";
  if (score >= 0.70) return "review";
  return "fail";
}

/**
 * Recursively collect all TestCase instances from a TestModule or TestSuite.
 */
function collectTestCases(children: ReadonlyArray<TestCase | TestSuite>): TestCase[] {
  const cases: TestCase[] = [];
  for (const child of children) {
    if (child.type === "test") {
      cases.push(child);
    } else if (child.type === "suite") {
      cases.push(...collectTestCases(child.children.array()));
    }
  }
  return cases;
}

export default class EvalPersistReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    if (testModules.length === 0) return;

    mkdirSync(HISTORY_DIR, { recursive: true });

    const { commit, branch } = gitInfo();
    const scenarioMap = new Map<string, ScenarioResult>();

    // Determine phase from module paths
    const hasLive = testModules.some((m) => m.moduleId.includes("/live/"));
    const hasOffline = testModules.some((m) => !m.moduleId.includes("/live/"));
    const phase = hasLive && hasOffline ? "both" : hasLive ? "live" : "offline";

    let totalTests = 0;
    let passedTests = 0;

    for (const mod of testModules) {
      const tests = collectTestCases(mod.children.array());
      for (const test of tests) {
        totalTests++;
        const testResult = test.result();
        const isPassed = testResult.state === "passed";
        if (isPassed) passedTests++;

        const meta = test.meta();
        if (!meta.evalScenarioId) continue;

        const scenarioId = String(meta.evalScenarioId);
        const dimension = String(meta.evalDimension ?? "unknown");
        const score = Number(meta.evalScore ?? (isPassed ? 1 : 0));
        const pass = Boolean(meta.evalPass ?? isPassed);
        const violations = (meta.evalViolations as string[] | undefined) ?? [];

        if (!scenarioMap.has(scenarioId)) {
          scenarioMap.set(scenarioId, {
            id: scenarioId,
            score: 0,
            level: "fail",
            dimensions: {},
          });
        }

        const scenario = scenarioMap.get(scenarioId)!;
        scenario.dimensions[dimension] = { pass, score, violations: violations.length > 0 ? violations : undefined };
      }
    }

    // Compute per-scenario aggregate scores
    for (const scenario of scenarioMap.values()) {
      const dims = Object.values(scenario.dimensions);
      if (dims.length > 0) {
        scenario.score = dims.reduce((s, d) => s + d.score, 0) / dims.length;
      }
      scenario.level = scoreLevel(scenario.score);
    }

    const scenarios = [...scenarioMap.values()];
    const overallScore = scenarios.length > 0
      ? scenarios.reduce((s, sc) => s + sc.score, 0) / scenarios.length
      : totalTests > 0 ? passedTests / totalTests : 0;

    const passed = scenarios.filter((s) => s.level === "pass").length;
    const review = scenarios.filter((s) => s.level === "review").length;
    const failed = scenarios.filter((s) => s.level === "fail").length;

    const result: EvalRunResult = {
      timestamp: new Date().toISOString(),
      commit,
      branch,
      phase,
      model: process.env.EVAL_MODEL ?? null,
      summary: {
        overallScore,
        level: scoreLevel(overallScore),
        scenarioCount: scenarios.length || totalTests,
        passed: scenarios.length > 0 ? passed : passedTests,
        review,
        failed: scenarios.length > 0 ? failed : totalTests - passedTests,
      },
      scenarios,
    };

    // Write latest + history
    const latestPath = join(RESULTS_DIR, "latest.json");
    const ts = result.timestamp.replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
    const historyPath = join(HISTORY_DIR, `${ts}.json`);

    const json = JSON.stringify(result, null, 2);
    writeFileSync(latestPath, json);
    writeFileSync(historyPath, json);
  }
}
