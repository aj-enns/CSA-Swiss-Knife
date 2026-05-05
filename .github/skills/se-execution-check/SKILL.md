---
name: se-execution-check
description: "SE execution check: task hygiene, architecture guardrail scan, and Unified constraint validation in one pass. Reads CRM tasks for correct owner/due-date/status, audits committed decisions against live state, and detects Unified dispatch readiness gaps. Replaces standalone task-hygiene-flow, execution-monitoring, and unified-constraint-check. Triggers: task record inspector, SE daily check, stale tasks, orphaned tasks, task owner, task due date, CRM task row, task hygiene, guardrail scanner, architecture breach, dependency audit, CSA punch-list, constraint violation, owner-motion mismatch, execution blockers, Unified Support, dispatch readiness, accreditation gap, eligibility proof, Unified catalog, Unified blocker, SE execution check. DO NOT USE FOR: full morning briefing — use morning-brief. Not for CSAM milestone reviews — use milestone-health-review."
argument-hint: 'Scope by opportunityId(s) or sweep all SE/CSA-owned active milestones'
---

# SE Execution Check

Unified daily execution sweep combining task hygiene, architecture guardrail monitoring, and Unified constraint validation against the same CRM milestone data.

## Freedom Level

**Medium** — Classification requires judgment; field corrections and constraint checks are rule-based.

## Modes

| Mode | Trigger Keywords | Purpose |
|---|---|---|
| **Task hygiene** | stale tasks, orphaned tasks, task owner, SE daily check | SE task completeness |
| **Execution monitoring** | guardrail scanner, architecture breach, execution blockers | CSA guardrail audit |
| **Unified constraints** | Unified Support, dispatch readiness, accreditation gap | Unified dispatch validation |

All three modes run by default for full SE morning prep. Specify a single mode when scoped.

## Flow

1. Call `msx:crm_auth_status`.
2. Call `msx:get_my_active_opportunities` — single call for all active opportunities.
3. Call `msx:get_milestones` with `opportunityIds` (batch from step 2), `statusFilter: 'active'`, `format: 'triage'`, `includeTasks: true` — one call returns milestones pre-classified by urgency with inline tasks.
4. Run all applicable modes against the same data:

### Task Hygiene

| Check | Pass | Fail Action |
|---|---|---|
| Owner assigned | Task has named owner | Flag for assignment |
| Due date set | Realistic future date | Flag for date update |
| Status current | Reflects actual progress | Flag for status refresh |
| **Task is closed** (SE only) | Task status = Completed/Closed | Flag for immediate closure |
| Blocker documented | If blocked, reason stated | Flag for blocker text |
| Completion condition | Clear done-criteria exist | Flag for criteria addition |
| HoK legal coverage | Legal agreement confirmed | **Block task**; flag for legal |
| HoK environment tier | Dev/Test/Prod classified | Flag for classification |

**SE Activity Tracking Rule**: SE tasks are **activity records**, not open work items. Every `create_task` MUST be immediately followed by `close_task` in the same confirmation packet. Open SE tasks found during hygiene sweeps are anomalies — flag for immediate closure.

### Execution Monitoring

| State | Criteria |
|---|---|
| **On track** | Active tasks with owners, no blockers, date >30 days |
| **At risk** | Date <30 days with incomplete tasks OR missing delivery motion |
| **Blocked** | No active tasks, no recovery plan, OR owner-motion mismatch |
| **Owner mismatch** | CSA listed as owner but delivery motion is Partner/ISD/Unified |

- Owner-motion mismatch → flag for reassignment
- Technical blockers → CSA-actionable remediation plan
- Delivery/resourcing blockers → route to CSAM
- Commercial/scope issues → route to Specialist

### Unified Constraints

| Constraint | Severity | Action |
|---|---|---|
| No eligibility evidence | High | Block commitment; create verification task |
| Accreditation gap | High | Escalate to delivery org |
| Dispatch not confirmed | Medium | Create dispatch readiness task |
| Customer timeline depends on Unified, no contingency | Critical | Flag `schedule_impact_high`; require contingency |
| Full readiness confirmed | Low | Document for tracking |

5. Generate dry-run corrections across all modes:
   - `msx:create_task` for missing tasks, escalations, readiness actions
   - `msx:update_task` for stale fields
   - `msx:close_task` for completed actions
   - `msx:update_milestone` for risk/status/comments

## Decision Logic

- Prioritize tasks on near-term milestones (due within 30 days)
- For uncommitted milestones: focus on BANT gap closure and HoK positioning tasks
- For committed milestones: ensure continuity until CSU execution is stable
- **HoK tasks**: Verify legal coverage; block without it, chain to `hok-readiness-check`
- Skip milestones where SE has no active contribution
- Escalate when no recovery activity exists for near-term committed milestones

## Output Schema

- `task_report`: milestone-level task hygiene status
- `risk_dashboard`: milestone-level execution state with reason codes
- `unified_dependency_report`: milestones with Unified path and readiness state
- `stale_tasks`: tasks needing update with specific gap
- `owner_mismatch_flags`: milestones needing ownership clarification
- `constraint_warnings`: Unified gaps classified by severity
- `proposed_corrections`: dry-run create/update/close payloads across all modes
- `next_action`: context-dependent — "Would you like to run `commit-gate-enforcement` for milestones approaching commitment?" or "SE execution check complete — no escalation needed."
