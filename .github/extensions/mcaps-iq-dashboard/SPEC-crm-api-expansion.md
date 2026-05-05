# Spec: Full MSX Toolset API for Dashboard Extension

## Status: Implemented (Layers 1-3 + Frontend Phases 1-2 + Approval Bar)

## Problem

The dashboard currently exposes only 4 CRM endpoints:
- `GET /api/crm/status` → `crm_auth_status`
- `GET /api/crm/whoami` → `crm_whoami`
- `GET /api/crm/opportunities` → `get_my_active_opportunities`
- `GET /api/crm/milestones` → `get_milestones`
- `POST /api/crm/refresh` → cache invalidation

The MSX MCP server provides 20+ tools. Missing operations (tasks, milestone updates, deal team management, staged writes) force users back to the Copilot chat or CRM UI for actions they could take directly in the dashboard.

## Goal

Expose every MSX MCP tool through the dashboard API so the frontend can support inline editing, task management, staged writes with approval, and deal team operations — all within the Opportunities/Milestones views.

## MSX Tool Inventory

### Read Tools (live, cacheable)

| Tool | Dashboard Endpoint | Query Params | Notes |
|---|---|---|---|
| `crm_auth_status` | `GET /api/crm/status` | — | **Exists** |
| `crm_whoami` | `GET /api/crm/whoami` | — | **Exists** |
| `get_my_active_opportunities` | `GET /api/crm/opportunities` | `customer`, `maxResults`, `dealTeam` | **Exists** |
| `get_milestones` | `GET /api/crm/milestones` | `opportunityId`, `customer`, `status`, `tasks`, `mine` | **Exists** |
| `get_milestone_activities` | `GET /api/crm/milestones/:id/activities` | — | **New** |
| `get_milestone_field_options` | `GET /api/crm/metadata/milestone-fields/:field` | — | **New** — returns picklist options |
| `get_task_status_options` | `GET /api/crm/metadata/task-statuses` | — | **New** |
| `list_accounts_by_tpid` | `GET /api/crm/accounts` | `tpids` (comma-separated) | **New** |
| `list_opportunities` | `GET /api/crm/opportunities/search` | `filter`, `top` | **New** — raw OData filter |
| `crm_get_record` | `GET /api/crm/records/:entitySet/:id` | `select` | **New** — single record |
| `crm_query` | `GET /api/crm/query` | `entitySet`, `filter`, `select`, `top` | **New** — generic OData (allowlisted entities only) |
| `find_milestones_needing_tasks` | `GET /api/crm/milestones/needing-tasks` | `customer` | **New** |

### Write-Intent Tools (staged — return operationId, not immediate writes)

| Tool | Dashboard Endpoint | Body | Notes |
|---|---|---|---|
| `update_milestone` | `POST /api/crm/milestones/:id` | `{ payload }` | **New** — staged |
| `create_milestone` | `POST /api/crm/milestones` | `{ name, opportunityId, workloadType, ... }` | **New** — staged |
| `create_task` | `POST /api/crm/tasks` | `{ subject, milestoneId, description, scheduledEnd }` | **New** — staged |
| `update_task` | `POST /api/crm/tasks/:id` | `{ payload }` | **New** — staged |
| `close_task` | `POST /api/crm/tasks/:id/close` | — | **New** — staged |
| `manage_deal_team` | `POST /api/crm/opportunities/:id/deal-team` | `{ action, userId, role }` | **New** — staged |
| `manage_milestone_team` | `POST /api/crm/milestones/:id/team` | `{ action, userId, role }` | **New** — staged |

### Approval/Execution Tools (execute staged writes)

| Tool | Dashboard Endpoint | Body | Notes |
|---|---|---|---|
| `list_pending_operations` | `GET /api/crm/operations` | — | **New** |
| `view_staged_changes_diff` | `GET /api/crm/operations/:id/diff` | — | **New** |
| `execute_operation` | `POST /api/crm/operations/:id/execute` | — | **New** |
| `execute_all` | `POST /api/crm/operations/execute-all` | — | **New** |
| `cancel_operation` | `POST /api/crm/operations/:id/cancel` | — | **New** |
| `cancel_all` | `POST /api/crm/operations/cancel-all` | — | **New** |

## Architecture

### Layer 1: CRM Client (`crm-client.mjs`)

Add typed wrapper methods for every tool. The client already exposes `callTool(name, args)` as an escape hatch, but typed methods provide caching, param validation, and cache invalidation on writes.

