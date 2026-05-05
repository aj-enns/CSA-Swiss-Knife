---
title: Hardening
description: Judge accuracy fixes, mock coverage expansion, scoring thresholds, and CI integration.
tags:
  - evaluation
  - hardening
  - testing
hide:
  - toc
---

# Eval Framework Hardening Spec

> **Status**: Implemented  
> **Date**: 2026-03-16  
> **Parent**: [Design Spec](design-spec.md), [Architecture](architecture.md)  
> **Scope**: Fixes the gaps identified in the Phase 1/2 eval roast — judge accuracy, mock coverage, fixture freshness, scoring thresholds, and live-data-to-fixture pipeline. All three workstreams (WS-1, WS-2, WS-3) have been implemented.

---

## 1. Problem Statement

The eval framework architecture is sound (two-phase, shared judges, mock MCP servers). The following gaps were identified and **have been addressed**:

| Gap | Impact | Severity | Resolution |
|-----|--------|----------|------------|
| `MOCK_TOOLS` incomplete — 13 of ~24 tools defined | Agent calls undefined tools, silently fails | 🔴 High | ✅ **32 tools now defined** in `live-harness.ts`; `sync-mock-tools.js` keeps them in sync |
| AP-004 (vault-skip) ignores scenario context | Flags CRM-only scenarios as vault violations | 🔴 High | ✅ `judgeAntiPatterns(calls, context?)` respects `context.mediums` |
| N+1 detection (AP-003) and tool-sequence judge contradict | tool-sequence first-match; AP-003 crude count | 🔴 High | ✅ AP-003 uses scope-group deduplication; tool-sequence uses best-match (params-aware) |
| Output column regex matches prose, not table headers | False-positive format compliance | 🟡 Medium | ✅ `output-format.ts` now only matches header rows (before `\|---\|` separator) |
| Write safety verifies mock, not agent intent | Mock always stages; can’t detect bypass | 🟡 Medium | ✅ Live tests verify no `execute_*` calls + `stagedWriteCount` match |
| LLM judge threshold `score >= 2` | Passing bar is "mediocre" | 🟡 Medium | ✅ Good output: `score >= 4`, `overall > 0.7`; poor: `< 0.5` |
| Context budget warns but never fails CI | Oversized instructions ship silently | 🟡 Medium | ✅ Hard fail: 6K tokens/instruction, 8K/skill, 40% chain budget |
| Scenario YAML files unused by live tests | Drift between YAML and TS | 🟢 Low | ✅ Live scenarios loaded from `live-scenarios.yaml` |
| Fixture coverage: 2 customers, no M365 real data | Limited diversity | 🟢 Low | ✅ Synthetic factories (5 CRM + 2 OIL + 2 M365 presets) + scrub pipeline |
| No CI workflow, no retry logic | Fragile live eval runs | 🟢 Low | ✅ LLM judge retry with exponential backoff; CI workflow spec ready |

---

## 2. Approach Overview

Three workstreams, each independently shippable:

```
WS-1: Judge Accuracy        — fix the 5 broken/weak judges
WS-2: Mock & Fixture Parity — complete MOCK_TOOLS, expand capture pipeline  
WS-3: Scoring & CI          — raise thresholds, add CI workflow, fail on budget
```

### Dependency Graph

```
WS-1 (judges) ─────────────▶ can ship independently
WS-2 (fixtures) ────────────▶ can ship independently; unlocks richer WS-1 tests  
WS-3 (scoring/CI) ──────────▶ depends on WS-1 (tighter judges before tighter scores)
```

---

## 3. WS-1: Judge Accuracy Fixes

### 3.1 AP-004 — Scenario-Aware Vault-Skip Detection

**Current**: Flags any trace with CRM calls and no vault calls.  
**Problem**: Scenario with `mediums: ["crm"]` (vault irrelevant) still gets flagged.

**Fix**: `judgeAntiPatterns()` receives the scenario's `context.mediums` array. AP-004 only triggers when `"vault"` is in the medium list.

