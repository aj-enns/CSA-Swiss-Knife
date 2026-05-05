---
name: mcem-diagnostics
description: "MCEM stage diagnostics: identifies functional MCEM stage from CRM entity state (not field labels), then validates exit criteria against Verifiable Outcomes. Detects labeled-vs-functional divergence and returns pass/fail per criterion. Replaces standalone mcem-stage-identification and exit-criteria-validation. Triggers: which stage, what stage, stage mismatch, triage stalled, diagnose position, identify step, what stage are we really in, governance prep, exit criteria, are we ready, Verifiable Outcome check, criteria met, VO audit, BPF evidence mismatch, ready to advance, MCEM diagnostics."
argument-hint: 'Provide opportunityId to diagnose; optionally specify target stage number'
---

# MCEM Diagnostics

Pinpoints the functional MCEM stage by reading CRM entity state and validates exit criteria against Verifiable Outcomes — all in one pass.

## Freedom Level

**Medium** — VO interpretation requires judgment; exit-criteria checks are rule-based.

## Modes

| Mode | Trigger Keywords | Purpose |
|---|---|---|
| **Identify** | which stage, what stage, stage mismatch, diagnose | Determine functional vs. declared stage |
| **Validate** | exit criteria, are we ready, VO audit, ready to advance | Check criteria for progression |

Both modes run by default. If user only asks "which stage" without mentioning exit criteria, **identify** mode can run standalone.

## Flow

1. Call `msx:crm_get_record` on opportunity for stage, solution play, success plan, `activestageid`.
2. Call `msx:get_milestones` with `opportunityId` for milestone state.
3. **Stage identification** — compare CRM artifacts against MCEM exit criteria:

| Transition | Evidence Required |
|---|---|
| Stage 1 → 2 | Qualified opportunity exists + solution play selected |
| Stage 2 → 3 | CSP created + business value reviewed + plays confirmed |
| Stage 3 → 4 | Customer agreement + resources aligned (`msp_commitmentrecommendation = 861980003`) |
| Stage 4 → 5 | Solution delivered (`msp_milestonestatus = 861980003`) + health metrics agreed |

   - **Non-linear rule**: If CRM Stage says "Stage 3" but no CSP or Business Value Assessment found → label as **Functional Stage 2 (At Risk)**.

4. **Exit criteria validation** — for the current/target stage gate, map achieved VOs:

| Gate | Criterion | CRM Evidence |
|---|---|---|
| 1→2 | Qualified opportunity | `opportunity.statecode = 0` + `activestageid` past qualification |
| 1→2 | Solution play selected | `opportunity.msp_salesplay ne null` |
| 2→3 | Plays confirmed | `opportunity.msp_salesplay` valid value |
| 2→3 | Business value reviewed | BVA entity `status = Complete` |
| 2→3 | CSP created | `msp_successplan` linked |
| 3→4 | Customer agreement | `opportunity.activestageid` post-commitment |
| 3→4 | Resources aligned | `msp_commitmentrecommendation = 861980003` + `msp_milestonedate` set |
| 4→5 | Solution delivered | `msp_milestonestatus = 861980003` |
| 4→5 | Health metrics agreed | CSP health fields populated |

5. Report pass/fail per criterion. Flag BPF stage divergence from VO-based stage.

## Decision Logic

- **All criteria met** → stage progression supported, recommend next-stage skills
- **Partial** → list specific gaps with remediation actions and accountable role
- **BPF vs. functional divergence** → flag discrepancy explicitly as highest-priority finding
- Route gaps to the accountable role for the current stage (ATU→STU→CSU per MCEM model)

## Output Schema

- `current_crm_stage`: stage reflected in MSX/D365
- `functional_mcem_stage`: stage supported by verifiable outcomes
- `outcome_gaps`: numbered list of missing exit criteria
- `criteria_results`: pass/fail per criterion with CRM evidence (validate mode)
- `overall_readiness`: ready | not_ready | partial
- `bpf_vs_vo_discrepancy`: flag if declared stage differs from evidence-based stage
- `recommended_lead`: which role should lead next steps based on functional stage
- `next_action`: names the appropriate skill for gap remediation or next-stage entry
