---
name: crm-entity-schema
description: "CRM entity schema reference for Dynamics 365 OData queries. Use when constructing crm_query, crm_get_record, or any OData filter/select expressions to avoid property name guessing. Triggers: CRM query, OData filter, property name, entity set, field lookup, milestone field, opportunity field, crm_query, crm_get_record, milestone status code, commitment code, workload type."
---
# CRM Entity Schema Reference

Use this file for safe, scoped CRM query construction. Keep queries small and explicit.

## Non-Negotiables

- Never guess property names.
- Use `crm_list_entity_properties` when a field is uncertain.
- Lookup fields use `_<field>_value` naming.
- Entity sets are plural (for `crm_query`), logical names are singular (for metadata tools).
- Respect `crm_query` ceiling: maximum 500 records with scoped filters.

## Allowed Entity Sets (Current)

`accounts`, `contacts`, `opportunities`, `msp_engagementmilestones`, `msp_dealteams`, `msp_workloads`, `tasks`, `systemusers`, `transactioncurrencies`, `connections`, `connectionroles`, `processstages`, `EntityDefinitions`

## Core Entities And Fields

### `accounts`

- `accountid`
- `name`
- `msp_mstopparentid` (TPID)
- `_ownerid_value`
- `_parentaccountid_value`

### `opportunities`

- `opportunityid` — **GUID** (primary key for all lookups, tool parameters, and OData filters)
- `name`
- `msp_opportunitynumber` — **display-only** (human-readable number like `7-3CBHWLQRWW`; show to user in tables/output but never use as an identifier in queries or tool calls)
- `msp_salesplay`
- `msp_activesalesstage`
- `estimatedclosedate`
- `msp_estcompletiondate`
- `estimatedvalue` — total deal value; populated primarily on **licensing/seat deals** (M365, W365, Dynamics). Often `$0` on Azure consumption-only deals.
- `msp_consumptionconsumedrecurring` — actual recurring consumption ACR; populated primarily on **Azure consumption deals**. Often `null` on licensing-only deals.
- `description`
- `_ownerid_value`
- `_parentaccountid_value`
- `statecode`

### `msp_engagementmilestones`

- `msp_engagementmilestoneid`
- `msp_milestonenumber`
- `msp_name`
- `_msp_opportunityid_value`
- `_ownerid_value`
- `_msp_workloadlkid_value`
- `msp_milestonedate`
- `msp_milestonestatus`
- `msp_commitmentrecommendation`
- `msp_milestoneworkload`
- `msp_deliveryspecifiedfield`
- `msp_monthlyuse`
- `msp_forecastcomments` — latest forecast comment (plain text summary, most recent at top)
- `msp_forecastcommentsjsonfield` — full comment history as JSON array with `userId`, `modifiedOn`, `comment` per entry
- `msp_milestonepreferredazureregion`
- `msp_milestoneazurecapacitytype` — **MultiSelectPicklist** (not a standard Picklist; metadata type is `MultiSelectPicklistAttributeMetadata`, options exposed via `GlobalOptionSet`)

### `tasks`

- `activityid`
- `subject`
- `description`
- `scheduledend`
- `statuscode`
- `statecode`
- `_ownerid_value`
- `_regardingobjectid_value`
- `msp_taskcategory`

### `systemusers`

- `systemuserid`
- `fullname`
- `internalemailaddress`

### `msp_dealteams`

- `msp_dealteamid`
- `_msp_dealteamuserid_value`
- `_msp_parentopportunityid_value`
- `msp_isowner`
- `statecode`

### `systemusers` (extended)

- `title`

## High-Value Corrections

