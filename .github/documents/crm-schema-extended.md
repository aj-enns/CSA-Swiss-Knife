# CRM Schema Extended Reference

Extended reference for low-frequency lookups and troubleshooting. Use
`.github/instructions/crm-entity-schema.instructions.md` for normal runtime behavior.

## When To Use This File

- You need long-form invalid-field diagnostics.
- You need expanded examples beyond core query patterns.
- You are validating uncommon picklist values.

## Dynamic Discovery First

```js
crm_list_entity_properties({ entityLogicalName: "msp_engagementmilestone" })
```

Prefer discovery over memorizing long field lists.

## Large Picklists

For complete option tables:

- `get_milestone_field_options({ field: "preferredAzureRegion" })` — standard Picklist
- `get_milestone_field_options({ field: "azureCapacityType" })` — **MultiSelectPicklist** (uses `MultiSelectPicklistAttributeMetadata` + `GlobalOptionSet` in OData metadata, not `PicklistAttributeMetadata` + `OptionSet`)

## Additional Invalid Patterns

- `msp_milestones` entity set (invalid) -> use `msp_engagementmilestones`
- `msp_estimatedcompletiondate` on milestone (invalid) -> use `msp_milestonedate`
- `msp_opportunityid` on opportunity (invalid) -> use `opportunityid` (GUID) for all lookups and tool parameters; `msp_opportunitynumber` is the human-readable display number only — never use it as an identifier in queries or tool calls
- `_msp_opportunityid_value` on `msp_workloads` (invalid) -> resolve via milestones

## Extra Query Examples

### Batch milestones by opportunity list

```js
get_milestones({
  opportunityIds: ["<GUID1>", "<GUID2>"],
  statusFilter: "active",
  format: "summary"
})
```

### Targeted ad-hoc milestone search

```js
crm_query({
  entitySet: "msp_engagementmilestones",
  filter: "contains(msp_name,'Migration') and msp_milestonestatus ne 861980003",
  select: "msp_engagementmilestoneid,msp_name,msp_milestonedate,msp_milestonestatus",
  top: 50
})
```

## Deal Team Notes

- Opportunity deal team is retrievable via `msp_dealteams` using `_msp_parentopportunityid_value` → opportunity and `_msp_dealteamuserid_value` → user.
- Stage and close-date enrichment for opportunity summaries should use `msp_activesalesstage` and `msp_estcompletiondate` (fallback `estimatedclosedate`).
- In environments where `msp_dealteams` is unavailable, use milestone ownership heuristics and clearly mark reduced certainty.
