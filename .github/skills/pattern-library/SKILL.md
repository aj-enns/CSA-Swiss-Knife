---
name: pattern-library
description: "Capture, catalog, and reuse proven implementation patterns — code snippets, dashboard structures, report layouts, query recipes, and workflow shapes discovered during real work. Triggers: save pattern, capture pattern, save this, remember this approach, reuse pattern, apply pattern, known pattern, prior pattern, pattern library, code recipe, dashboard pattern, report structure, query pattern, workflow pattern, pattern catalog, what patterns exist, list patterns, prune patterns, pattern hygiene."
---

# Pattern Library

Meta-skill: captures proven implementation patterns from *any* work session and catalogs them for future reuse. This skill does not replace domain skills (`vault-dashboard`, `shared-patterns`, `pbi-reference`, etc.) — it **harvests reusable artifacts** from them and from ad-hoc iterations that haven't yet earned a dedicated skill.

When a pattern type grows large enough to justify its own skill, graduate it out of here.

## Freedom Level

**Medium** — Pattern selection and adaptation involve judgment. Storage format and write safety are strict.

## Pattern Types

| Type | Description | Reference File |
|------|-------------|----------------|
| `code` | Iterated code recipes, utility snippets, API call shapes | [code-patterns.md](./references/code-patterns.md) |
| `dashboard` | Dashboard compositions, DataviewJS blocks, CSS components, chart configs | [dashboard-patterns.md](./references/dashboard-patterns.md) |
| `report` | Report structures, table layouts, output shapes, briefing formats | [report-structures.md](./references/report-structures.md) |
| `query` | CRM/OData/DAX/KQL query recipes | [code-patterns.md](./references/code-patterns.md) |
| `workflow` | Multi-step process shapes, tool chains, delegation patterns | [code-patterns.md](./references/code-patterns.md) |

## Tag Taxonomy (Fixed Vocabulary)

Use these controlled values in the `Tags` field. Combine freely.

| Dimension | Allowed Values |
|-----------|---------------|
| **Domain** | `pipeline`, `milestone`, `m365`, `pbi`, `vault`, `crm`, `hok`, `mcem`, `connect` |
| **Role** | `se`, `specialist`, `csa`, `csam`, `ae`, `ats`, `ia`, `sd` |
| **Data source** | `crm-odata`, `dax`, `workiq`, `mail`, `teams`, `calendar`, `oil`, `dataviewjs` |
| **Risk** | `low`, `medium`, `high` (write impact / blast radius) |
| **Fidelity** | `proven` (used 2+ times), `draft` (captured once, untested reuse) |

Freeform tags are allowed for one-off specificity but prefer the vocabulary above.

## Pattern Record Schema

Every pattern entry MUST use this structure:

```markdown
## Pattern: <Short Name>
- **Type**: code | dashboard | report | query | workflow
- **Use case**: When/why to reach for this
- **Inputs**: What data or context is needed
- **Tags**: domain, role, data-source, risk, fidelity (from taxonomy above)
- **Validated**: YYYY-MM-DD
- **Supersedes**: (prior pattern name, or "none")
- **Origin skill**: (skill name this was discovered in, or "ad-hoc")

### Structure / Implementation
(The actual pattern — code, layout, schema, steps)

### Adaptation Notes
(What to change when reusing — parameterize X, swap Y)

### Known Pitfalls
(Failure modes, edge cases, constraints)
```

---

## Write Safety Gate (Mandatory)

**Never save, modify, or delete pattern artifacts without explicit user confirmation.**

1. Show a preview of the proposed change (new entry, updated entry, file path, diff).
2. Ask: **"Save this pattern? (yes / no)"**
3. Only persist when user replies with an explicit **yes**.
4. If no or unclear → do nothing, keep the preview available for revision.

Default behavior is **preview-only**.

---

## Workflow: Capture a Pattern

Trigger: "save this pattern", "capture this", "remember this approach"

1. **Extract** — Identify the reusable artifact from conversation context:
   - Code snippet, DataviewJS block, DAX query, report layout, process steps
   - Strip customer-specific data; generalize identifiers
2. **Classify** — Determine pattern type (`code`, `dashboard`, `report`, `query`, `workflow`)
3. **Normalize** — Fill in the Pattern Record Schema above
4. **Assign tags** — Domain, role, data sources, risk level
5. **Preview** — Show the full record to the user with the target file path
6. **Confirm** — Apply Write Safety Gate. Only write on explicit yes.
7. **Append** — Add record to the appropriate reference file

## Workflow: Retrieve & Apply a Pattern

Trigger: "apply pattern", "reuse prior pattern", "what patterns exist"

1. **Match** — Search reference files by:
   - Pattern type
   - Tags (domain, role, data source)
   - Keywords in use case / name
2. **Rank** — Prefer: tag overlap > recency (`Validated` date) > specificity
3. **Present** — Show top 1–3 matches with:
   - Pattern name + use case
   - Adaptation notes for current context
   - Known pitfalls
4. **Apply** — On user selection, output the copy-ready artifact with adaptations applied

## Workflow: Pattern Hygiene

Trigger: "prune patterns", "pattern hygiene", "clean up patterns"

1. **Scan** reference files for:
   - `Validated` date older than 90 days → flag as stale
   - `Supersedes` chains → suggest removing superseded entries
   - Duplicate tags/use-cases across entries → suggest merge
2. **Preview** proposed removals/merges
3. **Confirm** — Apply Write Safety Gate per change

---

## Output Contract

All responses from this skill MUST include:

| Field | Required | Description |
|-------|----------|-------------|
| `Pattern Selected` | On retrieve | Name of matched pattern |
| `Why Selected` | On retrieve | Tag/keyword match rationale |
| `Adaptation Needed` | On retrieve | What to change for current context |
| `Risks / Guardrails` | Always | Known pitfalls or constraints |
| `Copy-ready artifact` | On retrieve/capture | The actual snippet, structure, or layout |
