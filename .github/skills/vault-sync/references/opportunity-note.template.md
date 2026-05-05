<!-- vault-sync template: Opportunity Note
     Edit this template to adjust how CRM opportunities appear in your vault.
     Syntax: {{field}}, {{field|format}}, {{#each array}}...{{/each}}, {{#empty array}}...{{/empty}}
     Formats: currency, acrMonthly, escapePipes, default:<fallback> -->

---

customer: "{{customerName}}"
opportunity: "{{name}}"
opportunityId: "{{opportunityid}}"
opportunityNumber: "{{msp_opportunitynumber}}"
stage: "{{msp_activesalesstage|default:Unknown}}"
estClose: "{{msp_estcompletiondate|default:Unknown}}"
dealValue: {{estimatedvalue|default:0}}
recurringACR: {{msp_consumptionconsumedrecurring|default:0}}
solutionPlay: "{{msp_salesplay|default:Unknown}}"
msxLink: "{{oppUrl}}"
last_opp_sync: "{{syncDate}}"
icon: LiTarget
tags:

- opportunity
- crm-synced

---

# 🎯

|                         |                                      |
| ----------------------- | ------------------------------------ |
| **Opp #**         | [{{msp_opportunitynumber}}]({{oppUrl}}) |
| **Stage**         | {{msp_activesalesstage}}             |
| **Est. Close**    | {{msp_estcompletiondate}}            |
| **Solution Play** | {{msp_salesplay}}                    |
| **🔗 MSX**        | [Open in MSX]({{oppUrl}})               |

## 💰 ACR Summary

<!-- Auto-synced from MSX CRM. Do not edit manually — values refresh on next sync. -->

|                               | Name         | Monthly Use (ACR)     | Commitment         | Status       | 🔗                                 |
| ----------------------------- | ------------ | --------------------- | ------------------ | ------------ | ---------------------------------- |
| 🎯**Opportunity**       | {{name}}     | {{escapePipes}}     | —                 | —           | {{msp_consumptionconsumedrecurring |
| {{#each milestones}}          |              |                       |                    |              |                                    |
| 📋 Milestone                  | {{msp_name}} | {{}}escapePipes}}     | {{msp_monthlyuse}} | {{acrMonthly}} | {{msp_commitmentrecommendation}}     |
| {{/each}}                     |              |                       |                    |              |                                    |
| **Total Milestone ACR** | —           | **{{totalMilestoneACR}}| {{acrMonthly}}**     | —           | —                                 |

## 👤 Deal Team

<!-- Auto-synced from MSX CRM deal team. Do not edit manually. -->

| 👤 Name             | Email                  | Title        | Owner   | `<!-- userid -->` |
| ------------------- | ---------------------- | ------------ | ------- | ------------------- |
| {{#each dealTeam}}  |                        |              |         |                     |
| [[{{fullname}}]]    | {{internalemailaddress}} | {{default:—}} | {{title}} | {{default:—}}        |
| {{/each}}           |                        |              |         |                     |
| {{#empty dealTeam}} |                        |              |         |                     |
| —                  | —                     | —           | —      |                     |
| {{/empty}}          |                        |              |         |                     |

## Opportunity Notes

<!-- Synced from CRM opportunity description field. -->

{{description|default:No description in CRM.}}

## 📝 Milestone Forecast Comments

<!-- Auto-synced from MSX CRM msp_forecastcomments. Most recent comment per milestone. -->

| 📋 Milestone                | Latest Comment        | Author    | Date          | 🔗       |
| --------------------------- | --------------------- | --------- | ------------- | -------- |
| {{#each forecastComments}}  |                       |           |               |          |
| {{milestoneName             | escapePipes}}         | {{comment | escapePipes}} | {{userId |
| {{/each}}                   |                       |           |               |          |
| {{#empty forecastComments}} |                       |           |               |          |
| —                          | No forecast comments. | —        | —            |          |
| {{/empty}}                  |                       |           |               |          |
