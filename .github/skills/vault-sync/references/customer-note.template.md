<!-- vault-sync template: Customer Note
     Edit this template to adjust how customer root notes are structured in your vault.
     Syntax: {{field}}, {{field|format}}
     The "Notes" section is user-authored and never overwritten by sync operations. -->

---

tags:

- customer
  aliases:
- "{{name}}"
  sticker: lucide//building-2
  icon: LiBuilding2
  parent_company:
  subsidiaries:
  has_unified: false
  MSX:
  account: "{{name}}"
  accountId: "{{accountId}}"
  last_validated: "{{syncDate}}"

---


## 🏢 Pipeline

<!-- Auto-populated by dataview. Do not edit manually. -->

```dataview
TABLE WITHOUT ID
  link(file.link, opportunity) AS "🎯 Opportunity",
  stage AS "Stage",
  "$" + string(recurringACR) + "/mo" AS "💰 ACR",
  estClose AS "Est. Close",
  solutionPlay AS "Solution Play"
FROM "Customers/{{safeName}}/opportunities"
WHERE contains(tags, "opportunity")
SORT recurringACR DESC
```

## 📋 Milestones

<!-- Auto-populated by dataview. Active milestones across all opportunities. -->

```dataview
TABLE WITHOUT ID
  link(file.link, milestone) AS "📋 Milestone",
  status AS "Status",
  "$" + string(monthlyUse) + "/mo" AS "💰 Monthly Use",
  commitment AS "Commitment",
  owner AS "Owner",
  milestoneDate AS "Due Date"
FROM "Customers/{{safeName}}/milestones"
WHERE contains(tags, "milestone") AND status != "Completed" AND status != "Cancelled"
SORT milestoneDate ASC
```

## Microsoft Team

- **STU:**
  ----
- **ATU:**
  ----
- **CSU:**
  ----

## Stakeholders

| Name | Title | Email | Role |
| ---- | ----- | ----- | ---- |

## Summary

## Notes

<!-- User-authored section. Never overwritten by sync operations. -->
