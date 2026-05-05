---
name: shared-patterns
description: "Shared definitions, runtime contract, upfront scoping pattern, WorkIQ companion, partner motion adjustments, and output conventions used across all MSX/MCEM role workflows. Triggers: runtime contract, upfront scoping, skill composition, WorkIQ companion, output conventions, cross-service data flow, M365 delegation, vault promote, CSU role resolution, CRM linkification, artifact output, partner motion, co-sell, partner-led, ISV partner, partner delivery, partner attribution, partner POC, SI engagement, partner delivery model, co-sell deal registration."
---
# Shared Patterns for MSX/MCEM Operations

## Shared Definitions

| Term                  | Definition                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Opportunity** | Customer engagement container aligned to MCEM stages                                                                                                                     |
| **Milestone**   | Execution unit (`msp_engagementmilestones`) for commitment, delivery, and usage/consumption outcomes                                                                   |
| **Uncommitted** | Still shaping; not fully resourced for delivery (`msp_commitmentrecommendation = 861980000`)                                                                          |
| **Committed**   | Customer agreement + internal readiness for execution (`msp_commitmentrecommendation = 861980003`)                                                                     |
| **Stage 1–5**  | MCEM stages: Listen & Consult → Inspire & Design → Empower & Achieve → Realize Value → Manage & Optimize                                                             |
| **EDE**         | Enhanced Designated Engineer — a dedicated technical resource aligned to a Unified Support package and customer TPID. Tracked in vault `## Unified Coverage`, not CRM |
| **HoK**         | Hands-on-Keyboard — SE-led hands-on work in customer development, test, or production environments to accelerate cloud consumption. Legal coverage required before execution. |
| **Cusp Customer** | A customer where HoK next steps are uncertain — interested but not committed to environment access, or stalled technical progression with ambiguous follow-through. Requires leadership discussion. |
| **SE Activity Record** | An SE task created and immediately closed in the same operation. SE tasks are activity tracking entries (proof delivered, HoK session executed, review conducted) — not open work items. `create_task` is always followed by `close_task` in the same confirmation packet. |
| **Swarming**    | Cross-role collaboration on adjacent pipeline within the same account — working opportunities outside your direct assignment to bring full account value                |

## Opportunity Identifier Discipline

- **GUID (`opportunityid`)**: Use for all tool parameters (`opportunityId`, `opportunityIds`), OData filters, and internal lookups between tools. This is the stable CRM primary key.
- **Number (`msp_opportunitynumber`)**: Use for user-facing display only — tables, links, and chat output. Render as `Opp #` column with CRM deep-link. Fall back to GUID only if number is missing.
- When chaining tool output → tool input, always pass the GUID (`id` field), never the opportunity number.

## MCEM Unit → Agent Role Mapping

| MCEM Unit                   | Agent Roles                                              | Stage Accountability                  |
| --------------------------- | -------------------------------------------------------- | ------------------------------------- |
| ATU (Account Team Unit)     | Account Executive (out of scope for skills)              | Stage 1 lead, co-orchestrates Stage 2 |
| STU (Specialist Team Unit)  | **Specialist**, **Solution Engineer (SE)**   | Stages 2–3 accountable               |
| CSU (Customer Success Unit) | **CSAM**, **Cloud Solution Architect (CSA)** | Stages 4–5 accountable               |
| Partners                    | Referenced contextually                                  | Varies by segment and motion          |

## Runtime Contract

- **Read tools are live**: `msx:crm_auth_status`, `msx:crm_whoami`, `msx:get_my_active_opportunities`, `msx:list_accounts_by_tpid`, `msx:list_opportunities`, `msx:get_milestones`, `msx:get_milestone_activities`, `msx:crm_get_record`, `msx:crm_query`, `msx:get_task_status_options`.
- **Write-intent tools are staged (not immediate writes)**: `msx:create_task`, `msx:update_task`, `msx:close_task`, `msx:create_milestone`, `msx:update_milestone`, `msx:manage_deal_team`, `msx:manage_milestone_team` return staged operations with `staged: true` and an `operationId`.
- **Approval-execution tools are live**: `msx:list_pending_operations`, `msx:view_staged_changes_diff`, `msx:execute_operation`, `msx:execute_all`, `msx:cancel_operation`, `msx:cancel_all`.
- Follow the `write-gate` skill for mandatory human confirmation before calling any execute tool.

