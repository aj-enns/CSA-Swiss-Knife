---
name: mcem-flow
description: "MCEM process spine: maps Stages 1-5 with ATU/STU/CSU accountability, exit criteria, skill activation order, and role orchestration routing. Triggers: stage progression, MCEM exit criteria, role orchestration, commit gates, handoff readiness, expansion routing, which stage, what stage, MCEM, who leads next, team assignment, action paralysis, ATU/STU/CSU routing, which team, next-step owner, who should own, tie-break, conflicting direction, who decides, authority clarification, role disagreement, deadlock, who has final say."
---
# MCEM Sales Process Flow

## Use This File

1. Identify likely stage with `mcem-diagnostics`.
2. Apply the stage row below for accountability and next-skill routing.
3. Use Verifiable Outcomes (VO) from CRM evidence as truth when BPF label disagrees.
4. If user role differs from accountable unit, state lead vs contributor explicitly.

## Stage Spine

| Stage               | Objective                                           | Accountable Unit | Typical Active Roles      | Primary Skills                                                                                | Exit Evidence (VO)                                     |
| ------------------- | --------------------------------------------------- | ---------------- | ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1 Listen & Consult  | Qualify need and define measurable outcomes         | ATU              | AE, ATS, IA, Specialist, CSAM | `pipeline-qualification`, `customer-outcome-scoping`                                      | Open qualified opportunity + initial `msp_salesplay` |
| 2 Inspire & Design  | Shape approach, validate value/design, and **position HoK** | STU              | Specialist, SE, CSA       | `proof-plan-orchestration`, `hok-readiness-check`, `architecture-review`, `pipeline-hygiene-triage` | Play confirmed + BVA complete + success plan linked + HoK positioned |
| 3 Empower & Achieve | Prove, commit, **execute HoK**, and finalize handoff readiness | STU              | Specialist, SE, CSA, CSAM | `commit-gate-enforcement`, `hok-readiness-check`, `handoff-readiness-validation`, `mcem-diagnostics`   | Agreement + committed milestones + dated outcomes + HoK legal coverage confirmed |
| 4 Realize Value     | Execute delivery and protect architecture integrity | CSU              | CSAM, CSA                 | `milestone-health-review`, `se-execution-check`    | Milestone delivery + customer health tracking          |
| 5 Manage & Optimize | Sustain outcomes and route expansion                | CSU              | CSAM, Specialist          | `stage-5-review`      | Sustained value + expansion/next-cycle readiness       |

## Cross-Stage Skills

- `mcem-diagnostics`
- `hok-readiness-check`
- `partner-motion-awareness` (see `shared-patterns` skill § Partner Motion Adjustments)
- `risk-surfacing`

## Role Orchestration

When multiple roles are involved and leadership is unclear, use the MCEM stage accountability model to determine who leads.

### Action Classification

| Action Type | Default Lead |
|---|---|
| Technical feasibility | CSA |
| Customer communication | CSAM |
| Pipeline/opportunity structure | Specialist |
| Proof execution | SE |
| Delivery coordination | CSAM (orchestration), Partner/ISD (execution) |
| Expansion evaluation | Specialist (pipeline), CSAM (timing) |

Stage accountability overrides action type when there's ambiguity. Cross-stage actions → lead role is determined by where the opportunity currently sits.

### Authority Tie-Break (Conflicting Role Guidance)

When two roles give conflicting direction on the same work item:

| Domain | Decision Owner | Communication Owner |
|---|---|---|
| Technical feasibility | CSA | CSA informs CSAM |
| Architecture constraints | CSA | CSA documents, CSAM communicates to customer |
| Customer expectation | CSAM | CSAM manages timeline/scope messaging |
| Delivery resourcing | CSAM (escalation) | CSAM owns partner/ISD coordination |
| Timeline adjustment | CSAM (customer) + CSA (technical) | Joint |

- Technical disputes → CSA is final authority
- Customer-facing implications → CSAM communicates adjustments
- Mixed → CSA decides technical path, CSAM communicates customer impact
- Neither claims decision → flag as `unresolved_authority` requiring explicit assignment

## VO Rules

- Stage is determined by evidence, not label alone.
- Compare `declared_stage` (BPF) vs `actual_stage` (VO-based) and report mismatch.
- Keep discrepancy output explicit: evidence present, evidence missing, and minimum next action.

## Critical Field Corrections

- `msp_milestonestatus = 861980001` means At Risk, not Committed.
- Commitment (Committed) is `msp_commitmentrecommendation = 861980003` (NOT `861980001`).
- Sales play field is `msp_salesplay`.
- Use `msp_milestonedate` for milestone date.

Detailed VO mappings and examples are in `.github/documents/MCEM-stage-reference.md`.

## Non-Linear Progression (Stage Loopback)

When evidence shows the opportunity is not ready to progress, structured loopback preserves execution integrity.

### Common Loopback Patterns

| Trigger | From → To | Re-entry Skill |
|---|---|---|
| Proof fails or is inconclusive | Stage 3 → Stage 2 | `proof-plan-orchestration` |
| Architecture infeasible | Stage 3 → Stage 2 | `architecture-review` |
| Capacity/delivery gap post-commit | Stage 4 → Stage 3 | `commit-gate-enforcement` |
| Scope change by customer | Stage 4 → Stage 2 | `pipeline-qualification` + `proof-plan-orchestration` |
| Adoption stall reveals design issue | Stage 5 → Stage 4 | `stage-5-review` |
| Customer priority shift | Any → Stage 1 | `pipeline-qualification` |

### Loopback Rules

- Loopback is recommended when VO evidence contradicts current stage positioning
- Document loopback reason in milestone comments before stage change
- Notify accountable roles for both current and target stages
- Loopback is not failure — it preserves long-term execution integrity
