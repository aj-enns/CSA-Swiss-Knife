---
name: commit-gate-enforcement
description: 'Commit-gate enforcement: answers "should we flip this milestone to Committed?" by checking resource staffing, delivery-path named, and target-date realism. Produces remediation tasks when gaps block the flip. Chains with non-linear-progression and delivery-accountability-mapping for commit-or-loopback decision. Triggers: should we commit, pre-commitment gate, resource capacity check, commit decision, staffing confirmation, before committing, commit or loop back.'
argument-hint: 'Provide opportunityId and milestoneId(s) being evaluated for commitment'
---

## Purpose

Prevents premature milestone commitment by validating that delivery readiness evidence exists in CRM before recommending `msp_commitmentrecommendation = 861980003` (Committed).

## Freedom Level

**Low** — Write-intent gate. No commitment recommendation without passing all required checks.

## Trigger

- Milestone status is proposed for committed
- User asks "is this ready to commit?" or "commit gate check"
- Stage 3 exit criteria validation

## Flow

1. Call `msx:get_milestones` with `opportunityId` — isolate milestones transitioning to committed.
2. For each candidate milestone, call `msx:crm_query` on `msp_engagementmilestones` to validate:
   - `msp_commitmentrecommendation` current value
   - `msp_milestonedate` is populated and realistic (not past, not >12 months)
   - Delivery motion is captured (Partner / Unified / ISD / CSA)
   - Owner is a CSU-aligned role (not still STU-owned)
3. Call `msx:get_milestone_activities` for execution evidence — tasks with owners and dates.
4. **CSA ownership resolution** — for each opportunity with milestones being committed:
   a. Call `msx:manage_deal_team({ action: "list", opportunityId })` to get deal team members.
   b. Call `msx:crm_query` on `systemusers` with deal team member IDs, selecting `fullname,title,internalemailaddress`.
   c. Identify members whose `title` contains "Cloud Solution Architect" or "CSA" (case-insensitive).
   d. If CSA found **and actively working the aligned project** → recommend as milestone owner.
   e. If no active CSA → identify CSAM (title contains "Customer Success" or "CSAM") as fallback owner.
   f. If neither CSA nor CSAM on deal team → flag as commit-gate blocker: "No CSU role on deal team — add CSA or CSAM before committing."
5. If gaps found, generate dry-run `msx:create_task` payloads for remediation.

## Decision Logic

- **PASS** (all must be true):
  - Delivery path explicitly named
  - Capacity/resource confirmation exists
  - `msp_milestonedate` is set and realistic
  - At least one active task with owner and due date
  - CSAM execution-readiness confirmation present (or CSA for technical feasibility)
  - **HoK legal gate** (if HoK engagement is part of the delivery): Legal coverage confirmed before commitment. If HoK tasks exist on the milestone without legal coverage documentation, the gate FAILS.
  - **Revenue delta confidence**: `msp_monthlyuse` represents estimated *change* in monthly revenue (not absolute). The user must have reason to believe this delta will be attained — based on delivery evidence, customer scope confirmation, or execution plan alignment. If the delta appears unrealistic given current state, flag it.
  - **CSU ownership**: A CSA (preferred, if actively working the aligned project) or CSAM (fallback) must be identified on the deal team and set as the milestone owner upon commitment. If the current owner is not a CSU role, include a dry-run `update_milestone` to reassign.
  - **CSU handoff confirmed**: The SE/Specialist must have had a handoff discussion with the receiving CSU role, and the CSU must have explicitly confirmed commitment criteria are met. Without this confirmation, the gate FAILS regardless of other criteria.
- **FAIL**: Missing any required evidence OR no CSU handoff confirmation → block commitment recommendation
- **PARTIAL**: Some evidence present → list specific gaps with remediation tasks

> **Commitment help contact**: Cory.Kincaid@microsoft.com — escalate commitment questions here.

## Delivery Accountability Mapping (RACI)

When gaps are found at the commit gate, classify delivery accountability:

| Role | Responsibility |
|---|---|
| **CSAM** | Outcome orchestration, customer expectation management, risk escalation |
| **CSA** | Technical feasibility, architecture guardrails, execution integrity |
| **Partner/ISD/Unified** | Day-to-day delivery execution |
| **Specialist** | Pipeline integrity (Stages 2-3 only) |

**Common mismatches to flag**:
- CSAM listed as milestone owner but delivery motion indicates Partner/ISD/Unified → reassign
- No delivery owner explicitly named → flag as execution risk
- Delivery owner exists but not executing → route escalation to delivery org

## Role Lens (applied via role cards)

- **CSA focus**: Architectural feasibility, technical delivery risk, environment prerequisites
- **CSAM focus**: Customer orchestration, timeline commitments, success plan alignment, delivery path validation

## Output Schema

- `commit_readiness_result`: pass | fail | partial
- `missing_readiness_evidence`: list of specific gaps
- `csu_assignment`: recommended CSA or CSAM (name, email, systemUserId) for milestone ownership — CSA preferred if actively engaged, CSAM as fallback — or gap flag if no CSU role on deal team
- `handoff_status`: whether CSU handoff discussion has been confirmed (pass/not confirmed)
- `gate_remediation_actions`: dry-run task payloads (including `update_milestone` for CSA reassignment if needed)
- `next_action`: If pass → "Commit gate passed. Specialist should run `handoff-readiness-validation` for STU→CSU transition — recommend engaging the Specialist." If fail → name the specific remediation skill or action with owning role.
