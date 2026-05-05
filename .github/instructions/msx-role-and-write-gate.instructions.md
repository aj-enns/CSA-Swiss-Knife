---
description: "Use for MSX/MCEM CRM operations, milestone/task updates, role-based workflow routing, and any create/update/close action via MCP tools. Enforces role mapping from CRM user profile and human-in-the-loop confirmation before write operations."
applyTo: "mcp-server/**"
---
# MSX Role Mapping + Write Confirmation Gate

## Scope
- Applies when working with MSX/MCEM CRM workflows, especially when using:
  - `crm_auth_status`, `crm_whoami`, `crm_get_record`, `crm_query`, `get_milestones`, `get_milestone_activities`
  - `create_task`, `update_task`, `close_task`, `update_milestone`

## 0) CRM Read Scoping (Required before bulk reads)
Before calling any CRM read tool that may return large result sets (especially `get_milestones` with `mine: true`):
1. **VAULT-PREFETCH first**: If OIL is available, call `get_customer_context({ customer: "<Name>" })` for the target customer to get assembled context including opportunity GUIDs, account IDs, and team. Use these IDs directly in CRM queries — do not run CRM discovery queries for identifiers the vault already has. For CRM-ready filters, use `prepare_crm_prefetch({ customers: ["<Name>"] })`. (See `obsidian-vault.instructions.md` § VAULT-PREFETCH.)
2. **Confirm the user's role** (see §1 below).
3. **Prefer `get_milestones` with name resolution**: Use `get_milestones({ customerKeyword: "Contoso" })` or `get_milestones({ opportunityKeyword: "Azure Migration" })` to resolve names to milestones in one call. Add `statusFilter: 'active'` and/or `includeTasks: true` as needed.
4. **Use `get_milestones` with a specific `opportunityId` or `milestoneId`/`milestoneNumber`** when you have the identifier (from vault or user).
5. Only use `get_milestones(mine: true)` (unfiltered) if the user explicitly requests all milestones and you have warned about volume.
6. **Avoid chaining** `list_opportunities` → `get_milestones` — use `customerKeyword` or `opportunityKeyword` on `get_milestones` instead.

## 1) Role Resolution (Required before workflow guidance)
1. Identify current user via `crm_auth_status` (or `crm_whoami`).
2. Fetch profile data using `crm_get_record` for `systemusers(<userId>)` with available identity fields (for example: name/title/email/business unit).
3. Map the user to one of these role workflows:
   - `Account Executive` → `role-ae` skill
   - `Specialist` → `role-specialist` skill
   - `Solution Engineer` → `role-se` skill
   - `Cloud Solution Architect` → `role-csa` skill
   - `Customer Success Account Manager` → `role-csam` skill
   - `Account Technology Strategist` → `role-ats` skill
   - `Industry Advisor` → `role-ia` skill
   - `ATU Sales Director` → `role-atu-sd` skill
4. If mapping is ambiguous or multiple roles match:
   - Present top 1–2 likely role mappings with reasons.
   - Ask the user to confirm role before proceeding.
5. If mapping is unknown:
   - Do not invent a role.
   - Ask the user which role workflow to apply.

## 2) Role-Bound Execution Rules
- Use the selected role skill as the primary workflow contract for:
  - boundary decisions,
  - stage/ownership checks,
  - handoff format,
  - escalation triggers.
- If a requested action conflicts with the selected role boundary, call out the conflict and propose the correct owner/route.

## 2a) Role-Action Authority Matrix (Mandatory pre-write check)

Before proposing or executing **any** write-intent action, check this matrix. If the active role is not in the **Allowed Roles** column, **STOP** — do not propose the action. Instead, name the correct role and suggest the user coordinate with that person.

| Action | Allowed Roles | Blocked Roles (must redirect) |
|---|---|---|
| `create_milestone` | **Specialist** | AE, IA, SD, SE, CSA, CSAM, ATS — redirect to Specialist |
| `update_milestone` (structure: name, date, monthlyUse, workload, commitment) | **Specialist**, **CSAM** (Stage 4-5 only) | SE, CSA, ATS — redirect to Specialist/CSAM |
| `update_milestone` (status only: On Track/At Risk/Blocked) | **Specialist**, **CSAM**, **CSA** | SE, ATS — can flag but redirect status update to milestone owner |
| `create_task` | **All roles** (on milestones they touch) | — |
| `update_task` | **Task owner**, or role that created it | Other roles — redirect to task owner |
| `close_task` | **Task owner**, or role that created it | Other roles — redirect to task owner |
| Opportunity field updates (stage, close date, revenue) | **Specialist** | AE, IA, SD, SE, CSA, CSAM, ATS — redirect to Specialist |
| Deal team membership (opportunity) | **Specialist**, **self-add by any role** | — |
| Milestone team membership | **Milestone owner**, **CSA**, **CSAM**, **Specialist** | Other roles — redirect to milestone owner |

**Enforcement rule**: When the agent detects a gap (e.g., "this milestone has no tasks"), the recommendation must respect the matrix:
- If the gap is a missing **milestone** → recommend the user flag it to their **Specialist**, not create it themselves.
- If the gap is a missing **task** on an existing milestone → the active role may create it (if they touch that milestone).
- If the gap is a stale **opportunity field** → recommend the user flag it to their **Specialist**.

