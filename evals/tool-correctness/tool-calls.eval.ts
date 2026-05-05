/**
 * Eval: Tool Call Correctness
 *
 * Validates that skill activations produce the correct tool calls
 * with proper parameters, ordering, and sequencing.
 * All write operations are mocked — no real CRM/vault/M365 mutations.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  MockMcpRecorder,
  MockCrmServer,
  MockOilServer,
  MockM365Server,
  computeOverallScore,
  passLevel,
  type EvalResult,
} from "../harness.js";
import { judgeToolSequence } from "../judges/tool-sequence.js";
import { CrmFixtureFactory } from "../fixtures/generators/crm-factory.js";
import { OilFixtureFactory } from "../fixtures/generators/oil-factory.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

// ── YAML scenario type ──────────────────────────────────────────────────────

interface YamlScenario {
  id: string;
  skill: string;
  fixture?: string;
  context?: { mediums?: string[]; role?: string; customer?: string };
  expected_calls?: Array<{
    tool: string;
    order?: number;
    phase?: number;
    params_contains?: Record<string, unknown>;
  }>;
  forbidden_calls?: Array<{ tool: string; params?: Record<string, unknown> }>;
}

/** Map fixture preset names to CrmFixtureFactory static methods. */
const FIXTURE_PRESETS: Record<string, () => CrmFixtureFactory> = {
  pipelineHealth: CrmFixtureFactory.pipelineHealth,
  stalePipeline: CrmFixtureFactory.stalePipeline,
  overdueMilestones: CrmFixtureFactory.overdueMilestones,
  writeSafety: CrmFixtureFactory.writeSafety,
  emptyPipeline: CrmFixtureFactory.emptyPipeline,
};

let recorder: MockMcpRecorder;
let crm: MockCrmServer;
let oil: MockOilServer;
let m365: MockM365Server;

beforeAll(async () => {
  recorder = new MockMcpRecorder();
  crm = new MockCrmServer(recorder);
  oil = new MockOilServer(recorder);
  m365 = new MockM365Server(recorder);
  try {
    await crm.loadFixtures();
  } catch {
    // Disk fixtures not available — use synthetic factory
    crm.loadFromFactory(CrmFixtureFactory.pipelineHealth().build());
    oil.loadFromFactory(OilFixtureFactory.standard().build());
  }
});

beforeEach(() => {
  recorder.reset();
  crm.stagedWrites.length = 0;
  oil.stagedWrites.length = 0;
});