### Staged Write Presentation Contract (CLI + Plugin)

When a staged write response is returned, the agent MUST:
1. Show the staged summary to the user (including before/after values and record links).
2. Preserve the operation ID exactly (`OP-*`) and repeat it in the approval prompt.
3. Ask for explicit approval (`approve` / `revise`) before any execution call.
4. Never auto-call `execute_operation` in the same response that staged the change.
5. For multiple pending writes, call `list_pending_operations` and present every operation's diff before asking for approval.

## Upfront Scoping Pattern

Collect scope in minimal calls before per-milestone workflows:

0. **VAULT-PREFETCH** — call `oil:get_customer_context({ customer })` for opportunity GUIDs and context. Skip if OIL unavailable. See `vault-routing` skill.
1. **Prefer `get_milestones` with name resolution** — `msx:get_milestones({ customerKeyword: "Contoso", statusFilter: "active" })` resolves customer → accounts → opportunities → milestones in one call. Add `includeTasks: true` to embed tasks inline.
2. **If vault provided GUIDs** — `msx:get_milestones({ opportunityId })` or `msx:get_milestones({ opportunityIds: [...] })` for batch.
3. `msx:get_milestone_activities(milestoneId)` — only for specific milestones needing deep investigation (or use `includeTasks: true` above).
4. `msx:crm_query` — for ad-hoc OData needs not covered by `get_milestones`. See `crm-query-strategy` skill.

## M365 Communication Layer

### Tool Selection: WorkIQ vs Native MCP

| Need | Tool | Skill |
|---|---|---|
| **Broad M365 discovery** (meetings + chats + emails + files) | `workiq:ask_work_iq` | `workiq-query-scoping` |
| **Targeted Teams** (chat, channel, message search, post) | `teams:*` | `teams-query-scoping` |
| **Targeted email** (KQL search, thread nav, send/reply) | `mail:*` | `mail-query-scoping` |
| **Calendar** (schedule, availability, room booking) | `calendar:*` | `calendar-query-scoping` |

**Hard rule — no exceptions**:
- **WorkIQ** (`workiq:ask_work_iq`): ONLY for broad multi-source discovery that spans meetings + chats + email + files in one sweep.
- **m365-actions subagent** (or native `mail:*` / `teams:*` / `calendar:*` MCP): ALL targeted single-source operations — search, read, headers, thread nav, attachments, compose, send.

**NEVER use WorkIQ when the request targets a single M365 source** (e.g., "find email from X", "search inbox for subject Y", "read Teams thread"). WorkIQ lacks header fidelity — it may omit Cc/Bcc fields, attachment metadata, and thread structure. If you can name the source type, use the dedicated tool.

### Multi-Account Teams Sweep (Vault-Augmented)

When asked for today's Teams activity across all accounts (or a broad account set), a single WorkIQ sweep is **insufficient**. WorkIQ is user-centric — it returns activity where the user was mentioned or directly participated. It **misses silent activity**: messages posted by others in group chats where the user was not mentioned.

**Three-phase pattern:**

1. **Phase 1 — WorkIQ broad sweep** (`workiq:ask_work_iq`): Fast user-centric discovery across all Teams chats/channels. Catches mentions and direct activity.
2. **Phase 2 — Vault-thread poll** (`teams:ListChatMessages` per vault thread ID): Query vault for all `teams-catalog` notes. Extract cached thread IDs. Poll each thread via Teams MCP for messages since midnight. This catches **all** activity in known account threads regardless of user involvement.
3. **Phase 3 — Merge and diff**: Combine results. Anything in Phase 2 not surfaced in Phase 1 is **silent activity** — flag it explicitly.

