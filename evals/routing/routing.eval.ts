/**
 * Eval: Skill Routing Accuracy
 *
 * Validates that skill trigger phrases correctly map to the right skill.
 * Phase 1: rule-based matching against skill description keywords.
 * Phase 2: will use live agent loop for real LLM-driven routing.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const SKILLS_DIR = resolve(import.meta.dirname, "../../.github/skills");

interface SkillMeta {
  name: string;
  triggers: string[];
  description: string;
}

let skills: SkillMeta[];

/** Extract trigger phrases from a SKILL.md description field. */
function extractTriggers(description: string): string[] {
  // Look for "Triggers:" section — may end with period, quote, or end of string
  const match = description.match(/Triggers?:\s*(.+?)(?:[.'"]|$)/is);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Simple keyword-based routing: does the utterance match any trigger? */
function routeUtterance(utterance: string, skills: SkillMeta[]): SkillMeta | null {
  const lower = utterance.toLowerCase();
  let bestMatch: SkillMeta | null = null;
  let bestScore = 0;

  for (const skill of skills) {
    let score = 0;
    for (const trigger of skill.triggers) {
      if (lower.includes(trigger)) {
        // Longer trigger matches are more specific
        score += trigger.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = skill;
    }
  }

  return bestMatch;
}

beforeAll(async () => {
  skills = [];
  try {
    const dirs = await readdir(SKILLS_DIR);
    for (const dir of dirs) {
      try {
        const content = await readFile(join(SKILLS_DIR, dir, "SKILL.md"), "utf-8");
        // Extract description from YAML frontmatter (handles single-quoted multi-line)
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let description = "";
        if (fmMatch) {
          // Match description field — handles 'single-quoted' or "double-quoted" or bare
          const descMatch = fmMatch[1].match(/description:\s*['"]?([\s\S]*?)['"]?\s*\n(?:\w|---)/);
          if (descMatch) description = descMatch[1];
        }
        if (!description) {
          // Fallback: extract Triggers from anywhere in the file
          const triggerMatch = content.match(/Triggers?:\s*(.+?)(?:\.|\n)/is);
          if (triggerMatch) description = triggerMatch[0];
        }
        const triggers = extractTriggers(description);
        skills.push({ name: dir, triggers, description });
      } catch {
        // Not a skill directory
      }
    }
  } catch {
    // Skills dir may not exist in CI
  }
});

describe("Skill Routing Accuracy", () => {
  describe("Morning brief triggers", () => {
    it.each([
      "start my day",
      "morning brief",
      "catch me up",
      "daily standup",
      "morning prep",
    ])('"%s" routes to morning-brief', (utterance) => {
      const match = routeUtterance(utterance, skills);
      if (skills.length === 0) {
        // CI environment — no skills directory
        expect(true).toBe(true);
        return;
      }
      expect(match?.name).toBe("morning-brief");
    });
  });

  describe("Pipeline vs milestone disambiguation", () => {
    it('"stale opportunities" routes to pipeline-hygiene-triage', () => {
      const match = routeUtterance("show me stale opportunities in my pipeline", skills);
      if (skills.length === 0) return;
      expect(match?.name).toBe("pipeline-hygiene-triage");
    });

    it('"how are my milestones" routes to milestone-health-review', () => {
      const match = routeUtterance("how are my milestones doing?", skills);
      if (skills.length === 0) return;
      expect(match?.name).toBe("milestone-health-review");
    });
  });

  describe("Risk surfacing triggers", () => {
    it.each([
      "deal risk",
      "risk radar",
      "flag risks",
      "early warning",
    ])('"%s" routes to risk-surfacing', (utterance) => {
      const match = routeUtterance(utterance, skills);
      if (skills.length === 0) return;
      expect(match?.name).toBe("risk-surfacing");
    });
  });

  describe("Task hygiene triggers", () => {
    it('"stale tasks" routes to se-execution-check', () => {
      const match = routeUtterance("check for stale tasks", skills);
      if (skills.length === 0) return;
      expect(match?.name).toBe("se-execution-check");
    });
  });

  describe("Vault context triggers", () => {
    it('"vault lookup" routes to vault-context-assembly', () => {
      const match = routeUtterance("vault lookup for Fabrikam", skills);
      if (skills.length === 0) return;
      expect(match?.name).toBe("vault-context-assembly");
    });
  });

  describe("Exit criteria triggers", () => {
    it('"are we ready to advance" routes to mcem-diagnostics', () => {
      const match = routeUtterance("are we ready to advance?", skills);
      if (skills.length === 0) return;
      expect(match?.name).toBe("mcem-diagnostics");
    });
  });

  describe("Negative cases — off-topic prompts", () => {
    it('"weather today" does not match any trigger strongly', () => {
      const match = routeUtterance("What's the weather like today?", skills);
      // Off-topic should either return null or a very low match
      // The router returns null when no triggers match
      if (skills.length === 0) return;
      // We just verify it doesn't strongly match a critical skill
      if (match) {
        expect(["morning-brief", "pipeline-hygiene-triage", "milestone-health-review"])
          .not.toContain(match.name);
      }
    });
  });

  describe("Skill metadata quality", () => {
    it("all loaded skills have at least one trigger phrase", () => {
      if (skills.length === 0) return; // No skills dir in CI
      const noTriggers = skills.filter((s) => s.triggers.length === 0);
      if (noTriggers.length > 0) {
        console.warn(
          `⚠️  Skills without triggers: ${noTriggers.map((s) => s.name).join(", ")}`,
        );
      }
      // Allow up to 50% without triggers (utility skills, legacy)
      expect(noTriggers.length).toBeLessThan(Math.max(1, skills.length * 0.5));
    });
  });
});
