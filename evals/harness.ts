/**
 * Eval Harness — shared types, mock MCP servers, and evaluation utilities.
 *
 * Phase 1: Trace-based (offline) evaluation.
 * Intercepts and records MCP tool calls without hitting real CRM/vault/M365.
 * Write operations are recorded as no-ops with full call metadata.
 */

import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import type { CrmFixtureSet } from "./fixtures/generators/crm-factory.js";
import type { OilFixtureSet } from "./fixtures/generators/oil-factory.js";

// ── Fixture paths ───────────────────────────────────────────────────────────

export const FIXTURES_PATH = resolve(import.meta.dirname, "fixtures");
export const CRM_FIXTURES = join(FIXTURES_PATH, "crm-responses");
export const OIL_FIXTURES = join(FIXTURES_PATH, "oil-responses");
export const M365_FIXTURES = join(FIXTURES_PATH, "m365-responses");

// ── Core types ──────────────────────────────────────────────────────────────

export interface ToolCallTrace {
  tool: string;
  params: Record<string, unknown>;
  response: unknown;
  timestamp: number;
  phase?: number;          // for parallel-call grouping
}

export interface AntiPatternViolation {
  id: string;              // AP-001 through AP-010
  tool: string;
  reason: string;
}

export interface OutputCheck {
  requiredSections?: string[];
  requiredColumns?: string[];
  forbiddenPatterns?: string[];
  format?: "table" | "prose" | "mixed";
}

export interface EvalScenario {
  id: string;
  name: string;
  description?: string;
  userUtterance: string;
  context?: {
    role?: "Specialist" | "SE" | "CSA" | "CSAM";
    customer?: string;
    mediums?: Array<"crm" | "vault" | "workiq" | "teams" | "mail" | "calendar">;
  };
  expectedSkill?: string | null;
  expectedSkills?: string[];
  negativeSkills?: string[];
  expectedCalls?: Array<{
    tool: string;
    params?: Record<string, unknown>;
    paramsContains?: Record<string, unknown>;
    order?: number;
    phase?: number;
    before?: string;
  }>;
  forbiddenCalls?: Array<{
    tool: string;
    params?: Record<string, unknown>;
  }>;
  forbiddenPatterns?: string[];
  expectedBehavior?: string;
  outputValidation?: OutputCheck;
}

export interface EvalResult {
  scenarioId: string;
  dimensions: {
    skillRouting?: { pass: boolean; activated: string | null; expected: string | null };
    toolCorrectness?: {
      pass: boolean;
      missing: string[];
      extra: string[];
      orderViolations: string[];
      score: number;
    };
    antiPatterns?: {
      pass: boolean;
      violations: AntiPatternViolation[];
      score: number;
    };
    outputFormat?: {
      pass: boolean;
      missingSections: string[];
      missingColumns: string[];
      score: number;
    };
  };
  overallScore: number;
  pass: boolean;
}

// ── Scoring weights (from spec §6) ──────────────────────────────────────────

export const SCORING_WEIGHTS = {
  skillRouting: 0.25,
  toolCorrectness: 0.30,
  antiPatterns: 0.20,
  outputFormat: 0.15,
  contextEfficiency: 0.10,
} as const;

export const PASS_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.70;

// ── Fixture loading ─────────────────────────────────────────────────────────

async function loadJsonFixture<T = unknown>(path: string): Promise<T> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

export async function loadCrmFixture<T = unknown>(name: string): Promise<T> {
  return loadJsonFixture<T>(join(CRM_FIXTURES, name));
}

export async function loadOilFixture<T = unknown>(name: string): Promise<T> {
  return loadJsonFixture<T>(join(OIL_FIXTURES, name));
}

export async function loadM365Fixture<T = unknown>(name: string): Promise<T> {
  return loadJsonFixture<T>(join(M365_FIXTURES, name));
}

// ── Mock MCP Servers ────────────────────────────────────────────────────────

/**
 * Records all tool calls for evaluation. Returns fixture data for reads,
 * records no-ops for writes (never executes real CRM or M365 mutations).
 */
export class MockMcpRecorder {
  readonly calls: ToolCallTrace[] = [];
  #startTime = Date.now();

  record(tool: string, params: Record<string, unknown>, response: unknown, phase?: number): void {
    this.calls.push({
      tool,
      params,
      response,
      timestamp: Date.now() - this.#startTime,
      phase,
    });
  }