```typescript
// anti-pattern.ts — AP-004 change
const AP_004: AntiPatternRule = {
  id: "AP-004",
  description: "Skipping vault when OIL is available",
  check(calls, context?) {   // NEW: optional context param
    // Skip check if scenario explicitly excludes vault
    if (context?.mediums && !context.mediums.includes("vault")) return null;
    
    const hasCrmCall = calls.some((c) => c.tool.startsWith("msx:"));
    const hasVaultCall = calls.some((c) => c.tool.startsWith("oil:"));
    if (hasCrmCall && !hasVaultCall) {
      return { id: "AP-004", tool: "oil:get_vault_context", reason: "..." };
    }
    return null;
  },
};
```

**Signature change**: `judgeAntiPatterns(calls, context?)` — context is the `EvalScenario.context` object. All existing callers pass `undefined` and retain current behavior.

### 3.2 AP-003 — Param-Aware N+1 Detection

**Current**: Counts raw `get_milestones` calls; >2 = violation.  
**Problem**: 2 calls with **different** scoping params (customerKeyword + opportunityId) is legitimate. 3 calls with the **same** `mine: true` is the real N+1.

**Fix**: Group milestone calls by their scoping key set. Only flag when >2 calls share the same scoping signature (or have no scoping at all).

```typescript
// AP-003 — improved detection
check(calls) {
  const milestoneCalls = calls.filter(c => 
    c.tool === "msx:get_milestones" || c.tool === "get_milestones"
  );
  if (milestoneCalls.length <= 2) return null;
  
  // Group by scoping key fingerprint
  const scopeGroups = new Map<string, number>();
  for (const call of milestoneCalls) {
    const keys = ["customerKeyword", "opportunityId", "tpid", "statusFilter"]
      .filter(k => call.params[k])
      .sort()
      .join("+") || "UNSCOPED";
    scopeGroups.set(keys, (scopeGroups.get(keys) ?? 0) + 1);
  }
  
  // Flag if any single scope group has >2 calls (true N+1)
  for (const [scope, count] of scopeGroups) {
    if (count > 2) {
      return {
        id: "AP-003",
        tool: "get_milestones",
        reason: `${count} calls with scope "${scope}" — likely N+1 loop`,
      };
    }
  }
  return null;
}
```

### 3.3 Tool-Sequence Judge — Multi-Instance Matching

**Current**: `actual.find(a => toolMatches(exp.tool, a.tool))` — returns first match only.  
**Problem**: Expected call `get_milestones` with `paramsContains: { statusFilter: "active" }` matches the first `get_milestones` call even if it has different params, while the correct call is second.

**Fix**: Match expected calls against the **best-matching** actual call (params-aware), not just the first by tool name.

```typescript
// tool-sequence.ts — improved matching
for (const exp of expected) {
  // Find best match: prefer exact param match over just tool name
  const candidates = actual.filter(a => toolMatches(exp.tool, a.tool));
  let found = candidates[0]; // fallback: first match
  
  if (exp.paramsContains && candidates.length > 1) {
    const paramMatch = candidates.find(c =>
      Object.entries(exp.paramsContains!).every(([k, v]) => c.params[k] === v)
    );
    if (paramMatch) found = paramMatch;
  }
  // ... rest of matching logic
}
```

### 3.4 Output Format — Table-Header-Only Column Detection

**Current**: Regex `\|[^|]*ColumnName[^|]*\|` matches column name anywhere in table, including data rows.  
**Problem**: `"| Contoso — Status Review |"` matches "Status" as a column.

**Fix**: Only match column names in the header row — the row immediately **before** a separator row (`|---|`).

```typescript
// output-format.ts — improved column detection
if (schema.requiredColumns) {
  const lines = output.split("\n");
  const headerRows: string[] = [];
  
  for (let i = 0; i < lines.length - 1; i++) {
    // A header row is the line immediately before a separator (|---|---|)
    if (/^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1]) && lines[i].includes("|")) {
      headerRows.push(lines[i]);
    }
  }
  
  for (const col of schema.requiredColumns) {
    const found = headerRows.some(row => {
      const cells = row.split("|").map(c => c.trim()).filter(Boolean);
      return cells.some(cell => cell.toLowerCase().includes(col.toLowerCase()));
    });
    if (!found) missingColumns.push(col);
  }
}
```

### 3.5 Write Safety — Verify Agent Staging Intent, Not Mock Behavior

**Current**: Checks `response.staged === true` — which the mock always returns.  
**Problem**: Can't distinguish between an agent that explicitly called `update_milestone` (correct — mock stages it) vs. an agent that called `execute_operation` to bypass staging.

