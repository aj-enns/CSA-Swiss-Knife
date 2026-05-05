---
title: Evaluation Framework
description: Automated testing for skill routing, tool correctness, anti-patterns, and output quality.
tags:
  - evaluation
  - testing
  - quality
hide:
  - toc
---

# Evaluation Framework

The eval framework validates agent behavior across **14 instruction files**, **~39 skills**, and **32 mock tools** — ensuring the agent selects the right skill, calls the right tools, avoids known anti-patterns, and produces correctly formatted output.

!!! success "Current Status"
    **Baseline**: 92.9% (7 offline scenarios) · **Live**: 94.0% (5 E2E scenarios)  
    Last verified: 2026-03-16 · ~50 source files, ~6,000+ lines

---

<div class="grid cards" markdown>

-   :material-cog .lg .middle } __[Architecture & Implementation](architecture.md)__

    ---

    Runtime flow, mock infrastructure, judges, fixtures, live agent loop, regression tracking, and the fixture generator pipeline.

-   :material-clipboard-check:{ .lg .middle } __[Design Spec](design-spec.md)__

    ---

    What we evaluate (5 dimensions), scenario design, scoring model, and implementation phases.

-   :material-shield-check:{ .lg .middle } __[Hardening](hardening.md)__

    ---

    Judge accuracy fixes, mock coverage expansion, scoring thresholds, and CI integration.

-   :material-chart-timeline-variant:{ .lg .middle } __[Regression & Test Data](regression-data.md)__

    ---

    Score persistence, baseline workflow, synthetic fixture generators, golden traces, and capture pipeline.

</div>

---

## Quick Reference

### Running Evals

```bash
npm run eval              # Phase 1 — offline, free, fast
npm run eval:live         # Phase 2 — requires Azure OpenAI
npm run eval:all          # Both phases sequentially
npm run eval:baseline     # Update committed baseline
npm run eval:diff         # Compare latest vs baseline
```

### Eval Dimensions

| Dimension | Weight | Judge |
|---|---|---|
| Skill Routing | 25% | Keyword match from SKILL.md descriptions |
| Tool Correctness | 30% | `tool-sequence.ts` — presence, params, ordering |
| Anti-Pattern Avoidance | 20% | `anti-pattern.ts` — AP-001→AP-010, severity-weighted |
| Output Format | 15% | `output-format.ts` — sections, columns (header-only), tables |
| Context Efficiency | 10% | `context-budget.eval.ts` — token limits, chain budget |

### Pass/Fail Thresholds

| Level | Threshold | Meaning |
|---|---|---|
| :material-check-circle:{ style="color: green" } Pass | ≥ 85% | Ship |
| :material-alert-circle:{ style="color: orange" } Review | 70–84% | Manual review |
| :material-close-circle:{ style="color: red" } Fail | < 70% | Block merge |
