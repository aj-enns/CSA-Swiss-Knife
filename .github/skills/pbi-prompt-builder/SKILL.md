---
name: pbi-prompt-builder
description: 'Interactive Power BI prompt builder: discovers semantic models, explores schema, drafts DAX queries from natural-language questions, validates them live, and outputs a ready-to-use pbi-*.prompt.md file. Triggers: build PBI prompt, create Power BI report prompt, scaffold PBI workflow, map Power BI report, generate PBI prompt, new PBI query, Power BI prompt template, what data can I pull.'
argument-hint: 'Describe the questions you want to answer, or provide a semantic model name/ID to explore'
---

## Purpose

Guides users through building a reusable Power BI prompt file (`pbi-*.prompt.md`) by interactively discovering what data is available, drafting DAX queries for their questions, validating them against live data, and assembling the result into a prompt that follows project conventions.

## When to Use

- User wants to create a new PBI-backed workflow (incentive tracking, gap analysis, pipeline scoring, consumption review)
- User knows the questions but not the DAX or schema
- User wants to map an existing Power BI report into a repeatable agent prompt
- Manager wants to customize a PBI prompt for their team

## Freedom Level

**High** — Discovery and question refinement require judgment. DAX generation uses `powerbi-remote:GenerateQuery`. Output structure is **Low freedom** (must follow template exactly).

## Runtime Contract

- **Tools**: `powerbi-remote:DiscoverArtifacts`, `powerbi-remote:GetSemanticModelSchema`, `powerbi-remote:GetReportMetadata`, `powerbi-remote:GenerateQuery`, `powerbi-remote:ExecuteQuery`
- **Auth convention**: Follow `powerbi-mcp.instructions.md` § Auth Pre-Check Pattern
- **Output convention**: Follow `powerbi-mcp.instructions.md` § Prompt Template Convention (`pbi-*.prompt.md` naming)

## Flow

### Phase 1 — Intent Gathering

Ask the user (skip items they've already provided):

1. **What questions do you want to answer?** — Collect 1–5 natural-language questions. Examples:
   - "What is my gap to target for account X?"
   - "Which opportunities in my pipeline have the highest conversion likelihood?"
   - "Show me accounts trending below consumption threshold"
   - "How is my team tracking against incentive Y?"

2. **Which Power BI report or semantic model?** — Options:
   - User provides a dataset ID (GUID) → use directly
   - User provides a report/model name → call `powerbi-remote:DiscoverArtifacts` to resolve
   - User doesn't know → call `powerbi-remote:DiscoverArtifacts` with keywords from their questions, present matches

3. **Account scope** — Where do TPIDs/account identifiers come from?
   - A vault file (e.g., `.docs/AccountReference.md`)
   - CRM (`msx:get_my_active_opportunities`)
   - User will provide inline
   - Not applicable (model-wide query)

4. **Business rules or reference docs** — Any program rules, incentive definitions, or threshold documents to embed? (Optional — stored in `.github/documents/`)

### Phase 2 — Schema Discovery

1. **Auth pre-check** — per `powerbi-mcp.instructions.md`:
   ```dax
   EVALUATE TOPN(1, 'Dim_Calendar')
   ```
   If this fails → stop and show the auth recovery message. Do not proceed.

2. **Get schema** — call `powerbi-remote:GetSemanticModelSchema({ artifactId })`.

3. **Inspect report** (if user referenced a report) — call `powerbi-remote:GetReportMetadata({ reportObjectId })` to understand how the model is used in practice: which tables, filters, and measures the report author intended.

4. **Present a plain-language summary** of what's in the model:
   - Key tables and what they represent
   - Available measures (pre-built calculations)
   - Important filter dimensions (calendar, account, segment, etc.)
   - Any custom instructions or verified answers from the model author

5. **Map questions to schema** — for each user question, identify:
   - Which tables/columns are needed
   - Which measures apply
   - What filters are required
   - Flag any questions that can't be answered by this model

Present the mapping and ask: *"Does this look right? Any questions to add, change, or drop?"*

### Phase 3 — DAX Generation & Validation

For each confirmed question:

1. **Generate DAX** — call `powerbi-remote:GenerateQuery` with:
   - `artifactId`: the semantic model ID
   - `userInput`: the user's natural-language question
   - `schemaSelection`: the table/column/measure mapping from Phase 2
   - `valueSearchTerms`: any specific account names, product names, etc.

2. **Test-run** — call `powerbi-remote:ExecuteQuery` with the generated DAX, limited to a small result set (`maxRows: 10`) to validate it returns data.

3. **Show results** — present the sample data to the user. Ask:
   - "Is this the data you expected?"
   - "Should we add/remove columns?"
   - "Any filters to adjust?"

4. **Iterate** — if the user wants changes, re-generate with updated `userInput` or `schemaSelection`. Use `chatHistory` parameter to carry prior DAX context forward.

5. **Parameterize** — replace hardcoded values (specific TPIDs, dates) with placeholders that the prompt workflow will fill dynamically:
   - TPID lists → `{"<TPID1>", "<TPID2>", ...}` (injected from account roster)
   - Dates → `RelativeFM` offsets or computed values
   - Thresholds → Configuration table variables

### Phase 4 — Prompt Assembly

Generate the `.prompt.md` file following this structure:

```markdown
---
description: "<one-line description of what this prompt does>"
---

# <Title>

<One-sentence instruction to the agent>

## Reference

<Link to any .github/documents/ files with program rules. Omit if none.>

## Key Rules Summary

<Business rules extracted from reference docs or user input. Omit if not applicable.>

## Configuration

> **Managers**: Fork this file and update these values.

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `<GUID>` | <model name> |
| **Account Roster** | `<path>` | <description> |
| <additional settings> | | |

## Workflow

### Step 0 — Power BI Auth Pre-Check
<standard auth check — always include>

### Step N — <Step Title>
<workflow step with DAX query, logic, or cross-medium retrieval>

### Step N+1 — Report
<output format — table layout and status values>
```

### Phase 5 — Write & Confirm

1. **Propose filename** — `pbi-<kebab-case-name>.prompt.md` in `.github/prompts/`.
2. **Write the file** — create it in the workspace.
3. **Summary** — show what was created and how to use it:
   - "Run this prompt by asking: `<trigger phrase>`"
   - "To customize: edit the Configuration table in the file"
   - "To change the data source: swap the Semantic Model ID"

## Decision Logic

| Situation | Action |
|---|---|
| Model has no relevant tables for a question | Drop the question; explain what the model *can* answer |
| `GenerateQuery` produces invalid DAX | Retry with broader `schemaSelection`; if still fails, hand-write DAX using schema |
| `ExecuteQuery` returns empty results | Check filters — may be scoping too narrowly. Show the user and ask for guidance |
| User wants cross-medium data (PBI + CRM) | Add CRM steps to the workflow (account roster, opp state); reference `shared-patterns` skill |
| User wants to use vault for account scoping | Add vault read step; reference `obsidian-vault.instructions.md` |
| Multiple semantic models needed | Create one prompt per model, or a multi-step prompt with separate queries per model |

## Output Schema

- `prompt_file_path`: path to the created `.prompt.md` file
- `questions_mapped`: list of questions → DAX query pairings
- `questions_dropped`: any questions the model couldn't answer (with explanation)
- `next_action`: "Prompt created. Run it with: `<trigger phrase>`. To refine, edit the Configuration table or re-run this skill."
