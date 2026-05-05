---
title: Design Spec
description: What we evaluate, scenario design, scoring model, and implementation phases.
tags:
  - evaluation
  - design
  - testing
hide:
  - toc
---

# Prompt & Skill Evaluation Framework — Design Spec

> **Status**: Implemented (Phase 1 + Phase 2 + Phase 3)  
> **Date**: 2026-03-16  
> **Last verified**: Baseline 92.9% (offline), 94.0% (live)  
> **Scope**: Evaluates the 14 instruction files, ~39 skills, and tool-calling patterns that guide the MCAPS-IQ agent.  
> **See also**: [Architecture](architecture.md) (implementation details), [Hardening](hardening.md) (hardening), [Regression & Test Data](regression-data.md) (regression & test data).

---

## 1. Problem

We have **14 instructions**, **~39 skills**, and **57 MCP tools** (targeting ~41 post-consolidation). These are living documents that affect agent behavior in production. Today there is no systematic way to know:

1. **Does the agent select the right skill** for a given user utterance?
2. **Does it call the right tools** in the right order with the right params?
3. **Does it avoid anti-patterns** documented in `crm-query-strategy.instructions.md` and elsewhere?
4. **Does a skill edit break behavior** in an unrelated skill (regression)?
5. **How much context budget** does a skill chain consume?

The OIL bench suite (`mcp/oil/bench/`) already measures low-level metrics (token efficiency, call count, latency, retrieval quality, write safety). This spec extends that model to the **prompt/skill layer** — evaluating agent *behavior*, not just server *performance*.

---

## 2. What We're Evaluating

| Layer | Artifact | Count | Example |
|---|---|---|---|
| **Instruction** | `.github/instructions/*.instructions.md` | 14 | `crm-query-strategy`, `msx-role-and-write-gate` |
| **Skill** | `.github/skills/*/SKILL.md` | ~39 | `morning-brief`, `pipeline-hygiene-triage` |
| **Tool surface** | `mcp/msx` + `mcp/oil` tools | 57 → 41 | `get_milestones`, `get_customer_context` |
| **Copilot config** | `.github/copilot-instructions.md` | 1 | Top-level agent directive |

---

## 3. Eval Dimensions

### 3.1 Skill Routing Accuracy

> Given a user utterance, does the agent activate the correct skill(s)?

Each skill has trigger phrases in its YAML frontmatter `description` field. We test:

- **True positive**: trigger phrase → correct skill activates
- **True negative**: off-topic prompt → skill does NOT activate
- **Disambiguation**: overlapping triggers resolve to the right skill (e.g., "pipeline review" → `pipeline-hygiene-triage` not `milestone-health-review`)
- **Chain activation**: compound requests trigger the right skill chain (e.g., "prep me for governance" → `mcem-stage-identification` + `milestone-health-review` + `customer-evidence-pack`)

### 3.2 Tool Call Correctness

> Given a skill activation, does the agent call the expected tools with correct parameters?

Each skill documents a `## Flow` section with explicit tool calls. We test:

- **Required tools called**: every tool in the flow is invoked
- **Correct parameters**: GUIDs, filters, formats match the documented pattern
- **Correct sequencing**: dependencies respected (e.g., vault-first before CRM query)
- **No anti-pattern violations**: patterns from `crm-query-strategy.instructions.md` (e.g., never unscoped `get_milestones()`)

### 3.3 Anti-Pattern Detection

> Does the agent avoid known bad patterns?

From `crm-query-strategy.instructions.md` and skill docs:

