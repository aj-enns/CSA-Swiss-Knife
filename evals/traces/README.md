# Golden Traces

Recorded tool-call traces from verified agent sessions, used for regression testing.

## Directory Structure

```
evals/traces/
├── README.md              ← this file
├── types.ts               ← AgentTrace interface
├── trace-harness.ts       ← capture, promote, and regression-check logic
├── golden/                ← committed, human-verified traces
│   └── *.trace.json
└── captured/              ← gitignored — raw session captures
    └── *.trace.json
```

## Trace Format

Each `.trace.json` file conforms to the `AgentTrace` interface in `types.ts`.
Key fields:

| Field | Description |
|-------|-------------|
| `id` | Unique trace identifier |
| `capturedAt` | ISO-8601 timestamp |
| `model` | Model that produced the trace |
| `userUtterance` | The prompt that triggered the session |
| `toolCalls` | Ordered list of tool calls with params and responses |
| `agentOutput` | Final text output from the agent |
| `verified` | Human verification metadata |
| `schemaVersion` | Tool schema version stamp for staleness detection |

## Workflow

### 1. Capture a trace from a live eval

```bash
npm run eval:live -- --capture-trace
```

Traces are written to `evals/traces/captured/`.

### 2. Review a captured trace

```bash
npm run eval:trace -- --review captured/session-2026-03-16.trace.json
```

### 3. Promote to golden (human-verified)

```bash
npm run eval:trace -- --promote captured/session-2026-03-16.trace.json \
  --quality good --notes "Clean morning brief, correct tool ordering"
```

### 4. Run regression check against golden traces

```bash
npm run eval:trace -- --regression
```

## Regression Check Logic

For each golden trace, the scenario is re-run against mock servers seeded with
the trace's fixture responses. The checker compares:

| Check | Pass Criteria |
|-------|---------------|
| Tool set match | Same tools called (allow superset, flag missing) |
| Tool order match | Same ordering for order-constrained calls |
| Anti-pattern clean | No new violations vs. golden |
| Output structure | Same required sections/columns present |
| Score delta | Overall score within ±5% of golden baseline |

## Staleness

Traces carry a `schemaVersion` stamp. When tool schemas change (detected by
the mock tool definitions in `live-harness.ts`), stale traces are flagged
during regression checks. Update or re-capture stale traces.
