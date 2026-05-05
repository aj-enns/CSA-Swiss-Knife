---
name: non-linear-progression
description: "Non-linear progression: guides MCEM stage loopback when customer readiness gaps, proof failures, or capacity constraints require iteration rather than forward movement. Determines which stage to loop back to and what must be resolved. Triggers: loop back, stage regression, go back a stage, not ready to advance, proof failed, readiness gap, stage loopback, re-qualify, stage regression, iteration needed."
---

# Non-Linear Progression

## Purpose
Guide **MCEM stage loopback** when customer readiness, proof gaps, or capacity constraints require iteration rather than forward progression. Determines the correct stage to return to, what must be resolved before re-advancing, and which role leads the recovery.

## Freedom Level
**Medium** — Loopback routing requires situational judgment.

## Trigger
- Proof execution fails or produces inconclusive results
- Customer readiness gaps surface during delivery (Stage 4 → Stage 2/3)
- Capacity or resource constraints block committed delivery
- `commit-gate-enforcement` determines the opportunity is not ready to commit
- `exit-criteria-validation` shows unmet criteria for the current stage

## Inputs
- Current MCEM stage (from `mcem-stage-identification` or user context)
- Nature of the gap: proof failure, readiness gap, capacity constraint, scope change
- Relevant CRM state (milestone status, commitment status, stage field)

## Flow

1. **Classify the gap** — Determine the root cause category:
   - **Proof gap**: Technical proof incomplete, inconclusive, or failed → loop to Stage 2 (redesign) or Stage 3 (re-execute)
   - **Readiness gap**: Customer not ready for commitment or delivery → loop to Stage 2 (re-align) or Stage 1 (re-qualify)
   - **Capacity constraint**: Resources unavailable for delivery → hold at current stage or loop to Stage 3 (re-scope)
   - **Scope change**: Customer requirements changed materially → loop to Stage 2 (redesign)
2. **Determine target stage** — Based on the gap class, identify which stage the opportunity should functionally operate in.
3. **Identify recovery owner** — Map the target stage to the accountable role per MCEM model:
   - Stage 1: Specialist (re-qualify)
   - Stage 2: Specialist + SE (redesign)
   - Stage 3: SE + CSA/CSAM (re-execute proof, re-validate commitment)
   - Stage 4: CSAM + CSA (re-scope delivery)
4. **Define recovery criteria** — List what must be resolved before the opportunity can re-advance past the loopback point.
5. **Recommend CRM actions** — Flag if the Stage field should be updated, milestone commitment should be reverted, or new milestones are needed.

## Output Format

| Field | Value |
|---|---|
| **Current Stage** | _where the opportunity sits today_ |
| **Gap Type** | _proof / readiness / capacity / scope_ |
| **Loopback Target** | _Stage N_ |
| **Recovery Owner** | _role (unit)_ |
| **Recovery Criteria** | _what must be true to re-advance_ |
| **CRM Actions** | _stage field update, milestone changes, etc._ |

## Boundary Rules
- Loopback is normal — it is not a failure. Frame as iteration toward the right outcome.
- Stage field updates are Specialist-owned. If loopback requires a stage field change, recommend it but redirect execution to Specialist.
- Milestone commitment changes follow the write-gate authority matrix — CSAM/Specialist only.
- Do not recommend closing the opportunity unless the customer has explicitly disengaged. Loopback ≠ loss.

## Chain Outputs
- `next_action`: Based on the loopback target — e.g., "Looping to Stage 2. Next: `architecture-feasibility-check` (CSA) to validate revised design, then `proof-plan-orchestration` (SE) to rebuild proof plan."