- TPID on account is `msp_mstopparentid` (not `msp_accounttpid`).
- Opportunity link from milestone is `_msp_opportunityid_value`.
- Opportunity stage in MSX reporting is `msp_activesalesstage` (not `activestageid`).
- Opportunity close date should prefer `msp_estcompletiondate` (fallback: `estimatedclosedate`).
- Milestone date is `msp_milestonedate` (not `msp_estimateddate`, not `msp_duedate`, not `msp_targetdate`).
- Task primary key is `activityid` (not `taskid`).
- Commitment (Committed) is `msp_commitmentrecommendation = 861980003` (NOT `861980001` — that value is rejected by the API).
- `msp_milestonestatus = 861980001` means At Risk (not Committed).

## Common Codes

### Milestone status (`msp_milestonestatus`)

- On Track: `861980000`
- At Risk: `861980001`
- Blocked: `861980002`
- Completed: `861980003`
- Cancelled: `861980004`
- Not Started: `861980005`
- Closed as Incomplete: `861980007`

### Commitment (`msp_commitmentrecommendation`)

- Uncommitted: `861980000`
- ~~Best Case: `861980001`~~: **deprecated** — exists in historical records but API rejects writes with this value
- Pipeline: `861980002`
- Committed: `861980003`

> `msp_monthlyuse` = estimated **change** in monthly revenue (delta), not total/absolute. Commitment should only be set when there is confidence the delta will be attained. This is the **most reliable ACR indicator** — populated on milestones regardless of whether the parent opportunity is licensing or consumption. At the opportunity level, check both `estimatedvalue` (licensing deals) and `msp_consumptionconsumedrecurring` (consumption deals) since they split by deal type.

### Workload type (`msp_milestoneworkload`)

- Azure: `861980000`
- Dynamics 365: `861980001`
- Security: `861980002`
- Modern Work: `861980003`

### Delivered by (`msp_deliveryspecifiedfield`)

- Customer: `606820000`
- Partner: `606820001`
- ISD: `606820002`

For region/capacity full option sets, call:

- `get_milestone_field_options({ field: "preferredAzureRegion" })` — standard Picklist
- `get_milestone_field_options({ field: "azureCapacityType" })` — **MultiSelectPicklist** (metadata uses `MultiSelectPicklistAttributeMetadata` + `GlobalOptionSet`, not `PicklistAttributeMetadata` + `OptionSet`)

## Query Patterns

### Milestones by opportunity

```js
crm_query({
  entitySet: "msp_engagementmilestones",
  filter: "_msp_opportunityid_value eq '<GUID>' and msp_milestonestatus ne 861980003",
  select: "msp_engagementmilestoneid,msp_name,msp_milestonestatus,msp_milestonedate,_ownerid_value",
  orderby: "msp_milestonedate asc",
  top: 25
})
```

### Opportunity deal-team lookup

```js
crm_query({
  entitySet: "msp_dealteams",
  filter: "_msp_parentopportunityid_value eq '<OPPORTUNITY_GUID>' and statecode eq 0",
  select: "_msp_parentopportunityid_value,_msp_dealteamuserid_value,msp_isowner",
  top: 100
})
```

### Opportunity status enrichment

```js
crm_query({
  entitySet: "opportunities",
  filter: "opportunityid eq '<GUID>' and statecode eq 0",
  select: "opportunityid,name,msp_opportunitynumber,msp_activesalesstage,msp_estcompletiondate,estimatedclosedate,_ownerid_value",
  top: 1
})
```

## Deal Team Clarification

- Opportunity deal team: `msp_dealteams`.
- Milestone execution team: milestone `_ownerid_value`.
- These are related but not identical. Do not assume one implies the other.
- `msp_dealteams` may be unavailable in some environments; if so, report reduced certainty and fall back to owner/milestone signals.

## Record URL Template

`https://microsoftsales.crm.dynamics.com/main.aspx?etn=<entityLogicalName>&id=<GUID>&pagetype=entityrecord`

Prefer `recordUrl` from tool payloads when provided.

## Extended Reference

For full invalid-field tables, expanded code lists, and additional examples, read:
`.github/documents/crm-schema-extended.md`
