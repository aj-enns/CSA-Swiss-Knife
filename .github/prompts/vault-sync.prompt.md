---
description: "Bulk CRM → vault sync — pulls live CRM data and writes all entity notes in one pass via vault-sync.js. Replaces the N×2 OIL MCP round-trip pattern. Triggers: vault sync, bulk sync, sync all, refresh vault, sync customers, full vault refresh, sync pipeline to vault."
---

# Bulk Vault Sync

Pull my CRM data and sync it to the vault in one pass using the bulk sync script.

## Scope Philosophy

The vault is your **personal working context** — opportunities where you're on the deal team. If you need portfolio-wide analytics, use Power BI or MSX views.

**Default scope**: Only sync opportunities where the user is on the deal team (`get_my_active_opportunities`). This is the right scope for daily use.

**Expanded scope** (only when explicitly requested): "sync all Contoso opps", "sync everything for Customer X" — uses `prepare_crm_prefetch` + vault roster for broader pulls. Flag this to the user: *"This will pull all opportunities for these customers, not just your deal team. For portfolio-wide data, consider PBI reports instead."*

## Steps

1. **Identify user** — `crm_whoami`. Capture email, display name, and systemuserid.

2. **Scope** — Determine what to sync:

   | User says | Scope | Tool |
   |-----------|-------|------|
   | "vault sync" / "sync all" | Deal-team opps only (default) | `get_my_active_opportunities` |
   | "sync Contoso" | Deal-team opps for that customer | `get_my_active_opportunities`, filter by customer |
   | "sync all Contoso opps" | All active opps for that customer | `prepare_crm_prefetch` → `crm_get_record` per opp |
   | Config file exists | Per config scope | Config-driven |

   **Default**: `get_my_active_opportunities({ includeDealTeam: true })` — returns only opportunities where the user is owner or deal team member, with the `relationship` tag per opp.

3. **Pull CRM data** — Use parallel MSX MCP calls to assemble the input JSON:

   **Phase 1** (one call): `get_my_active_opportunities({ includeDealTeam: true })` → opportunities grouped by customer with deal team inline.

   **Phase 2** (parallel per customer): `get_milestones({ opportunityIds, statusFilter: "active", format: "triage" })` for each customer's opportunity set.

   **Phase 3** (parallel batches): Deduplicate all systemuser GUIDs from deal teams → resolve names/emails via `crm_query` on `systemusers` (OR-chain up to 15 per query).

4. **Assemble input JSON** — Shape the data into the format expected by `vault-sync.js`. Write to `/tmp/crm-sync-{{date}}.json`.

   Structure per customer:
   ```json
   {
     "syncDate": "<ISO now>",
     "user": { "email": "<from crm_whoami>", "fullname": "<from crm_whoami>" },
     "customers": [
       {
         "name": "<customer>",
         "tpid": "<tpid from vault or CRM>",
         "accountId": "<account GUID>",
         "opportunities": [
           {
             "opportunityid": "<guid>",
             "name": "<name>",
             "msp_opportunitynumber": "<opp#>",
             "msp_activesalesstage": "<stage label>",
             "msp_estcompletiondate": "<YYYY-MM-DD>",
             "estimatedvalue": "<number>",
             "msp_consumptionconsumedrecurring": "<number>",
             "msp_salesplay": "<label>",
             "description": "<text>",
             "statecode": 0,
             "dealTeam": [
               { "systemuserid": "<guid>", "fullname": "<name>", "internalemailaddress": "<email>", "title": "<title>", "isOwner": true }
             ],
             "milestones": [
               {
                 "msp_engagementmilestoneid": "<guid>",
                 "msp_name": "<name>",
                 "msp_milestonenumber": "<ms#>",
                 "msp_monthlyuse": "<number>",
                 "msp_milestonestatus": "<label>",
                 "msp_commitmentrecommendation": "<label>",
                 "msp_milestonedate": "<YYYY-MM-DD>",
                 "msp_milestoneworkload": "<label>",
                 "msp_deliveryspecifiedfield": "<label>",
                 "msp_forecastcomments": "<text>",
                 "msp_forecastcommentsjsonfield": [{"modifiedOn": "<date>", "userId": "<email>", "comment": "<text>"}],
                 "owner": { "fullname": "<name>", "internalemailaddress": "<email>" }
               }
             ]
           }
         ]
       }
     ]
   }
   ```

5. **Dry run first** — Run with `--dry-run` and show the summary to the user:
   ```bash
   node scripts/helpers/vault-sync.js /tmp/crm-sync-{{date}}.json --vault "$OBSIDIAN_VAULT" --dry-run
   ```
   Present the summary: how many entities would be created/updated/skipped per customer.

6. **Confirm and execute** — After user confirms:
   ```bash
   node scripts/helpers/vault-sync.js /tmp/crm-sync-{{date}}.json --vault "$OBSIDIAN_VAULT"
   ```

7. **Report** — Show the final summary table:
   ```
   | Entity Type   | Created | Updated | Skipped |
   |---------------|---------|---------|---------|
   | Customers     |    X    |    X    |    X    |
   | Opportunities |    X    |    X    |    X    |
   | Milestones    |    X    |    X    |    X    |
   | People        |    X    |    X    |    X    |
   ```
   Plus per-customer breakdown and any errors.

## Options

- **Customer scope**: "sync Contoso and Fabrikam" → filter to those customers
- **Entity filter**: "just milestones" → `--entities milestones`
- **Config**: if `$OBSIDIAN_VAULT/_sync/sync-config.json` exists, pass `--config`
- **Expanded scope**: "sync all opps for Contoso" → broader pull, warn user

## Rules

- **Default is deal-team scoped** — do not pull all-org data without explicit request.
- Always dry-run before writing. Show the preview.
- Use the `vault-sync.js` helper script — do NOT write vault notes via inline code or individual OIL MCP calls.
- If a customer has no vault folder yet, the script creates the nested structure automatically.
- User-authored content below `<!-- end-crm-sync -->` and `## Task Activity Log` rows are always preserved.
- Templates live in `.github/skills/vault-sync/references/`. To change note structure, edit the `.template.md` files.
- If the user asks for portfolio-wide data or analytics, suggest PBI reports instead of vault sync.
