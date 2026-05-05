---
name: role-specialist
description: "Specialist role card — pipeline builder and deal driver. Covers opportunity qualification, forecast hygiene, Stage 2-3 progression, and STU-to-CSU handoff checklists. Triggers: Specialist, STU, pipeline building, deal qualification, forecast hygiene, opportunity creation, STU-to-CSU handoff."
---

# Role Card: Specialist (STU)

## Mission
Own **pipeline creation and progression** through MCEM Stages 2–3 for the solution area, and ensure clean handoffs to CSU once customer commitment is achieved.

## MCEM Stage Accountability

| Stage | Role |
|---|---|
| Stage 1 | Contribute — signal intake, support qualification |
| **Stages 2–3** | **Lead** — create/own opportunities, drive to customer agreement |
| Stage 4+ | Transition — hand off committed milestones to CSU; remain for expansion |

## Ownership Scope in MSX

- Create/update opportunity fields driving pipeline insights
- Create milestones reflecting executable projects with correct owner, monthly usage signal, and meaningful comments
- Ensure commitment and stage reflect verifiable outcomes

## Hygiene Cadence
- **Weekly**: pipeline review for stage staleness, date drift, missing required fields
- **Pre-forecast**: verify forecast comments and milestone status are current

## Boundary Rules
1. If Specialist creates Stage 2–3 opportunity, Specialist is the **single accountable owner** for stage movement and milestone structure.
2. Specialist owns milestone structure/assignment; SE owns technical completion evidence.
3. **No commitment flip** without explicit CSA/CSAM execution-readiness signal.
4. Specialist responsibility ends only after a **warm, documented STU→CSU handoff**.
5. Stage 2 pipeline must meet qualification quality signals, not just coverage quantity.
6. Expansion opportunity creation requires explicit CSAM alignment on timing and motion.

### Exclusive Ownership (Specialist-only actions)
- **`create_milestone`** — Specialist is the only role that creates milestones. Other roles must flag gaps to Specialist.
- **Opportunity field updates** (stage, close date, revenue, monthly use) — Specialist-owned.
- **Milestone structure changes** (name, date, monthlyUse, workload, commitment) — Specialist-owned (CSAM co-owns in Stage 4-5).
- See `write-gate` skill §2a for the full Role-Action Authority Matrix.

## Cross-Role Skill Lens

| Skill | Specialist Focus |
|---|---|
| `pipeline-hygiene-triage` | Stage staleness, field completeness, pipeline quality signals |
| `handoff-readiness-validation` | Completeness of handoff artifact: why bought, success criteria, scope, next actions |
| `commit-gate-enforcement` | Validate that CSA/CSAM readiness signals exist before recommending commitment |
| `shared-patterns` § Partner Motion | Impact on pipeline structure and co-sell alignment |
| `account-landscape-awareness` | Full account pipeline visibility, EDE alignment, Unified package coverage |

## Cross-Role Communication
- **With SE**: Agree on proof plan, success criteria, and milestone plan
- **With CSA**: Engage early for delivery dependencies, late for commitment readiness
- **With CSAM**: Warm handoff of committed milestones; provide context + explicit asks

## Escalation Triggers
- Opportunity stalled in Stage 2–3 beyond governance thresholds
- Milestones at-risk/blocked within 60 days without clear help path
- Missing required fields impacting pipeline hygiene
- Expansion signal requires CSAM alignment but no response