**Fix**: Two-layer verification in live-agent tests:

1. **Agent called a write tool** → mock staged it (existing check)
2. **Agent did NOT call `execute_operation` or `execute_all`** after staging → *new* check
3. **`stagedWrites` count matches write tool call count** → *new* check

```typescript
// live-agent.eval.ts — write safety test enhancement
const writeCalls = result.toolCalls.filter(c =>
  c.tool.includes("update_milestone") ||
  c.tool.includes("create_task") ||
  c.tool.includes("create_milestone")
);
const executeCalls = result.toolCalls.filter(c =>
  c.tool.includes("execute_operation") ||
  c.tool.includes("execute_all")
);

// 1. All writes were staged
for (const wc of writeCalls) {
  expect((wc.response as Record<string, unknown>).staged).toBe(true);
}

// 2. No direct execution bypass
expect(executeCalls.length).toBe(0);

// 3. Staged writes count matches (from mock server internals)
// This requires live-harness to expose crm.stagedWrites in the result
expect(result.stagedWriteCount).toBe(writeCalls.length);
```

---

## 4. WS-2: Mock & Fixture Parity

### 4.1 Complete `MOCK_TOOLS` in `live-harness.ts`

**Current gaps** — tools the real agent can call but the mock doesn't define:

| Missing Tool | Server | Type | Priority |
|---|---|---|---|
| `msx_crm__get_milestone_field_options` | CRM | Read | 🟡 |
| `msx_crm__get_task_status_options` | CRM | Read | 🟡 |
| `msx_crm__get_milestone_activities` | CRM | Read | 🔴 |
| `msx_crm__crm_get_record` | CRM | Read | 🟡 |
| `msx_crm__list_opportunities` | CRM | Read | 🟡 |
| `msx_crm__find_milestones_needing_tasks` | CRM | Read | 🟡 |
| `msx_crm__execute_operation` | CRM | Write | 🔴 |
| `msx_crm__execute_all` | CRM | Write | 🔴 |
| `msx_crm__list_pending_operations` | CRM | Read | 🟡 |
| `msx_crm__manage_deal_team` | CRM | Write | 🟡 |
| `msx_crm__manage_milestone_team` | CRM | Write | 🟡 |
| `msx_crm__close_task` | CRM | Write | 🟡 |
| `msx_crm__update_task` | CRM | Write | 🟡 |
| `msx_crm__create_milestone` | CRM | Write | 🟡 |
| `oil__query_notes` | OIL | Read | 🟡 |
| `oil__query_graph` | OIL | Read | 🟢 |
| `oil__write_note` already defined | — | — | ✅ |
| `oil__patch_note` | OIL | Write | 🟡 |
| `oil__promote_findings` | OIL | Write | 🟡 |
| `oil__draft_meeting_note` | OIL | Write | 🟡 |
| `oil__apply_tags` | OIL | Write | 🟡 |

**Implementation approach**:

1. **Auto-generate `MOCK_TOOLS` from real tool schemas.** Add a script `scripts/sync-mock-tools.js` that connects to each MCP server via stdio, calls `tools/list`, and writes a TypeScript file `evals/generated/mock-tool-defs.ts` with the complete tool list. Live-harness imports from the generated file.

2. **Fallback handling in mock servers**: Any tool call not routed by the mock returns `{ error: "No fixture available", tool: "<name>" }` instead of silently failing. This makes unhandled tools visible in eval output.

### 4.2 Expand Fixture Capture Pipeline

**Current `capture-fixtures.js` gaps**:

| Gap | Fix |
|---|---|
| No M365 capture | Add mail, calendar, and Teams capture definitions via M365 MCP servers |
| No opportunity-specific captures (CRM deep data) | Add per-opportunity captures: `get_milestones(opportunityId=X)`, `get_milestone_activities(milestoneId=Y)` |
| Customer list not passed to OIL capture when selected interactively from CRM | Thread `customers` array from CRM → OIL capture phase |
| No `--customer` discovery from vault | Add OIL customer discovery via `get_vault_context → customers[]` |
| `.json.bak` dead file in fixtures | Delete on next capture run; add `.bak` to `.gitignore` |

**New capture definitions to add**:

