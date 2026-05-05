---
name: proof-plan-orchestration
description: 'POC/Pilot/Demo/HoK blueprint builder: defines trial scope, acceptance criteria, timeline, environment needs, legal coverage requirements, and role assignments for a technical proof or HoK engagement. Outputs a structured plan ready for SE and Specialist execution. Triggers: POC design, pilot blueprint, demo plan, HoK plan, hands-on-keyboard scope, trial scope, proof requirements, technical win plan.'
argument-hint: 'Provide opportunityId and proof format (POC, Pilot, Demo, or HoK)'
---

## Purpose

Defines the technical proof plan by scoping proof type (POC/Pilot/Demo/HoK), success criteria, milestone structure, and role assignments — ensuring SE and Specialist alignment on what proves customer value and accelerates cloud consumption.

## Freedom Level

**Medium** — Proof scoping requires judgment; milestone structure recommendations are exact.

## Trigger

- Opportunity entering proof phase (Stage 2-3)
- User asks "what should the POC cover?" or "proof plan"
- SE and Specialist need alignment on proof requirements

## Flow

1. Call `msx:crm_get_record` on opportunity for solution play, stage, and customer context.
2. Call `msx:get_milestones` with `opportunityId` — check for existing proof milestones (POC/Pilot/Demo).
3. If proof milestones exist, call `msx:get_milestone_activities` to assess current task state.
4. Define proof plan components (see below).
5. Generate dry-run actions:
   - `msx:update_milestone` for scope/criteria updates on existing proof milestones
   - `msx:create_task` for proof execution tasks with owners and dates (SE role: pair with immediate `close_task` — SE tasks are activity records, not open work items)

## Proof Plan Components

- **Proof type**: POC (technical feasibility) | Pilot (business value in production-like) | Demo (capability showcase) | **HoK (hands-on acceleration in customer environment)**
- **Success criteria**: Measurable outcomes customer agrees prove value
- **Scope boundaries**: What is in scope and explicitly out of scope
- **Timeline**: Realistic duration with checkpoints
- **Role assignments**: SE (technical execution), Specialist (customer relationship + scope), CSA (architecture review)
- **Exit conditions**: What outcome triggers progression vs redesign
- **Legal coverage** (HoK only): Confirmed legal agreement before any customer environment work
- **Environment tier** (HoK only): Development, test, or production — with production requiring heightened approval

## Decision Logic

- If proof milestones already exist with tasks → validate completeness, update gaps
- If no proof milestones → recommend creation with minimum viable structure
- Proof scope should match solution play and customer stated needs
- Route architecture concerns to CSA via `architecture-review`
- **HoK proofs**: Verify legal coverage before creating execution tasks. If legal coverage is missing, block execution tasks and chain to `hok-readiness-check`. Classify environment tier (dev/test/prod) explicitly in the plan.

## Output Schema

- `proof_plan`: type, scope, success criteria, timeline, roles
- `milestone_structure`: recommended milestones with tasks
- `dry_run_actions`: milestone/task payloads
- `next_action`: "Proof plan defined. CSA should run `architecture-review` to validate technical executability — would you like to engage your CSA?" | For HoK: "HoK plan scoped. Run `hok-readiness-check` to verify legal coverage and environment access before execution."
