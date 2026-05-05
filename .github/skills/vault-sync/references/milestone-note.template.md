<!-- vault-sync template: Milestone Note
     Edit this template to adjust how CRM milestones appear in your vault.
     Syntax: {{field}}, {{field|format}}, {{#each array}}...{{/each}}, {{#empty array}}...{{/empty}}
     The "Notes" section below <!-- end-crm-sync --> is never overwritten by sync. -->

---

customer: "{{customerName}}"
opportunity: "{{opportunityName}}"
opportunityId: "{{opportunityid}}"
milestone: "{{msp_name}}"
milestoneId: "{{msp_engagementmilestoneid}}"
milestoneNumber: "{{msp_milestonenumber|default:—}}"
monthlyUse: {{msp_monthlyuse|default:0}}
status: "{{msp_milestonestatus|default:Unknown}}"
commitment: "{{msp_commitmentrecommendation|default:Unknown}}"
milestoneDate: "{{msp_milestonedate|default:Unknown}}"
owner: "{{owner.fullname|default:Unknown}}"
ownerEmail: "{{owner.internalemailaddress|default:Unknown}}"
workload: "{{msp_milestoneworkload|default:Unknown}}"
deliveredBy: "{{msp_deliveryspecifiedfield|default:Unknown}}"
msxLink: "{{msUrl}}"
last_milestone_sync: "{{syncDate}}"
icon: LiFlag
tags:

- milestone
- crm-synced

---

# 📋}

|                                |                                              |
| ------------------------------ | -------------------------------------------- |
| **Milestone #**          | {{msp_milestonenumber}}                      |
| **💰 Monthly Use (ACR)** | {{msp_monthlyuse}}                           |
| **Status**               | {{msp_milestonestatus}}                      |
| **Commitment**           | {{msp_commitmentrecommendation}}             |
| **📅 Milestone Date**    | {{msp_milestonedate}}                        |
| **👤 Owner**             | [[{{owner.fullname}}]]                       |
| **Workload**             | {{msp_milestoneworkload}}                    |
| **Delivered By**         | {{msp_deliveryspecifiedfield}}               |
| **🔗 MSX**               | [Open in MSX]({{msUrl}})                        |
| **🎯 Parent Opp**        | [[{{opportunityNoteName}}]] ·[MSX]({{oppUrl}}) |

## 👥 Milestone Team

<!-- Auto-synced from MSX CRM via manage_milestone_team. Do not edit — refreshes on next sync. -->

| Name | Title | Email |
| ---- | ----- | ----- |
| {{#each milestoneTeam}} | | |
| [[{{fullName}}]] | {{title\|default:—}} | {{email\|default:—}} |
| {{/each}} | | |
| {{#empty milestoneTeam}} | | |
| — | — | No milestone team members (owner only). |
| {{/empty}} | | |

## 📝 Forecast Comments

<!-- Auto-synced from MSX CRM. Do not edit — refreshes on next sync. -->

| Date                        | Author         | Comment               |
| --------------------------- | -------------- | --------------------- |
| {{#each forecastComments}}  |                |                       |
| {{modifiedOn}}                | {{default:—}} | {{userId}}              |
| {{/each}}                   |                |                       |
| {{#empty forecastComments}} |                |                       |
| —                          | —             | No forecast comments. |
| {{/empty}}                  |                |                       |

> **Latest**: {{msp_forecastcomments|default:No forecast comments.}}

## Notes

<!-- User-authored section. Sync never touches content below this line. -->

<!-- end-crm-sync -->

## Task Activity Log

<!-- Managed by task sync. Do not edit manually. -->

| Date | Action | Task | Owner | Link |
| ---- | ------ | ---- | ----- | ---- |
