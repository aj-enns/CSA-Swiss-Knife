---
description: "Create a new People note from context in a meeting note or conversation."
---

# Create Person

Create a People note in the Obsidian vault. Given a name and any available context (meeting notes, conversation, user input), produce a complete note and save it.

## Workflow

1. **Check for duplicates**: Use `oil:search_vault({ query: "<person name>", filter_folder: "People" })` to ensure no existing People note.
2. **Resolve customer links**: If a customer is mentioned, use `oil:search_vault({ query: "<customer name>", filter_folder: "Customers" })` or `oil:get_customer_context({ customer: "<Name>" })` to match against existing customer files for proper `[[wiki-links]]`.
3. **Fill gaps via WorkIQ**: If title, company, email, or role context is missing from user input, use `ask_work_iq` to search M365:
   > "Find recent emails, meetings, or Teams messages involving {person name}. What is their job title, company, and email address? What topics have they been involved in?"
   - Extract: job title, company, email, org type (internal/customer/partner), and customer associations.
   - Also note what topics or projects they've been involved in → populate the Notes section.
   - If WorkIQ returns nothing, leave fields empty rather than guessing.
4. **Write the note**: Use `oil:write_note({ path: "People/{Full Name}.md", content: "..." })` to save.
5. **Cross-link**: If the person was first mentioned in a meeting note, use `oil:patch_note({ path: "Meetings/...", heading: "Attendees", content: "..." })` to add a backlink in that meeting's Attendees section if missing.

## Frontmatter Schema

```yaml
tags:
  - people
aliases: []
icon: LiUser
email:        # Work email if known
title:        # Job title
company:      # Organization name
customers:    # Array — must match Customers/ filenames
  - CustomerA
org:          # internal | customer | partner
linkedin:     # URL or empty
```

## Body Template

```markdown
# {Full Name}

## Contact
- **Title:** {job title}
- **Company:** {company}
- **Email:** {email}
- **Org:** {internal/customer/partner}

## Notes
- {Context: how you met, what they work on, areas of expertise}
- First mentioned in: [[{meeting note where they appeared}]]
```

## Input

{user provides name and any available context}
