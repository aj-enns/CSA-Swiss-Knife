/**
 * Eval: Output Format Compliance
 *
 * Validates that agent output matches the expected structure per
 * copilot-instructions.md: tables, required columns, sections.
 */

import { describe, it, expect } from "vitest";
import { judgeOutputFormat } from "../judges/output-format.js";

describe("Output Format Compliance", () => {
  describe("Milestone table format", () => {
    const MILESTONE_SCHEMA = {
      requiredColumns: ["Name", "Monthly Use", "Due Date", "Status", "Owner"],
      format: "table" as const,
    };

    it("passes with properly formatted milestone table", ({ task }) => {
      const output = `## Milestone Health — Contoso

| Name | Monthly Use | Due Date | Status | Owner | Blocker/Risk |
|------|------------|----------|--------|-------|-------------|
| Azure Landing Zone Setup | $8,000 | 2026-04-15 | Committed | Jin Lee | None |
| App Modernization POC | $4,000 | 2026-05-30 | In Progress | Jin Lee | Waiting on env access |
| Azure Sentinel Onboarding | $2,000 | 2026-03-10 | Overdue | Alex R | Customer infra delayed |

**Remediation Queue**: MS-003 overdue by 6 days — escalate to CSAM.`;

      const result = judgeOutputFormat(output, MILESTONE_SCHEMA);

      task.meta.evalScenarioId = "milestone-table-format";
      task.meta.evalDimension = "outputFormat";
      task.meta.evalScore = result.score;
      task.meta.evalPass = result.pass;

      expect(result.pass).toBe(true);
      expect(result.missingColumns).toHaveLength(0);
      expect(result.score).toBe(1);
    });

    it("fails when required column is missing", () => {
      const output = `| Name | Due Date | Status |
|------|----------|--------|
| Azure Landing Zone | 2026-04-15 | Committed |`;

      const result = judgeOutputFormat(output, MILESTONE_SCHEMA);
      expect(result.pass).toBe(false);
      expect(result.missingColumns).toContain("Monthly Use");
      expect(result.missingColumns).toContain("Owner");
    });

    it("does not treat data-row prose as a valid header column", () => {
      const output = `| Name | Due Date | Owner |
|------|----------|-------|
| Azure Landing Zone Status Review | 2026-04-15 | Jin Lee |`;

      const result = judgeOutputFormat(output, MILESTONE_SCHEMA);
      expect(result.pass).toBe(false);
      expect(result.missingColumns).toContain("Status");
      expect(result.missingColumns).toContain("Monthly Use");
    });

    it("fails when output is prose instead of table", () => {
      const output = `The Azure Landing Zone milestone is committed and due April 15.
The POC milestone is in progress, targeting May 30.`;

      const result = judgeOutputFormat(output, MILESTONE_SCHEMA);
      expect(result.pass).toBe(false);
      expect(result.missingSections).toContain("markdown table (required format: table)");
    });
  });

  describe("Opportunity table format", () => {
    const OPP_SCHEMA = {
      requiredColumns: ["Opp #", "Name", "Stage", "Estimated Close Date"],
      format: "table" as const,
    };

    it("passes with properly formatted opportunity table", () => {
      const output = `## Pipeline — Contoso

| Opp # | Name | Monthly Use | Stage | Estimated Close Date | Health/Risk | Next Step | Deal Team |
|-------|------|------------|-------|---------------------|-------------|-----------|-----------|
| [OPP-2026-001](https://crm.link/opp1) | Azure Migration FY26 | $12,000 | 3 - Solution & Proof | 2026-06-15 | 🟢 On Track | Complete ADS | Jin Lee, Alex R |
| [OPP-2026-002](https://crm.link/opp2) | Security Modernization | $0 | 2 - Qualify | 2026-09-30 | 🟡 Early | Qualify BANT | Unknown |`;

      const result = judgeOutputFormat(output, OPP_SCHEMA);
      expect(result.pass).toBe(true);
      expect(result.missingColumns).toHaveLength(0);
    });
  });

  describe("Morning brief format", () => {
    const BRIEF_SCHEMA = {
      requiredSections: ["Pipeline", "Milestones", "Meetings"],
      format: "mixed" as const,
    };

    it("passes with all required sections", ({ task }) => {
      const output = `## Morning Brief — March 16, 2026

### 🔴 Critical
- MS-003 (Azure Sentinel Onboarding) overdue by 6 days

### Pipeline
2 active opportunities in Contoso:
| Opp # | Stage | Health |
|-------|-------|--------|
| OPP-2026-001 | Solution & Proof | 🟢 |
| OPP-2026-002 | Qualify | 🟡 |

### Milestones
3 active milestones, 1 overdue.

### Meetings
- 9:00 AM — Contoso Weekly Architecture Review
- 2:00 PM — Pipeline Review`;

      const result = judgeOutputFormat(output, BRIEF_SCHEMA);

      task.meta.evalScenarioId = "morning-brief-format";
      task.meta.evalDimension = "outputFormat";
      task.meta.evalScore = result.score;
      task.meta.evalPass = result.pass;

      expect(result.pass).toBe(true);
      expect(result.missingSections).toHaveLength(0);
    });

    it("fails when meetings section is missing", () => {
      const output = `## Morning Brief

### Pipeline
2 active opportunities.

### Milestones
3 active milestones.`;

      const result = judgeOutputFormat(output, BRIEF_SCHEMA);
      expect(result.pass).toBe(false);
      expect(result.missingSections).toContain("Meetings");
    });
  });

  describe("Forbidden patterns", () => {
    it("detects forbidden output patterns", () => {
      const schema = {
        forbiddenPatterns: ["I don't know", "I'm not sure"],
      };

      const output = "The pipeline looks healthy. I'm not sure about the close date though.";
      const result = judgeOutputFormat(output, schema);
      expect(result.pass).toBe(false);
      expect(result.forbiddenMatches).toHaveLength(1);
    });

    it("passes when no forbidden patterns present", () => {
      const schema = {
        forbiddenPatterns: ["I don't know", "I'm not sure"],
      };

      const output = "The pipeline is healthy with 2 active opportunities on track.";
      const result = judgeOutputFormat(output, schema);
      expect(result.pass).toBe(true);
    });
  });
});
