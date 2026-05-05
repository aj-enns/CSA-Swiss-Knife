---
name: architecture-review
description: "Architecture feasibility check and execution handoff in one skill. Reviews environment prerequisites, dependency sequencing, capacity headroom, and solution design risks before commitment. Produces structured handoff artifacts (decisions, constraints, guardrails, KPIs) when proof concludes. Replaces standalone architecture-feasibility-check and architecture-execution-handoff. Triggers: can we build, feasibility, prerequisites, capacity headroom, technical risk, solution design review, buildability, proof completed, write handoff note, architecture decision record, POC concluded, CSA document, proof summary writeup, handoff artifact, create handoff, architecture review."
argument-hint: 'Provide opportunityId for the solution requiring feasibility or handoff review'
---

# Architecture Review

Unified CSA review covering pre-commitment feasibility and post-proof handoff documentation against the same opportunity milestones.

## Freedom Level

**Medium** (feasibility) / **Low** (handoff — quality gate, all required elements must be present).

## Modes

| Mode | Trigger Keywords | Purpose |
|---|---|---|
| **Feasibility** | can we build, feasibility, prerequisites, technical risk | Pre-commitment validation |
| **Handoff** | handoff note, POC concluded, architecture decision record | Post-proof documentation |

Run **feasibility** first when both modes are appropriate (e.g., proof just completed → check feasibility → generate handoff).

## Flow

1. Call `msx:crm_get_record` on opportunity for solution play, stage, and success plan linkage.
2. Call `msx:get_milestones` with `opportunityId` and `includeTasks: true` — identify proof/POC/pilot milestones with inline task/proof traces.
3. Call `msx:get_milestone_activities` for milestones with unclear technical state (targeted only).
4. Call `msx:crm_query` on task entities for broader dependency tracking if needed.

### Feasibility Assessment

Evaluate against checklist:

- [ ] Environment prerequisites identified and achievable
- [ ] Dependency sequencing is realistic (no circular or impossible chains)
- [ ] Delivery capacity exists (people, partner, tooling)
- [ ] Technical risk is documented and mitigatable
- [ ] Architecture aligns with customer's existing estate
- [ ] Success metrics are measurable and technically trackable

**Verdict**:
- **Feasible**: All items satisfied → ready for proof/commitment progression
- **Conditionally feasible**: Some gaps, but remediable → list prerequisites with owners
- **Not feasible**: Fundamental blockers → recommend Stage 2 loop-back for redesign

Route capacity/resourcing gaps to CSAM for delivery path validation.

### Handoff Note Generation

Compile from gathered evidence:

- **Architecture summary**: Key design decisions and rationale
- **Constraints**: Technical, regulatory, or environmental limitations
- **Deliverables**: What was proven and what remains to build
- **Risks**: Known risks with mitigation plans
- **Success metrics**: Baseline + target measurements agreed with customer
- **Next actions**: Assigned, dated tasks for delivery phase
- **Dependencies**: External/internal prerequisites for execution

Handoff not execution-ready if constraints, dependencies, or success metrics are implicit. Missing proof artifacts → flag and create task to close gap.

5. Generate dry-run corrections:
   - `msx:update_milestone` for risk/dependency/status notes
   - `msx:create_task` for prerequisite and gap-closure actions

## Output Schema

- `feasibility_result`: feasible | conditional | not_feasible (when feasibility mode runs)
- `prerequisites`: required actions before progression
- `technical_risks`: documented risks with mitigation strategy
- `handoff_note`: structured document per template above (when handoff mode runs)
- `completeness_check`: pass | fail with specific gaps
- `dry_run_updates`: milestone/task payloads
- `next_action`: "Architecture reviewed. Would you like to run `commit-gate-enforcement` to check full Stage 3 readiness?"
