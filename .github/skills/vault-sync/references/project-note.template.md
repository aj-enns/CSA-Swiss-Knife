<!-- vault-sync template: Project Note
     Customize this template to change how project notes are structured in your vault.
     Placeholders use {CRM_FIELD} syntax — the sync process replaces them with live values.
     Meta Bind INPUT fields provide inline editing in Obsidian.
     Sections below <!-- end-managed --> are user-authored and never overwritten. -->

---
tags:
  - project
sticker: lucide//wrench
icon: LiWrench
customer: "{CustomerName}"
status: "active"
type: "{type}"
priority: "{priority}"
target_date: {YYYY-MM-DD}
created: "{YYYY-MM-DD}"
opportunity: "{[[OpportunityName]] or null}"
partner: "{PartnerName or null}"
stakeholders: []
tech_stack: []
parent_project: null
repo: null
msft_team:
  stu: []
  atu: []
  csu: []
---

# {ProjectName}

**Customer:** `INPUT[suggester(option(Asurion), option(Bank of America), option(BD), option(BlueKC), option(Cencora), option(Cigna), option(EPIC), option(Fiserv), option(Illumina), option(Omnicell), option(Optum), option(PayPal), option(R1), option(R1 RCM), option(Rogers), option(Stryker), option(WPS)):customer]`
**Status:** `INPUT[inlineSelect(option(active), option(on-hold), option(completed), option(archived)):status]`
**Type:** `INPUT[inlineSelect(option(poc), option(demo), option(engagement), option(internal), option(discovery)):type]`
**Priority:** `INPUT[inlineSelect(option(high), option(medium), option(low)):priority]`

## Context

<!-- Brief description of the project scope and purpose. -->



## Success Criteria

- 

## Architecture / Approach

- 

## Stakeholders

| Role | Name | Notes |
|------|------|-------|
| Primary | | |
| Exec Sponsor | | |
| Technical Lead | | |

## Timeline & Milestones

| Date | Milestone | Status |
|------|-----------|--------|
| | | |

## Meeting Log

<!-- Auto-populated by dataview. Related meetings matched via project frontmatter or backlinks. -->

```dataview
TABLE WITHOUT ID
  link(file.link, file.name) AS "📅 Meeting",
  date AS "Date",
  summary AS "Summary",
  status AS "Status"
FROM "Meetings"
WHERE project = this.file.name
   OR contains(project, this.file.name)
   OR contains(file.outlinks, this.file.link)
SORT date DESC
```

## Open Items

- [ ] 

## Related

<!-- Wiki-links to customer notes, opportunities, sibling projects. -->

- [[{CustomerName}]]

## Notes

<!-- User-authored section. Sync never touches content below this line. -->
<!-- end-managed -->