| Scenario | Phase 1 Only | Phase 1 + 2 |
|---|---|---|
| "What did I miss?" / mentions check | Sufficient | Not needed |
| "What's happening across all accounts today?" | Insufficient | **Required** |
| "Any activity in [specific account] thread?" | Skip | Phase 2 only |
| Morning brief / daily sweep | Start here | Add Phase 2 for completeness |

**Scaling note**: Phase 2 makes one `ListChatMessages` call per vault thread. Cap at `top: 5` per thread for sweep; increase only for confirmed activity.

### Native M365 MCP Tools

- **Teams**: Always set `top` on `SearchTeamsMessages` (start at 5-10). Self-chat (`48:notes`) is not discoverable via `ListChats`. Cache `teamId`/`channelId` after first resolution. Vault-first UPN resolution: call `oil:get_person_context({ name })` before person-targeted ops.
- **Mail**: Always include date range in KQL searches. Use two-pass pattern (search → `GetMessage`). Check attachment sizes before download.
- **Calendar**: Always use `ListCalendarView` (time-bounded), never `ListEvents` (unbounded). Resolve timezone first.

## VAULT-PROMOTE (Post-Workflow)

After completing a CRM workflow, persist validated findings to the vault:

- Use `oil:promote_findings()` or `oil:patch_note()` with `heading: "Agent Insights"`.
- If new opportunity GUIDs were discovered, use `oil:update_customer_file()` to add them.
- **Opportunity capture**: When a workflow reads or modifies opportunity data (deal team, milestones, ACR), chain to `vault-sync` (Mode 1: Opp Sync auto-capture) to sync deal team roster, `estimatedvalue`, `msp_consumptionconsumedrecurring`, milestone `msp_monthlyuse`, and opportunity notes to the vault. Direction: CRM→vault only.
- Skipped automatically if OIL is unavailable.

## Skill Composition Contract

Skills are instruction documents auto-loaded by the runtime when matched. The agent MUST execute multiple skills sequentially in the same turn when needed. Do NOT refuse with "I can only invoke one skill at a time."

### Skill execution

1. **Locate**: Skill Flow/Decision Logic/Output Schema are in context when matched. Fall back to `read_file` at `.github/skills/{name}/SKILL.md` for chained skills not auto-loaded.
2. **Execute**: Follow the skill's `## Flow` — each step maps to MCP tool calls.
3. **Chain**: Read `next_action`. Same-role → execute immediately. Cross-role → present handoff recommendation.
4. **Reuse data**: MCP calls that feed multiple skills should be made once and shared.
5. **Combined output**: Label sections per skill when executing multiple skills.

### Cross-Service Data Flow Guardrails

**Allowed flows** (single-turn, no confirmation needed): CRM→Vault, M365→Vault, CRM→CRM, Vault→CRM.

**Restricted flows** (require explicit user confirmation): M365 content→CRM fields (privacy mismatch), CRM data→M365 send (HBI exposure), any→CRM bulk writes (data integrity). Never copy raw email/chat into CRM fields without approval.

## CSU Role Resolution (CSA / CSAM Lookup)

When any workflow needs to identify the CSA or CSAM for an account or opportunity, follow this resolution chain in order. Stop at the first source that returns a confirmed result.

### Resolution chain

1. **Vault contacts note** (vault-first, most reliable) — `oil:query_notes({ where: { customer: "<name>", tags: "contacts" } })` → `oil:read_note`. Check:
   - `## Microsoft Team` table → rows with Role = "CSAM" or "CSA"
   - `## V-Team Roles (from CRM)` → `### CSAM` and `### CSA` subsections
   - The vault contacts note reflects email-confirmed and V-Team-confirmed assignments. Do NOT override vault-confirmed roles with CRM deal team inferences.