  reset(): void {
    this.calls.length = 0;
    this.#startTime = Date.now();
  }

  /** Get all calls to a specific tool. */
  callsTo(tool: string): ToolCallTrace[] {
    return this.calls.filter((c) => c.tool === tool);
  }

  /** Check whether a specific tool was called. */
  wasCalled(tool: string): boolean {
    return this.calls.some((c) => c.tool === tool);
  }

  /** Check whether a tool was called with specific param values. */
  wasCalledWith(tool: string, paramsSubset: Record<string, unknown>): boolean {
    return this.calls.some((c) => {
      if (c.tool !== tool) return false;
      return Object.entries(paramsSubset).every(
        ([k, v]) => c.params[k] === v,
      );
    });
  }

  /** Check whether toolA was called before toolB. */
  wasCalledBefore(toolA: string, toolB: string): boolean {
    const indexA = this.calls.findIndex((c) => c.tool === toolA);
    const indexB = this.calls.findIndex((c) => c.tool === toolB);
    if (indexA === -1 || indexB === -1) return false;
    return indexA < indexB;
  }
}

/**
 * Mock CRM MCP server — returns fixture data for reads,
 * records writes as staged no-ops.
 */
export class MockCrmServer {
  readonly recorder: MockMcpRecorder;
  #fixtures = new Map<string, unknown>();
  /** Tracks staged write operations (never executed). */
  readonly stagedWrites: Array<{ tool: string; params: Record<string, unknown>; description: string }> = [];

  constructor(recorder: MockMcpRecorder) {
    this.recorder = recorder;
  }

  async loadFixtures(): Promise<void> {
    this.#fixtures.set("crm_whoami", await loadCrmFixture("whoami.json"));
    this.#fixtures.set("crm_auth_status", { authenticated: true, user: "jinle@microsoft.com" });
    this.#fixtures.set("get_my_active_opportunities", await loadCrmFixture("opportunities-contoso.json"));
    this.#fixtures.set("get_milestones", await loadCrmFixture("milestones-active.json"));
    this.#fixtures.set("get_milestone_activities", await loadCrmFixture("tasks-active.json"));
  }

  /** Load from a synthetic fixture factory instead of disk. */
  loadFromFactory(fixtures: CrmFixtureSet): void {
    this.#fixtures.set("crm_whoami", fixtures["whoami.json"]);
    this.#fixtures.set("crm_auth_status", { authenticated: true, user: "eval@example.com" });
    this.#fixtures.set("get_my_active_opportunities", fixtures["opportunities-mine.json"]);
    this.#fixtures.set("get_milestones", fixtures["milestones-active.json"]);
    this.#fixtures.set("get_milestone_activities", fixtures["tasks-active.json"]);
  }

  /** Handle a tool call. Reads return fixture data; writes are staged, never executed. */
  handle(tool: string, params: Record<string, unknown> = {}): unknown {
    const shortTool = tool.replace("msx:", "");

    // Write operations → stage as no-op, never execute
    if (this.#isWriteOp(shortTool)) {
      const staged = {
        tool: shortTool,
        params,
        description: `MOCK: Staged ${shortTool} — NOT executed`,
      };
      this.stagedWrites.push(staged);
      this.recorder.record(tool, params, {
        staged: true,
        operationId: `MOCK-OP-${this.stagedWrites.length}`,
        description: staged.description,
      });
      return {
        staged: true,
        operationId: `MOCK-OP-${this.stagedWrites.length}`,
        message: staged.description,
      };
    }

    // Read operations → return fixture data
    const response = this.#fixtures.get(shortTool) ?? { error: `No fixture for ${shortTool}` };
    this.recorder.record(tool, params, response);
    return response;
  }

  #isWriteOp(tool: string): boolean {
    const WRITE_OPS = new Set([
      "create_milestone",
      "update_milestone",
      "create_task",
      "update_task",
      "close_task",
      "manage_deal_team",
      "manage_milestone_team",
      "execute_operation",
      "execute_all",
    ]);
    return WRITE_OPS.has(tool);
  }
}

/**
 * Mock OIL (vault) MCP server — returns fixture data for reads,
 * records writes as no-ops.
 */
export class MockOilServer {
  readonly recorder: MockMcpRecorder;
  readonly stagedWrites: Array<{ tool: string; params: Record<string, unknown>; description: string }> = [];
  #fixtures = new Map<string, unknown>();