| Anti-Pattern ID | Description | Source |
|---|---|---|
| `AP-001` | `get_milestones()` with no scoping parameter | crm-query-strategy |
| `AP-002` | `crm_query` with wrong entity set (`msp_milestones`) | crm-query-strategy |
| `AP-003` | Loop: `list_opportunities` per customer → `get_milestones` per opp | crm-query-strategy |
| `AP-004` | Skipping vault when OIL is available | crm-query-strategy |
| `AP-005` | CRM write without human-in-the-loop confirmation | msx-role-and-write-gate |
| `AP-006` | Guessing CRM property names not in entity schema | crm-entity-schema |
| `AP-007` | `crm_query` to entity set not in `ALLOWED_ENTITY_SETS` | tools.ts allowlist |
| `AP-008` | Treating vault cached state as live CRM truth | obsidian-vault |
| `AP-009` | Unbounded M365/WorkIQ retrieval | shared-patterns |
| `AP-010` | Role assumption without `crm_whoami` or explicit confirmation | msx-role-and-write-gate |
| `AP-011` | `get_milestones` scoped by entity/customer but missing `statusFilter` — returns all milestones including completed/cancelled | crm-query-strategy |

### 3.4 Output Format Compliance

> Does the agent produce output matching the skill's `## Output Schema`?