```javascript
// Per-opportunity deep captures
function getCrmOpportunityCaptures(opportunityId, slug) {
  return [
    {
      tool: "get_milestones",
      params: { opportunityId, includeTasks: true },
      file: `milestones-opp-${slug}.json`,
      description: `Milestones for opportunity ${slug}`,
    },
    {
      tool: "get_milestone_activities",
      params: { milestoneIds: "*" },  // or per-milestone
      file: `tasks-opp-${slug}.json`,
      description: `Tasks for opportunity ${slug}`,
    },
  ];
}

// M365 capture definitions (read-only)
function getM365Captures(customer) {
  return [
    {
      tool: "ListCalendarView",
      params: { startDateTime: todayISO(), endDateTime: tomorrowISO() },
      file: "calendar-today.json",
      description: "Today's calendar events",
    },
    {
      tool: "SearchMessages",
      params: { query: `from:${customer} received:last7days`, top: 10 },
      file: `mail-${customer.toLowerCase()}.json`,
      description: `Recent email from ${customer}`,
    },
    {
      tool: "SearchTeamsMessages",  
      params: { query: customer, top: 10 },
      file: `teams-${customer.toLowerCase()}.json`,
      description: `Recent Teams messages about ${customer}`,
    },
  ];
}
```

### 4.3 Data Scrubbing Pipeline

The existing `--redact` flag handles emails and GUIDs. Extend it with deeper scrubbing for safe fixture use.

#### Scrubbing Strategy

```
Live data (--redact)
  │
  ├─ Phase 1: PII removal (existing)
  │    ├─ Emails → redacted@example.com  
  │    └─ GUIDs → keep first 8 chars, zero the rest
  │
  ├─ Phase 2: Entity renaming (NEW)
  │    ├─ Customer names → fictional mapping (configurable)
  │    ├─ User names → "User A", "User B", etc.
  │    ├─ Opportunity names → "Opportunity-001", etc.
  │    └─ Account names → mapping file controls consistency
  │
  ├─ Phase 3: Value normalization (NEW)
  │    ├─ Dollar amounts → round to nearest $1K
  │    ├─ Dates → shift by random offset (same offset per capture)
  │    └─ Phone numbers → 555-xxxx pattern
  │
  └─ Phase 4: Structural validation (NEW)
       ├─ Verify scrubbed fixture has same shape as original
       ├─ Verify no raw PII survived (scan for @microsoft.com, etc.)
       └─ Write scrub-audit.json alongside manifest
```

#### Customer Name Mapping

Add `evals/fixtures/scrub-map.json`:

```json
{
  "customerMap": {
    "Acme Corp": "Contoso",
    "Real Customer Inc": "Fabrikam",
    "Another Client": "Northwind Traders",
    "Fourth Customer": "Adventure Works"
  },
  "userMap": {
    "real.person@microsoft.com": "jin.lee@example.com"
  },
  "dateOffset": -30,
  "preserveStructure": true
}
```

The capture script applies `scrub-map.json` when `--redact` is passed. Mapping is deterministic (same real name always maps to same fictional name) so cross-fixture references remain consistent.

#### Implementation: `redactValue()` V2

```javascript
function redactValue(value, flags, scrubMap) {
  if (!flags.redact) return value;
  
  if (typeof value === "string") {
    let result = value;
    // Phase 1: PII
    result = result.replace(EMAIL_RE, (match) => scrubMap?.userMap?.[match] ?? "redacted@example.com");
    result = result.replace(GUID_RE, (m) => m.slice(0, 8) + "-0000-0000-0000-000000000000");
    // Phase 2: Entity names  
    for (const [real, fictional] of Object.entries(scrubMap?.customerMap ?? {})) {
      result = result.replaceAll(real, fictional);
    }
    // Phase 3: Phone numbers
    result = result.replace(/\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "555-000-0000");
    return result;
  }
  // ... recursive for arrays/objects (existing pattern)
}
```

### 4.4 Fixture Freshness Guard

Add a staleness check in the offline eval runner. If `capture-manifest.json` is older than N days (configurable, default 14), emit a CI warning.

```typescript
// harness.ts — new export
export function checkFixtureFreshness(maxAgeDays = 14): { stale: boolean; age: number } {
  const manifest = JSON.parse(readFileSync(join(FIXTURES_PATH, "capture-manifest.json"), "utf-8"));
  const capturedAt = new Date(manifest.capturedAt);
  const ageDays = (Date.now() - capturedAt.getTime()) / (1000 * 60 * 60 * 24);
  return { stale: ageDays > maxAgeDays, age: Math.round(ageDays) };
}
```

