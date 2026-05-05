---
name: account-structure-diagram
description: 'Excalidraw diagram generator: produces visual maps of account structure — opportunities, milestones, deal-team roles, MCEM stage positions, and role-specific prioritized views. Assembles CRM + vault data into a renderable .excalidraw.md file. Chains with mcem-stage-identification and role-orchestration for enriched stage/role context. Triggers: diagram, visualize account, draw structure, Excalidraw, account map, opportunity map, visual overview, show me the account, structural view, customer map, portfolio visualization. DO NOT USE FOR: architecture feasibility reviews or technical POC planning — use architecture-feasibility-check.'
argument-hint: 'Provide customer name, opportunityId(s), or account TPID — optionally specify role for a prioritized lens'
---

## Purpose

Generates an Excalidraw diagram that visually represents a customer's account structure — accounts, opportunities, milestones, deal-team members, MCEM stage positions, and status health — so account teams gain a single-glance structural overview.

## When to Use

- Account team needs a visual overview before a governance meeting or QBR
- User asks "show me the account structure" or "draw a diagram of this customer"
- Cross-role alignment meeting where structural context must be shared quickly
- Specialist wants a portfolio-level visual across multiple opportunities
- CSAM preparing a customer health summary for leadership

## Freedom Level

**Medium** — Layout heuristics and grouping are context-dependent; the Excalidraw JSON structure is exact.

## Flow

1. **Scope** — Identify the customer. Use one of:
   - `oil:get_customer_context({ customer })` for vault-first prefetch (account IDs, known opportunity GUIDs).
   - `msx:list_accounts_by_tpid({ tpid })` if TPID is provided.
   - `msx:get_my_active_opportunities({ customerKeyword })` to discover opportunities by name.

2. **Gather structural data** — For each opportunity in scope:
   - `msx:get_milestones({ opportunityIds: [...], includeTasks: true })` — batch milestones with inline tasks, status, commitment, owners, dates. Or use `customerKeyword` for customer-scoped retrieval in one call.
   - `oil:get_vault_context()` — stakeholder map, risk flags, relationship notes (skip if unavailable).

3. **Classify MCEM stage** — For each opportunity, determine functional stage using `mcem-stage-identification` Decision Logic (or reuse if already in context). Tag each opportunity node with its stage.

4. **Apply role lens** (if role specified) — Prioritize and highlight elements relevant to the user's role:

   | Role | Prioritized view |
   |---|---|
   | Specialist | Pipeline health, Stage 2–3 opportunities, close-date proximity, forecast gaps |
   | SE | Technical proof milestones, task ownership, blocker status |
   | CSA | Architecture milestones, commitment readiness, delivery guardrails |
   | CSAM | Full account breadth, adoption milestones, Stage 4–5 health, governance items |

5. **Generate Excalidraw diagram** — Produce a valid `.excalidraw.md` code block using the layout and element specs below.

