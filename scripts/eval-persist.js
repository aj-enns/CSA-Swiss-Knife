#!/usr/bin/env node
/**
 * Eval Persistence & Regression Detection
 *
 * Three modes:
 *   --baseline           Copy latest.json → baseline.json (commit this)
 *   --diff               Compare latest.json vs baseline.json, exit 1 on regression
 *   --history            Print score trend from history/ files
 *
 * Options:
 *   --fail-on-regression  Exit 1 if any scenario drops (default in --diff)
 *   --threshold N         Regression threshold in percentage points (default: 5)
 *   --output FILE         Write diff report to file instead of stdout
 */

import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const RESULTS_DIR = resolve(new URL(".", import.meta.url).pathname, "../evals/results");
const BASELINE_PATH = join(RESULTS_DIR, "baseline.json");
const LATEST_PATH = join(RESULTS_DIR, "latest.json");
const HISTORY_DIR = join(RESULTS_DIR, "history");
const MAX_HISTORY = 30;

// ── CLI parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  baseline: args.includes("--baseline"),
  diff: args.includes("--diff"),
  history: args.includes("--history"),
  update: args.includes("--update"),
  failOnRegression: args.includes("--fail-on-regression"),
  threshold: 5,
  output: /** @type {string|null} */ (null),
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--threshold" && args[i + 1]) {
    flags.threshold = Number(args[++i]);
  }
  if (args[i] === "--output" && args[i + 1]) {
    flags.output = args[++i];
  }
}