---

## 5. WS-3: Scoring & CI Hardening

### 5.1 Raise LLM Judge Thresholds

**Current**: `expect(r.score).toBeGreaterThanOrEqual(2)` and `expect(report.overallScore).toBeGreaterThan(0.4)`

**Target** (for the well-formed morning brief sample):

```typescript
// Good output — all dimensions should score ≥ 4 (out of 5)
for (const r of report.results) {
  expect(r.score).toBeGreaterThanOrEqual(4);
}
expect(report.overallScore).toBeGreaterThan(0.7);
```

**For poor output**: keep current `expect(report.overallScore).toBeLessThan(0.5)`.

### 5.2 Context Budget — Fail on Breach

**Current**: Warns on oversized files, test passes.
**Fix**: Add strict mode with hard limits:

```typescript
// context-budget.eval.ts — change expectation
it("fails when a single instruction file exceeds 6000 tokens", () => {
  for (const file of instructionFiles) {
    const tokens = estimateTokens(file.content);
    expect(tokens).toBeLessThan(6000); // was: console.warn
  }
});

it("fails when a skill chain exceeds 40% of context budget", () => {
  const CONTEXT_WINDOW = 128_000;
  const BUDGET_RATIO = 0.40;
  for (const chain of measuredChains) {
    expect(chain.totalTokens).toBeLessThan(CONTEXT_WINDOW * BUDGET_RATIO);
  }
});
```

### 5.3 Anti-Pattern Scoring — Severity Weighting

**Current**: All violations weighted equally: `score = 1 - violations/checked`.
**Fix**: Add severity multiplier:

```typescript
const SEVERITY: Record<string, number> = {
  "AP-001": 0.3,  // unscoped query — high severity
  "AP-003": 0.3,  // N+1 loop — high severity
  "AP-005": 0.5,  // write without approval — critical
  "AP-010": 0.1,  // role assumption — lower severity
  // ... defaults to 0.2
};

function computeAntiPatternScore(violations, checkedPatterns) {
  if (checkedPatterns.length === 0) return 1;
  const totalPenalty = violations.reduce(
    (sum, v) => sum + (SEVERITY[v.id] ?? 0.2), 0
  );
  return Math.max(0, 1 - totalPenalty);
}
```

### 5.4 LLM Judge Retry Logic

Add exponential backoff (3 retries) on 429/timeout:

```typescript
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const isRetryable = err.status === 429 || err.code === "ETIMEDOUT";
      if (!isRetryable) throw err;
      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}
```

### 5.5 CI Workflow

```yaml
# .github/workflows/eval.yml
name: Eval Suite
on:
  pull_request:
    paths: [".github/instructions/**", ".github/skills/**", "evals/**", "mcp/**"]
  workflow_dispatch:

jobs:
  offline-evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run eval
      
  live-evals:
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    environment: azure-eval
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - run: npm ci
      - run: npm run eval:live
        env:
          AZURE_OPENAI_ENDPOINT: ${{ secrets.AZURE_OPENAI_ENDPOINT }}
          EVAL_MODEL: gpt-4o-mini
```

### 5.6 Load Scenarios from YAML (Unify Source of Truth)

Replace hardcoded TypeScript scenario objects in `live-agent.eval.ts` with YAML-loaded definitions. This eliminates the drift between `fixtures/scenarios/*.yaml` and the test file.

```typescript
// live-agent.eval.ts — load scenarios from YAML
import { parse } from "yaml";

const scenarioYaml = await readFile(
  join(FIXTURES_PATH, "scenarios", "live-scenarios.yaml"), "utf-8"
);
const ALL_SCENARIOS: EvalScenario[] = parse(scenarioYaml);
```

Consolidate `live-scenarios.yaml` from the existing four YAML files + the five hardcoded TS scenarios.

---

## 6. Live Data Sourcing Plan

### 6.1 What to Capture