  constructor(recorder: MockMcpRecorder) {
    this.recorder = recorder;
  }

  /** Load captured fixtures from disk if available. Falls back to inline data. */
  async loadFixtures(): Promise<void> {
    const tryLoad = async (tool: string, file: string) => {
      try {
        this.#fixtures.set(tool, await loadOilFixture(file));
      } catch {
        // Captured fixture not available — inline fallback will be used
      }
    };

    await tryLoad("get_vault_context", "vault-context.json");
    // Customer-specific fixtures loaded by pattern: customer-context-{name}.json
    // search-{name}.json, notes-{name}.json — loaded on demand in #readFixture
  }

  /** Load from a synthetic fixture factory instead of disk. */
  loadFromFactory(fixtures: OilFixtureSet): void {
    this.#fixtures.set("get_vault_context", fixtures["vault-context.json"]);
    for (const [name, ctx] of fixtures.customers) {
      this.#fixtures.set(`get_customer_context:${name}`, ctx);
    }
  }

  handle(tool: string, params: Record<string, unknown> = {}): unknown {
    const shortTool = tool.replace("oil:", "");

    // Write operations → stage as no-op
    if (this.#isWriteOp(shortTool)) {
      const staged = {
        tool: shortTool,
        params,
        description: `MOCK: Staged ${shortTool} — NOT executed`,
      };
      this.stagedWrites.push(staged);
      this.recorder.record(tool, params, { staged: true, description: staged.description });
      return { staged: true, message: staged.description };
    }

    // Read operations → return synthetic vault context
    const response = this.#readFixture(shortTool, params);
    this.recorder.record(tool, params, response);
    return response;
  }

  #readFixture(tool: string, params: Record<string, unknown>): unknown {
    // Check for captured/factory fixture first
    const captured = this.#fixtures.get(tool);
    if (captured) return captured;

    // Check for factory-loaded customer context by customer name
    if (tool === "get_customer_context" && params.customer) {
      const byCustomer = this.#fixtures.get(`get_customer_context:${params.customer}`);
      if (byCustomer) return byCustomer;
    }

    // Inline fallback data
    switch (tool) {
      case "get_vault_context":
        return {
          vaultPath: "/mock/vault",
          noteCount: 42,
          customers: ["Contoso", "Fabrikam", "Northwind Traders"],
          recentNotes: [
            { path: "Customers/Contoso/overview.md", modified: "2026-03-15" },
            { path: "Meetings/2026-03-14-contoso-review.md", modified: "2026-03-14" },
          ],
        };
      case "get_customer_context":
        return {
          customer: params.customer ?? "Contoso",
          notes: [
            { path: "Customers/Contoso/overview.md", title: "Contoso Overview" },
            { path: "Customers/Contoso/architecture-decisions.md", title: "Architecture Decisions" },
          ],
          opportunities: ["OPP-2026-001", "OPP-2026-002"],
          lastContact: "2026-03-14",
        };
      case "search_vault":
        return {
          results: [
            { path: "Customers/Contoso/overview.md", score: 0.95, snippet: "Azure migration program..." },
          ],
        };
      case "read_note":
        return {
          path: params.path ?? "Customers/Contoso/overview.md",
          content: "# Contoso Overview\n\nEnterprise customer, Azure migration FY26.\n",
          frontmatter: { tags: ["customer", "azure"], customer: "Contoso" },
        };
      default:
        return { error: `No mock for oil:${tool}` };
    }
  }

  #isWriteOp(tool: string): boolean {
    const WRITE_OPS = new Set([
      "write_note",
      "patch_note",
      "apply_tags",
      "draft_meeting_note",
      "promote_findings",
    ]);
    return WRITE_OPS.has(tool);
  }
}

/**
 * Mock M365 MCP server — covers WorkIQ, Calendar, Teams, Mail.
 * All responses are fixture-based; no real API calls.
 */
export class MockM365Server {
  readonly recorder: MockMcpRecorder;

  constructor(recorder: MockMcpRecorder) {
    this.recorder = recorder;
  }

  async loadFixtures(): Promise<void> {
    // Fixtures are loaded lazily on demand
  }

  handle(tool: string, params: Record<string, unknown> = {}): unknown {
    const response = this.#readFixture(tool, params);
    this.recorder.record(tool, params, response);
    return response;
  }