```
// New read methods
getMilestoneActivities(milestoneId)           → callTool('get_milestone_activities', { milestoneIds: [milestoneId] })
getMilestoneFieldOptions(field)               → callTool('get_milestone_field_options', { field })  [cache: long TTL]
getTaskStatusOptions()                        → callTool('get_task_status_options', {})  [cache: long TTL]
listAccountsByTpid(tpids)                     → already exists
searchOpportunities(filter, top)              → callTool('list_opportunities', { filter, top })
getRecord(entitySet, id, select)              → callTool('crm_get_record', { entitySet, id, select })
query(entitySet, filter, select, top)         → callTool('crm_query', { entitySet, filter, select, top })
findMilestonesNeedingTasks(customer)          → callTool('find_milestones_needing_tasks', { customerKeyword })

// New write-intent methods (all return { staged: true, operationId, preview })
updateMilestone(milestoneId, payload)         → callTool('update_milestone', { milestoneId, payload })
createMilestone(params)                       → callTool('create_milestone', params)
createTask(params)                            → callTool('create_task', params)
updateTask(taskId, payload)                   → callTool('update_task', { taskId, payload })
closeTask(taskId)                             → callTool('close_task', { taskId })
manageDealTeam(oppId, action, userId, role)   → callTool('manage_deal_team', { opportunityId, action, userId, role })
manageMilestoneTeam(msId, action, userId, role) → callTool('manage_milestone_team', { milestoneId, action, userId, role })

// New approval methods
listPendingOperations()                       → callTool('list_pending_operations', {})
viewStagedDiff(operationId)                   → callTool('view_staged_changes_diff', { operationId })
executeOperation(operationId)                 → callTool('execute_operation', { operationId })
executeAll()                                  → callTool('execute_all', {})
cancelOperation(operationId)                  → callTool('cancel_operation', { operationId })
cancelAll()                                   → callTool('cancel_all', {})
```

**Cache invalidation rules:**
- Any successful write-intent call → invalidate `milestones_*` and `my_opps_*` cache entries
- `executeOperation` / `executeAll` → invalidate ALL cache
- Metadata endpoints (field options, task statuses) → cache with 1h TTL (rarely changes)

### Layer 2: Server Endpoints (`shared-server.mjs`)

RESTful endpoint mapping. All write endpoints use `POST`. All read endpoints use `GET`.

**Security rules:**
- All endpoints validate required params and return 400 for missing input
- `crm_query` and `crm_get_record` pass through to MCP — the allowlist enforcement happens in the MCP server itself
- No auth bypass — every call flows through the MCP client's auth chain
- Write-intent endpoints return the staged response as-is (operationId + preview). The frontend must show confirmation UI
- Execute endpoints are separate — never auto-execute from a write-intent call

### Layer 3: Frontend Integration (`opportunities-view.js`)

#### Phase 1: Milestone Inline Actions
- **Edit milestone status**: Dropdown in milestone row (On Track / At Risk / Blocked) → `POST /api/crm/milestones/:id` with `{ payload: { msp_milestonestatus: <code> } }`
- **Edit commitment**: Dropdown (Uncommitted / Pipeline / Committed) → same endpoint
- **Edit due date / monthly use**: Inline editable fields
- All edits produce staged operations → show confirmation toast with before/after diff
- Approval bar at bottom: "N pending changes — Review & Apply | Discard All"

#### Phase 2: Task Management
- **View tasks**: Expand milestone → nested task list by calling `GET /api/crm/milestones/:id/activities`
- **Create task**: "+ Add Task" button → inline form (subject, description, due date)
- **Close task**: Checkbox or button → `POST /api/crm/tasks/:id/close`
- **Update task**: Inline edit on subject/description/due date

#### Phase 3: Deal Team & Milestone Team
- **View deal team**: Opp expansion shows deal team members
- **Add/remove team member**: User picker → `POST /api/crm/opportunities/:id/deal-team`
- **Milestone team**: Same pattern per milestone

#### Phase 4: Approval Queue UI
- **Pending operations badge**: Show count in header bar
- **Operations panel**: Drawer/modal listing all staged ops with diffs
- **Per-operation actions**: Execute / Cancel per item
- **Bulk actions**: Execute All / Cancel All
- **Real-time update**: After execution, invalidate cache and refresh affected views

## API Design Details

### Read Endpoints

