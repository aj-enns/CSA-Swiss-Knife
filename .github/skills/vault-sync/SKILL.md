---
name: vault-sync
description: "Unified CRM→vault sync and hygiene skill. Seven modes: opportunity sync, milestone sync, people sync (batch CRM + ad-hoc create), customer hygiene, task sync, project sync (create + hygiene), dashboard sync. Always CRM→vault (one-way). Templates live in references/. Triggers: sync opportunity, opp sync, capture deal team, pipeline to vault, milestone sync, refresh milestones, milestone vault sync, sync people, people sync, deal team people, create person, add person, new people note, customer hygiene, clean up customer, consolidate insights, tidy customer notes, create customer note, sync tasks, task sync, update task log, SE activity log, task activity log, record task in vault, post-write vault capture, opportunity vault sync, create project, new project, scaffold project, project hygiene, project sync, project cleanup, fix project notes, missing meetings dataview, create dashboard, pipeline dashboard, insert dashboard, refresh dashboard, vault dashboard, pipeline intelligence dashboard, open dashboard."
argument-hint: "Scope by customer name, opportunity number, or 'all' for full portfolio sweep"
---

## Purpose

Maintains durable, per-entity context in the Obsidian vault that mirrors CRM state: opportunity pipelines, milestone metadata, deal team composition, People directory, customer structure, task activity logs, and project notes. Gives any role a local reference without re-querying CRM every time.

**Direction: CRM → vault only.** The vault is a read-cache of CRM truth. To update CRM, the user must explicitly request a write through the write-gate.

## Freedom Level

**Low** — Data transcription. No judgment calls; all values come from CRM fields or vault structure rules. The skill reads CRM and writes to vault. It never modifies CRM.

## Mode Selection

| Mode | Trigger phrases | Scope |
|------|----------------|-------|
| **Opportunity Sync** | opp sync, sync opportunity, capture deal team, pipeline to vault, save opportunity | Opportunity notes + deal team + ACR + People correlation |
| **Milestone Sync** | milestone sync, sync milestones, refresh milestones, milestone vault sync | All milestone CRM fields, lifecycle transitions, deep per-milestone rebuild |
| **People Sync** | sync people, people sync, deal team people, link deal team, who is on my deals, create person, add person, new people note | People/ notes: batch from CRM (3a) or ad-hoc from context (3b) |
| **Customer Hygiene** | customer hygiene, clean up customer, consolidate insights, tidy customer notes, create customer note | Customer root notes: structure, dataview queries, Agent Insights consolidation |
| **Task Sync** | sync tasks, task sync, update task log, SE activity log, task activity log | Task activity log rows in milestone notes |
| **Project Sync** | create project, new project, new project note, scaffold project, start project, project creation, fix projects, fixup projects, project hygiene, project sync, standardize projects, project cleanup, fix project notes, missing meetings dataview | Project note creation from context + hygiene for existing notes |

**Auto-capture modes** (silent, no user trigger needed):
- **Opportunity auto-capture**: Chains from write-gate after `update_milestone`, `create_milestone`, `manage_deal_team`.
- **Task auto-capture**: Chains from write-gate after `create_task`, `update_task`, `close_task`.
- **Stale refresh**: If `last_opp_sync` > 24h and opportunity is touched in any workflow, trigger opp sync automatically.

## Parallelization Strategy

All modes share the same parallel processing principles. **These rules are mandatory.**

### Core Rules

1. **No sequential customer loops**: Never iterate customers one-by-one. All customers flow through each batch together.
2. **Cross-customer parallelism**: All customers are independent — process them in parallel, not sequentially.
3. **Cross-entity parallelism**: Opportunity notes, milestone notes, People notes, and customer notes are all independent files with no cross-dependencies. Write them in one parallel batch.
4. **Batch sizing**: Up to 10 parallel tool calls per batch. If >10 operations, split into sub-batches of 10, launching each as the prior completes.
5. **Deduplicate before resolve**: Collect all unique GUIDs (systemusers, milestones, opportunities) across all customers first, then resolve in parallel — never resolve the same GUID twice.

### Standard Batch Sequence