- **Required sections present**: e.g., morning brief must have 🔴/🟡/🟢/meetings/pipeline/gaps
- **Table format**: milestones/opportunities rendered as tables, not prose
- **Required columns**: per `copilot-instructions.md` (Opp # with deep-link, Stage, Deal Team, etc.)
- **Connect hook hint**: present when skill documents one

### 3.5 Context Budget Efficiency

> How much of the context window does a skill chain consume?

Extending the OIL bench token-efficiency pattern:

- **Schema overhead**: tool count × avg schema tokens per turn
- **Instruction overhead**: instruction file tokens loaded per skill activation
- **Response payload**: total tokens returned by tool calls
- **Budget ratio**: (schema + instruction + response) / context window size

---

## 4. Architecture

See [Architecture](architecture.md) for full implementation details including source file inventory, class diagrams, and data flow.

```
evals/
├── harness.ts                   # Core types, mock servers, scoring (533 lines)
├── report.ts                    # Aggregation + CI reporter (92 lines)
├── fixtures/
│   ├── crm-responses/           # Captured/hand-crafted CRM fixtures (gitignored)
│   ├── oil-responses/           # Captured OIL fixtures (gitignored)
│   ├── m365-responses/          # Captured M365 fixtures (gitignored)
│   ├── generators/              # Synthetic fixture factories
│   │   ├── crm-factory.ts       # 5 presets (pipelineHealth, stalePipeline, etc.)
│   │   ├── oil-factory.ts       # 2 presets (standard, empty)
│   │   ├── m365-factory.ts      # 2 presets (standard, empty)
│   │   └── schema-guard.ts      # Shape validation & drift detection
│   ├── scenarios/               # YAML-defined test scenarios (5 files, 34+ scenarios)
│   └── scrub-map.json           # PII redaction mapping
├── judges/
│   ├── tool-sequence.ts         # Checks tool call order and params (181 lines)
│   ├── anti-pattern.ts          # Detects AP-001→AP-010 with severity weights (368 lines)
│   ├── output-format.ts         # Validates output structure, header-only columns (132 lines)
│   └── llm-judge.ts             # LLM-as-judge with retry logic (261 lines)
├── reporters/
│   └── json-persist.ts          # Vitest custom reporter → JSON results (172 lines)
├── results/
│   ├── baseline.json            # Committed baseline (92.9%, 7 scenarios)
│   ├── latest.json              # Gitignored — most recent run
│   └── history/                 # Gitignored — timestamped archive
├── traces/
│   ├── types.ts                 # AgentTrace interface
│   ├── trace-harness.ts         # Capture/promote/regression CLI (293 lines)
│   └── golden/                  # Committed human-verified traces
├── routing/routing.eval.ts
├── tool-correctness/tool-calls.eval.ts
├── anti-patterns/anti-patterns.eval.ts
├── output-format/output-format.eval.ts
├── context-budget/context-budget.eval.ts
└── live/
    ├── config.ts                # 4 model profiles
    ├── live-harness.ts          # Full agent loop, 32 MOCK_TOOLS (843 lines)
    └── live-agent.eval.ts       # 5 E2E scenarios + LLM judge (320 lines)
```

**Total**: ~50 source files, ~6,000+ lines of eval framework code.

### 4.1 Eval Harness

The harness intercepts MCP tool calls and records them without hitting real CRM/vault/M365. Two execution modes, both implemented:

#### Mode A: Trace-Based (offline, fast) — ✅ Implemented

Hand-crafted or YAML-driven scenarios with fixture-backed mock servers. Supports both disk-loaded fixtures and synthetic factory-generated fixtures.

```typescript
// Implemented in harness.ts
interface ToolCallTrace {
  tool: string;           // "msx:get_milestones"
  params: Record<string, unknown>;
  response: unknown;      // mocked or captured response
  timestamp: number;
  phase?: number;         // for parallel-call grouping
}

interface EvalScenario {
  id: string;
  name: string;
  description?: string;
  userUtterance: string;
  context?: {
    role?: "Specialist" | "SE" | "CSA" | "CSAM";
    customer?: string;
    mediums?: Array<"crm" | "vault" | "workiq" | "teams" | "mail" | "calendar">;
  };
  expectedSkill?: string | null;
  expectedSkills?: string[];
  negativeSkills?: string[];
  expectedCalls?: Array<{ tool: string; params?: Record<string, unknown>; paramsContains?: Record<string, unknown>; order?: number; phase?: number; before?: string; }>;
  forbiddenCalls?: Array<{ tool: string; params?: Record<string, unknown>; }>;
  forbiddenPatterns?: string[];
  outputValidation?: OutputCheck;
}
```

#### Mode B: Live Agent Loop (online, comprehensive) — ✅ Implemented

Run the actual agent (via Azure OpenAI) against mock MCP servers. System prompt assembled from real instruction/skill files. 32 tools available to the LLM. Max 10 turns safety limit.

```typescript
// Implemented in live/config.ts
interface LiveEvalConfig {
  model: string;          // "gpt-4o-mini" | "gpt-4o" | "gpt-4.1-mini" | "gpt-4.1"
  judgeModel: string;
  endpoint: string;       // Azure OpenAI endpoint
  apiVersion: string;
  temperature: number;
  iterations: number;
}
```

### 4.2 Mock MCP Servers — ✅ Implemented

Three mock servers with fixture loading from disk or synthetic factories:

```typescript
// MockCrmServer — returns fixture responses, stages writes as no-ops
class MockCrmServer {
  async loadFixtures(): Promise<void>   // from disk
  loadFromFactory(fixtures: CrmFixtureSet): void  // from factory
  handle(tool: string, params: Record<string, unknown>): unknown
  readonly stagedWrites: Array<{ tool: string; params: Record<string, unknown> }>
}

// MockOilServer — disk + factory + inline fallback
class MockOilServer {
  async loadFixtures(): Promise<void>
  loadFromFactory(fixtures: OilFixtureSet): void
  handle(tool: string, params: Record<string, unknown>): unknown
}

// MockM365Server — WorkIQ, Calendar, Teams, Mail
class MockM365Server { ... }
```

### 4.3 Judges — ✅ Implemented

#### Rule-Based Judges (deterministic, fast)

```typescript
// Tool sequence judge — best-match (params-aware), not first-match
function judgeToolSequence(
  actual: ToolCallTrace[],
  expected: Array<{ tool: string; params?: Record<string, unknown>; paramsContains?: Record<string, unknown>; order?: number; before?: string }>,
  forbidden?: Array<{ tool: string; params?: Record<string, unknown> }>,
): { pass: boolean; score: number; missing: string[]; extra: string[]; orderViolations: string[] }

// Anti-pattern judge — severity-weighted, context-aware
function judgeAntiPatterns(
  calls: ToolCallTrace[],
  context?: { mediums?: string[] },  // AP-004 respects scenario context
): { pass: boolean; score: number; violations: AntiPatternViolation[] }

// Output format judge — header-only column detection
function judgeOutputFormat(
  output: string,
  schema: OutputCheck,
): { pass: boolean; score: number; missingSections: string[]; missingColumns: string[] }
```

#### LLM-as-Judge (subjective quality, Phase 2) — ✅ Implemented

Scores 5 dimensions at 1–5 scale with exponential backoff retry. Good output threshold: ≥4 per dimension, overall >0.7.

```typescript
interface LlmJudgeResult {
  dimension: string;
  score: 1 | 2 | 3 | 4 | 5;
  reasoning: string;
}
```

---

## 5. Scenario Design

### 5.1 Skill Routing Scenarios

```yaml
# evals/fixtures/scenarios/skill-routing.yaml
scenarios:
  - id: route-morning-brief
    utterance: "start my day"
    expected_skill: morning-brief
    negative_skills: [pipeline-hygiene-triage, milestone-health-review]

  - id: route-morning-brief-alt
    utterance: "catch me up on everything"
    expected_skill: morning-brief

  - id: route-pipeline-not-milestone
    utterance: "show me stale pipeline entries"
    expected_skill: pipeline-hygiene-triage
    negative_skills: [milestone-health-review]

  - id: route-milestone-not-pipeline
    utterance: "how are my committed milestones doing?"
    expected_skill: milestone-health-review
    negative_skills: [pipeline-hygiene-triage]

  - id: route-disambiguation-review
    utterance: "weekly review"
    expected_skill: pipeline-hygiene-triage  # Specialist default
    context:
      role: Specialist

  - id: route-disambiguation-review-csam
    utterance: "weekly review"
    expected_skill: milestone-health-review  # CSAM default
    context:
      role: CSAM

  - id: route-chain-governance
    utterance: "prep me for the Contoso governance meeting"
    expected_skills:
      - mcem-stage-identification
      - milestone-health-review
      - customer-evidence-pack

  - id: route-negative-off-topic
    utterance: "What's the weather like today?"
    expected_skill: null  # No skill should activate
```

### 5.2 Tool Call Correctness Scenarios

```yaml
# evals/fixtures/scenarios/tool-correctness.yaml
scenarios:
  - id: milestone-health-scoped
    skill: milestone-health-review
    context:
      mediums: [crm, vault]
      role: CSAM
      customer: Contoso
    expected_calls:
      - tool: msx:crm_auth_status
        order: 1
      - tool: oil:get_customer_context
        params: { customer: "Contoso" }
        order: 2
      - tool: msx:get_milestones
        params_contains:
          customerKeyword: "Contoso"
          statusFilter: "active"
          includeTasks: true
        order: 3
    forbidden_calls:
      - tool: msx:get_milestones
        params: {}  # unscoped

  - id: morning-brief-parallel
    skill: morning-brief
    context:
      mediums: [crm, vault, workiq]
      role: CSA
    expected_calls:
      - tool: oil:get_vault_context
        phase: 1
      - tool: msx:crm_auth_status
        phase: 1  # parallel with vault
      - tool: msx:get_my_active_opportunities
        phase: 2
      - tool: msx:get_milestones
        phase: 2
        params_contains:
          statusFilter: "active"
          includeTasks: true

  - id: vault-first-crm-query
    skill: vault-context-assembly
    context:
      mediums: [crm, vault]
    expected_sequence:
      - oil:get_vault_context  # must come before any CRM call
      - oil:get_customer_context
      - msx:*             # any CRM call must follow vault
```

### 5.3 Anti-Pattern Scenarios

```yaml
# evals/fixtures/scenarios/anti-patterns.yaml
scenarios:
  - id: ap001-unscoped-milestones
    description: "Agent must not call get_milestones without scoping"
    utterance: "show me all my milestones"
    forbidden_patterns:
      - AP-001  # get_milestones with no scope param

  - id: ap003-no-loop
    description: "Agent must batch, not loop"
    utterance: "Contoso milestone status for all opportunities"
    forbidden_patterns:
      - AP-003  # sequential per-opp calls
    expected_pattern: "single get_milestones with customerKeyword"

  - id: ap004-vault-skip
    description: "Agent must use vault when available"
    utterance: "what's happening with Fabrikam?"
    context:
      mediums: [crm, vault]
    forbidden_patterns:
      - AP-004  # vault available but skipped
    expected_calls:
      - tool: oil:get_customer_context
        before: msx:*

  - id: ap005-write-gate
    description: "Agent must confirm before CRM writes"
    utterance: "update the milestone status to at-risk"
    forbidden_patterns:
      - AP-005  # write without confirmation
    expected_behavior: "dry-run preview shown before execution"

  - id: ap010-role-first
    description: "Agent must establish role before write guidance"
    utterance: "create a new milestone for the Azure migration"
    forbidden_patterns:
      - AP-010  # role assumed without confirmation
```

---

## 6. Scoring Model

### Per-Scenario Scores

| Dimension | Weight | Scoring | Constants |
|---|---|---|---|
| Skill routing | 25% | Binary: correct activation / not | `SCORING_WEIGHTS.skillRouting` |
| Tool call correctness | 30% | % of expected calls present with correct params | `SCORING_WEIGHTS.toolCorrectness` |
| Anti-pattern avoidance | 20% | Severity-weighted: `1 - Σ(penalty_per_violation)` | `SCORING_WEIGHTS.antiPatterns` |
| Output format compliance | 15% | % of required sections/columns present | `SCORING_WEIGHTS.outputFormat` |
| Context efficiency | 10% | Budget ratio below threshold | `SCORING_WEIGHTS.contextEfficiency` |

### Aggregate Scores

```
Skill Score = Σ(dimension_weight × dimension_score) across all scenarios for that skill
Instruction Score = Avg(skill_scores) for skills governed by that instruction
Overall Score = Avg(all skill scores)
```

### Pass/Fail Thresholds

| Level | Threshold | Consequence |
|---|---|---|
| 🟢 Pass | ≥85% | Ship |
| 🟡 Review | 70–84% | Manual review, likely fine |
| 🔴 Fail | <70% | Block merge, investigate |

---

## 7. Implementation Phases

### Phase 1: Scenario Fixtures + Rule-Based Judges (offline, no LLM) — ✅ Complete

**Goal**: Validate tool-call patterns from captured traces.

**Delivered**:
- 5 YAML scenario files covering the top skills
- 4 judges: `tool-sequence`, `anti-pattern` (severity-weighted), `output-format` (header-only columns), `llm-judge`
- 3 mock MCP servers (CRM, OIL, M365) with fixture loading + factory support
- 3 synthetic fixture generators (`crm-factory`, `oil-factory`, `m365-factory`) + schema guard
- Vitest suite: `npm run eval` with `json-persist` reporter
- Context budget hard failures (6K instruction limit, 8K skill limit, 40% chain budget)
- Current baseline: 92.9% across 7 scenarios

### Phase 2: Live Agent Loop (requires LLM API) — ✅ Complete

**Goal**: Run the full agent against mock servers, validate end-to-end.

**Delivered**:
- Live eval harness with system prompt assembly from real instruction/skill files
- 32 mock tools (full CRM + OIL + M365 coverage) with tool name mapping
- 5 E2E live scenarios loaded from YAML (`live-scenarios.yaml`)
- LLM-as-judge (5 dimensions, 1–5 scale) with exponential backoff retry
- Multi-model comparison support (4 model profiles: gpt-4o-mini, gpt-4o, gpt-4.1-mini, gpt-4.1)
- Write safety verification: staged writes + no `execute_*` bypass + count match
- Trace capture integration (`--capture-trace` flag)
- Current live score: 94.0% across 5 scenarios

### Phase 3: Regression + Diff Evals — ✅ Complete

**Goal**: Catch regressions when skills/instructions change.

**Delivered**:
- Custom Vitest reporter (`json-persist.ts`) persisting results with git metadata
- `baseline.json` (committed) + `latest.json` + `history/` (gitignored)
- `eval-persist.js` script: `--baseline`, `--diff`, `--history`, `--fail-on-regression`
- Golden trace infrastructure: `types.ts`, `trace-harness.ts` (capture/promote/regression)
- Schema version stamps for trace staleness detection
- `capture-fixtures.js` with PII scrubbing (`scrub-map.json`)
- `sync-mock-tools.js` for MOCK_TOOLS drift prevention

---

## 8. Relation to Tool Consolidation

Tool consolidation (57 → 41) directly impacts evals:

| Consolidation | Eval Impact |
|---|---|
| Staging queue 5→2 | Fewer tool names in traces; update scenario fixtures |
| Opportunity queries 2→1 | Update `scope` param expectations in scenarios |
| Metadata picklists 2→1 | Update tool name in scenario fixtures |
| Team management 2→1 | Update `recordType` param expectations |
| `close_task` → `update_task` | Remove `close_task` from expected calls |
| OIL write consolidation | Update vault-write scenarios |

**Recommendation**: Build eval fixtures using the **post-consolidation** tool names. Add backward-compat aliases in scenario fixtures for transition period.

---

## 9. Extending the OIL Bench Pattern

The existing `mcp/oil/bench/` harness measures server-level metrics. The new eval framework measures agent-level behavior. They complement each other:

| Dimension | OIL Bench (existing) | Skill Evals (new) |
|---|---|---|
| **Scope** | Single MCP server | Full agent across multiple servers |
| **What's measured** | Latency, tokens, recall, call count | Skill routing, tool correctness, anti-patterns |
| **Test data** | Fixture vault | Fixture vault + mock CRM + mock M365 |
| **Execution** | Direct function calls | Agent LLM loop or trace replay |
| **Cost** | Free (no LLM) | Phase 1 free, Phase 2 requires LLM API |
| **CI integration** | `npm run bench` in `mcp/oil` | `npm run eval` at repo root |

The fixture vault from `mcp/oil/bench/fixtures/vault/` is reused as the OIL mock server backing store.

---

## 10. Scenario Coverage Matrix

A tracking table mapping skills → eval scenarios → coverage:

| Skill | Routing | Tool Calls | Anti-Patterns | Output | Budget | Status |
|---|---|---|---|---|---|---|
| morning-brief | ✅ | ✅ | AP-004,009 | ✅ | ✅ | Phase 1 |
| milestone-health-review | ✅ | ✅ | AP-001,003 | ✅ | - | Phase 1 |
| pipeline-hygiene-triage | ✅ | ✅ | AP-001 | ✅ | - | Phase 1 |
| vault-context-assembly | ✅ | ✅ | AP-004,008 | - | - | Phase 1 |
| mcem-stage-identification | ✅ | ✅ | AP-006 | ✅ | - | Phase 1 |
| risk-surfacing | ✅ | ✅ | AP-004 | ✅ | - | Phase 1 |
| task-hygiene-flow | ✅ | ✅ | AP-005 | ✅ | - | Phase 1 |
| role-orchestration | ✅ | ✅ | AP-010 | - | - | Phase 1 |
| customer-evidence-pack | ✅ | ✅ | AP-009 | ✅ | - | Phase 1 |
| exit-criteria-validation | ✅ | ✅ | AP-006 | ✅ | - | Phase 1 |
| *remaining 29 skills* | - | - | - | - | - | Phase 2+ |

---

## 11. Open Questions — Resolved

1. **Trace capture**: ✅ Resolved — Live eval harness captures traces via `--capture-trace` flag. `trace-harness.ts` provides review/promote/regression CLI. Golden traces stored in `evals/traces/golden/`.
2. **LLM cost**: ✅ Resolved — `live/config.ts` includes `estimateCost()`. Live evals are `skipIf(!HAS_AZURE_ENDPOINT)` so offline runs are free.
3. **Multi-model**: ✅ Resolved — 4 model profiles in `config.ts`. Set `EVAL_MODELS=gpt-4o-mini,gpt-4o` for comparison runs.
4. **Instruction versioning**: ✅ Resolved — `json-persist.ts` captures git commit/branch per run. `eval-persist.js --diff` compares against baseline. Traces carry schema version stamps.
5. **Skill chain depth**: ✅ Resolved — `context-budget.eval.ts` measures chain budget as % of context window. Hard fail at 40% for the `morning-brief` chain.