```
GET /api/crm/milestones/:milestoneId/activities
  → getMilestoneActivities(milestoneId)
  Response: { tasks: [...] }

GET /api/crm/metadata/milestone-fields/:field
  field: workloadType | deliveredBy | preferredAzureRegion | azureCapacityType
  → getMilestoneFieldOptions(field)
  Response: { field, options: [{ value: 861980000, label: "Azure" }, ...] }

GET /api/crm/metadata/task-statuses
  → getTaskStatusOptions()
  Response: { options: [...] }

GET /api/crm/accounts?tpids=123,456
  → listAccountsByTpid([123, 456])
  Response: { accounts: [...] }

GET /api/crm/opportunities/search?filter=...&top=20
  → searchOpportunities(filter, top)
  Response: { opportunities: [...] }

GET /api/crm/records/:entitySet/:id?select=name,msp_activesalesstage
  → getRecord(entitySet, id, select)
  Response: { <record fields> }

GET /api/crm/query?entitySet=msp_engagementmilestones&filter=...&select=...&top=50
  → query(entitySet, filter, select, top)
  Response: { value: [...], truncated: bool }

GET /api/crm/milestones/needing-tasks?customer=Contoso
  → findMilestonesNeedingTasks("Contoso")
  Response: { milestones: [...] }
```

### Write-Intent Endpoints (all return staged response)

```
POST /api/crm/milestones
  Body: { name, opportunityId, workloadType, deliveredBy, preferredAzureRegion, azureCapacityType, ... }
  → createMilestone(body)
  Response: { staged: true, operationId: "OP-xxx", preview: { ... } }

POST /api/crm/milestones/:id
  Body: { payload: { msp_milestonestatus: 861980002, ... } }
  → updateMilestone(id, payload)
  Response: { staged: true, operationId: "OP-xxx", preview: { before: {...}, after: {...} } }

POST /api/crm/tasks
  Body: { subject, milestoneId, description?, scheduledEnd? }
  → createTask(body)
  Response: { staged: true, operationId: "OP-xxx", preview: { ... } }

POST /api/crm/tasks/:id
  Body: { payload: { subject?, description?, scheduledend? } }
  → updateTask(id, payload)
  Response: { staged: true, operationId: "OP-xxx", preview: { ... } }

POST /api/crm/tasks/:id/close
  → closeTask(id)
  Response: { staged: true, operationId: "OP-xxx", preview: { ... } }

POST /api/crm/opportunities/:id/deal-team
  Body: { action: "add"|"remove", userId, role? }
  → manageDealTeam(id, action, userId, role)
  Response: { staged: true, operationId: "OP-xxx", preview: { ... } }

POST /api/crm/milestones/:id/team
  Body: { action: "add"|"remove", userId, role? }
  → manageMilestoneTeam(id, action, userId, role)
  Response: { staged: true, operationId: "OP-xxx", preview: { ... } }
```

### Approval Endpoints

```
GET /api/crm/operations
  → listPendingOperations()
  Response: { operations: [{ operationId, tool, preview, createdAt }, ...] }

GET /api/crm/operations/:id/diff
  → viewStagedDiff(operationId)
  Response: { operationId, before: {...}, after: {...}, tool, target }

POST /api/crm/operations/:id/execute
  → executeOperation(operationId)
  Response: { success: true, result: {...} }

POST /api/crm/operations/execute-all
  → executeAll()
  Response: { executed: N, results: [...] }

POST /api/crm/operations/:id/cancel
  → cancelOperation(operationId)
  Response: { cancelled: true }

POST /api/crm/operations/cancel-all
  → cancelAll()
  Response: { cancelled: N }
```

## Implementation Order

1. **CRM Client methods** — add all typed wrappers to `crm-client.mjs`
2. **Server read endpoints** — add to `shared-server.mjs` (no UI needed to test with curl)
3. **Server write endpoints** — staged writes + approval endpoints
4. **Frontend Phase 1** — inline milestone editing with staged approval
5. **Frontend Phase 2** — task management (view/create/close/update)
6. **Frontend Phase 3** — deal team + milestone team management
7. **Frontend Phase 4** — approval queue UI (pending ops panel, execute/cancel)

## Safety Model

All writes go through the MCP server's staging queue:

```
User action in UI  →  POST /api/crm/milestones/:id  →  callTool('update_milestone')
                                                         ↓
                                                    MCP server stages it
                                                    returns { staged: true, operationId }
                                                         ↓
                                                    Frontend shows diff + confirm
                                                         ↓
User clicks "Apply" →  POST /api/crm/operations/:id/execute  →  callTool('execute_operation')
                                                                   ↓
                                                              MCP executes PATCH against CRM
                                                              Returns success/error
                                                                   ↓
                                                              Frontend invalidates cache + refreshes
```

**No write ever executes without an explicit user confirmation step in the UI.** The staged→execute separation is enforced at the API layer — write-intent endpoints CANNOT execute. Execute endpoints are separate POST calls.

## Non-Goals

- **Role authority enforcement in the dashboard**: The MCP server already enforces this. The dashboard passes through.
- **OIL/Vault integration**: This spec covers MSX tools only. Vault integration is a separate effort.
- **WorkIQ/M365 tools**: Out of scope for this spec.
