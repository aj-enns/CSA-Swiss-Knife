/**
 * Report aggregator — summarizes eval results for CI output.
 */

import {
  type EvalResult,
  computeOverallScore,
  passLevel,
  passEmoji,
  PASS_THRESHOLD,
  REVIEW_THRESHOLD,
} from "./harness.js";

export interface EvalSummary {
  totalScenarios: number;
  passed: number;
  review: number;
  failed: number;
  overallScore: number;
  level: "pass" | "review" | "fail";
  details: Array<{
    scenarioId: string;
    score: number;
    level: "pass" | "review" | "fail";
    violations: string[];
  }>;
}

export function aggregateResults(results: EvalResult[]): EvalSummary {
  let passed = 0;
  let review = 0;
  let failed = 0;
  const details: EvalSummary["details"] = [];

  for (const r of results) {
    const score = computeOverallScore(r);
    const level = passLevel(score);
    const violations: string[] = [];

    if (r.dimensions.antiPatterns?.violations) {
      for (const v of r.dimensions.antiPatterns.violations) {
        violations.push(`${v.id}: ${v.reason}`);
      }
    }
    if (r.dimensions.toolCorrectness?.missing) {
      for (const m of r.dimensions.toolCorrectness.missing) {
        violations.push(`Missing tool: ${m}`);
      }
    }

    if (level === "pass") passed++;
    else if (level === "review") review++;
    else failed++;

    details.push({ scenarioId: r.scenarioId, score, level, violations });
  }

  const overallScore = results.length > 0
    ? results.reduce((s, r) => s + computeOverallScore(r), 0) / results.length
    : 0;

  return {
    totalScenarios: results.length,
    passed,
    review,
    failed,
    overallScore,
    level: passLevel(overallScore),
    details,
  };
}

export function formatReport(summary: EvalSummary): string {
  const lines: string[] = [
    `# Eval Report`,
    ``,
    `**Overall**: ${passEmoji(summary.level)} ${(summary.overallScore * 100).toFixed(1)}% (${summary.level})`,
    `**Scenarios**: ${summary.totalScenarios} total — ${summary.passed} passed, ${summary.review} review, ${summary.failed} failed`,
    ``,
    `| Scenario | Score | Status | Issues |`,
    `|----------|-------|--------|--------|`,
  ];

  for (const d of summary.details) {
    const issues = d.violations.length > 0 ? d.violations.join("; ") : "—";
    lines.push(
      `| ${d.scenarioId} | ${(d.score * 100).toFixed(0)}% | ${passEmoji(d.level)} | ${issues} |`,
    );
  }

  return lines.join("\n");
}