// Default: show help
if (!flags.baseline && !flags.diff && !flags.history) {
  console.log(`Usage:
  node scripts/eval-persist.js --baseline          # Save current results as baseline
  node scripts/eval-persist.js --diff              # Compare latest vs baseline
  node scripts/eval-persist.js --history           # Show score trend
  
Options:
  --threshold N        Regression threshold in % points (default: 5)
  --output FILE        Write diff report to a file
  --fail-on-regression Exit 1 on regression (default in --diff)
  --update             Overwrite existing baseline`);
  process.exit(0);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function pct(n) {
  return (n * 100).toFixed(1) + "%";
}

function delta(a, b) {
  const d = (b - a) * 100;
  if (Math.abs(d) < 0.05) return "—";
  return d > 0 ? `▲ ${d.toFixed(1)}%` : `▼ ${Math.abs(d).toFixed(1)}%`;
}

function levelEmoji(level) {
  return level === "pass" ? "🟢" : level === "review" ? "🟡" : "🔴";
}

// ── Baseline ────────────────────────────────────────────────────────────────

if (flags.baseline) {
  if (!existsSync(LATEST_PATH)) {
    console.error("❌ No latest.json found. Run `npm run eval` first.");
    process.exit(1);
  }

  if (existsSync(BASELINE_PATH) && !flags.update) {
    console.error("⚠️  baseline.json already exists. Use --update to overwrite.");
    process.exit(1);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  copyFileSync(LATEST_PATH, BASELINE_PATH);
  const data = loadJson(BASELINE_PATH);
  console.log(`✅ Baseline saved (${pct(data.summary.overallScore)} — ${data.summary.scenarioCount} scenarios)`);
  console.log(`   Commit: ${data.commit} | Branch: ${data.branch}`);
  process.exit(0);
}

// ── Diff ────────────────────────────────────────────────────────────────────

if (flags.diff) {
  if (!existsSync(LATEST_PATH)) {
    console.error("❌ No latest.json found. Run `npm run eval` first.");
    process.exit(1);
  }
  if (!existsSync(BASELINE_PATH)) {
    console.error("❌ No baseline.json found. Run `npm run eval:baseline` first.");
    process.exit(1);
  }

  const latest = loadJson(LATEST_PATH);
  const baseline = loadJson(BASELINE_PATH);

  // Model mismatch warning (open question #1: baseline includes model metadata)
  const latestModel = latest.model ?? "unknown";
  const baselineModel = baseline.model ?? "unknown";

  const lines = [];
  lines.push(`# Eval Regression Report`);
  lines.push(``);

  if (latestModel !== baselineModel) {
    lines.push(`> ⚠️ **Model mismatch**: baseline used **${baselineModel}**, latest used **${latestModel}**. Score deltas may reflect model differences, not code changes.`);
    lines.push(``);
  }
  lines.push(`**Latest**: ${latest.commit} (${latest.branch}) — ${latest.timestamp}`);
  lines.push(`**Baseline**: ${baseline.commit} (${baseline.branch}) — ${baseline.timestamp}`);
  lines.push(``);

  const overallDelta = (latest.summary.overallScore - baseline.summary.overallScore) * 100;
  const overallSign = overallDelta >= 0 ? "▲" : "▼";
  const overallStatus = overallDelta < -flags.threshold ? "⚠️ REGRESSION" : "✅ OK";

  lines.push(`**Overall**: ${pct(baseline.summary.overallScore)} → ${pct(latest.summary.overallScore)} (${overallSign} ${Math.abs(overallDelta).toFixed(1)}%) ${overallStatus}`);
  lines.push(``);

  // Build scenario comparison
  const baselineMap = new Map();
  for (const s of baseline.scenarios ?? []) {
    baselineMap.set(s.id, s);
  }

  const regressions = [];
  const improvements = [];
  const newScenarios = [];
  const removed = [];

  lines.push(`| Scenario | Baseline | Latest | Delta | Status |`);
  lines.push(`|----------|----------|--------|-------|--------|`);

  for (const s of latest.scenarios ?? []) {
    const base = baselineMap.get(s.id);
    if (!base) {
      newScenarios.push(s.id);
      lines.push(`| ${s.id} | — | ${pct(s.score)} | NEW | 🆕 |`);
      continue;
    }

    const d = (s.score - base.score) * 100;
    const status = d < -flags.threshold ? "🔴 REGRESSED" : d > flags.threshold ? "🟢 IMPROVED" : "—";
    lines.push(`| ${s.id} | ${pct(base.score)} | ${pct(s.score)} | ${delta(base.score, s.score)} | ${status} |`);

    if (d < -flags.threshold) regressions.push({ id: s.id, from: base.score, to: s.score });
    if (d > flags.threshold) improvements.push({ id: s.id, from: base.score, to: s.score });
    baselineMap.delete(s.id);
  }

  for (const [id] of baselineMap) {
    removed.push(id);
    lines.push(`| ${id} | ${pct(baselineMap.get(id).score)} | — | REMOVED | ⚪ |`);
  }

  lines.push(``);

  if (regressions.length > 0) {
    lines.push(`### Regressions (>${flags.threshold}% drop)`);
    for (const r of regressions) {
      lines.push(`- **${r.id}**: ${pct(r.from)} → ${pct(r.to)}`);
    }
    lines.push(``);
  }

  if (improvements.length > 0) {
    lines.push(`### Improvements`);
    for (const r of improvements) {
      lines.push(`- **${r.id}**: ${pct(r.from)} → ${pct(r.to)}`);
    }
    lines.push(``);
  }

  const report = lines.join("\n");

  if (flags.output) {
    writeFileSync(flags.output, report);
    console.log(`📄 Diff report written to ${flags.output}`);
  } else {
    console.log(report);
  }

  // Exit code
  if (regressions.length > 0 && (flags.failOnRegression || flags.diff)) {
    console.error(`\n❌ ${regressions.length} regression(s) detected. Threshold: ${flags.threshold}%`);
    process.exit(1);
  }

  process.exit(0);
}

// ── History ─────────────────────────────────────────────────────────────────

if (flags.history) {
  if (!existsSync(HISTORY_DIR)) {
    console.log("No history yet. Run some evals first.");
    process.exit(0);
  }

  const files = readdirSync(HISTORY_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .slice(-MAX_HISTORY);

  if (files.length === 0) {
    console.log("No history files found.");
    process.exit(0);
  }

  console.log("# Eval Score History\n");
  console.log("| Date | Commit | Score | Level | Scenarios |");
  console.log("|------|--------|-------|-------|-----------|");

  for (const f of files) {
    const data = loadJson(join(HISTORY_DIR, f));
    const date = data.timestamp?.slice(0, 10) ?? "?";
    const commit = data.commit ?? "?";
    const score = pct(data.summary?.overallScore ?? 0);
    const level = levelEmoji(data.summary?.level ?? "fail");
    const count = data.summary?.scenarioCount ?? 0;
    console.log(`| ${date} | ${commit} | ${score} | ${level} | ${count} |`);
  }

  // Prune old entries
  if (files.length > MAX_HISTORY) {
    const toRemove = files.slice(0, files.length - MAX_HISTORY);
    for (const f of toRemove) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(join(HISTORY_DIR, f));
    }
    console.log(`\n🗑️  Pruned ${toRemove.length} old history entries.`);
  }

  process.exit(0);
}
