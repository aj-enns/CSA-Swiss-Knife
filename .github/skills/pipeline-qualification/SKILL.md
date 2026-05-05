---
name: pipeline-qualification
description: 'Inbound-signal qualifier: scores a new customer signal for commercial fit, solution-play alignment, and priority match, then scaffolds a draft opportunity with initial milestones. Triggers: qualify signal, new opportunity, inbound lead, commercial fit, create pipeline, scaffold opportunity, net-new deal. DO NOT USE FOR: routing upsell or expansion signals from existing delivery — use stage-5-review.'
argument-hint: 'Provide account TPID or GUID and the inbound customer signal description'
---

## Purpose

Qualifies incoming customer signals into actionable Stage 2 pipeline by validating customer priority alignment, commercial fit, and solution play — then producing draft opportunity and milestone structures.

## Freedom Level

**Medium** — Qualification scoring requires judgment; pipeline structure recommendations are exact.

## Trigger

- New customer signal or net-new project in Specialist scope
- User asks "should I create an opportunity?" or "qualify this signal"
- ATU-originated lead requires Specialist evaluation

## Flow

1. Call `msx:crm_auth_status`.
2. Resolve account scope — if TPID: call `msx:list_accounts_by_tpid`; if GUID known: skip.
3. Call `msx:get_my_active_opportunities` to check for existing opportunities (avoid duplicates).
4. For existing opportunities, call `msx:get_milestones` with `opportunityIds` to classify milestone state across all opportunities in one call.
5. Apply qualification criteria (see below).
6. If qualified, output draft opportunity + minimum milestone set as recommendations.

## Qualification Criteria

| Signal | Required | Evidence |
|---|---|---|
| Customer priority alignment | Yes | Customer has stated need or business problem |
| Commercial fit | Yes | Budget indication or project funding path |
| Solution play match | Yes | `msp_salesplay` maps to a valid solution area |
| No duplicate opportunity | Yes | No existing active opportunity covers same scope |
| Stakeholder access | Recommended | Named decision maker or champion identified |

## Decision Logic

- **Qualified**: All required criteria met → output draft opportunity + milestone structure
- **Not qualified**: Missing required criteria → list specific gaps, do not recommend creation
- **Duplicate detected**: Existing opportunity covers scope → recommend updating existing vs creating new
- Quality over volume — stop low-quality opportunities early

## Output Schema

- `qualification_result`: qualified | not_qualified | duplicate_detected
- `qualification_gaps`: missing criteria with specific evidence needed
- `draft_opportunity`: recommended field values for new opportunity (if qualified)
- `draft_milestones`: minimum milestone set with owners and dates
- `next_action`: "Opportunity qualified. Would you like to initiate `proof-plan-orchestration` for Stage 2 technical shaping?"

## Customer Outcome Scoping (Pre-Stage 2)

When qualifying, also define explicit, measurable KPIs during initial engagement:

### Outcome Clarity Criteria

| Element | Required | Evidence |
|---|---|---|
| Business problem stated | Yes | Customer-articulated need (not Microsoft projection) |
| Measurable success metric | Yes | Quantifiable target (reduce X by Y%, achieve Z users) |
| Baseline available | Recommended | Current state measurement exists or plan to obtain |
| Timeline expectation | Yes | Customer's expected value realization window |
| Stakeholder identified | Recommended | Named sponsor or decision maker |

- Missing baseline → acceptable to proceed but flag for Stage 2 collection
- No measurable metric → block progression; create task to define measurement
- Multiple outcomes → prioritize by customer emphasis and commercial alignment