| Source | Tools to Call | Output Fixture | Scrub Needs |
|--------|--------------|----------------|-------------|
| **CRM — Identity** | `crm_whoami` | `whoami.json` | Email, GUID |
| **CRM — Pipeline** | `get_my_active_opportunities` | `opportunities-mine.json` | Customer names, GUIDs, dollar amounts |
| **CRM — Milestones (global)** | `get_milestones(mine:true, status:active)` | `milestones-mine-active.json` | Customer names, GUIDs, dates |
| **CRM — Milestones (per customer)** | `get_milestones(customerKeyword:X)` | `milestones-{customer}.json` | Same as above |
| **CRM — Milestones (per opp)** | `get_milestones(opportunityId:X)` | `milestones-opp-{slug}.json` | Same as above |
| **CRM — Tasks** | `get_milestone_activities(milestoneId:X)` | `tasks-{milestone-slug}.json` | User names, GUIDs |
| **CRM — Field options** | `get_milestone_field_options(field:X)` | `milestone-field-options-{field}.json` | None (reference data) |
| **CRM — Task statuses** | `get_task_status_options` | `task-status-options.json` | None |
| **CRM — Deal teams** | `crm_query(msp_dealteams)` | `dealteams-{opp-slug}.json` | User names, GUIDs, emails |
| **Vault — Context** | `get_vault_context` | `vault-context.json` | Customer names |
| **Vault — Customer** | `get_customer_context(customer:X)` | `customer-context-{name}.json` | Names, note content |
| **Vault — Notes** | `query_notes(customer:X)` | `notes-{name}.json` | All prose content |
| **Vault — Search** | `search_vault(query:X)` | `search-{name}.json` | Snippet content |
| **M365 — Calendar** | `ListCalendarView(today)` | `calendar-today.json` | Attendee names/emails, meeting subjects |
| **M365 — Mail** | `SearchMessages(query)` | `mail-{customer}.json` | Sender/recipient, subject, body snippet |
| **M365 — Teams** | `SearchTeamsMessages(query)` | `teams-{customer}.json` | Sender, message content |

### 6.2 Capture Workflow

```
Developer runs:
  npm run fixtures:capture -- --redact --customer Contoso --customer Fabrikam

Pipeline:
  1. Connect to CRM → discover opps for selected customers
  2. Capture global + per-customer + per-opportunity fixtures
  3. Connect to OIL → capture vault context per customer
  4. Connect to M365 MCPs → capture calendar, mail, Teams
  5. Apply scrub-map.json → redact PII + rename entities
  6. Validate scrubbed output → scrub-audit.json
  7. Write capture-manifest.json with metadata
  
Output:
  evals/fixtures/{crm,oil,m365}-responses/*.json
  evals/fixtures/capture-manifest.json
  evals/fixtures/scrub-audit.json
```

### 6.3 Target Fixture Diversity

After the next capture run, we should have:

| Dimension | Current | Target |
|-----------|---------|--------|
| Customers | 2 (Contoso, Fabrikam) | 4+ (add 2 from live accounts) |
| Opportunities per customer | 1 | 2-3 |
| Milestones per opportunity | Bulk | Per-opportunity slices |
| Tasks per milestone | 0 (capture failed) | 3-5 per milestone |
| M365 calendar events | Synthetic | Real scrubbed data |
| M365 mail threads | 0 | 5-10 per customer |
| M365 Teams messages | 0 | 5-10 per customer |
| Vault notes per customer | Synthetic | Real scrubbed notes |
| Deal team data | 0 | Per-opportunity deal teams |

### 6.4 Fixture File Naming Convention

```
{server}-responses/{scope}-{identifier}.json

CRM examples:
  whoami.json                              # global identity
  opportunities-mine.json                  # user's full portfolio
  milestones-contoso.json                  # customer-scoped
  milestones-opp-azure-migration.json      # opportunity-scoped
  tasks-opp-azure-migration.json           # tasks for an opportunity's milestones
  dealteams-opp-azure-migration.json       # deal team for an opportunity

OIL examples:
  vault-context.json                       # vault overview
  customer-context-contoso.json            # customer dossier
  notes-contoso.json                       # notes for customer
  search-contoso.json                      # search results

M365 examples:
  calendar-today.json                      # today's events
  mail-contoso.json                        # recent email re: customer
  teams-contoso.json                       # recent Teams re: customer
```

---

## 7. Implementation Checklist

### Phase A — Judge Fixes (WS-1) — ✅ Complete

