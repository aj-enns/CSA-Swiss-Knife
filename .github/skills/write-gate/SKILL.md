---
name: write-gate
description: "MSX Role Mapping + Write Confirmation Gate. Enforces role mapping from CRM user profile and human-in-the-loop confirmation before write operations. Triggers: CRM write, create task, update task, close task, create milestone, update milestone, manage deal team, staged operation, staged changes, pending operations, execute operation, execute all, write confirmation, role authority, role mapping, picklist field mapping."
---

# MSX Role Mapping + Write Confirmation Gate

## Scope
Applies when working with MSX/MCEM CRM workflows, especially write-intent tools:
`crm_auth_status`, `crm_whoami`, `crm_get_record`, `crm_query`, `get_milestones`, `get_milestone_activities`,
`create_task`, `update_task`, `close_task`, `update_milestone`

## 0) CRM Read Scoping (Required before bulk reads)
Before calling any CRM read tool that may return large result sets:
1. **VAULT-PREFETCH first**: If OIL is available, call `get_customer_context({ customer })` for the target customer.
2. **Confirm the user's role** (see §1 below).
3. **Prefer `get_milestones` with name resolution**: Use `customerKeyword` or `opportunityKeyword`.
4. Only use `get_milestones(mine: true)` if the user explicitly requests all milestones.

## 1) Role Resolution (Required before workflow guidance)
1. Identify current user via `crm_auth_status` (or `crm_whoami`).
2. Fetch profile data using `crm_get_record` for `systemusers(<userId>)`.
3. Map the user to one of: Specialist, Solution Engineer, Cloud Solution Architect, Customer Success Account Manager.
4. If mapping is ambiguous: Present top 1–2 likely roles with reasons and ask the user to confirm.
5. If mapping is unknown: Ask the user which role workflow to apply.

## 2) Role-Bound Execution Rules
Use the selected role skill as the primary workflow contract for boundary decisions, stage/ownership checks, handoff format, and escalation triggers.

## 2a) Role-Action Authority Matrix (Mandatory pre-write check)

| Action | Allowed Roles | Blocked Roles (must redirect) |
|---|---|---|
| `create_milestone` | **Specialist**, **CSA** | SE, CSAM — redirect to Specialist |
| `update_milestone` (structure) | **Specialist**, **CSAM** (Stage 4-5 only) | SE, CSA — redirect to Specialist/CSAM |
| `update_milestone` (status only) | **Specialist**, **CSAM**, **CSA** | SE — redirect to milestone owner |
| `create_task` | **All roles** (on milestones they touch) | — |
| `update_task` | **Task owner**, or role that created it | Other roles — redirect to task owner |
| `close_task` | **Task owner**, or role that created it | Other roles — redirect to task owner |
| Opportunity field updates | **Specialist** | SE, CSA, CSAM — redirect to Specialist |
| Deal team membership | **Specialist**, **self-add by any role** | — |

**Enforcement rule**: When the agent detects a gap (e.g., "this milestone has no tasks"), the recommendation must respect the matrix.

## 3) Mandatory Plan Mode for Write-Intent Actions

### 3a) Picklist Field Mapping (Required for milestone create/update)
1. **Map all picklist fields** to numeric codes using `crm-entity-schema` skill.
2. For `create_milestone`, all four milestone-view fields are **mandatory** — `workloadType`, `deliveredBy`, `preferredAzureRegion`, `azureCapacityType`.
3. If the user's value doesn't match, call `get_milestone_field_options({ field: "..." })`.
4. **Never guess a numeric code.**
5. Show resolved label alongside numeric code in confirmation packet.

### Required confirmation packet (must be shown to user)
- Role being applied
- Customer/account name
- Opportunity name + CRM link
- Milestone/task name + CRM link
- Current values relevant to the change
- Proposed new values (with picklist labels)
- Why the change is needed
- Expected impact and any risk

### SE Activity Tracking: Create-and-Close (Mandatory for SE role)

When the active role is **SE**, every `create_task` MUST be paired with an immediate `close_task` in the same confirmation packet. SE tasks are **activity records** (completed work), not open work items.

- Present as a single atomic operation: "Create and close task: [description]".
- The confirmation packet shows both the create and close as one proposed action.
- Approval covers both operations — no separate confirm for the close.
- If the SE describes a **future/planned** activity, do NOT create a task. Advise recording it after the activity is performed.

### Confirmation language
Ask for explicit approval: "Please confirm this update is correct. Reply: `approve` to proceed or `revise` to change details."

Rules:
- Do not perform write-intent calls in the same response that first proposes changes.
- If any identity field is missing, stop and ask for it.
- For multi-record changes, list each record and require approval for the full set.

### Staged response rendering (mandatory)
When a write-intent tool returns a staged operation:
- Show the staged summary to the user, including current state, proposed change, and record link(s).
- Include the operation ID and ask explicitly for approval (`approve` / `revise`).
- Do not collapse the staged output into a one-line summary.
- If more than one operation is staged, call `list_pending_operations` and present each pending diff before asking for approval.

## 4) Safety and Auditability
- Re-state identifiers before executing write-intent operations.
- Prefer smallest possible change set.
- After each write, return a concise result summary and follow-up verification read.

## 5) Post-Write Vault Capture (Automatic for Task Operations)

After any confirmed `create_task`, `update_task`, or `close_task` write completes successfully:

1. **Chain to `vault-sync` skill** (Mode 5: Task Sync post-write hook) — pass the write result and confirmation packet context (customer, milestone, opportunity).
2. The vault capture is a **silent side-effect** — no additional user confirmation needed. The user already approved the CRM write; the vault log is a downstream record.
3. If vault (OIL) is unavailable, skip silently — CRM is the system of record. Log a note: *"Vault unavailable — run `/task-sync` later to backfill."*
4. If the vault write fails, warn: *"⚠️ Task recorded in CRM but vault capture failed. Run `/task-sync` to reconcile."*

This ensures every SE task operation produces a durable activity trail in the customer's milestone note without extra manual steps.

## 6) Post-Write Vault Capture (Automatic for Opportunity Operations)

After any confirmed `update_milestone`, `create_milestone`, or `manage_deal_team` write completes successfully:

1. **Chain to `vault-sync` skill** (Mode 1: Opp Sync auto-capture) — pass the opportunity context from the confirmation packet (customer, opportunity GUID/number, and any deal team or milestone data retrieved during the workflow).
2. The vault capture is a **silent side-effect** — no additional user confirmation needed. This is a one-way CRM→vault sync.
3. If vault (OIL) is unavailable, skip silently. If vault write fails, warn: *"⚠️ CRM write succeeded but vault opportunity capture failed. Run `opp sync` to reconcile."*
4. **Direction rule**: This skill reads CRM and writes to vault. It never writes back to CRM. The user must explicitly request CRM updates through the write-gate.
