---
name: account-landscape-awareness
description: 'Account landscape scanner: surfaces full pipeline, cross-role activity, and EDE coverage across accounts where user is on the deal team. Identifies swarming opportunities where adjacent pipeline exists outside your solution area, and Unified investment signals from package/EDE gaps. Chains with account-structure-diagram and pipeline-hygiene-triage. Triggers: swarm opportunities, account landscape, what else is happening, other pipeline, cross-CSA, EDE alignment, EDE gaps, who else is working, full account view, Unified upsell, package coverage, swarming, adjacent pipeline.'
argument-hint: 'Optionally provide customerKeyword to focus on one account, or omit for portfolio-wide scan'
---

## Purpose

Surfaces the full pipeline landscape across the user's accounts — not just their own opportunities — so they can see adjacent work, identify swarming opportunities, and detect EDE/Unified coverage gaps that represent commercial signals.

## Freedom Level

**Medium** — Data gathering is structured; swarming classification and investment signals require judgment.

## Trigger

- "What else is happening on my accounts?"
- "Who else is working on this customer?"
- "Are there opportunities I should be aware of / could swarm on?"
- "Which accounts have EDE gaps?" or "Where should we invest in Unified?"
- Account team reaches out about work starting without domain coverage
- Pre-governance portfolio awareness for cross-role alignment

## Flow

### Layer 1 — My Footprint → Full Account Pipeline (the "Diff")

1. **VAULT-PREFETCH** — `oil:get_customer_context({ customer })` if a specific customer is named. Otherwise `oil:get_vault_context()` for the full roster.

2. **My footprint** — `msx:get_my_active_opportunities()` with optional `customerKeyword`. Returns opportunities tagged `relationship: 'owner'` or `relationship: 'deal-team'`. Extract:
   - `my_opportunity_ids` — set of opportunity GUIDs I'm on
   - `my_account_ids` — set of unique `_parentaccountid_value` from those opportunities

3. **Full account pipeline** — For each account in `my_account_ids`:
   - `msx:list_opportunities({ accountIds: [<account_ids>], format: 'compact' })` — returns active opportunities on those accounts in a compact shape for faster diff/scoring.
   - Tag each returned opportunity: `mine: true` if `opportunityid ∈ my_opportunity_ids`, else `mine: false`.

4. **Produce the diff**:
   - **My opportunities**: opps where `mine: true` — include stage, solution play, health summary.
   - **Adjacent opportunities**: opps where `mine: false` — these are swarming candidates. Include: opportunity name, owner (`_ownerid_value`), solution play (`msp_salesplay`), estimated close date, consumption.
   - **Isolation signal**: accounts where ALL opps are `mine: true` and user is sole resource → flag as single-threaded risk.

### Layer 2 — Cross-Role Coverage Map

5. **Milestone owners across all opps** — `msx:get_milestones({ opportunityIds: [<all_opp_ids>], statusFilter: 'active', format: 'summary' })`. Or if single customer: `get_milestones({ customerKeyword, statusFilter: 'active' })`.

6. **Build people roster** — Extract unique `_ownerid_value` across all milestones. Group by opportunity. For each person, infer role from milestone context (solution area, workload type) or vault People notes (`oil:resolve_people_to_customers` / `oil:get_person_context`).

7. **Cross-role matrix** — Per account, produce:
   | Person | Role (inferred) | Opportunities | Milestone Count | Solution Area |
   |---|---|---|---|---|
   - Highlight: other CSAs on the account, SEs running proofs, Specialists with adjacent pipeline.
   - Flag: opportunities with NO milestone activity (pipeline exists but nobody is executing).

### Layer 3 — EDE & Unified Coverage (Vault-Backed)

> **Context**: Enhanced Designated Engineers (EDEs) align to Unified Support packages by TPID. CRM does not have a clean entity for EDE→package→account mapping. The vault serves as the knowledge layer for this data.

8. **Read vault EDE data** — `oil:read_note({ path: 'Customers/<Customer>/<Customer>.md', section: 'Unified Coverage' })` or check for a dedicated `unified-coverage.md` sub-note. Extract:
   - Unified packages on the account
   - EDEs aligned per package (name, domain: Infra / Security / Data & AI / Modern Work / Business Apps)
   - Package consumption status (utilized / underconsumed / at-cap)

9. **Cross-reference pipeline vs. EDE coverage**:
   - For each **adjacent opportunity** (Layer 1 `mine: false`), map its solution play to an EDE domain.
   - Flag **coverage gaps**: active pipeline in a domain with no aligned EDE.
   - Flag **investment signals**: underconsumed package + active pipeline + no EDE = "consider Unified infrastructure add-on to get a resource aligned."

10. **If no vault EDE data exists** — Surface the gap: "No Unified coverage data tracked for this account. Consider adding a `## Unified Coverage` section to capture package/EDE alignment." Offer to scaffold it.

## Decision Logic

### Swarming Classification

| Signal | Classification | Recommended Action |
|---|---|---|
| Adjacent opp in same solution area, different owner | **Peer swarm** | Coordinate with opp owner — shared proof/delivery possible |
| Adjacent opp in different solution area, same account | **Cross-domain awareness** | Attend account team sync; understand dependencies |
| Adjacent opp with no milestone activity | **Pipeline-only (dormant)** | Check with opp owner if execution is planned; may need activation |
| My opp + adjacent opp share customer stakeholders | **Stakeholder overlap** | Coordinate messaging; avoid competing for same sponsor attention |

### Unified Investment Signal Classification

| Signal | Strength | Recommended Action |
|---|---|---|
| Active pipeline + no EDE in domain + underconsumed package | **High** | Propose Unified add-on to align EDE resource; route to Specialist |
| Active pipeline + EDE exists but different domain | **Medium** | Cross-brief EDE on adjacent work; check if domain expansion warranted |
| No active pipeline + EDE aligned | **Low (monitor)** | EDE capacity available — proactively look for customer needs to leverage |
| Pipeline + EDE aligned + package well-consumed | **Covered** | Healthy state; maintain cadence |

### Portfolio Scan Mode

When no `customerKeyword` is provided, run Layers 1-2 across all accounts from `get_my_active_opportunities()`. Produce a portfolio-level summary:
- Accounts ranked by swarming opportunity count
- Accounts with EDE coverage gaps (if vault data exists)
- Accounts where user is single-threaded (isolation risk)

## Output Schema

- `my_footprint`: list of opportunities the user is on (owner or deal team), grouped by account
- `adjacent_pipeline`: list of opportunities per account the user is NOT on, with owner, solution play, stage
- `cross_role_map`: people × opportunities × role matrix per account
- `swarming_opportunities`: classified swarming signals with recommended actions
- `ede_coverage`: per-account EDE alignment status (from vault) — or gap flag if no data
- `investment_signals`: Unified upsell opportunities from package/EDE gaps cross-referenced with pipeline
- `isolation_risks`: accounts where user is the sole resource
- `next_action`: context-dependent —
  - If swarming opportunities found: "Review adjacent pipeline. Consider running `account-structure-diagram` for {customer} to visualize the full landscape."
  - If EDE gaps found: "Unified investment signal detected. **Specialist** should evaluate Unified add-on for {domain} coverage. Run `pipeline-qualification` to scope."
  - If dormant pipeline: "Run `pipeline-hygiene-triage` to assess stale opportunities on {account}."
- `connect_hook_hint`: Impact Area(s): Culture & Collaboration, Business Impact — "Surfaced {n} swarming opportunities and {m} EDE coverage gaps across {account_count} accounts — enabling cross-role collaboration and Unified investment targeting"
