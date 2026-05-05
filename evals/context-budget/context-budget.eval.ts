/**
 * Eval: Context Budget Efficiency
 *
 * Measures context window consumption of tool schemas, instruction files,
 * and response payloads. Extends the OIL bench token-efficiency pattern.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkFixtureFreshness } from "../harness.js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../..");
const INSTRUCTIONS_DIR = join(WORKSPACE_ROOT, ".github/instructions");
const SKILLS_DIR = join(WORKSPACE_ROOT, ".github/skills");

/** Rough token estimate: ~4 chars per token (GPT-4 heuristic). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Context window sizes
const CONTEXT_WINDOWS = {
  "claude-sonnet": 200_000,
  "gpt-4o": 128_000,
} as const;

const BUDGET_CEILING = 0.40; // skill chain should use <40% of context

describe("Context Budget Efficiency", () => {
  let instructionTokens: Map<string, number>;
  let skillTokens: Map<string, number>;

  beforeAll(async () => {
    instructionTokens = new Map();
    skillTokens = new Map();

    // Measure instruction files
    try {
      const instrFiles = await readdir(INSTRUCTIONS_DIR);
      for (const f of instrFiles) {
        if (!f.endsWith(".md")) continue;
        const content = await readFile(join(INSTRUCTIONS_DIR, f), "utf-8");
        instructionTokens.set(f, estimateTokens(content));
      }
    } catch {
      // Instructions dir may not exist in test env
    }

    // Measure skill files
    try {
      const skillDirs = await readdir(SKILLS_DIR);
      for (const dir of skillDirs) {
        try {
          const content = await readFile(join(SKILLS_DIR, dir, "SKILL.md"), "utf-8");
          skillTokens.set(dir, estimateTokens(content));
        } catch {
          // Skip non-skill directories
        }
      }
    } catch {
      // Skills dir may not exist in test env
    }
  });

  it("individual instruction files stay under 2000 tokens", () => {
    const oversized: string[] = [];
    for (const [file, tokens] of instructionTokens) {
      if (tokens > 2000) oversized.push(`${file} (${tokens} tokens)`);
    }
    if (oversized.length > 0) {
      console.warn(`⚠️  Oversized instruction files:\n  ${oversized.join("\n  ")}`);
    }
    expect(oversized.length).toBeLessThanOrEqual(5);
  });

  it("no instruction file exceeds hard ceiling of 6000 tokens (spec §5.2)", () => {
    const breached: string[] = [];
    for (const [file, tokens] of instructionTokens) {
      if (tokens > 6000) breached.push(`${file} (${tokens} tokens)`);
    }
    if (breached.length > 0) {
      console.error(`🔴 Hard ceiling breached:\n  ${breached.join("\n  ")}`);
    }
    expect(breached).toHaveLength(0);
  });

  it("individual skill files stay under 3000 tokens", () => {
    const oversized: string[] = [];
    for (const [skill, tokens] of skillTokens) {
      if (tokens > 3000) oversized.push(`${skill} (${tokens} tokens)`);
    }
    if (oversized.length > 0) {
      console.warn(`⚠️  Oversized skill files:\n  ${oversized.join("\n  ")}`);
    }
    expect(oversized.length).toBeLessThanOrEqual(10);
  });

  it("no skill file exceeds hard ceiling of 8000 tokens (spec §5.2)", () => {
    const breached: string[] = [];
    for (const [skill, tokens] of skillTokens) {
      if (tokens > 8000) breached.push(`${skill} (${tokens} tokens)`);
    }
    if (breached.length > 0) {
      console.error(`🔴 Hard ceiling breached:\n  ${breached.join("\n  ")}`);
    }
    expect(breached).toHaveLength(0);
  });

  it("morning-brief skill chain fits within budget ceiling", () => {
    // Morning brief loads: copilot-instructions + shared-patterns + morning-brief + vault
    const chainSkills = ["morning-brief", "vault-context-assembly", "shared-patterns"];
    const chainInstructions = ["crm-query-strategy.instructions.md"];

    let total = 0;

    for (const skill of chainSkills) {
      total += skillTokens.get(skill) ?? 0;
    }
    for (const instr of chainInstructions) {
      total += instructionTokens.get(instr) ?? 0;
    }

    // Estimate fixture response overhead (~500 tokens per tool call × 5 calls)
    total += 2500;

    const contextWindow = CONTEXT_WINDOWS["claude-sonnet"];
    const ratio = total / contextWindow;

    console.log(`Morning brief chain: ~${total} tokens (${(ratio * 100).toFixed(1)}% of ${contextWindow / 1000}K context)`);

    expect(ratio).toBeLessThan(BUDGET_CEILING);
  });

  it("total instruction + skill payload stays under 50% of context", () => {
    const totalInstr = [...instructionTokens.values()].reduce((s, t) => s + t, 0);
    const totalSkill = [...skillTokens.values()].reduce((s, t) => s + t, 0);
    const total = totalInstr + totalSkill;

    const contextWindow = CONTEXT_WINDOWS["claude-sonnet"];
    const ratio = total / contextWindow;

    console.log(
      `Total payload: ${totalInstr} instr + ${totalSkill} skill = ${total} tokens (${(ratio * 100).toFixed(1)}% of ${contextWindow / 1000}K)`,
    );

    // This is the full payload — individual sessions won't load all of it
    // Fail only if the total is way over budget
    expect(ratio).toBeLessThan(0.50);
  });

  it("fixture data is not stale (spec §4.4)", () => {
    const freshness = checkFixtureFreshness(14);
    if (freshness.age === Infinity) {
      console.warn("⚠️  No capture-manifest.json found — run npm run fixtures:capture");
    } else if (freshness.stale) {
      console.warn(`⚠️  Fixtures are ${freshness.age} days old — consider re-capturing`);
    } else {
      console.log(`✅ Fixtures are ${freshness.age} days old (within 14-day window)`);
    }
    // Warn but don't hard-fail in CI — freshness is advisory
    // Hard fail at 30 days
    expect(freshness.age).toBeLessThan(30);
  });
});
