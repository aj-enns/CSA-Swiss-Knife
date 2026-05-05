# Vault Operations Reference

Detailed reference for OIL workflows. Use
`.github/instructions/obsidian-vault.instructions.md` for day-to-day runtime behavior.

## Layout Guidance

- Preferred customer layout: `Customers/<Name>/<Name>.md`
- Entity sub-notes:
  - `Customers/<Name>/opportunities/<Opp>.md`
  - `Customers/<Name>/milestones/<Ms>.md`

## Frontmatter Notes

- IDs and machine-readable fields belong in frontmatter.
- Narrative context belongs in note body sections.
- Keep owner names aligned with `People/<Name>.md` filenames.
- All agent-created notes MUST include `icon:` frontmatter for the Obsidian Iconize plugin:
  - Opportunity notes: `icon: LiTarget`
  - Milestone notes: `icon: LiFlag`
  - People notes: `icon: LiUser`
  - Customer notes: `icon: LiBuilding2`
  - Meeting notes: `icon: LiCalendar`

## Deep Workflow Notes

### VAULT-PREFETCH

- First pull customer context.
- Then derive CRM filters from vault IDs.

### VAULT-SYNC

- Read vault entities.
- Diff with CRM result set.
- Write only deltas.

### VAULT-HYGIENE

- Run `check_vault_health`.
- Review `structuralIssues` and stale entities.
- Propose migrations and targeted repairs.

## Safety Reminders

- Avoid direct bulk markdown generation for entities.
- Prefer entity-aware OIL tools for auditability.
- Use pending write review for non-trivial change sets.

## Related Docs

- `.github/instructions/connect-hooks.instructions.md`
- `.github/instructions/crm-query-strategy.instructions.md`
- `mcp/oil/README.md`