Every mode follows this pattern (skip phases that don't apply):

1. **Batch: Scope** — `get_customer_context` / `get_vault_context` for all customers (parallel).
2. **Batch: CRM retrieval** — `crm_get_record`, `crm_query`, `get_milestones` across all customers (parallel). No cross-dependencies between customers.
3. **Batch: Identity resolution** — `crm_query` on `systemusers` for all unique GUIDs (parallel batches, OR-chain up to 15 per query).
4. **Batch: Vault reads** — Read all target vault notes simultaneously (parallel).
5. **CPU: Diff** — Compare CRM state ↔ vault state. No tool calls.
6. **Batch: Vault writes** — All creates + updates in one parallel batch (different files = no conflicts).
7. **Batch: People correlation** (if applicable) — Search all, then create/update all (two parallel batches).

---

## Mode 1: Opportunity Sync

### Auto-Capture (Post-Workflow Hook)

Runs silently after any workflow that reads/modifies opportunity data — pipeline reviews, milestone updates, deal team changes, morning briefs, account reviews. No user trigger needed.

**Input**: Opportunity data already in context from the parent workflow.

**Flow**:
1. Extract from parent context: customer name, opportunity GUID, opportunity number, deal team, milestones with `msp_monthlyuse`, `estimatedvalue`, `msp_consumptionconsumedrecurring`.
2. Resolve vault note path (see Vault Note Resolution below).
3. If changed or stale: update sections via `oil:atomic_replace`.
4. Update `last_opp_sync` frontmatter timestamp.
5. Run People correlation (see Shared: People Correlation below).

### Batch Sync (On-Demand)

**Steps**:

1. **Identify user** — `crm_whoami`.

2. **Scope** — Customer name from user, or sweep vault roster via `get_vault_context`.

3. **CRM retrieval — parallel across customers**:

   **Phase 3a (parallel)**: `get_customer_context` for all customers → extract opportunity GUIDs.

   **Phase 3b (parallel per customer, all customers in parallel)**:
   - `crm_get_record` for each opportunity (all in parallel): `select: "opportunityid,name,msp_opportunitynumber,msp_activesalesstage,msp_estcompletiondate,estimatedclosedate,estimatedvalue,msp_consumptionconsumedrecurring,msp_salesplay,description,_ownerid_value,_parentaccountid_value,statecode"`.
   - `get_milestones({ opportunityIds, statusFilter: "active", format: "triage" })` per customer.
   - `crm_query` on `msp_dealteams` per opportunity (all in parallel): `filter: "_msp_parentopportunityid_value eq '<GUID>' and statecode eq 0"`, `select: "_msp_parentopportunityid_value,_msp_dealteamuserid_value,msp_isowner"`.

   **Phase 3c (parallel batches)**: Deduplicate all systemuser GUIDs, resolve via `crm_query` on `systemusers` (OR-chain up to 15, all batches in parallel).

4. **Vault reads — parallel**: Read all opportunity notes + milestone sub-notes simultaneously.

5. **Diff** (CPU-only): Compare CRM ↔ vault per field. **Volatile fields rule**: ACR, dates, stage, description, forecast comments — always rewrite, never skip.

6. **Vault writes — parallel**: All opportunity note creates/updates + milestone sub-note updates in one batch:
   - New notes: `oil:create_note` with Opportunity Note Template.
   - Existing notes: `oil:atomic_replace` on frontmatter (`dealValue`, `recurringACR`, `stage`, `estClose`, `solutionPlay`), `## 💰 ACR Summary`, `## 👤 Deal Team`, `## Opportunity Notes`, `## 📝 Milestone Forecast Comments`, `last_opp_sync`.
   - Milestone sub-notes: update `monthlyUse`, `status`, `commitment`, `msxLink`, info table, forecast comments. Create if missing.

7. **People correlation — parallel** (mandatory, see Shared: People Correlation).

8. **Summary**:
   ```
   | 🏢 Customer | 🎯 Opportunity | Opp # | 👤 Deal Team | 💰 ACR | Notes | Status |
   ```

### Vault Note Resolution

Resolve in order:
1. **Nested** (preferred): `Customers/<Customer>/opportunities/<OppName>.md`
2. **Customer root**: `Customers/<Customer>/<Customer>.md` → `## Opportunities` subsection.
3. **Flat**: `Customers/<Customer>.md` → `## Opportunities`.
4. **Not found**: Create at path (1).

Use `oil:get_customer_context` to discover actual vault structure before writing.

### Opp-Level CRM Fields

| Vault Location | CRM Field | Format |
|---|---|---|
| Frontmatter | `opportunityid` | GUID |
| Frontmatter | `msp_opportunitynumber` | As-is |
| Frontmatter | `msp_activesalesstage` | Label |
| Frontmatter | `msp_estcompletiondate` | `YYYY-MM-DD` |
| Frontmatter | `estimatedvalue` | `$X,XXX` |
| Frontmatter | `msp_consumptionconsumedrecurring` | `$X,XXX/mo` |
| Frontmatter | `msp_salesplay` | Label |
| `## Deal Team` | `msp_dealteams` → resolved `systemusers` | Table |
| `## Opportunity Notes` | `description` | Block text |
| `## ACR Summary` | Computed from milestones + opp fields | Table |
| `## Milestone Forecast Comments` | `msp_forecastcommentsjsonfield` | Table |

### Deduplication

- **Deal Team**: Primary key `systemuserid` via `<!-- userid:{GUID} -->`. Full-section replace every sync.
- **ACR Summary**: Full-section replace every sync.
- **Opportunity Notes**: Always rewrite from CRM `description`. Preserve content below `<!-- end-crm-sync -->`.
- **Forecast Comments**: Full-section replace every sync.
- **Frontmatter**: Always update all volatile fields (`dealValue`, `recurringACR`, `stage`, `estClose`, `solutionPlay`, `last_opp_sync`).

### Decision Logic

- **Stale threshold**: `last_opp_sync` > 24h + opportunity touched → auto-trigger.
- **Inactive opps**: Skip `statecode != 0`. If vault note exists for inactive opp, update `stage` but don't delete.
- **Deal team empty**: Preserve existing vault section, add comment noting empty query.
- **Batch ordering**: By customer, then `msp_estcompletiondate` ascending.

---

## Mode 2: Milestone Sync

Deep per-milestone sync of all CRM fields, lifecycle transitions, and forecast comments. More thorough than the shallow milestone updates in Opp Sync.

### Relationship to Other Modes

| Mode | Milestone Coverage |
|------|-------------------|
| **Opp Sync** | Shallow: 4 frontmatter fields + info table + forecast comments |
| **Milestone Sync** (this) | Deep: all CRM fields, lifecycle transitions, owner, workload, deliveredBy |
| **Task Sync** | Appends task rows to `## Task Activity Log` only |

### Steps

1. **Identify user** — `crm_whoami`.

2. **Scope** — Customer, opportunity, or milestone name. Or sweep vault roster.

3. **CRM retrieval — parallel across customers**:

   **Phase 3a (parallel)**: `get_customer_context` for all customers.

   **Phase 3b (parallel)**: `get_milestones({ opportunityIds, statusFilter: "all", format: "triage" })` for all customers.

   **Phase 3c (parallel)**: Enrich milestones lacking detail — `crm_get_record` on `msp_engagementmilestones` (all in parallel): `select: "msp_engagementmilestoneid,msp_name,msp_milestonenumber,_msp_opportunityid_value,_ownerid_value,msp_milestonedate,msp_milestonestatus,msp_commitmentrecommendation,msp_monthlyuse,msp_milestoneworkload,msp_deliveryspecifiedfield,msp_forecastcomments,msp_forecastcommentsjsonfield,_msp_workloadlkid_value,msp_milestonepreferredazureregion"`.

   **Phase 3d (parallel)**: `manage_milestone_team({ action: "list", milestoneId })` for all milestones (all in parallel). Returns team members with `fullName`, `title`, `systemUserId`.

   **Phase 3e (parallel batches)**: Resolve owner GUIDs via `crm_query` on `systemusers`.

4. **Vault reads — parallel**: Read all milestone notes across all customers simultaneously.

5. **Diff** (CPU-only):
   - **Volatile fields** (always rewrite): `monthlyUse`, `status`, `commitment`, `milestoneDate`, `owner`, `ownerEmail`, `workload`, `deliveredBy`, `forecastComments`, `milestoneTeam`, `msxLink`.
   - **Lifecycle transitions**: Completed (`861980003`), Cancelled (`861980004`), Closed as Incomplete (`861980007`).
   - **New milestones**: In CRM but no vault note → create.
   - **Orphaned vault notes**: In vault but not in CRM → flag (never delete).

6. **Vault writes — parallel**: All creates + updates in one batch:
   - New notes: `oil:create_note` with Milestone Note Template.
   - Existing notes: `oil:atomic_replace` on all volatile frontmatter, info table, `## 📝 Forecast Comments`.
   - Lifecycle: add `completedDate`/`cancelledDate`/`closedIncompleteDate` to frontmatter, prepend status banner.

   **Preserve**: `## Task Activity Log` (task-sync managed), `## Notes` (user-authored), content below `<!-- end-crm-sync -->`.

7. **Summary**:
   ```
   | 🏢 Customer | 📋 Milestone | Status | 💰 ACR | 👤 Owner | Commitment | Action |
   ```
   Plus lifecycle transition callout and orphaned note warnings.

---

## Mode 3: People Sync

Creates and maintains `People/<Full Name>.md` notes. Two sub-modes: batch sync from CRM deal teams, or ad-hoc creation from meeting/conversation context.

### Sub-Mode 3a: Batch CRM Sync

Ensures every CRM deal team member has a vault People note with email, title, and customer associations.

**Steps**:

1. **Identify user** — `crm_whoami`.

2. **Gather deal team rosters** — `get_my_active_opportunities({ includeDealTeam: true })`. Deduplicate: `{ systemuserid → { name, customers, opportunities } }`.

3. **Resolve details — parallel batches**: `crm_query` on `systemusers` (OR-chain up to 15, all batches in parallel).

4. **Check existing — parallel**: `oil:search_vault` for all members simultaneously. Then `oil:get_note_metadata` for all found notes in a second parallel batch. Classify: `existing`, `stale`, `missing`.

5. **Create missing — parallel**: `oil:create_note` for all missing members simultaneously with People Note Template.

6. **Update stale — parallel**: `oil:atomic_replace` to add missing customers to `customers` frontmatter array. Launch all in one batch.

7. **Summary**:
   ```
   | 👤 Name | Email | Title | Customers | Opps | Status |
   ```

### Sub-Mode 3b: Create from Context

Creates a single People note from meeting notes, conversation, or user input. Triggered by "create person", "add person", or "new people note". Also offered automatically when meeting processing (Step 4) detects attendees without People notes.

**Steps**:

1. **Check for duplicates**: `oil:search_vault({ query: "<person name>", filter_folder: "People" })`. If found, show existing note and ask whether to update it instead.

2. **Resolve customer links**: If a customer is mentioned, use `oil:search_vault({ query: "<customer>", filter_folder: "Customers" })` or `oil:get_customer_context` to match vault folder names for proper `[[wiki-links]]`.

3. **Fill gaps via WorkIQ**: If title, company, email, or role is missing from user input, use `ask_work_iq`:
   > "Find recent emails, meetings, or Teams messages involving {person name}. What is their job title, company, and email address? What topics have they been involved in?"
   - Extract: job title, company, email, org type (internal/customer/partner), customer associations, and topics.
   - If WorkIQ returns nothing, leave fields empty rather than guessing.

4. **Write the note**: `oil:create_note({ path: "People/{Full Name}.md" })` with the People Note Template, enhanced with any context discovered.

5. **Cross-link**: If person was first mentioned in a meeting note, use `oil:patch_note` to add a `[[{Full Name}]]` backlink in that meeting's Attendees section if missing.

### Rules (both sub-modes)

- **Skip self**: Do not create a People note for the authenticated user.
- **No duplicates**: Search by fullname before creating. Alias match → update existing.
- **Preserve manual content**: Never overwrite `## Notes` or `## Meetings` on existing notes.

---

## Mode 4: Customer Hygiene

Creates missing customer root notes and audits existing ones for canonical structure, dataview queries, and Agent Insights consolidation.

### Scope

- One customer at a time unless user says "all" → sweep via `oil:check_vault_health`.
- **Vault-only** reads + writes. No CRM calls (use opp sync for CRM→vault pipeline data).
- **Safe**: Never deletes user-authored content.

### Steps

1. **Identify targets** — Resolve root note paths: `Customers/<Name>/<Name>.md` (nested) or `Customers/<Name>.md` (flat).

2. **Read current state — parallel**: `oil:get_note_metadata` for all target customers simultaneously. Classify: `missing` → Step 4, `exists` → Step 3.

3. **Audit & update — parallel reads, then parallel writes**:

   **Phase 3-read (parallel)**: Read full note content for all existing customers simultaneously.

   **3a. Frontmatter check**: Ensure required fields: `tags: [customer]`, `icon: LiBuilding2`, `sticker: lucide//building-2`, `aliases`, `MSX.account`, `MSX.accountId`, `has_unified`, `last_validated`.

   **3b. Section structure**: Canonical order:
   1. `# {CustomerName}`
   2. `## 🏢 Pipeline` (dataview query)
   3. `## 📋 Milestones` (dataview query)
   4. `## Microsoft Team`
   5. `## Stakeholders`
   6. `## Summary`
   7. `## Notes` (user-authored — **never modify**)
   8. `## Agent Insights` (consolidated)
   9. `## Connect Hooks`

   Replace old flat `## Opportunities` lists with dataview queries.

   **3c. Agent Insights consolidation**:
   1. Parse entries by date prefix.
   2. Group by theme.
   3. Per theme → single consolidated entry: most recent date, preserve decisions/risks/people/actions, drop superseded updates.
   4. Entries > 90 days → archive to collapsed block (unless unresolved risk).
   5. Target ≤ 15 entries.

   **3d. Stale section cleanup**: Flag `## MSX Milestone Gaps` > 30 days old, `## Recent Meeting Activity` > 60 days old.

   **Phase 3-write (parallel)**: `oil:atomic_replace` for all customer notes simultaneously.

4. **Create missing — parallel**: `oil:create_note` for all missing customers simultaneously with Customer Note Template. Pre-fill from `oil:get_customer_context` if available.

5. **Write back**: Update `last_validated` on every written note.

6. **Summary**:
   ```
   | 🏢 Customer | Action | Insights Before → After | Sections Added | Status |
   ```

### Consolidation Rules

- **Preserve**: Decisions, risk flags, people names, milestone/opp cross-references, open action items, Connect-qualifying evidence.
- **Drop**: Superseded status updates, verbose meeting recaps in `Meetings/`, duplicate info, resolved action items, stale task counts.
- **Merge**: Same topic within 7-day window → single entry with latest date. Note original dates.
- **Confirm**: If consolidation removes > 50% of word count, show before/after diff.

---

## Mode 5: Task Sync

Maintains per-milestone task activity logs in the vault.

### Post-Write Hook (Automatic)

Called after confirmed `create_task`, `update_task`, or `close_task`. No user trigger.

**Flow**:
1. Extract from confirmation packet: customer, milestone, opportunity, task record.
2. Resolve vault path: `Customers/<Customer>/milestones/<Milestone>.md`. Create if missing.
3. `oil:atomic_append` to `## Task Activity Log` with row format (see Task Row Schema below).
4. **Volatile field refresh** (opportunistic): If milestone data is in context from `get_milestones`, refresh `monthlyUse`, `status`, `commitment`, info table, forecast comments. Do not make extra CRM calls.

### Batch Sync (On-Demand)

**Steps**:

1. **Scope** — Customer name or sweep vault roster.

2. **CRM + vault retrieval — parallel**:
   - **Phase 2a (parallel)**: `get_customer_context` for all customers.
   - **Phase 2b (parallel)**: `get_milestones({ opportunityIds, includeTasks: true, format: "triage" })` for all customers.

3. **Vault reads — parallel**: `oil:read_note_section({ section: "Task Activity Log" })` for all milestone notes simultaneously.

4. **Diff** (CPU-only): Compare CRM task IDs vs vault-logged `<!-- taskid:{GUID} -->`. Classify: `new`, `changed` (action icon differs), `current`.

5. **Vault writes — parallel**: `oil:atomic_append` for all milestones with new rows simultaneously. Replace changed rows via `oil:atomic_replace`.

6. **Summary**:
   ```
   | Customer | Milestone | New | Updated | Skipped | Errors |
   ```

### Task Row Schema

```
| {date} | {action_icon} | {task_subject} | {owner_name} | [{link_text}]({crm_url}) | <!-- taskid:{activityid} -->
```

| Column | CRM Source | Format |
|--------|-----------|--------|
| Date | `actualend` (completed) or `modifiedon` | `YYYY-MM-DD` |
| Action | `statecode`/`statuscode` | Icon (see below) |
| Task | `subject` | Truncate 80 chars |
| Owner | `_ownerid_value` formatted | Display name |
| Link | Constructed from `activityid` | `[CRM]({url})` |
| taskid | `activityid` GUID | HTML comment for dedup |

### Action Icon Mapping

| statecode | statuscode | Icon |
|-----------|-----------|------|
| 1 (Completed) | 5 | ✅ Completed |
| 2 (Canceled) | 6 | ❌ Canceled |
| 0 (Open) | 2 (Not Started) | ➕ Created |
| 0 (Open) | 3 (In Progress) | 🔄 In Progress |
| 0 (Open) | 7 (Waiting) | ⏸️ On Hold |

### Decision Logic

- **SE role**: Every task should be ✅ Completed (SE Activity Tracking Rule). Flag open SE tasks as anomalies.
- **Batch ordering**: Newest first (descending by date).
- **Cross-milestone tasks**: Log on primary milestone only.
- **Rows without `<!-- taskid -->` comment**: Manually authored — never touch.

---

## Mode 6: Project Sync

Creates new project notes and maintains existing ones. Two sub-modes: **create** (scaffold a new project from user context, conversation, or meeting output) and **hygiene** (scan existing notes for missing frontmatter, sections, and dataview queries).

### Sub-Mode 6a: Project Creation

Scaffolds a new `Projects/<ProjectName>.md` note from user context (customer, type, stakeholders, success criteria) using the Project Note Template.

**Triggers**: "create project", "new project", "new project note", "scaffold project", "start project", "project creation".

**Steps**:

1. **Resolve scope** — Extract from user input or conversation context: project name, customer, type (poc/demo/engagement/internal/discovery), stakeholders, opportunity link, tech stack, description.

2. **Check for duplicates**: `oil:search_vault({ query: "<project name>", filter_tags: ["project"], filter_folder: "Projects" })`. If found, show existing note and ask whether to update it instead.

3. **Resolve customer link**: If customer is mentioned, `oil:get_customer_context({ customer })` to resolve vault folder name for `[[wiki-link]]` in frontmatter and `## Related`.

4. **Resolve opportunity link**: If opportunity is mentioned, `oil:search_vault({ query: "<opp name or number>", filter_folder: "Customers" })` to resolve `[[Opportunity Name]]` for frontmatter.

5. **Write the note**: `oil:create_note({ path: "Projects/<ProjectName>.md" })` with the Project Note Template. Substitute all `{PLACEHOLDER}` values from resolved context. Leave unresolved fields as `null`.

6. **Cross-link**: If customer note exists, use `oil:atomic_append` to add a `[[Projects/<ProjectName>]]` backlink under `## Related` or `## Agent Insights` in the customer note (only if not already present).

7. **Summary**:
   ```
   Created: Projects/<ProjectName>.md
   Customer: <name> | Type: <type> | Status: active
   ```

**Rules**:
- **No duplicates**: Search by name before creating.
- **Minimum viable note**: Only `tags`, `icon`, `sticker`, `status`, and `created` are required in frontmatter. All other fields are optional at creation time.
- **Meta Bind block**: Always include the INPUT fields block from the template below the H1 heading.
- **User sections**: `## Notes` is always included but left empty for user authoring.

### Sub-Mode 6b: Project Hygiene

Scans existing project notes (`Projects/` folder) for missing or inconsistent frontmatter, missing canonical sections, stale status fields, and missing meeting dataview queries. Brings legacy and ad-hoc project notes into alignment with the Project Note Template.

### Scope

- One project at a time, or "all" → sweep `Projects/` folder recursively.
- **Vault-only** reads + writes. No CRM calls.
- **Safe**: Never deletes user-authored content (`## Notes`, content below `<!-- end-managed -->`). Never overwrites existing section content — only adds missing sections and patches frontmatter.

### Steps

1. **Discover projects — parallel**: `oil:search_vault({ query: "project", filter_tags: ["project"], filter_folder: "Projects", limit: 50 })`. Then `oil:get_note_metadata` for all found notes in a parallel batch.

2. **Classify** (CPU-only): For each project note, check:

   **Frontmatter gaps**:
   | Field | Required | Default if missing |
   |-------|----------|--------------------|
   | `tags` | `[project]` | Add `project` tag |
   | `sticker` | Yes | `lucide//wrench` |
   | `icon` | Yes | `LiWrench` |
   | `customer` | No | `null` |
   | `status` | Yes | Infer: `_LegacyCompleted/` → `completed`, else `active` |
   | `type` | Yes | `engagement` |
   | `priority` | Yes | `medium` |
   | `target_date` | No | `null` |
   | `created` | Yes | Use `created_at` from file metadata |
   | `opportunity` | No | `null` |
   | `partner` | No | `null` |
   | `stakeholders` | Yes | `[]` |
   | `tech_stack` | Yes | `[]` |
   | `parent_project` | No | `null` |
   | `repo` | No | `null` |
   | `msft_team` | Yes | `{ stu: [], atu: [], csu: [] }` |

   **Section gaps**: Check headings list against canonical sections:
   - `## Meeting Log` — **critical**: most common missing section. Must contain the dataview query. (Equivalent: `## Meetings`)
   - `## Open Items` — active tasks/follow-ups. (Equivalent: `## Action Items`)
   - `## Success Criteria` — measurable outcomes for the project.
   - `## Architecture / Approach` — technical design or engagement approach.
   - `## Stakeholders` — table format (Role / Name / Notes).
   - `## Timeline & Milestones` — date-indexed milestone table.
   - `## Related` — should contain `[[customer]]` backlink if `customer` frontmatter is set.
   - `## Notes` — user-authored, just ensure it exists.
   - `## Context` or `## Customer Need` — either name is acceptable.

   **Meeting dataview check**: If `## Meeting Log` (or `## Meetings`) exists, read its content. Classify:
   - `has_dataview`: Contains ` ```dataview ` block → OK.
   - `manual_links_only`: Contains only `[[wiki-links]]` or plain text → needs dataview added above manual links.
   - `empty`: Section exists but no content → needs dataview inserted.
   - `missing`: No `## Meetings` section at all → needs section + dataview.

   **Status check**: Notes under `_LegacyCompleted/` with `status: active` → flag as mismatch.

3. **Read full content — parallel**: For all notes needing fixes, `oil:read_note_section` for relevant sections (parallel batch).

4. **Apply fixes — parallel**: All writes in one batch via `oil:atomic_replace`:

   **4a. Frontmatter patch**: Merge missing fields into existing frontmatter. Never remove existing fields. Never overwrite existing non-null values.

   **4b. Missing sections**: Append missing canonical sections in template order (Context → Success Criteria → Architecture / Approach → Stakeholders → Timeline & Milestones → Meeting Log → Open Items → Related → Notes). If `## Meeting Log` is missing, insert before `## Related` (or before `## Notes` if no Related).

   **4c. Meeting dataview insertion**: Standard query:
   ```
   ```dataview
   TABLE WITHOUT ID
     link(file.link, file.name) AS "📅 Meeting",
     date AS "Date",
     summary AS "Summary",
     status AS "Status"
   FROM "Meetings"
   WHERE project = this.file.name
      OR contains(project, this.file.name)
      OR contains(flatten(file.outlinks), this.file.link)
   SORT date DESC
   ```
   ```
   If manual meeting links exist, preserve them below the dataview under a `### Manual References` sub-heading.

   **4d. Status alignment**: `_LegacyCompleted/` + `status: active` → set `status: completed`.

   **4e. Related backlinks**: If `customer` is set and `## Related` exists but doesn't contain `[[{customer}]]`, prepend it.

5. **Summary**:
   ```
   | 📁 Project | Customer | Frontmatter Fixes | Sections Added | Meetings DV | Status Fix | Errors |
   ```

### Decision Logic

- **Never rename files or move projects** — only patch content in place.
- **Never overwrite existing section content** except frontmatter fields and meeting dataview insertion into empty/missing sections.
- **Manual meeting links are preserved** — the dataview is added above them, not instead of them.
- **Existing `## Meeting Log` heading**: Treat as equivalent to `## Meetings` — don't add a duplicate. Prefer `## Meeting Log` when creating new sections.
- **Existing `## Open Items` heading**: Treat as equivalent to `## Action Items` — don't add a duplicate. Prefer `## Open Items` when creating new sections.
- **Meta Bind INPUT fields**: If the block of `INPUT[...]` fields exists below the H1, preserve it. When creating new project notes, include the Meta Bind block from the template.
- **Projects without `customer`**: Valid (internal projects). Skip Related backlink check.
- **Sub-folder projects** (e.g., `Projects/SYK - Project Orpheus/`): Process the main `.md` file, not sub-files.

---

## Mode 7: Dashboard Sync

Creates and maintains a single `_Dashboard/Pipeline Dashboard.md` note in the vault root. The dashboard is a live-query surface: Dataview and DataviewJS render all tables on open — the agent only writes the static shell, the scope summary (`dashboard_scope`), and the `last_refreshed` timestamp. There is no CRM read in this mode; the dashboard queries are vault-only.

### Triggers
`create dashboard`, `pipeline dashboard`, `insert dashboard`, `refresh dashboard`, `vault dashboard`, `pipeline intelligence dashboard`, `open dashboard`

### Steps

1. **Check for existing note**: `oil:search_vault({ query: "Pipeline Intelligence Dashboard", filter_folder: "_Dashboard" })`.
   - **Not found**: Create from template (step 3).
   - **Found**: Update `last_refreshed` and `dashboard_scope` frontmatter only (step 2).

2. **Scope summary (CPU-only)**: Build the `scopeSummary` string from any context already in the conversation. If a prior vault prefetch, morning brief, or opp sync ran this session, extract customer count and milestone count. Fallback: `"Full portfolio — open vault to compute totals."`

3. **Render template**: Substitute `{{syncDate}}` (ISO timestamp, e.g. `2026-04-03T09:15:00`) and `{{scopeSummary}}` (e.g. `"12 customers · 28 milestones"`) into the Pipeline Dashboard Template.

4. **Write note**:
   - **New**: `oil:create_note({ path: "_Dashboard/Pipeline Dashboard.md" })` with rendered template.
   - **Existing**: `oil:atomic_replace` on the frontmatter block to update `last_refreshed` and `dashboard_scope` only. Preserve all other content.

5. **Summary**:
   ```
   ✅ Pipeline dashboard written to _Dashboard/Pipeline Dashboard.md
   Scope: {{scopeSummary}}
   Open in Obsidian and install Dataview + Meta Bind (optional) for live filtering.
   ```

### Required Obsidian Plugins

| Plugin | Role | Required? |
|--------|------|-----------|
| **Dataview** | Live milestone table (`## 📋 Milestones by Owner`) | ✅ Required |
| **DataviewJS** | Pipeline Pulse stats + Opportunity Breakdown + Hygiene Risk Register | ✅ Required |
| **Meta Bind** v0.12+ | Inline filter controls (Stage / Customer / Window) | Optional — filters block is gracefully ignored if absent |
| **Iconize** | `LiLayoutDashboard` sidebar icon | Optional — no functional impact |

### Decision Logic

- **Never overwrite user content**: Preserve everything below `<!-- end-crm-sync -->` and the `## Notes` section.
- **Never query CRM**: Dashboard is vault-only. Live CRM data surfaces through normal opp/milestone sync populating vault notes that Dataview queries.
- **Idempotent**: Running dashboard sync twice is safe. Second run updates only the two frontmatter fields.
- **Template location**: [`references/pipeline-dashboard.template.md`](references/pipeline-dashboard.template.md).

---

## Shared: People Correlation

Used by Opp Sync and auto-capture modes. **MANDATORY — do not skip.**

**Parallel batch 1**: `oil:search_vault({ query: "<fullname>", filter_folder: "People" })` for all unique deal team members simultaneously.

**Classify**: `existing + current`, `stale` (missing customer link), `missing` (no note).

**Parallel batch 2**: All creates + updates simultaneously:
- Creates: `oil:create_note` with People Note Template.
- Updates: `oil:atomic_replace` to add missing customer to `customers` frontmatter.

**Map CRM customer names to vault folder names** using the Customer Name Mapping table. Use `oil:get_customer_context` for dynamic resolution when mapping is missing.

---

## Appendix A: Templates

Templates live in `references/` as standalone `.md` files. Customize them to change how CRM data is rendered in your vault. Placeholders use `{CRM_FIELD}` syntax — the sync process replaces them with live values at write time.

| Template | File | Used By |
|----------|------|---------|
| Project Note | [`references/project-note.template.md`](references/project-note.template.md) | Mode 6 (Project Sync: creation + hygiene) |
| Opportunity Note | [`references/opportunity-note.template.md`](references/opportunity-note.template.md) | Mode 1 (Opp Sync) |
| Milestone Note | [`references/milestone-note.template.md`](references/milestone-note.template.md) | Mode 2 (Milestone Sync) |
| People Note | [`references/people-note.template.md`](references/people-note.template.md) | Mode 3 (People Sync) |
| Customer Note | [`references/customer-note.template.md`](references/customer-note.template.md) | Mode 4 (Customer Hygiene) |
| Pipeline Dashboard | [`references/pipeline-dashboard.template.md`](references/pipeline-dashboard.template.md) | Mode 7 (Dashboard Sync) |

When a sync mode creates a new vault note, it reads the corresponding template file, substitutes placeholders with CRM field values, and writes the result via `oil:create_note`. Sections marked with `<!-- end-crm-sync -->` or `<!-- User-authored -->` comments are never overwritten on subsequent syncs.

---

## Appendix B: CRM Field Reference

### Milestone Status (`msp_milestonestatus`)

| Code | Label |
|------|-------|
| `861980000` | On Track |
| `861980001` | At Risk |
| `861980002` | Blocked |
| `861980003` | Completed |
| `861980004` | Cancelled |
| `861980005` | Not Started |
| `861980007` | Closed as Incomplete |

### Commitment (`msp_commitmentrecommendation`)

| Code | Label |
|------|-------|
| `861980000` | Uncommitted |
| `861980002` | Pipeline |
| `861980003` | Committed |

### Workload Type (`msp_milestoneworkload`)

| Code | Label |
|------|-------|
| `861980000` | Azure |
| `861980001` | Dynamics 365 |
| `861980002` | Security |
| `861980003` | Modern Work |

### Delivered By (`msp_deliveryspecifiedfield`)

| Code | Label |
|------|-------|
| `606820000` | Customer |
| `606820001` | Partner |
| `606820002` | ISD |

---

## Appendix C: Shared Rules

### ACR Formatting

- **`estimatedvalue`** = total deal value (licensing/seat deals). Often `$0` on Azure consumption.
- **`msp_consumptionconsumedrecurring`** = recurring consumption ACR (Azure deals). Often `null` on licensing.
- **`msp_monthlyuse`** (milestone) = estimated monthly ACR delta.

**Best-available display**: Both > 0 → show both. `consumptionRecurring > 0` → `Recurring ACR: $X,XXX/mo`. `estimatedvalue > 0` → `Deal Value: $X,XXX`. Neither → `⚠️ No ACR recorded`. Frontmatter: always raw numbers. Tables: `$X,XXX` with commas, monthly values append `/mo`. Zero/null in table cells → `—` (em-dash).

### Markdown Table Formatting

**MANDATORY for all vault tables. Broken tables render as raw text in Obsidian.**

1. **Escape pipes**: `|` in cell content → `\|`. #1 cause of broken tables.
2. **Matching column count**: Header, separator, and every data row must have same `|` count.
3. **Closing pipe**: Every row must end with `|`.
4. **Separator**: One `-` section per column. Never `|---|---||` or missing columns.
5. **HTML comments in cells**: `<!-- userid:GUID -->` counts as content. Row must still end with `|`.
6. **No pipes in frontmatter**: Escaping applies to table cells only.

### Customer Name Mapping

Map CRM names to vault folder names:

| CRM | Vault |
|-----|-------|
| STRYKER CORPORATION | Stryker |
| Unitedhealth Group | UHG |
| BCBS OF KANSAS CITY | BlueKC |
| Mass General Brigham (Partners) | MGB |
| R1 RCM Inc | R1 |
| Carefirst Blue Cross Blue Shield of Maryland | CareFirst |
| CHILDRENS HOSPITAL COLORADO | CHCO |
| CIGNA CORPORATION | Cigna |
| ILLUMINA INC | Illumina |
| INCYTE GENOMICS | Incyte |
| EPIC SYSTEMS CORPORATION | EPIC |
| Cencora (AmerisourceBergen) | Cencora |
| ASURION INSURANCE SERVICES INC | Asurion |

Use `oil:get_customer_context` for dynamic resolution when mapping is missing.

### Name Normalization

- Strip parenthetical suffixes: `"Andrea Welker (She/Her)"` → `"Andrea Welker"`
- Strip role parentheticals: `"Joey Schluchter (GBB)"` → `"Joey Schluchter"`
- Vault filename: spaces preserved, special characters removed.
- CRM name differs from vault → add CRM name as `aliases` in frontmatter.

### Anti-Patterns

- **Never write to CRM** from any mode. Direction is vault-capture only.
- **Never delete vault content** the user may have added (respect `<!-- end-crm-sync -->` markers).
- **Never guess deal team roles** from names — use `title` from `systemusers`.
- **Never replace vault-confirmed team composition** (contacts notes) with CRM deal team data. `## Deal Team` and `## Microsoft Team` are complementary.
- **Never mix MSXI ACR (PBI) with CRM milestone ACR** — different measures, different vault sections.
- **Never delete orphaned vault notes** — flag them, let the user decide.

## Chains

- **write-gate** → this skill (Mode 1 opp auto-capture after `update_milestone`/`create_milestone`/`manage_deal_team`)
- **write-gate** → this skill (Mode 5 task auto-capture after `create_task`/`update_task`/`close_task`)
- **pipeline-hygiene-triage** → this skill (Mode 1 batch, after hygiene review)
- **morning-brief** → this skill (Mode 1 auto-capture, post-brief stale refresh)
- **account-review** → this skill (Mode 1 auto-capture, post-review persist)
- **Any CRM-reading workflow** → this skill (Mode 1 auto-capture, when vault is stale)
- **customer-hygiene** → this skill (Mode 6 project hygiene, when customer-scoped project cleanup requested)