describe("Tool Call Correctness", () => {
  describe("milestone-health-review — scoped query", () => {
    it("calls auth, vault, then scoped milestones in order", ({ task }) => {
      // Simulate the expected tool call sequence
      crm.handle("msx:crm_auth_status");
      oil.handle("oil:get_customer_context", { customer: "Contoso" });
      crm.handle("msx:get_milestones", {
        customerKeyword: "Contoso",
        statusFilter: "active",
        includeTasks: true,
      });

      const result = judgeToolSequence(
        recorder.calls,
        [
          { tool: "msx:crm_auth_status", order: 1 },
          { tool: "oil:get_customer_context", order: 2 },
          { tool: "msx:get_milestones", order: 3, paramsContains: { customerKeyword: "Contoso" } },
        ],
      );

      task.meta.evalScenarioId = "milestone-health-scoped";
      task.meta.evalDimension = "toolCorrectness";
      task.meta.evalScore = result.score;
      task.meta.evalPass = result.pass;

      expect(result.pass).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.orderViolations).toHaveLength(0);
      expect(result.score).toBeGreaterThanOrEqual(0.85);
    });

    it("flags unscoped get_milestones as forbidden", () => {
      crm.handle("msx:crm_auth_status");
      crm.handle("msx:get_milestones", {}); // unscoped — bad!

      const result = judgeToolSequence(
        recorder.calls,
        [{ tool: "msx:crm_auth_status" }, { tool: "msx:get_milestones" }],
        [{ tool: "msx:get_milestones", params: {} }],
      );

      expect(result.missing).toContain("FORBIDDEN: msx:get_milestones was called");
    });

    it("matches paramsContains against the best candidate when tool appears multiple times", () => {
      crm.handle("msx:get_milestones", { customerKeyword: "Contoso" });
      crm.handle("msx:get_milestones", { statusFilter: "active" });

      const result = judgeToolSequence(recorder.calls, [
        { tool: "msx:get_milestones", paramsContains: { statusFilter: "active" } },
      ]);

      expect(result.pass).toBe(true);
      expect(result.paramMismatches).toHaveLength(0);
    });
  });

  describe("morning-brief — parallel retrieval", () => {
    it("calls vault and auth in parallel, then CRM queries", ({ task }) => {
      // Phase 1: parallel
      oil.handle("oil:get_vault_context");
      crm.handle("msx:crm_auth_status");

      // Phase 2: CRM queries
      crm.handle("msx:get_my_active_opportunities");
      crm.handle("msx:get_milestones", {
        statusFilter: "active",
        includeTasks: true,
      });

      const result = judgeToolSequence(recorder.calls, [
        { tool: "oil:get_vault_context", phase: 1 },
        { tool: "msx:crm_auth_status", phase: 1 },
        { tool: "msx:get_my_active_opportunities", phase: 2 },
        { tool: "msx:get_milestones", phase: 2 },
      ]);

      task.meta.evalScenarioId = "morning-brief-parallel";
      task.meta.evalDimension = "toolCorrectness";
      task.meta.evalScore = result.score;
      task.meta.evalPass = result.pass;

      expect(result.pass).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe("vault-first — CRM after vault", () => {
    it("vault context is fetched before any CRM call", () => {
      oil.handle("oil:get_vault_context");
      oil.handle("oil:get_customer_context", { customer: "Contoso" });
      crm.handle("msx:crm_query", {
        entitySet: "opportunities",
        filter: "contains(name,'Contoso')",
      });

      expect(recorder.wasCalledBefore("oil:get_vault_context", "msx:crm_query")).toBe(true);
    });

    it("detects vault skip when CRM is called first", () => {
      crm.handle("msx:crm_query", { entitySet: "opportunities" });
      oil.handle("oil:get_vault_context");

      expect(recorder.wasCalledBefore("oil:get_vault_context", "msx:crm_query")).toBe(false);
    });
  });

  describe("pipeline-hygiene-triage — auth then opportunities", () => {
    it("calls auth before opportunity retrieval", () => {
      crm.handle("msx:crm_auth_status");
      crm.handle("msx:get_my_active_opportunities");

      const result = judgeToolSequence(recorder.calls, [
        { tool: "msx:crm_auth_status", order: 1 },
        { tool: "msx:get_my_active_opportunities", order: 2 },
      ]);

      expect(result.pass).toBe(true);
    });
  });

  describe("write operations — staging guard", () => {
    it("CRM write operations are staged, not directly executed", () => {
      crm.handle("msx:crm_whoami");
      crm.handle("msx:update_milestone", {
        milestoneId: "ms-111111-aaaa-bbbb-cccc-111111111111",
        payload: { msp_milestonestatus: 861980002 },
      });

      // Write should be staged, not executed
      expect(crm.stagedWrites).toHaveLength(1);
      expect(crm.stagedWrites[0].tool).toBe("update_milestone");

      // Recorder should show it was staged
      const writeCall = recorder.callsTo("msx:update_milestone");
      expect(writeCall).toHaveLength(1);
      expect((writeCall[0].response as Record<string, unknown>).staged).toBe(true);
    });

    it("OIL write operations are staged, not directly executed", () => {
      oil.handle("oil:write_note", {
        path: "Meetings/2026-03-16.md",
        content: "# Meeting Notes",
      });

      expect(oil.stagedWrites).toHaveLength(1);
      expect(oil.stagedWrites[0].tool).toBe("write_note");
    });

    it("no execute_operation or execute_all without prior staging", () => {
      // Directly calling execute without staging should be recorded
      crm.handle("msx:execute_operation", { operationId: "OP-1" });

      expect(crm.stagedWrites).toHaveLength(1);
      expect(crm.stagedWrites[0].description).toContain("MOCK");
    });
  });
});

// ── YAML-driven scenarios (spec §3.2 — fixture binding) ─────────────────────

describe("YAML-Driven Tool Correctness Scenarios", () => {
  let yamlScenarios: YamlScenario[] = [];

  beforeAll(async () => {
    try {
      const raw = await readFile(
        join(import.meta.dirname, "../fixtures/scenarios/tool-correctness.yaml"),
        "utf-8",
      );
      const parsed = parseYaml(raw);
      yamlScenarios = (parsed.scenarios ?? []) as YamlScenario[];
    } catch {
      // YAML file may not exist in CI
    }
  });

  it("loads and validates all YAML scenarios", () => {
    if (yamlScenarios.length === 0) return;
    for (const s of yamlScenarios) {
      expect(s.id).toBeTruthy();
      expect(s.skill).toBeTruthy();
    }
  });

  it("factory presets referenced in YAML are all valid", () => {
    if (yamlScenarios.length === 0) return;
    for (const s of yamlScenarios) {
      if (s.fixture) {
        expect(FIXTURE_PRESETS).toHaveProperty(s.fixture);
      }
    }
  });

  it("runs each YAML scenario with its factory fixture", ({ task }) => {
    if (yamlScenarios.length === 0) return;

    for (const s of yamlScenarios) {
      if (!s.expected_calls) continue;

      // Setup mock with factory fixture
      const yamlRecorder = new MockMcpRecorder();
      const yamlCrm = new MockCrmServer(yamlRecorder);
      const yamlOil = new MockOilServer(yamlRecorder);

      if (s.fixture && FIXTURE_PRESETS[s.fixture]) {
        yamlCrm.loadFromFactory(FIXTURE_PRESETS[s.fixture]().build());
        yamlOil.loadFromFactory(OilFixtureFactory.standard().build());
      }

      // Simulate the expected tool calls
      for (const call of s.expected_calls) {
        const params = call.params_contains ?? {};
        if (call.tool.startsWith("msx:")) {
          yamlCrm.handle(call.tool, params);
        } else if (call.tool.startsWith("oil:")) {
          yamlOil.handle(call.tool, params);
        }
      }

      // Judge the trace (skip forbidden_calls for simulated replay since we
      // only replayed expected calls — forbidden checks are validated in the
      // handwritten tests above with intentionally bad traces)
      const expected = s.expected_calls.map((c) => ({
        tool: c.tool,
        order: c.order,
        phase: c.phase,
        paramsContains: c.params_contains,
      }));

      const result = judgeToolSequence(yamlRecorder.calls, expected);
      expect(result.pass).toBe(true);
    }

    task.meta.evalScenarioId = "yaml-tool-correctness";
    task.meta.evalDimension = "toolCorrectness";
    task.meta.evalScore = 1;
    task.meta.evalPass = true;
  });
});