6. **Output** — Return the diagram as a fenced code block (` ```excalidraw `) that can be pasted into an Obsidian note. When OIL is available, save the `.excalidraw` file to the vault `MCAPS-IQ-Artifacts/` folder (customer-scoped: `MCAPS-IQ-Artifacts/<Customer>/`); otherwise fall back to `.copilot/docs/excalidraw/` (see `shared-patterns` skill § Artifact Output Directory).

## Layout Specification

### Node hierarchy

```
Account (top-level container)
├── Opportunity 1 (grouped by MCEM stage)
│   ├── Milestone A (color-coded by status)
│   │   └── Tasks (collapsed unless blockers)
│   └── Milestone B
├── Opportunity 2
│   └── ...
└── Deal Team (side panel)
    ├── Role: Person
    └── ...
```

### Element types and styling

| Element | Shape | Color | Border |
|---|---|---|---|
| Account | Rectangle, rounded | `#f0f0f0` fill | 2px solid `#333` |
| Opportunity (On Track) | Rectangle | `#d4edda` fill | 1px `#28a745` |
| Opportunity (At Risk) | Rectangle | `#fff3cd` fill | 2px `#ffc107` |
| Opportunity (Blocked) | Rectangle | `#f8d7da` fill | 2px `#dc3545` |
| Milestone (Committed) | Rounded rect | `#cce5ff` fill | 1px `#004085` |
| Milestone (Uncommitted) | Rounded rect | `#e2e3e5` fill | 1px `#6c757d` |
| Milestone (Completed) | Rounded rect | `#d4edda` fill | 1px dashed `#155724` |
| MCEM Stage label | Text badge | Stage color gradient | — |
| Deal Team member | Ellipse | Role-based color | 1px `#666` |
| Arrow (parent→child) | Arrow | `#666` | — |
| Risk flag | Diamond | `#dc3545` fill | 2px `#721c24` |

### MCEM stage colors

| Stage | Color | Label |
|---|---|---|
| Stage 1: Listen & Consult | `#e8d5f5` | S1 |
| Stage 2: Inspire & Design | `#d5e8f5` | S2 |
| Stage 3: Empower & Achieve | `#d5f5e8` | S3 |
| Stage 4: Realize Value | `#f5ead5` | S4 |
| Stage 5: Manage & Optimize | `#f5d5d5` | S5 |

### Role colors (deal team panel)

| Role | Color |
|---|---|
| Specialist | `#6f42c1` |
| SE | `#20c997` |
| CSA | `#fd7e14` |
| CSAM | `#0d6efd` |
| Partner | `#6c757d` |

## Excalidraw Output Format

Generate a valid Excalidraw JSON scene wrapped in an Obsidian-compatible code block. The structure must follow Excalidraw v2 schema:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "mcaps-iq",
  "elements": [
    {
      "type": "rectangle",
      "id": "<unique-id>",
      "x": 0, "y": 0,
      "width": 300, "height": 60,
      "backgroundColor": "<fill>",
      "strokeColor": "<border>",
      "strokeWidth": 2,
      "roundness": { "type": 3 },
      "boundElements": [{ "type": "text", "id": "<text-id>" }]
    },
    {
      "type": "text",
      "id": "<text-id>",
      "x": 10, "y": 15,
      "text": "<label>",
      "fontSize": 16,
      "containerId": "<parent-rect-id>"
    },
    {
      "type": "arrow",
      "id": "<arrow-id>",
      "startBinding": { "elementId": "<from>", "focus": 0, "gap": 5 },
      "endBinding": { "elementId": "<to>", "focus": 0, "gap": 5 }
    }
  ],
  "appState": { "gridSize": null, "viewBackgroundColor": "#ffffff" }
}
```

### Layout algorithm

- **Y-axis**: group opportunities by MCEM stage (Stage 1 at top → Stage 5 at bottom).
- **X-axis**: milestones flow left-to-right within each opportunity by `msp_milestonedate`.
- **Deal team panel**: positioned to the right of the main structure.
- **Spacing**: 120px vertical between opportunity rows, 160px horizontal between milestone columns.
- **Container width**: scale to content; minimum 800px wide.

### ID generation

Use deterministic IDs derived from CRM entity IDs: `acc-{accountid}`, `opp-{opportunityid}`, `ms-{milestoneid}`, `role-{systemuserid}`.

## Decision Logic

- If >10 opportunities: group by solution play (`msp_salesplay`) into collapsible clusters; show counts per cluster. Expand only At Risk / Blocked opportunities by default.
- If single opportunity: expand fully with all milestones and tasks visible.
- If role lens active: dim (reduce opacity to 30%) elements outside the role's accountability scope.
- If vault stakeholder map available: add stakeholder nodes linked to their associated milestones.
- If stage divergence detected (from `mcem-stage-identification`): add a warning badge on the opportunity node showing `CRM: Stage X → Functional: Stage Y`.

## Output Schema

- `diagram`: Excalidraw JSON scene in ` ```excalidraw ` code block
- `summary`: one-paragraph natural language description of the account structure
- `health_snapshot`: counts by status (on_track, at_risk, blocked, completed)
- `stage_distribution`: opportunity count per MCEM stage
- `role_coverage`: deal team members mapped to their owned milestones
- `next_action`: suggests follow-up skill based on findings — e.g., `pipeline-hygiene-triage` if stale items detected, `risk-surfacing` if At Risk milestones found, `milestone-health-review` for governance prep
- `connect_hook_hint`: Impact Area(s): Customer Impact, Culture & Collaboration — "Generated account structure diagram for {customer}: {n} opportunities across Stages {stages}, {health_snapshot}"
