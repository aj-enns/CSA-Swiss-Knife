/**
 * Synthetic CRM Fixture Factory
 *
 * Generates realistic CRM fixture data with controlled shapes for eval scenarios.
 * All data is fictional — no PII risk, no production dependency.
 *
 * Usage:
 *   const fixtures = CrmFixtureFactory.pipelineHealth().build();
 *   // fixtures["whoami.json"], fixtures["opportunities-mine.json"], etc.
 */

import { randomUUID } from "node:crypto";

// ── Types matching real CRM response shapes ─────────────────────────────────

export interface WhoAmI {
  "@odata.context": string;
  BusinessUnitId: string;
  UserId: string;
  OrganizationId: string;
}

export interface Opportunity {
  opportunityid: string;
  name: string;
  msp_opportunitynumber: string;
  msp_activesalesstage: string;
  estimatedclosedate: string | null;
  msp_estcompletiondate: string | null;
  estimatedvalue: number;
  msp_consumptionconsumedrecurring: number;
  msp_salesplay: string;
  _ownerid_value: string;
  _parentaccountid_value: string;
  statecode?: number;
}

export interface Milestone {
  msp_engagementmilestoneid: string;
  msp_milestonenumber: string;
  msp_name: string;
  msp_monthlyuse: number;
  msp_milestonedate: string;
  msp_milestonestatus: number;
  msp_commitmentrecommendation: number;
  msp_milestonecategory: number;
  _ownerid_value: string;
  _msp_opportunityid_value: string;
  _msp_workloadlkid_value: string;
  msp_forecastcomments: string;
  msp_milestoneworkload: string;
  msp_deliveryspecifiedfield: string;
}

export interface CrmTask {
  activityid: string;
  subject: string;
  description: string;
  scheduledend: string;
  statuscode: number;
  statecode: number;
  _ownerid_value: string;
  _regardingobjectid_value: string;
  msp_taskcategory: number;
}

export interface CrmFixtureSet {
  "whoami.json": WhoAmI;
  "opportunities-mine.json": { value: Opportunity[] };
  "milestones-active.json": { value: Milestone[] };
  "tasks-active.json": { value: CrmTask[] };
}

// ── Status code constants (matching Dynamics 365 option sets) ────────────────

export const MILESTONE_STATUS = {
  PROPOSED: 861980000,
  COMMITTED: 861980001,
  COMPLETED: 861980002,
  CANCELLED: 861980003,
} as const;

export const COMMITMENT_RECOMMENDATION = {
  ON_TRACK: 861980000,
  AT_RISK: 861980001,
  BLOCKED: 861980002,
} as const;

export const MILESTONE_CATEGORY = {
  TECHNICAL: 861980001,
  BUSINESS: 861980002,
} as const;