## 3) Mandatory Plan Mode for Write-Intent Actions
Before calling any write-intent tool (`create_task`, `update_task`, `close_task`, `create_milestone`, `update_milestone`), always:
1. **Check §2a Role-Action Authority Matrix** — confirm the active role is allowed. If not, STOP and redirect.
2. Run a confirmation step.

### 3a) Picklist Field Mapping (Required for `create_milestone` and `update_milestone`)
Before building the confirmation packet for milestone create/update operations:
1. **Map all picklist fields** to numeric codes using the reference tables in `crm-entity-schema.instructions.md` § Workload Type / Delivered By / Preferred Azure Region / Azure Capacity Type.
2. For `create_milestone`, all four milestone-view fields are **mandatory** — `workloadType`, `deliveredBy`, `preferredAzureRegion`, `azureCapacityType`. If the user has not specified a value, ask for it (present the available options).
3. If the user's value does not match any entry in the embedded common-values tables, call `get_milestone_field_options({ field: "..." })` to retrieve the full option list from live Dynamics 365 metadata.
4. **Never guess a numeric code.** If no match is found after querying metadata, ask the user to verify.
5. Show the resolved human-readable label alongside the numeric code in the confirmation packet (e.g. `workloadType: Azure (861980000)`).

### Required confirmation packet (must be shown to user)
- Role being applied (SE/CSA/CSAM/Specialist)
- Customer/account name
- Opportunity name + [CRM link](https://microsoftsales.crm.dynamics.com/main.aspx?etn=opportunity&id=<GUID>&pagetype=entityrecord)
- Milestone/task name + [CRM link](https://microsoftsales.crm.dynamics.com/main.aspx?etn=<etn>&id=<GUID>&pagetype=entityrecord)
- Current values relevant to the change
- Proposed new values (with picklist labels resolved to "Label (code)" format)
- Why the change is needed (business intent)
- Expected impact and any risk

**Linkification**: Every opportunity, milestone, and task in the confirmation packet must be a clickable CRM link. Use `recordUrl` from `get_milestones` when available, otherwise construct from the entity logical name and GUID (see `crm-entity-schema.instructions.md` § CRM Record URL Pattern).

### SE Activity Tracking: Create-and-Close (Mandatory for SE role)

When the active role is **SE**, every `create_task` MUST be paired with an immediate `close_task` in the same confirmation packet. SE tasks are **activity records** (completed work), not open work items.

- Present as a single atomic operation: "Create and close task: [description]".
- The confirmation packet shows both the create and close as one proposed action.
- Approval covers both operations — no separate confirm for the close.
- If the SE describes a **future/planned** activity, do NOT create a task. Advise recording it after the activity is performed.
- This rule applies to all SE task creation: task hygiene backfills, proof plan tasks, HoK activity records, and execution monitoring follow-ups.

### Confirmation language
Ask for explicit approval in a separate step, for example:
- "Please confirm this update is correct. Reply: `approve` to proceed or `revise` to change details."

Rules:
- Do not perform write-intent calls in the same response that first proposes changes.
- If any identity field (customer/opportunity/milestone/task) is missing, stop and ask for it.
- For multi-record changes, list each record and require clear approval for the full set.

## 4) Safety and Auditability
- Re-state identifiers before executing write-intent operations.
- Prefer smallest possible change set.
- After each write-intent operation, return a concise result summary and any follow-up verification read.
- If write tools are currently dry-run/mock, still require the same confirmation flow.

## 5) Output Style for MSX Operations
When producing action recommendations or preflight checks, use this order:
1. Role selected + confidence
2. Workflow checks (pass/fail)
3. Proposed action plan
4. Confirmation packet
5. Await approval

## 6) Post-Write Vault Capture (Task Operations)

After any confirmed `create_task`, `update_task`, or `close_task` write completes:

1. **Automatically chain** to the `vault-sync` skill (Mode 5: Task Sync post-write hook) — pass the write result plus confirmation-packet context (customer, milestone, opportunity names and GUIDs).
2. No additional user confirmation — the vault log is a downstream record of the already-approved CRM write.
3. If OIL is unavailable, skip silently. If vault write fails, warn the user and suggest `/task-sync` to reconcile later.
4. For batch task operations (e.g., task-hygiene corrections), run vault capture once after all writes complete rather than per-task.

## 7) Post-Write Vault Capture (Opportunity Operations)

After any confirmed `update_milestone`, `create_milestone`, or `manage_deal_team` write completes:

1. **Automatically chain** to the `vault-sync` skill (Mode 1: Opp Sync auto-capture) — pass the opportunity context from the confirmation packet (customer, opportunity GUID/number, deal team, milestones with ACR values).
2. No additional user confirmation — the vault capture is a one-way CRM→vault sync of the already-approved data.
3. If OIL is unavailable, skip silently. If vault write fails, warn the user and suggest `opp sync` to reconcile later.
4. This captures deal team roster, opportunity notes, ACR values (`estimatedvalue`, `msp_consumptionconsumedrecurring`, milestone `msp_monthlyuse`), and pipeline metadata to the vault.
5. **Direction rule**: CRM→vault only. The vault is a read-cache. To update CRM, the user must explicitly request a write through the write-gate.
