---
name: role-se
description: "SE role card — technical proof executor and HoK engagement driver. Covers POC/Pilot/Demo/HoK management, BANT qualification support, SE-to-CSU handoff, and Hands-on-Keyboard positioning. Triggers: Solution Engineer, SE, proof management, HoK engagement, technical win, POC, pilot, demo."
---

# Role Card: Solution Engineer (SE)

## Mission
Drive **technical win quality** and **cloud consumption acceleration** through disciplined milestone-task management, proof execution, Hands-on-Keyboard (HoK) engagement, and timely cross-role handoff.

## Hands-on-Keyboard (HoK) Mandate

Every SE is expected to position HoK with every client and maintain active HoK engagements.

### HoK Positioning Rules
1. **Position with every client** — the ability to position HoK for the opportunity to execute with excellence is an expectation.
2. **Cusp customers** — identify customers where next steps are uncertain and engage leadership about HoK fit.
3. **Legal coverage first** — legal coverage **must** be in place before any work in customer environments.
4. **Environment classification** — explicitly categorize HoK work by environment tier: development, test, or production.

### HoK Resources
- **SE Playbook & SE Readiness Backpack**: Comprehensive guides and best practices
- **Community & Support Channels**: Teams channels per Solution Play (M&M, Data, Apps, Software)
- **Skilling Plans**: Required quarterly completion tracked at https://aka.ms/FRI
- **HoK Field Playbook**: Guidance and legal coverage for hands-on customer environment work

## MCEM Stage Accountability

| Stage | Role |
|---|---|
| Stages 1–2 | Contribute — shape technical need, proof plan, and **HoK positioning** |
| **Stage 3** | **Lead technical proof and HoK execution** |
| Stages 4–5 | Contribute — preserve continuity via CSU handoff, post-commitment task hygiene |

## Activity Tracking Model

SE tasks are **activity records**, not open work items. They document completed actions (proof delivered, HoK session executed, technical review conducted) for audit trail and downstream handoff evidence.

**Create-and-close rule**: When recording SE activity, `create_task` is always immediately followed by `close_task` in the same confirmation packet. Tasks are never left in an open state — they are born closed.

- If the activity is **already completed**: create-and-close immediately.
- If the activity is **planned/future**: do NOT create a task yet. Record intent in milestone notes or vault; create the task only when the activity is performed.

For the full task-creation workflow (activity types, field mapping, confirmation protocol), load `role-se-ms-activities`.

## Ownership Scope in MSX

- Maintain task-level accuracy on milestones SE touches
- Add SE to deal team when materially contributing
- Express execution via concrete activity-record tasks — avoid milestone-level ambiguity
- Track HoK engagements as explicit closed tasks with environment tier and legal coverage status

## Hygiene Cadence
- **Daily/Weekly**: milestone task hygiene for active opportunities; HoK engagement status review; verify recent activities have been recorded as closed tasks
- **At handoff**: ensure BANT evidence, HoK artifacts, legal coverage records, and handoff artifacts are complete; confirm all SE activities are captured as closed task records

## Boundary Rules
1. SE owns technical completion evidence; Specialist owns milestone structure/assignment.
2. Uncommitted milestones: SE manages task hygiene, technical shaping tasks, and HoK positioning tasks.
3. Committed milestones where SE influenced: continue task updates and HoK execution until owner-driven execution is stable.
4. Committed milestones where SE did NOT influence: limit to hygiene-only, provide monitoring note.
5. BANT-qualified handoff to CSU only when Budget, Authority, Need, Timeline are evidenced.
6. **HoK legal gate**: No HoK execution task may be created or started without legal coverage confirmation.

### Hard Blocks (agent must STOP and redirect)
- **NEVER `create_milestone`** — this is Specialist-owned. Flag the gap to Specialist.
- **NEVER update milestone structure** (name, date, monthlyUse, workload, commitment) — redirect to Specialist or CSAM.
- **NEVER update opportunity fields** (stage, close date, revenue) — redirect to Specialist.
- SE **may** create/update/close tasks on milestones they actively contribute to.
- See `write-gate` skill §2a for the full Role-Action Authority Matrix.

## Cross-Role Skill Lens

| Skill | SE Focus |
|---|---|
| `se-execution-check` | Owner, due date, status, blocker text, HoK task legal coverage status |
| `proof-plan-orchestration` | Technical proof requirements, success criteria, HoK scope and environment tier |
| `hok-readiness-check` | Legal coverage verification, customer environment access, cusp customer positioning |
| `handoff-readiness-validation` | BANT evidence completeness, technical decisions documented, HoK artifacts transferred |
| `commit-gate-enforcement` | Technical feasibility validated, proof outcomes recorded, HoK legal gate passed |
| `role-se-ms-activities` | Activity creation workflow, field mapping, create-and-close protocol, vault capture |

## Cross-Role Communication
- **With Specialist**: Align on solution play, proof scope, HoK positioning; surface cusp customers
- **With CSA**: Receive BANT-qualified uncommitted handoff for CSU planning; transfer HoK context
- **With CSAM**: Coordinate task ownership transitions; ensure HoK continuity during handoff
- **With Leadership**: Engage on cusp customers; report HoK engagement status

## Escalation Triggers
- Technical proof blocked >7 days without unblock path
- Milestone dates materially diverge from delivery reality
- **HoK legal coverage not in place** for customer environment work
- **Cusp customer** with no clear HoK path — escalate to leadership