2. **Vault handoff tracker** — check `Reference/Committed-Milestone-Handoff-Tracker.md` for known CSA/CSAM assignments previously confirmed by the user.
3. **CRM deal team** (supplementary, not primary) — `msx:manage_deal_team({ action: "list", opportunityId })` → resolve member titles via `msx:crm_query` on `systemusers` (select `fullname,title,internalemailaddress`). Match titles containing "Cloud Solution Architect" or "CSA" for CSA; "Customer Success" or "CSAM" for CSAM. If no match, check **other opportunities on the same account**. **Critical**: CRM deal team membership alone is not sufficient to infer role.
4. **PBI fallback** — delegate to `pbi-analyst` with the **WhoIsTheCSAM** report:
   - Report ID: `8be168b9-0ba6-415a-bba8-8cbfa2a9e381`
   - Dataset: `SSDMSelfServeOpenAccess`
   - Workspace: `PSDIDeliveryMgmtProdWS01`
   - Filter by TPID. Returns TAM (primary CSAM), ACSAM (backup), SPM, BAM per active Unified package.

### Priority for milestone ownership on commit

- **CSA** — if actively working with the customer on the aligned project
- **CSAM** — fallback when no CSA is actively engaged on the specific project
- See vault `Reference/Milestone-Commitment-Rule.md` for the full commitment rule

## Partner Motion Adjustments

When partner-led or co-sell motions are present on an opportunity, adjust ownership assumptions and delivery attribution:

### Partner Motion Types

| Motion | Ownership Impact | Delivery Attribution |
|---|---|---|
| **Microsoft-led, partner-assisted** | Microsoft roles lead; partner contributes | Milestone delivery = Microsoft + Partner |
| **Partner-led** | Partner leads delivery; Microsoft advisory | Milestone delivery = Partner; CSAM orchestrates |
| **Co-sell** | Shared pipeline; split accountability | Explicit split per milestone required |
| **ISV solution** | ISV owns solution; Microsoft enables platform | ISV delivery; CSA validates architecture |

### Partner Adjustment Rules

- Partner-led milestones → do not assign Microsoft roles as delivery owners
- Co-sell → require explicit accountability split per milestone (no implicit shared)
- Partner delivery with no Microsoft contact → flag as `partner_gap_risk`
- Detect partner involvement via `msx:crm_get_record` on opportunity (partner linkage, co-sell flags, deal registration)
- Skill adjustments: `commit-gate-enforcement` includes partner capacity; `handoff-readiness-validation` includes partner artifacts; `se-execution-check` flags partner execution gaps without absorbing partner PM work

## Common Output Conventions

- Dry-run write payloads include `mock: true` and the tool name that would execute.
- Every stage-bound skill output includes `next_action` naming the recommended next skill.
- Cross-role `next_action` must name the owning role and recommend engagement (no auto-invoke).
- Risk findings always include: one-sentence risk, evidence source, role to act, minimum intervention.
- `connect_hook_hint` (optional): pre-classified Connects impact area(s) and one-line hook template for passive evidence capture.

### Artifact Output Directory (Mandatory — Vault-First)

Generated file artifacts follow a **vault-first** storage strategy. When OIL is available, save artifacts into the Obsidian vault so the user has one place to find everything. Fall back to `.copilot/docs/` only when OIL is unavailable.

#### Resolution order

1. **Vault available** — save to `MCAPS-IQ-Artifacts/` in the vault root via `oil:create_note` (for `.md`/text) or direct file write to the vault path (for binary formats).
   - Customer-scoped artifacts go under `MCAPS-IQ-Artifacts/<Customer>/<name>.<ext>`.
   - General (non-customer) artifacts go under `MCAPS-IQ-Artifacts/<name>.<ext>`.
2. **Vault unavailable** — save to `.copilot/docs/<name>.<ext>` in the workspace root (gitignored fallback).
3. **User provides explicit path** — honor it, regardless of vault availability.

#### Vault paths (when OIL available)