  #readFixture(tool: string, params: Record<string, unknown>): unknown {
    // WorkIQ
    if (tool.includes("ask_work_iq") || tool.includes("workiq")) {
      return {
        results: [
          {
            type: "Event",
            subject: "Contoso — Weekly Architecture Review",
            preview: "Discussed landing zone topology.",
            date: "2026-03-09",
          },
          {
            type: "ChatMessage",
            subject: "Contoso Migration Thread",
            preview: "Firewall rule changes approved.",
            date: "2026-03-15",
          },
        ],
      };
    }

    // Calendar
    if (tool.includes("ListCalendarView") || tool.includes("calendar")) {
      return {
        value: [
          {
            subject: "Contoso — Weekly Architecture Review",
            start: "2026-03-16T09:00:00",
            end: "2026-03-16T10:00:00",
            organizer: "sarachen@contoso.com",
          },
          {
            subject: "Pipeline Review — Azure Migration Deals",
            start: "2026-03-16T14:00:00",
            end: "2026-03-16T15:00:00",
            organizer: "mikej@microsoft.com",
          },
        ],
      };
    }

    // Teams
    if (tool.includes("Teams") || tool.includes("teams:")) {
      return { value: [] };
    }

    // Mail
    if (tool.includes("Mail") || tool.includes("mail:") || tool.includes("SearchMessages")) {
      return { value: [] };
    }

    return { error: `No mock for ${tool}` };
  }
}

// ── Aggregate scorer ────────────────────────────────────────────────────────

export function computeOverallScore(result: EvalResult): number {
  const d = result.dimensions;
  let score = 0;
  let weightSum = 0;

  if (d.skillRouting) {
    score += SCORING_WEIGHTS.skillRouting * (d.skillRouting.pass ? 1 : 0);
    weightSum += SCORING_WEIGHTS.skillRouting;
  }
  if (d.toolCorrectness) {
    score += SCORING_WEIGHTS.toolCorrectness * d.toolCorrectness.score;
    weightSum += SCORING_WEIGHTS.toolCorrectness;
  }
  if (d.antiPatterns) {
    score += SCORING_WEIGHTS.antiPatterns * d.antiPatterns.score;
    weightSum += SCORING_WEIGHTS.antiPatterns;
  }
  if (d.outputFormat) {
    score += SCORING_WEIGHTS.outputFormat * d.outputFormat.score;
    weightSum += SCORING_WEIGHTS.outputFormat;
  }

  return weightSum > 0 ? score / weightSum : 0;
}

export function passLevel(score: number): "pass" | "review" | "fail" {
  if (score >= PASS_THRESHOLD) return "pass";
  if (score >= REVIEW_THRESHOLD) return "review";
  return "fail";
}

export function passEmoji(level: "pass" | "review" | "fail"): string {
  return level === "pass" ? "🟢" : level === "review" ? "🟡" : "🔴";
}

// ── Eval Metadata Helper ────────────────────────────────────────────────────

/**
 * Convenience helper to attach eval metadata to a Vitest test context.
 * Use inside `it()` callbacks: `attachEvalMeta(task, { ... })`
 */
export function attachEvalMeta(
  task: { meta: Record<string, unknown> },
  meta: {
    scenarioId: string;
    dimension: string;
    score: number;
    pass: boolean;
    violations?: string[];
  },
): void {
  task.meta.evalScenarioId = meta.scenarioId;
  task.meta.evalDimension = meta.dimension;
  task.meta.evalScore = meta.score;
  task.meta.evalPass = meta.pass;
  if (meta.violations?.length) {
    task.meta.evalViolations = meta.violations;
  }
}

// ── Fixture Freshness Guard (spec §4.4) ─────────────────────────────────────

export function checkFixtureFreshness(maxAgeDays = 14): { stale: boolean; age: number; path: string } {
  const manifestPath = join(FIXTURES_PATH, "capture-manifest.json");
  if (!existsSync(manifestPath)) {
    return { stale: true, age: Infinity, path: manifestPath };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const capturedAt = new Date(manifest.capturedAt ?? manifest.timestamp ?? 0);
  const ageDays = (Date.now() - capturedAt.getTime()) / (1000 * 60 * 60 * 24);
  return { stale: ageDays > maxAgeDays, age: Math.round(ageDays), path: manifestPath };
}