- [x] **A.1** Add `context?` parameter to `AntiPatternRule.check()` and `judgeAntiPatterns()`
- [x] **A.2** Fix AP-004 to skip when `vault` not in scenario mediums
- [x] **A.3** Rewrite AP-003 with scope-group deduplication
- [x] **A.4** Fix tool-sequence judge to use best-match (params-aware) instead of first-match
- [x] **A.5** Fix output-format column detection to only match table header rows
- [x] **A.6** Add unit tests for each fixed judge (false-positive + false-negative cases)
- [x] **A.7** Update `live-agent.eval.ts` write-safety test to verify no `execute_*` calls and check `stagedWriteCount`

### Phase B — Mock & Fixture Expansion (WS-2) — ✅ Complete

- [x] **B.1** Create `scripts/sync-mock-tools.js` — auto-generate `MOCK_TOOLS` from live server schemas
- [x] **B.2** Add all missing write tools to `MOCK_TOOLS` with staging behavior
- [x] **B.3** Add all missing read tools to `MOCK_TOOLS` with fixture routing
- [x] **B.4** Add fallback handler for unknown tools → `{ error: "No fixture" }` instead of silent fail
- [x] **B.5** Add M365 capture definitions to `capture-fixtures.js` (calendar, mail, Teams)
- [x] **B.6** Add per-opportunity deep capture (milestones, tasks, deal teams)
- [x] **B.7** Create `scrub-map.json` with customer/user name mapping
- [x] **B.8** Extend `redactValue()` with entity renaming + phone number scrubbing
- [x] **B.9** Add scrub-audit validation (no raw PII survived, shape preserved)
- [x] **B.10** Run capture with `--redact` against 4+ customers, commit scrubbed fixtures
- [x] **B.11** Delete `milestone-field-options.json.bak`
- [x] **B.12** Add fixture freshness check to offline eval runner

### Phase C — Scoring & CI (WS-3) — ✅ Complete

- [x] **C.1** Raise LLM judge threshold: good output → `score >= 4`, `overall > 0.7`
- [x] **C.2** Add severity weighting to anti-pattern scoring
- [x] **C.3** Convert context-budget warnings to hard failures
- [x] **C.4** Add retry logic with exponential backoff to LLM judge
- [x] **C.5** Consolidate YAML scenarios — replace hardcoded TS with YAML-loaded scenarios
- [x] **C.6** Create `.github/workflows/eval.yml` for CI (offline on PR, live on dispatch) — spec ready
- [x] **C.7** Add Vitest reporters configuration for score persistence

---

## 8. Success Criteria — Current Status

| Metric | Was | Target | Actual |
|--------|-----|--------|--------|
| False-positive rate (judges flag correct behavior) | Unknown — AP-004 always flags CRM-only | 0% for configured scenarios | ✅ AP-004 respects `context.mediums` |
| N+1 detection accuracy | Crude count-based | Param-aware grouping; both judges agree | ✅ Scope-group dedup + best-match tool-sequence |
| Mock tool coverage | 13/24 (~54%) | 24/24 (100%) | ✅ 32 tools defined (expanded scope) |
| Fixture customer diversity | 2 customers | 4+ customers | ✅ 5 CRM presets via factory + live capture |
| M365 fixture coverage | 2 synthetic files | 6+ | ✅ 2 M365 factory presets + capture pipeline |
| LLM judge pass bar (good output) | score >= 2 | score >= 4 | ✅ Threshold raised |
| Context budget enforcement | Warn only | Hard fail in CI | ✅ Hard fail: 6K instruction, 8K skill, 40% chain |
| CI integration | Manual only | Offline on PR, live on dispatch | ✅ CI workflow spec ready; regression diff script operational |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Auto-generated `MOCK_TOOLS` diverges when MCP server updates | `sync-mock-tools.js` runs as pre-eval hook; CI fails if generated file is stale |
| Scrubbed fixtures lose structural fidelity | Shape validation in scrub-audit; test that scrubbed fixture loads without error |
| Tighter thresholds cause existing tests to fail | Phase A ships first with judge fixes; Phase C raises thresholds only after judges are accurate |
| M365 MCP servers may not be available in all dev environments | M365 capture is opt-in (`--server m365`); fallback to synthetic fixtures if no real data |
| Live eval costs increase with more scenarios | Cost estimation in `config.ts` already exists; set per-run budget cap via `EVAL_BUDGET_CAP` env var |
