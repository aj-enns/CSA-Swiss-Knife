---
name: pbi-reference
description: "Power BI conventions and context bridge: auth pre-check, semantic model referencing, DAX patterns, subagent delegation, pre-aggregation, and session persistence for downstream CRM/vault workflows. Triggers: Power BI, PBI, MSXI, semantic model, DAX query, powerbi-remote tool call, PBI auth, PBI subagent delegation, PBI context budget, DAX pre-aggregation, PBI session persistence, context window exhaustion."
---

# Power BI — Conventions & Context Bridge

## Medium Registration

Power BI is a **read-only analytics medium** alongside CRM, Vault, and WorkIQ. It provides aggregated metrics, ACR telemetry, incentive baselines, and scorecard data that live outside CRM transaction records.

| Medium | Server | Probe | If unavailable |
|---|---|---|---|
| **Power BI** | `powerbi-remote` | `ExecuteQuery` with `EVALUATE TOPN(1, 'Dim_Calendar')` against the target semantic model | Skip PBI steps; note "Power BI data unavailable this session" |

## Auth Pre-Check

Before any PBI data query, probe:

```dax
EVALUATE TOPN(1, 'Dim_Calendar')
```

- **Success** → proceed.
- **Failure** → stop PBI portion, tell user:
  > Run `az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47` then `az account get-access-token --resource https://analysis.windows.net/powerbi/api`, then restart `powerbi-remote`.

## Semantic Model Referencing

- Reference by **dataset ID** (GUID), never display name.
- Document the ID in each prompt. Example: `a0239518-1109-45a3-a3eb-1872dc10ac15` (MSXI).

## DAX Discipline

1. **Filter early** — `CALCULATETABLE` + `FILTER` to push predicates.
2. **Project explicitly** — `SELECTCOLUMNS` for needed columns only.
3. **Parameterize TPIDs** — inject from vault/CRM, never hardcode.
4. **Relative dates** — `RelativeFM` or computed offsets, not hardcoded dates.
5. **Batch** — combine related queries into one `EVALUATE` when possible.

## Cross-Medium Integration

| Step | Medium | Purpose |
|---|---|---|
| Account roster | Vault or CRM | TPID list to filter queries |
| Telemetry | Power BI | ACR, seats, usage metrics |
| Business rules | Prompt logic | Eligibility, thresholds |
| CRM correlation | msx | Opportunity stage, milestones |
| Output | Synthesized report | Cross-medium data |

## Context Budget Problem

Power BI prompts pull 5–10 DAX query results that accumulate 15,000–40,000+ tokens of raw tabular data in context. When users then ask for CRM correlation, WorkIQ check, or skill-based analysis, the context window is already saturated — leaving no room for downstream tool calls and reasoning.

## Subagent Delegation

For medium/heavy prompts, delegate to `@pbi-analyst` so raw DAX data stays isolated. Parent receives only the final report.

| Complexity | Queries | Strategy |
|---|---|---|
| Light (1–3, single model) | Inline | No subagent |
| Medium (4–6, single model) | Subagent if downstream CRM/WorkIQ planned |
| Heavy (6+, multi-model) | **Always subagent** |

### Delegation Template

> Delegate to `@pbi-analyst`: execute [prompt name] against model [ID] with scope [filters]. Return the FINAL REPORT with tables, rankings, and recommendations — not raw DAX.

### Vault Context Injection

When parent has vault overrides for scoped accounts, include in delegation:

```
## Vault Context
### [Account Name]
- [Override: e.g., "Org migration: slug-A → slug-B. Don't flag seat decline as churn."]
```

Subagent applies overrides during analysis and includes "Vault Context Applied" in the report.

## DAX Pre-Aggregation

Push analysis into DAX to reduce rows before they enter context:

- `SUMMARIZECOLUMNS` for server-side counts/groups.
- `TOPN` aggressively: Portfolio `TOPN(50)`, Opportunity `TOPN(30)`, Service `TOPN(20)`.
- Merge queries sharing the same dimension grain.

## Session File Persistence

After PBI analysis completes, persist the report using vault-first storage (see `shared-patterns` skill § Artifact Output Directory):

- **Vault available (customer-scoped)**: `MCAPS-IQ-Artifacts/<Customer>/<prompt-name>-<date>.md`
- **Vault available (general)**: `MCAPS-IQ-Artifacts/pbi/<prompt-name>-<date>.md`
- **Vault unavailable**: `.copilot/sessions/pbi/<prompt-name>-<date>.md`

Full rendered report — not compressed. Downstream skills re-read to extract TPIDs, gaps, rankings.

## PBI Prompts

Live in `.github/prompts/pbi-*.prompt.md`. Each is self-contained with model ID, DAX, and business rules. To create new ones interactively, use the `pbi-prompt-builder` skill.
