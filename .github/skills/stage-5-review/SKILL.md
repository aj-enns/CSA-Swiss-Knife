---
name: stage-5-review
description: "Stage 5 review: adoption health, value realization, and expansion signal routing in one pass. Audits usage telemetry against targets, validates measurable outcome definitions, and captures growth signals for Specialist routing. Replaces standalone adoption-excellence-review, value-realization-pack, and expansion-signal-routing. Triggers: consumption scorecard, MAU, DAU, usage telemetry, adoption gap, adoption health, license utilization, consumption vs target, how is adoption going, ROI report, business impact, outcome measurement, value quantification, impact evidence, value tracking proof, is value being realized, value realization, upsell detected, cross-sell opportunity, growth signal, land-and-expand, new deal from delivery, expansion routing, expansion signals, flag expansion, Stage 5 review. DO NOT USE FOR: initial opportunity qualification from inbound signals — use pipeline-qualification."
argument-hint: 'Scope by opportunityId(s) or run across all CSAM-owned Stage 5 milestones'
---

# Stage 5 Review

Unified review for Stage 5 opportunities covering adoption health, value realization completeness, and expansion signal routing. Runs all three assessments against the same CRM data in one pass.

## Freedom Level

**Medium** — Assessment requires judgment; gap identification and routing are rule-based.

## Modes

Run all three modes by default, or specify a single mode when scoped:

| Mode | Trigger Keywords | Purpose |
|---|---|---|
| **Adoption** | adoption health, MAU, DAU, consumption | Audit usage telemetry against targets |
| **Value** | ROI, business impact, value realization | Validate measurable outcome evidence |
| **Expansion** | upsell, cross-sell, growth signal | Capture and route expansion signals |

## Flow

0. **Resolve identity** — call `msx:crm_whoami` to obtain `systemuserid`, name, alias. Used in step 5b for Connect attribution verification.
1. Call `msx:crm_get_record` on opportunity for stage, success plan, and solution play.
2. Call `msx:get_milestones` with `opportunityId`, `keyword: 'adoption'`, `includeTasks: true` — isolate value/adoption milestones with inline task evidence.
3. Call `msx:get_milestone_activities` for milestones lacking execution cadence evidence (targeted only).
4. **Adoption assessment** — evaluate per milestone:

| Signal | Healthy | Unhealthy |
|---|---|---|
| Consumption trend | Tracking toward or above target | Flat or declining |
| Stakeholder coverage | Named owners on adoption tasks | No owner or generic assignment |
| Success plan alignment | Milestone outcomes match CSP priorities | Disconnected from success plan |
| Activity cadence | Recent tasks with progress | No activity in 30+ days |
| Measurable targets | `msp_monthlyuse` or equivalent populated | No consumption metric defined |

5. **Value completeness** — evaluate per milestone:

| Element | Required | Evidence |
|---|---|---|
| Metric intent | Yes | `msp_monthlyuse` or equivalent populated |
| Baseline defined | Yes | Starting measurement documented |
| Target defined | Yes | Success threshold stated |
| Owner assigned | Yes | CSU-aligned owner on milestone |
| Tracking active | Yes | Recent activity showing measurement cadence |

   - **5b. Attribution cross-reference** — for each finding that could surface as Connect evidence, verify the authenticated user (from step 0) appears as owner, task assignee, or named contributor. Outcomes where ownership is ambiguous **must** be flagged `attribution: unverified`.

6. **Expansion signal scan** — check for growth signals:
   - Call `msx:get_my_active_opportunities` to check for existing expansion opportunities (avoid duplicates).

| Signal Type | Example | Route |
|---|---|---|
| Workload expansion | Customer wants to extend to new business unit | Specialist — new Stage 1-2 opportunity |
| Usage growth | Consumption exceeding targets, new use cases emerging | CSAM documents, Specialist evaluates |
| Technology uplift | Architecture modernization or migration need | CSA captures signal, Specialist creates pipeline |
| Renewal with scope change | Renewal includes new workloads or services | Specialist — linked opportunity |

7. Generate dry-run corrections across all modes:
   - `msx:create_task` for missing stakeholder tasks and signal routing
   - `msx:update_task` for date/description corrections
   - `msx:close_task` for completed actions
   - `msx:update_milestone` for measurable comments/metric updates

## Decision Logic

- **Adoption**: Complete when each adoption milestone has active owner-task coverage and measurable next outcomes. Flag stalls when consumption is flat with no active mitigation.
- **Value**: Complete when each value milestone has metric intent, owner, date, and next activity. Weak evidence → output mandatory gap closures.
- **Expansion**: Route signals **only after CSAM timing/prioritization alignment is explicit**. Do not treat signal capture as automatic opportunity creation. Preserve signal evidence in current milestone comments before routing.

## Output Schema

- `adoption_health`: per-milestone adoption state with classification and gap details
- `value_checklist`: per-milestone completeness assessment
- `measurement_plan`: metrics, baselines, targets, tracking approach
- `expansion_signals`: detected signals with classification and evidence
- `ownership_route`: CSAM → Specialist routing with timing recommendation
- `duplicate_check`: existing opportunities that may cover expansion signals
- `remediation_queue`: proposed tasks for all modes
- `dry_run_updates`: create/update/close task and milestone preview payloads
- `csam_ready_summary`: what CSAM needs for customer governance
- `connect_hook_hint`: Impact Area(s): Customer Impact — "Stage 5 review for {customer}: {healthy}/{total} milestones healthy, {value_gaps} value gaps, {expansion_count} expansion signals"
