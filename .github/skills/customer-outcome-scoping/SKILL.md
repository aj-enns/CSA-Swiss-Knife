---
name: customer-outcome-scoping
description: "Customer outcome scoping: defines measurable customer outcomes during Stage 1 qualification. Captures business objectives, success metrics, and baseline measurements to anchor the opportunity in verifiable customer value. Chains with pipeline-qualification for Stage 1 completion. Triggers: customer outcomes, measurable outcomes, success metrics, outcome definition, baseline metrics, customer objectives, what does success look like."
---

# Customer Outcome Scoping

## Purpose
Define **measurable customer outcomes** during Stage 1 (Listen & Consult) so the opportunity is anchored in verifiable customer value from the start. Ensures outcomes are specific, measurable, and agreed upon before progressing to solution design.

## Freedom Level
**Medium** — Outcome definition requires customer context judgment.

## Trigger
- New opportunity entering Stage 1 qualification
- User asks "what does success look like" for a customer
- Milestone planning requires explicit outcome definitions
- CSAM needs success metrics for success plan creation

## Inputs
- Customer name or opportunity identifier
- Customer business objectives (from vault, conversation, or CRM notes)
- Existing success plan or prior engagement context

## Flow

1. **Gather context** — Check vault for customer technology landscape and prior outcomes. Query CRM for opportunity notes and existing success plan links.
2. **Identify business objectives** — Extract or elicit 2–5 concrete business objectives the customer wants to achieve.
3. **Define measurable outcomes** — For each objective, define:
   - **Outcome statement**: What success looks like in customer terms
   - **Metric**: How it will be measured (quantitative where possible)
   - **Baseline**: Current state measurement (or flag as "needs baseline")
   - **Target**: Expected post-deployment state
   - **Timeline**: When the outcome should be realized
4. **Validate alignment** — Confirm outcomes align with the proposed solution play and Microsoft capabilities.
5. **Document** — Output structured outcome table ready for success plan or milestone planning.

## Output Format

| # | Business Objective | Outcome | Metric | Baseline | Target | Timeline |
|---|---|---|---|---|---|---|
| 1 | _objective_ | _what success looks like_ | _how measured_ | _current state_ | _expected state_ | _when_ |

## Boundary Rules
- CSAM owns outcome scoping; Specialist provides pipeline context.
- Outcomes must be customer-visible — avoid internal Microsoft metrics as primary outcomes.
- If baseline data is unavailable, flag it as a Stage 2 prerequisite (instrumentation needed).
- Do not promise delivery timelines — outcomes define "what", not "when we deliver".

## Chain Outputs
- `next_action`: "Outcomes defined. Ready for `pipeline-qualification` to complete Stage 1 exit criteria, or `proof-plan-orchestration` if advancing to Stage 2."
