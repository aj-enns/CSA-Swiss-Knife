/**
 * Schema Guard — validates synthetic fixture shapes against expected CRM schemas.
 *
 * Detects drift between generated fixtures and real Dynamics 365 response shapes.
 * Uses lightweight structural validation (no external deps like Ajv).
 */

import type { Opportunity, Milestone, CrmTask, WhoAmI, CrmFixtureSet } from "./crm-factory.js";

// ── Schema definitions (derived from crm-entity-schema.instructions.md) ─────

interface FieldDef {
  type: "string" | "number" | "boolean" | "object";
  required?: boolean;
}

type EntitySchema = Record<string, FieldDef>;

export const OPPORTUNITY_SCHEMA: EntitySchema = {
  opportunityid: { type: "string", required: true },
  name: { type: "string", required: true },
  msp_opportunitynumber: { type: "string" },
  msp_activesalesstage: { type: "string", required: true },
  estimatedclosedate: { type: "string" },
  msp_estcompletiondate: { type: "string" },
  estimatedvalue: { type: "number" },
  msp_consumptionconsumedrecurring: { type: "number" },
  msp_salesplay: { type: "string" },
  _ownerid_value: { type: "string" },
  _parentaccountid_value: { type: "string" },
  statecode: { type: "number" },
};

export const MILESTONE_SCHEMA: EntitySchema = {
  msp_engagementmilestoneid: { type: "string", required: true },
  msp_milestonenumber: { type: "string" },
  msp_name: { type: "string", required: true },
  msp_monthlyuse: { type: "number" },
  msp_milestonedate: { type: "string" },
  msp_milestonestatus: { type: "number", required: true },
  msp_commitmentrecommendation: { type: "number" },
  msp_milestonecategory: { type: "number" },
  _ownerid_value: { type: "string" },
  _msp_opportunityid_value: { type: "string" },
  _msp_workloadlkid_value: { type: "string" },
  msp_forecastcomments: { type: "string" },
  msp_milestoneworkload: { type: "string" },
  msp_deliveryspecifiedfield: { type: "string" },
};

export const TASK_SCHEMA: EntitySchema = {
  activityid: { type: "string", required: true },
  subject: { type: "string", required: true },
  description: { type: "string" },
  scheduledend: { type: "string" },
  statuscode: { type: "number", required: true },
  statecode: { type: "number", required: true },
  _ownerid_value: { type: "string" },
  _regardingobjectid_value: { type: "string" },
  msp_taskcategory: { type: "number" },
};

export const WHOAMI_SCHEMA: EntitySchema = {
  "@odata.context": { type: "string" },
  BusinessUnitId: { type: "string", required: true },
  UserId: { type: "string", required: true },
  OrganizationId: { type: "string", required: true },
};

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  entity: string;
  field: string;
  issue: "missing_required" | "wrong_type" | "unknown_field";
  expected?: string;
  actual?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validate a single record against a schema.
 * Returns errors for required field violations and type mismatches.
 * Returns warnings for fields present in the record but absent from the schema.
 */
export function validateRecord(
  record: Record<string, unknown>,
  schema: EntitySchema,
  entityName: string,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check required fields and types
  for (const [field, def] of Object.entries(schema)) {
    const value = record[field];

    if (value === undefined || value === null) {
      if (def.required) {
        errors.push({ entity: entityName, field, issue: "missing_required" });
      }
      continue;
    }

    const actualType = typeof value;
    if (actualType !== def.type) {
      errors.push({
        entity: entityName,
        field,
        issue: "wrong_type",
        expected: def.type,
        actual: actualType,
      });
    }
  }

  // Warn on unknown fields (potential schema drift in the other direction)
  for (const field of Object.keys(record)) {
    if (!(field in schema)) {
      warnings.push({ entity: entityName, field, issue: "unknown_field" });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a full CrmFixtureSet against known schemas.
 */
export function validateFixtureSet(fixtures: CrmFixtureSet): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  // WhoAmI
  const whoami = validateRecord(
    fixtures["whoami.json"] as unknown as Record<string, unknown>,
    WHOAMI_SCHEMA,
    "WhoAmI",
  );
  allErrors.push(...whoami.errors);
  allWarnings.push(...whoami.warnings);

  // Opportunities
  for (const opp of fixtures["opportunities-mine.json"].value) {
    const r = validateRecord(opp as unknown as Record<string, unknown>, OPPORTUNITY_SCHEMA, "Opportunity");
    allErrors.push(...r.errors);
    allWarnings.push(...r.warnings);
  }

  // Milestones
  for (const ms of fixtures["milestones-active.json"].value) {
    const r = validateRecord(ms as unknown as Record<string, unknown>, MILESTONE_SCHEMA, "Milestone");
    allErrors.push(...r.errors);
    allWarnings.push(...r.warnings);
  }

  // Tasks
  for (const task of fixtures["tasks-active.json"].value) {
    const r = validateRecord(task as unknown as Record<string, unknown>, TASK_SCHEMA, "Task");
    allErrors.push(...r.errors);
    allWarnings.push(...r.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Compare a live-captured response shape against the expected schema.
 * Reads a "shape-only" capture (field names + types, no values).
 */
export function compareShapes(
  liveShape: Record<string, string>,
  schema: EntitySchema,
  entityName: string,
): { newFields: string[]; removedFields: string[]; typeChanges: Array<{ field: string; was: string; now: string }> } {
  const newFields: string[] = [];
  const removedFields: string[] = [];
  const typeChanges: Array<{ field: string; was: string; now: string }> = [];

  // Fields in live but not in schema
  for (const field of Object.keys(liveShape)) {
    if (!(field in schema)) {
      newFields.push(field);
    }
  }

  // Fields in schema but not in live
  for (const field of Object.keys(schema)) {
    if (!(field in liveShape)) {
      removedFields.push(field);
    }
  }

  // Type mismatches
  for (const [field, def] of Object.entries(schema)) {
    if (field in liveShape && liveShape[field] !== def.type) {
      typeChanges.push({ field, was: def.type, now: liveShape[field] });
    }
  }

  return { newFields, removedFields, typeChanges };
}
