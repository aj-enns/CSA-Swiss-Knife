---
name: delivery-accountability-mapping
description: "Delivery accountability mapping: clarifies who owns execution vs orchestration for committed milestones in Stage 4. Maps delivery owners (Partner, ISD, Unified, internal) and flags when CSAM is treated as delivery owner without decision rights. Triggers: delivery owner, who owns execution, delivery accountability, execution vs orchestration, delivery mapping, CSAM delivery burden, partner delivery, ISD delivery."
---

# Delivery Accountability Mapping

## Purpose
Clarify **who owns execution vs orchestration** for committed milestones in Stage 4 (Realize Value). Prevents the common failure mode where CSAM is held accountable for delivery execution without having decision rights over the delivery resource.

## Freedom Level
**Medium** — Requires judgment on delivery ownership patterns.

## Trigger
- Committed milestones entering delivery phase
- CSAM flagged as delivery owner but actual execution is Partner/ISD/Unified
- Blocked milestones where delivery accountability is unclear
- Post-handoff from `handoff-readiness-validation` (STU→CSU transition)
- `milestone-health-review` surfaces blocked milestones needing accountability clarity

## Inputs
- Opportunity ID or customer name
- Committed milestones with current owner assignments
- Delivery motion context (Partner-led, ISD, Unified, internal)

## Flow

1. **Retrieve committed milestones** — Query CRM for committed milestones on the target opportunity. Include owner, delivery type, and status.
2. **Map accountability** — For each milestone, classify:
   - **Execution Owner**: Who performs the delivery work (Partner, ISD, Unified, CSA, SE)
   - **Orchestration Owner**: Who manages customer expectations and cadence (typically CSAM)
   - **Decision Authority**: Who can change scope, timeline, or approach
   - **Escalation Path**: Where blockers go when execution stalls
3. **Flag mismatches** — Identify milestones where:
   - CSAM is listed as owner but has no execution authority
   - Execution owner is unnamed or generic ("TBD", "Partner")
   - Decision authority is ambiguous between roles
   - Delivery motion (Partner/ISD/Unified) is not reflected in CRM fields
4. **Recommend fixes** — For each mismatch, propose specific owner reassignment or CRM field update.

## Output Format

| Milestone | Execution Owner | Orchestration Owner | Decision Authority | Status | Issue |
|---|---|---|---|---|---|
| _name_ | _who delivers_ | _who orchestrates_ | _who decides_ | _match/mismatch_ | _description if mismatch_ |

## Boundary Rules
- CSAM owns orchestration and customer expectation management, NOT day-to-day delivery execution.
- If CSAM is the listed milestone owner but a Partner/ISD is executing, flag for reassignment — the delivery resource should be the milestone owner.
- CSA owns technical decision authority; CSAM communicates customer-facing implications.
- Specialist owns opportunity field updates; redirect if stage/revenue changes are needed.

## Chain Outputs
- `next_action`: "Accountability mapped. Run `execution-monitoring` (CSA) for architecture guardrail checks on flagged milestones, or `milestone-health-review` (CSAM) for status updates."
