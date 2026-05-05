export { CrmFixtureFactory, MILESTONE_STATUS, COMMITMENT_RECOMMENDATION, TASK_STATUS } from "./crm-factory.js";
export type { CrmFixtureSet, Opportunity, Milestone, CrmTask, WhoAmI } from "./crm-factory.js";

export { OilFixtureFactory } from "./oil-factory.js";
export type { OilFixtureSet, VaultContext, CustomerContext } from "./oil-factory.js";

export { M365FixtureFactory } from "./m365-factory.js";
export type { M365FixtureSet, CalendarEvent, WorkIqResult } from "./m365-factory.js";

export {
  validateRecord,
  validateFixtureSet,
  compareShapes,
  OPPORTUNITY_SCHEMA,
  MILESTONE_SCHEMA,
  TASK_SCHEMA,
  WHOAMI_SCHEMA,
} from "./schema-guard.js";
export type { ValidationResult, ValidationError } from "./schema-guard.js";
