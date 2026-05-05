# Activity Classification & Type Catalog — Full Reference

Loaded on demand by `role-se-ms-activities` SKILL.md when classifying activities or constructing task fields.

## Always Significant

Activities matching these types are always worth recording:

- Architecture Design Session
- Blocker Escalation
- Customized Demo
- PoC/Pilot Scoping and Execution
- Workshop / Hackathon
- RFI/RFP Answer
- Technical Close/Win Plan
- Consumption Plan
- HoK Session (with legal gate)
- SE-to-CSU Handoff

## Minor by Default

Do **not** record unless escalation rule applies:
- Single customer call with no clear technical deliverable or outcome
- Internal-only meeting
- Quick email responses or small coordination tasks
- Routine status syncs

## Escalation Rule (Minor → Significant)

If there are **≥2 related signals** (any combination of meeting, email, Teams message) tied to the same customer/opportunity/technical theme **AND** the estimated total effort is **≥2 hours**, treat as significant and propose one consolidated activity.

## Effort Estimation Heuristic

- **Meetings**: scheduled duration + 25% for preparation and follow-up.
- **Email/Teams**: estimate by thread length, message count, complexity cues (attachments, architecture discussion, RFP/RFI, decisions, action items).
- Consolidate across the same theme window. State the estimate basis briefly in the evidence section.

## Activity Type Catalog

| Type | Description Guidance |
|---|---|
| **Architecture Design Session** | {solution area}, {decisions made} |
| **Blocker Escalation** | {blocker}, {resolution or status} |
| **POC delivered** | {solution area}, {outcome} |
| **Pilot delivered** | {solution area}, {scope}, {outcome} |
| **Demo delivered** | {solution area}, {audience} |
| **HoK session** | {environment tier}, {work summary} |
| **Technical review** | {topic}, {decisions} |
| **Workshop delivered** | {topic}, {attendee scope} |
| **RFI/RFP Answer** | {scope}, {sections addressed} |
| **Technical Close/Win Plan** | {approach}, {key proof points} |
| **Consumption Plan** | {workload}, {target ACR}, {timeline} |
| **BANT contribution** | {elements addressed} |
| **Handoff artifact** | {artifact type}, {completeness} |
| **Other SE activity** | {free-form description} |

## Milestone Mapping Guidance

- Signals indicating PoC, Pilot, prototype, validation, technical evaluation, scoping, demo build → map to **PoC/Pilot** milestone.
- Signals indicating go-live, deployment, production readiness, operations, rollout, live incidents/blockers → map to **Production** milestone.
- If ambiguous: present top 2 milestone candidates and ask one concise question.

## Subject Construction Rule

`subject` = `{Customer} — {Brief Description}`

Maximum **60 characters**. Customer name and prefix are mandatory; truncate description to fit. Milestone context is carried by the task's `regardingobjectid` link and the description body.

Examples:
- `Contoso — Azure migration readiness` (35 chars)
- `Fabrikam — AKS cluster config in dev` (36 chars)
- `Northwind — Copilot RAG prototype` (33 chars)

## Description Construction Rule

`description` uses a structured template. **Do not repeat fields already carried by CRM task metadata** (`scheduledEnd` → date, `milestoneId` → milestone/opportunity link, effort → confirmation packet). Only include the activity type, summary, and HoK-specific fields.

```
{what was done, outcome, next implications}
[HoK only] Environment: {dev|test|prod}
[HoK only] Legal coverage: {confirmed — reference}
```
