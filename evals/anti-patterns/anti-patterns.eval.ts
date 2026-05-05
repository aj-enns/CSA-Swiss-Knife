/**
 * Eval: Anti-Pattern Detection
 *
 * Validates that traces avoid known anti-patterns (AP-001 through AP-010).
 * Each test simulates a bad trace and verifies the judge catches it,
 * then simulates a good trace and verifies it passes.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  MockMcpRecorder,
  MockCrmServer,
  MockOilServer,
  type ToolCallTrace,
} from "../harness.js";
import {
  judgeAntiPatterns,
  getPatterns,
  ALL_ANTI_PATTERNS,
} from "../judges/anti-pattern.js";
import { CrmFixtureFactory } from "../fixtures/generators/crm-factory.js";
import { OilFixtureFactory } from "../fixtures/generators/oil-factory.js";

let recorder: MockMcpRecorder;
let crm: MockCrmServer;
let oil: MockOilServer;

beforeAll(async () => {
  recorder = new MockMcpRecorder();
  crm = new MockCrmServer(recorder);
  oil = new MockOilServer(recorder);
  try {
    await crm.loadFixtures();
  } catch {
    crm.loadFromFactory(CrmFixtureFactory.pipelineHealth().build());
    oil.loadFromFactory(OilFixtureFactory.standard().build());
  }
});

beforeEach(() => {
  recorder.reset();
  crm.stagedWrites.length = 0;
  oil.stagedWrites.length = 0;
});

describe("Anti-Pattern Detection", () => {
  describe("AP-001: unscoped get_milestones", () => {
    it("catches get_milestones with no scoping parameter", ({ task }) => {
      crm.handle("msx:get_milestones", {});

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-001"]));

      task.meta.evalScenarioId = "ap001-unscoped-milestones";
      task.meta.evalDimension = "antiPatterns";
      task.meta.evalScore = result.score;
      task.meta.evalPass = !result.pass; // inverted: we expect detection
      task.meta.evalViolations = result.violations.map((v) => v.id);

      expect(result.pass).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].id).toBe("AP-001");
    });

    it("passes when get_milestones has customerKeyword", () => {
      crm.handle("msx:get_milestones", { customerKeyword: "Contoso" });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-001"]));
      expect(result.pass).toBe(true);
    });

    it("passes when get_milestones has statusFilter", () => {
      crm.handle("msx:get_milestones", { statusFilter: "active" });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-001"]));
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-002: wrong entity set for milestones", () => {
    it("catches msp_milestones instead of msp_engagementmilestones", () => {
      crm.handle("msx:crm_query", {
        entitySet: "msp_milestones",
        filter: "contains(msp_name,'Landing Zone')",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-002"]));
      expect(result.pass).toBe(false);
      expect(result.violations[0].id).toBe("AP-002");
    });

    it("passes with correct entity set", () => {
      crm.handle("msx:crm_query", {
        entitySet: "msp_engagementmilestones",
        filter: "contains(msp_name,'Landing Zone')",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-002"]));
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-003: N+1 milestone loop", () => {
    it("catches more than 2 sequential get_milestones calls", () => {
      crm.handle("msx:get_milestones", { opportunityId: "opp-1" });
      crm.handle("msx:get_milestones", { opportunityId: "opp-2" });
      crm.handle("msx:get_milestones", { opportunityId: "opp-3" });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-003"]));
      expect(result.pass).toBe(false);
      expect(result.violations[0].id).toBe("AP-003");
    });

    it("passes when repeated calls are scoped differently", () => {
      crm.handle("msx:get_milestones", { customerKeyword: "Contoso" });
      crm.handle("msx:get_milestones", { opportunityId: "opp-1" });
      crm.handle("msx:get_milestones", { statusFilter: "active" });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-003"]));
      expect(result.pass).toBe(true);
    });

    it("passes with a single batched call", () => {
      crm.handle("msx:get_milestones", { customerKeyword: "Contoso" });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-003"]));
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-004: vault skip", () => {
    it("catches CRM calls without vault consultation", ({ task }) => {
      crm.handle("msx:crm_auth_status");
      crm.handle("msx:get_my_active_opportunities");
      // No vault calls!

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-004"]));

      task.meta.evalScenarioId = "ap004-vault-skip";
      task.meta.evalDimension = "antiPatterns";
      task.meta.evalScore = result.score;
      task.meta.evalPass = !result.pass;
      task.meta.evalViolations = result.violations.map((v) => v.id);

      expect(result.pass).toBe(false);
      expect(result.violations[0].id).toBe("AP-004");
    });

    it("passes when vault is consulted before CRM", () => {
      oil.handle("oil:get_vault_context");
      oil.handle("oil:get_customer_context", { customer: "Contoso" });
      crm.handle("msx:get_my_active_opportunities");

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-004"]));
      expect(result.pass).toBe(true);
    });

    it("passes when scenario mediums explicitly exclude vault", () => {
      crm.handle("msx:crm_auth_status");
      crm.handle("msx:get_my_active_opportunities");

      const result = judgeAntiPatterns(
        recorder.calls,
        getPatterns(["AP-004"]),
        { mediums: ["crm"] },
      );
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-005: write without staging", () => {
    it("allows writes that go through staging (mock default)", () => {
      crm.handle("msx:crm_whoami");
      crm.handle("msx:update_milestone", {
        milestoneId: "ms-111",
        payload: { msp_milestonestatus: 861980002 },
      });

      // Mock server stages writes by default, so AP-005 should pass
      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-005"]));
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-006: guessed property names", () => {
    it("catches wrong property name in query filter", () => {
      crm.handle("msx:crm_query", {
        entitySet: "opportunities",
        filter: "msp_stage eq '3'",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-006"]));
      expect(result.pass).toBe(false);
      expect(result.violations[0].reason).toContain("msp_stage");
    });

    it("passes with correct property name", () => {
      crm.handle("msx:crm_query", {
        entitySet: "opportunities",
        filter: "msp_activesalesstage eq '3'",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-006"]));
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-007: disallowed entity set", () => {
    it("catches query to unlisted entity set", () => {
      crm.handle("msx:crm_query", {
        entitySet: "invoices",
        filter: "",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-007"]));
      expect(result.pass).toBe(false);
      expect(result.violations[0].reason).toContain("invoices");
    });

    it("passes with allowed entity set", () => {
      crm.handle("msx:crm_query", {
        entitySet: "accounts",
        filter: "name eq 'Contoso'",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-007"]));
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-009: unbounded WorkIQ retrieval", () => {
    it("catches WorkIQ query without top/limit", () => {
      recorder.record("workiq:ask_work_iq", { query: "Contoso meetings" }, {});

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-009"]));
      expect(result.pass).toBe(false);
      expect(result.violations[0].id).toBe("AP-009");
    });

    it("passes with top parameter in query", () => {
      recorder.record("workiq:ask_work_iq", { query: "Contoso meetings top:5" }, {});

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-009"]));
      expect(result.pass).toBe(true);
    });

    it("passes with limit param", () => {
      recorder.record("workiq:ask_work_iq", { query: "Contoso meetings", limit: 5 }, {});

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-009"]));
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-010: role assumption without whoami", () => {
    it("catches write ops without prior crm_whoami", () => {
      crm.handle("msx:create_milestone", {
        name: "New Milestone",
        opportunityId: "opp-1",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-010"]));
      expect(result.pass).toBe(false);
      expect(result.violations[0].id).toBe("AP-010");
    });

    it("passes when crm_whoami precedes writes", () => {
      crm.handle("msx:crm_whoami");
      crm.handle("msx:create_milestone", {
        name: "New Milestone",
        opportunityId: "opp-1",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-010"]));
      expect(result.pass).toBe(true);
    });
  });

  describe("AP-011: missing statusFilter on scoped get_milestones", () => {
    it("catches scoped call without statusFilter", ({ task }) => {
      crm.handle("msx:get_milestones", {
        customerKeyword: "Cencora",
        format: "triage",
        includeTasks: true,
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-011"]));

      task.meta.evalScenarioId = "ap011-missing-statusfilter";
      task.meta.evalDimension = "antiPatterns";
      task.meta.evalScore = result.score;
      task.meta.evalPass = !result.pass;

      expect(result.pass).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].id).toBe("AP-011");
    });

    it("passes when statusFilter is present", () => {
      crm.handle("msx:get_milestones", {
        customerKeyword: "Contoso",
        statusFilter: "active",
        includeTasks: true,
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-011"]));
      expect(result.pass).toBe(true);
    });

    it("passes for direct milestone lookup without statusFilter", () => {
      crm.handle("msx:get_milestones", {
        milestoneNumber: "7-500658820",
      });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-011"]));
      expect(result.pass).toBe(true);
    });

    it("catches mine:true without statusFilter", () => {
      crm.handle("msx:get_milestones", { mine: true });

      const result = judgeAntiPatterns(recorder.calls, getPatterns(["AP-011"]));
      expect(result.pass).toBe(false);
      expect(result.violations[0].id).toBe("AP-011");
    });
  });

  describe("Combined — full trace validation", () => {
    it("good trace passes all patterns", () => {
      // Well-formed flow: whoami → vault → scoped CRM
      crm.handle("msx:crm_whoami");
      crm.handle("msx:crm_auth_status");
      oil.handle("oil:get_vault_context");
      oil.handle("oil:get_customer_context", { customer: "Contoso" });
      crm.handle("msx:get_milestones", {
        customerKeyword: "Contoso",
        statusFilter: "active",
      });

      const result = judgeAntiPatterns(recorder.calls, ALL_ANTI_PATTERNS);
      expect(result.pass).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(1);
    });

    it("bad trace catches multiple violations", () => {
      // Bad flow: no whoami, no vault, unscoped milestones
      crm.handle("msx:get_milestones", {});

      const result = judgeAntiPatterns(recorder.calls, ALL_ANTI_PATTERNS);
      expect(result.pass).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(1);
    });
  });
});