export const TASK_STATUS = {
  NOT_STARTED: 2,
  IN_PROGRESS: 3,
  COMPLETED: 5,
  CANCELLED: 6,
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function guid(): string {
  return randomUUID();
}

const OWNER_IDS = {
  primary: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  secondary: "d4e5f6a7-b8c9-0123-def0-456789abcdef",
};

const ACCOUNT_IDS = {
  contoso: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  fabrikam: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
  northwind: "cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa",
};

// ── Factory ─────────────────────────────────────────────────────────────────

export class CrmFixtureFactory {
  #opportunities: Opportunity[] = [];
  #milestones: Milestone[] = [];
  #tasks: CrmTask[] = [];
  #role: "Specialist" | "SE" | "CSA" | "CSAM" = "CSA";

  /** Set the role context for whoami */
  withRole(role: "Specialist" | "SE" | "CSA" | "CSAM"): this {
    this.#role = role;
    return this;
  }

  /** Identity for crm_whoami */
  whoami(): WhoAmI {
    return {
      "@odata.context":
        "https://microsoftsales.crm.dynamics.com/api/data/v9.2/$metadata#Microsoft.Dynamics.CRM.WhoAmIResponse",
      BusinessUnitId: "1e81e2cb-be7c-e411-b21a-6c3be5a82b30",
      UserId: OWNER_IDS.primary,
      OrganizationId: "aeae68a5-57e4-49ca-a82c-f2df71524041",
    };
  }

  /** Add an opportunity with sensible defaults */
  addOpportunity(overrides: Partial<Opportunity> = {}): this {
    const idx = this.#opportunities.length + 1;
    this.#opportunities.push({
      opportunityid: guid(),
      msp_opportunitynumber: `OPP-2026-${String(idx).padStart(3, "0")}`,
      name: `Opportunity ${idx}`,
      msp_activesalesstage: "3 - Solution & Proof",
      estimatedclosedate: futureDate(90),
      msp_estcompletiondate: futureDate(90),
      estimatedvalue: 50000,
      msp_consumptionconsumedrecurring: 0,
      msp_salesplay: "Azure Migrate & Modernize",
      _ownerid_value: OWNER_IDS.primary,
      _parentaccountid_value: ACCOUNT_IDS.contoso,
      statecode: 0,
      ...overrides,
    });
    return this;
  }

  /** Add milestone linked to the most recently added opportunity */
  addMilestone(overrides: Partial<Milestone> = {}): this {
    const opp = this.#opportunities.at(-1);
    const idx = this.#milestones.length + 1;
    this.#milestones.push({
      msp_engagementmilestoneid: guid(),
      msp_milestonenumber: `MS-${String(idx).padStart(3, "0")}`,
      msp_name: `Milestone ${idx}`,
      msp_monthlyuse: 5000,
      msp_milestonedate: futureDate(30),
      msp_milestonestatus: MILESTONE_STATUS.COMMITTED,
      msp_commitmentrecommendation: COMMITMENT_RECOMMENDATION.ON_TRACK,
      msp_milestonecategory: MILESTONE_CATEGORY.TECHNICAL,
      _ownerid_value: OWNER_IDS.primary,
      _msp_opportunityid_value: opp?.opportunityid ?? guid(),
      _msp_workloadlkid_value: guid(),
      msp_forecastcomments: "",
      msp_milestoneworkload: "Azure IaaS",
      msp_deliveryspecifiedfield: "CSA-Led",
      ...overrides,
    });
    return this;
  }

  /** Add task linked to the most recently added milestone */
  addTask(overrides: Partial<CrmTask> = {}): this {
    const ms = this.#milestones.at(-1);
    const idx = this.#tasks.length + 1;
    this.#tasks.push({
      activityid: guid(),
      subject: `Task ${idx}`,
      description: "",
      scheduledend: futureDate(14),
      statuscode: TASK_STATUS.NOT_STARTED,
      statecode: 0,
      _ownerid_value: OWNER_IDS.primary,
      _regardingobjectid_value: ms?.msp_engagementmilestoneid ?? guid(),
      msp_taskcategory: 861980000,
      ...overrides,
    });
    return this;
  }

  // ── Named presets ───────────────────────────────────────────────────────

  /** Standard pipeline: 3 opps, mixed stages, 3 milestones, 2 tasks */
  static pipelineHealth(): CrmFixtureFactory {
    return new CrmFixtureFactory()
      .addOpportunity({
        name: "Contoso — Azure Migration FY26",
        msp_activesalesstage: "3 - Solution & Proof",
        estimatedvalue: 450000,
        msp_consumptionconsumedrecurring: 12000,
        msp_salesplay: "Azure Migrate & Modernize",
      })
      .addMilestone({
        msp_name: "Azure Landing Zone Setup",
        msp_monthlyuse: 8000,
        msp_milestonedate: futureDate(30),
        msp_milestonestatus: MILESTONE_STATUS.COMMITTED,
        msp_forecastcomments: "On track for deployment",
      })
      .addTask({ subject: "Configure VNet peering", scheduledend: futureDate(7) })
      .addMilestone({
        msp_name: "App Modernization POC",
        msp_monthlyuse: 4000,
        msp_milestonedate: futureDate(75),
        msp_milestonestatus: MILESTONE_STATUS.PROPOSED,
        msp_forecastcomments: "Waiting on customer environment access",
        msp_deliveryspecifiedfield: "SE-Led",
      })
      .addOpportunity({
        name: "Contoso — Security Modernization",
        msp_activesalesstage: "2 - Qualify",
        estimatedvalue: 200000,
        msp_salesplay: "Security - Sentinel",
        _ownerid_value: OWNER_IDS.secondary,
      })
      .addMilestone({
        msp_name: "Azure Sentinel Onboarding",
        msp_monthlyuse: 2000,
        msp_milestonedate: pastDate(6),
        msp_milestonestatus: MILESTONE_STATUS.COMMITTED,
        msp_commitmentrecommendation: COMMITMENT_RECOMMENDATION.AT_RISK,
        msp_forecastcomments: "Customer infra team delayed",
        _ownerid_value: OWNER_IDS.secondary,
      })
      .addTask({
        subject: "Review Sentinel workspace config",
        scheduledend: pastDate(3),
        statuscode: TASK_STATUS.IN_PROGRESS,
      })
      .addOpportunity({
        name: "Contoso — Data Platform Refresh",
        msp_activesalesstage: "3 - Solution & Proof",
        estimatedclosedate: pastDate(15),
        estimatedvalue: 300000,
        msp_salesplay: "Data & AI",
      });
  }

  /** Stale pipeline: overdue close dates, missing fields */
  static stalePipeline(): CrmFixtureFactory {
    return new CrmFixtureFactory()
      .addOpportunity({
        name: "Stale Opportunity — No Activity",
        estimatedclosedate: pastDate(45),
        msp_estcompletiondate: pastDate(45),
        msp_activesalesstage: "2 - Qualify",
        estimatedvalue: 100000,
      })
      .addOpportunity({
        name: "Very Stale — Overdue by 90 Days",
        estimatedclosedate: pastDate(90),
        msp_estcompletiondate: pastDate(90),
        msp_activesalesstage: "1 - Inspire",
        estimatedvalue: 75000,
        msp_salesplay: "",
      });
  }

  /** Overdue milestones scenario for milestone-health-review testing */
  static overdueMilestones(): CrmFixtureFactory {
    return new CrmFixtureFactory()
      .addOpportunity({
        name: "Contoso — Azure Migration FY26",
        msp_activesalesstage: "3 - Solution & Proof",
        estimatedvalue: 450000,
      })
      .addMilestone({
        msp_name: "Azure Sentinel Onboarding",
        msp_milestonedate: pastDate(6),
        msp_milestonestatus: MILESTONE_STATUS.COMMITTED,
        msp_commitmentrecommendation: COMMITMENT_RECOMMENDATION.AT_RISK,
        msp_forecastcomments: "Customer infra team delayed",
      })
      .addMilestone({
        msp_name: "Landing Zone Setup",
        msp_milestonedate: futureDate(30),
        msp_milestonestatus: MILESTONE_STATUS.COMMITTED,
        msp_commitmentrecommendation: COMMITMENT_RECOMMENDATION.ON_TRACK,
      })
      .addMilestone({
        msp_name: "Data Migration — Phase 1",
        msp_milestonedate: pastDate(20),
        msp_milestonestatus: MILESTONE_STATUS.COMMITTED,
        msp_commitmentrecommendation: COMMITMENT_RECOMMENDATION.BLOCKED,
        msp_forecastcomments: "Blocked on data classification review",
      });
  }

  /** Write safety scenario: opportunity + milestone ready for update */
  static writeSafety(): CrmFixtureFactory {
    return new CrmFixtureFactory()
      .addOpportunity({
        name: "Contoso — Azure Migration FY26",
        msp_activesalesstage: "3 - Solution & Proof",
      })
      .addMilestone({
        msp_name: "Azure Landing Zone Setup",
        msp_milestonedate: futureDate(30),
        msp_milestonestatus: MILESTONE_STATUS.COMMITTED,
      });
  }

  /** Empty pipeline — no opportunities */
  static emptyPipeline(): CrmFixtureFactory {
    return new CrmFixtureFactory();
  }

  // ── Build ─────────────────────────────────────────────────────────────

  /** Serialize all fixtures to the shapes MockCrmServer expects */
  build(): CrmFixtureSet {
    return {
      "whoami.json": this.whoami(),
      "opportunities-mine.json": { value: this.#opportunities },
      "milestones-active.json": { value: this.#milestones },
      "tasks-active.json": { value: this.#tasks },
    };
  }

  /** Get opportunity list for use in other factories */
  get opportunities(): readonly Opportunity[] {
    return this.#opportunities;
  }

  /** Get milestone list */
  get milestones(): readonly Milestone[] {
    return this.#milestones;
  }
}
