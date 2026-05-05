---
name: pipeline-hygiene-triage
description: 'Pipeline hygiene triage for Specialist: flags stale opportunities, missing CRM fields, close-date slippage, and low-quality entries. Generates exception report with bulk-fix suggestions for forecast prep. Chains with handoff-readiness-validation and risk-surfacing for weekly pipeline review. Triggers: portfolio cleanup, stale opportunities, missing fields, forecast prep, pipeline exceptions, close-date slip, weekly review, pipeline review. DO NOT USE FOR: CSAM milestone governance reviews — use milestone-health-review instead.'
argument-hint: 'Scope by opportunityId(s) or sweep all active Specialist-owned pipeline'
---

## Purpose

Detects and prioritizes pipeline hygiene exceptions across active Stage 2–3 opportunities, enabling Specialist to maintain pipeline quality and forecast accuracy.

## Freedom Level

**Medium** — Prioritization involves judgment; field corrections are exact.

## Trigger

- Weekly pipeline review cadence
- Pre-forecast hygiene pass
- User asks "what needs cleanup?" or "pipeline health check"

## Flow

1. Call `msx:get_my_active_opportunities({ maxResults: 100 })` — single call for active opportunities with bounded payload.
2. Call `msx:get_milestones` with `opportunityIds` (batch from step 1), `statusFilter: 'active'`, `format: 'summary'` — one call returns all milestones across opportunities. Add `includeTasks: true` if task state is needed.
3. Score and rank exceptions by severity.
4. Generate dry-run `msx:update_milestone` and `msx:update_task` payloads for top exceptions.

## Exception Detection Rules

| Exception | Detection | Severity |
|---|---|---|
| Stage staleness | Opportunity in Stage 2–3 for >governance threshold with no recent activity | High |
| Date drift | `msp_milestonedate` is past or within 14 days with no active tasks | High |
| Missing required fields | `msp_salesplay` is null, `msp_monthlyuse` empty on active milestones | Medium |
| Owner mismatch | Milestone owner does not match expected role for stage | Medium |
| Low qualification signals | Stage 2 opportunity lacks customer priority alignment or commercial fit | Medium |
| Stale forecast comments | Forecast comments older than current period | Low |

## Decision Logic

- Rank by: proximity (`msp_milestonedate`) × severity × governance threshold
- Escalate when milestone is within governance threshold and has no mitigation activity
- Route to SE when exception involves technical proof gaps
- Route to CSA/CSAM when exception involves commitment readiness

## Output Schema

- `exceptions`: prioritized list with severity, reason, and affected milestone
- `proposed_field_updates`: dry-run payloads for corrections
- `escalation_path`: who to engage (SE, CSA, CSAM, partner) per exception
- `next_action`: "Pipeline reviewed. CSA/CSAM should run `commit-gate-enforcement` for milestones approaching commitment — recommend engaging the CSU team."
- `connect_hook_hint`: Impact Area(s): Business Impact, Culture & Collaboration — "Pipeline hygiene triage across {n} opportunities: flagged {exceptions} exceptions, proposed {fixes} field corrections for forecast accuracy"
