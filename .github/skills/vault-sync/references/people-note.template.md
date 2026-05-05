<!-- vault-sync template: People Note
     Edit this template to adjust how CRM deal team members appear in your vault.
     Syntax: {{field}}, {{field|format}}, {{#each array}}...{{/each}}
     The "Notes" and "Meetings" sections are user-authored and never overwritten. -->

---
tags:
  - people
title: "{{title}}"
email: "{{internalemailaddress}}"
company: "Microsoft"
customers:
{{#each customerList}}
  - "{{name}}"
{{/each}}
org: internal
icon: LiUser
---

tags:: [[👥 People MOC]]

# {{fullname}}

## Notes
- Category: Internal Account Team
- Organization: Microsoft
- Discovered via CRM deal team on {{oppLinks}}

## Meetings

```dataview
Table file.cday as Created, summary AS "Summary"
FROM "Timestamps/Meetings" where contains(file.outlinks, [[{{fullname}}]])
SORT file.cday DESC
```