| Artifact type | Customer-scoped | General |
|---|---|---|
| PDF | `MCAPS-IQ-Artifacts/<Customer>/<name>.pdf` | `MCAPS-IQ-Artifacts/<name>.pdf` |
| Word (.docx) | `MCAPS-IQ-Artifacts/<Customer>/<name>.docx` | `MCAPS-IQ-Artifacts/<name>.docx` |
| Excel (.xlsx) | `MCAPS-IQ-Artifacts/<Customer>/<name>.xlsx` | `MCAPS-IQ-Artifacts/<name>.xlsx` |
| PowerPoint (.pptx) | `MCAPS-IQ-Artifacts/<Customer>/<name>.pptx` | `MCAPS-IQ-Artifacts/<name>.pptx` |
| Excalidraw | `MCAPS-IQ-Artifacts/<Customer>/<name>.excalidraw` | `MCAPS-IQ-Artifacts/<name>.excalidraw` |
| PBI session report | `MCAPS-IQ-Artifacts/<Customer>/<prompt>-<date>.md` | `MCAPS-IQ-Artifacts/pbi/<prompt>-<date>.md` |
| Other documents | `MCAPS-IQ-Artifacts/<Customer>/<name>.<ext>` | `MCAPS-IQ-Artifacts/<name>.<ext>` |

#### Fallback paths (vault unavailable)

| Artifact type | Default path |
|---|---|
| PDF | `.copilot/docs/<name>.pdf` |
| Word (.docx) | `.copilot/docs/<name>.docx` |
| Excel (.xlsx) | `.copilot/docs/<name>.xlsx` |
| PowerPoint (.pptx) | `.copilot/docs/<name>.pptx` |
| Excalidraw | `.copilot/docs/excalidraw/<name>.excalidraw` |
| PBI session report | `.copilot/sessions/pbi/<prompt>-<date>.md` |
| Other documents | `.copilot/docs/<name>.<ext>` |

#### Rules

- **Check vault availability first**: Call `oil:get_vault_context()` (or reuse cached result) before choosing output path.
- Create target directories automatically before writing — use `mkdir -p` or equivalent.
- Use descriptive filenames: `<customer>-<artifact>-<date>.<ext>` (e.g. `contoso-pricing-model-2026-03-16.xlsx`).
- After writing to vault, confirm the path in your response so the user knows where to find it.
- Binary files (xlsx, pptx, pdf, docx) are written to the vault filesystem path directly (the vault is a local folder); `oil:create_note` is for markdown notes only.

### CRM Record Linkification (Mandatory)

Always link CRM records in output: `https://microsoftsales.crm.dynamics.com/main.aspx?etn=<entityLogicalName>&id=<GUID>&pagetype=entityrecord`. Entity types: `opportunity`, `msp_engagementmilestone`, `task`. Use `recordUrl` from tool output when available.

### Vault Entity Icons (Mandatory)

All vault entries and agent output MUST use standard entity icons:

| Entity | Icon | Example |
|--------|------|------|
| Opportunity | 🎯 | `# 🎯 Copilot Rollout` |
| Milestone | 📋 | `# 📋 AI Migration Pilot` |
| Task (by state) | ✅ 🔄 ➕ ❌ ⏸️ | `✅ Completed`, `🔄 In Progress` |
| Deal Team member | 👤 | `👤 Jin Lee` |
| ACR / Revenue | 💰 | `## 💰 ACR Summary` |
| CRM Link | 🔗 | `[🔗 MSX](url)` |
| Risk / Warning | ⚠️ | `⚠️ Stale data` |
| Customer | 🏢 | `## 🏢 Contoso` |

See `vault-routing` skill § Vault Entity Icon & Link Standards for full contract.

### Markdown Table Formatting for Vault Notes (Mandatory)

Broken tables render as raw text in Obsidian. These rules prevent the three most common failures:

1. **Escape `|` in cell content**: Any pipe character inside a table cell MUST be escaped as `\|`. Common in opportunity names (`CIGNA \| Accelerate AI \| Call Center`).
2. **Every row ends with `|`**: A row like `| Name | Value` is INVALID — must be `| Name | Value |`.
3. **Separator columns match header columns**: `|---|---|` for 2 columns. Never double-pipe (`||`) or missing columns.
