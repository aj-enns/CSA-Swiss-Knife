---
name: hok-readiness-check
description: 'HoK (Hands-on-Keyboard) readiness check: validates legal coverage, customer environment access, and engagement positioning for SE hands-on work in customer dev/test/production environments. Identifies cusp customers where HoK next steps are uncertain and surfaces them for leadership discussion. Chains with proof-plan-orchestration for HoK-scoped proofs and task-hygiene-flow for HoK task tracking. Triggers: HoK readiness, hands-on-keyboard, legal coverage, customer environment, HoK positioning, cusp customer, HoK engagement, HoK legal gate, environment access, HoK status, HoK field playbook.'
argument-hint: 'Scope by opportunityId, customerKeyword, or sweep active SE portfolio for HoK positioning gaps'
---

## Purpose

Ensures SEs can position and execute HoK engagements compliantly by verifying legal coverage, environment access, and customer readiness — and surfaces cusp customers where HoK positioning direction is needed from leadership.

## Freedom Level

**Low** — Legal gate is non-negotiable. No HoK execution without confirmed legal coverage.

## Trigger

- SE positioning HoK with a customer
- Pre-engagement readiness check for hands-on work
- User asks "is this customer HoK-ready?" or "HoK status"
- Pipeline review to identify cusp customers for leadership discussion
- Morning prep to assess HoK engagement portfolio health

## Flow

1. **Scope**: Call `msx:get_my_active_opportunities` — single call for all active opportunities where SE is on deal team.
2. **Milestone scan**: Call `msx:get_milestones` with `opportunityIds` (batch from step 1), `statusFilter: 'active'`, `includeTasks: true` — identify milestones with HoK-related tasks or proof milestones that could benefit from HoK.
3. **Vault context** (if OIL available): Call `oil:get_customer_context({ customer })` — check for existing HoK notes, legal coverage records, and engagement history.
4. **Classify each opportunity** into HoK positioning categories (see below).
5. Generate actionable output:
   - Cusp customer list for leadership escalation
   - Legal coverage gaps requiring remediation
   - HoK task creation dry-runs for opportunities ready to proceed

## HoK Positioning Categories

| Category | Criteria | Action |
|---|---|---|
| **HoK Active** | Legal coverage confirmed, environment access granted, SE executing | Track progress; ensure task hygiene |
| **HoK Ready** | Legal coverage confirmed, customer receptive, not yet started | Create execution tasks; schedule kickoff |
| **HoK Positioned** | Customer conversation initiated, legal not yet confirmed | Prioritize legal coverage; track positioning status |
| **Cusp** | Next steps uncertain — customer interest unclear or mixed signals | **Escalate to leadership**; prepare positioning rationale |
| **Not Positioned** | No HoK conversation has occurred | Position HoK in next customer touchpoint; prepare value narrative |

## Legal Coverage Gate

> **Hard rule**: Legal coverage must be in place before any work in customer environments.

| Check | Pass | Fail Action |
|---|---|---|
| Legal coverage confirmed | Documentation or task evidence of legal agreement | **Block HoK execution**; create legal coverage task |
| Environment tier classified | Dev / Test / Production explicitly stated | Flag for classification before proceeding |
| Production access | Heightened approval documented | Block until approval chain complete |
| Customer environment readiness | Access credentials / VPN / tooling confirmed | Create environment readiness task |

## Cusp Customer Identification

A **cusp customer** is one where HoK next steps are uncertain:
- Customer has expressed interest but hasn't committed to environment access
- Solution play suggests HoK value but customer engagement cadence is low
- Proof completed but HoK follow-through path is ambiguous
- Customer is in Stage 2-3 with stalled technical progression

**For cusp customers**: Generate a structured brief for the SE's manager including:
- Customer name and opportunity context
- Current engagement state and blockers
- HoK value proposition specific to the customer's scenario
- Recommended next step options (position/defer/escalate)

## HoK Resources Reference

When SE asks about HoK guidance, direct to:
- **SE Playbook & SE Readiness Backpack** — comprehensive SE best practices
- **HoK Field Playbook** — legal coverage and hands-on execution guidance
- **Teams channels per Solution Play** (M&M, Data, Apps, Software) — async Q&A
- **Skilling Plans** — quarterly completion at https://aka.ms/FRI
- **Tech Elevate series** — subject matter expertise enhancement

## Decision Logic

- If opportunity has no HoK positioning → recommend positioning in next customer interaction
- If HoK positioned but legal coverage missing → block execution, create legal task, flag as priority
- If cusp customer identified → generate leadership brief, do not force HoK
- If HoK active → validate task hygiene and execution progress
- HoK should complement proof activity, not replace it — chain with `proof-plan-orchestration` when proof scope includes HoK

## Output Schema

- `hok_portfolio`: per-opportunity HoK positioning category and status
- `legal_coverage_status`: confirmed / pending / missing per engagement
- `cusp_customers`: list with structured briefs for leadership discussion
- `positioning_gaps`: opportunities where HoK has not been discussed
- `hok_tasks`: dry-run task payloads for legal coverage, environment access, and execution
- `next_action`: Context-dependent — "3 cusp customers identified. Share the briefs with your manager for HoK direction." or "Legal coverage confirmed for 2 engagements — ready to create HoK execution tasks."
