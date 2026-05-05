---
description: "Helper-script contract for M365 data normalization, meeting scoring, and bulk vault sync. Use scripts/helpers tools instead of inline parsing for MCP JSON responses, WorkIQ query construction, and bulk CRM→vault sync operations."
applyTo: "**"
---
# Data Helper Scripts

## Purpose

Reusable Node.js CLI tools in `scripts/helpers/` that normalize, score, format, and sync raw MCP tool responses. **Use these instead of generating inline parsing code.**

## When to Use

Whenever a workflow receives raw JSON from `calendar:ListCalendarView`, `mail:SearchMessages`, needs to construct a `workiq:ask_work_iq` query, or needs to bulk-sync CRM data into the Obsidian vault, pipe the data through the appropriate helper script rather than writing one-off parsing logic.

## Available Helpers

### normalize-calendar.js
Normalizes raw `calendar:ListCalendarView` JSON into compact event data.
- Resolves attendee response codes (2=accepted, 3=tentative, 4=declined)
- Identifies external (customer-facing) attendees by domain
- Converts UTC times to local times
- Flags declined/cancelled events

```bash
node scripts/helpers/normalize-calendar.js /tmp/cal-raw.json \
  --tz America/Chicago \
  --user-email jin.lee@microsoft.com
```

### score-meetings.js
Scores normalized calendar events and detects time conflicts.
- Applies deterministic priority scoring (+50 customer-facing, +25 VIP, +10 owner, -40 declined, -15 low-signal recurring)
- Groups overlapping events into conflict clusters
- Ranks conflicts by score with tie-breaking

```bash
node scripts/helpers/score-meetings.js /tmp/cal-normalized.json \
  --vip-list "$VAULT_DIR/_lcg/vip-list.md"
```

### normalize-mail.js
Normalizes raw `mail:SearchMessages` JSON into compact mail items.
- Extracts sender, subject, received date, snippet, webLink
- Classifies priority (URGENT/HIGH/NORMAL/LOW) using VIP list and importance signals
- Suppresses automated noise (noreply, notifications)

```bash
node scripts/helpers/normalize-mail.js /tmp/mail-raw.json \
  --vip-list "$VAULT_DIR/_lcg/vip-list.md"
```

### build-workiq-query.js
Builds properly scoped WorkIQ prompts from structured inputs. Prevents malformed queries by enforcing time bounds and entity constraints.

```bash
node scripts/helpers/build-workiq-query.js \
  --goal "action items from PriorAuth sync" \
  --sources meetings,chats \
  --entities "Adam Ziesmer,Blue KC" \
  --time-window 7d \
  --topic "PriorAuth" \
  --output-shape actions
```

## Standard Pipeline for Morning Triage

1. **Calendar**: Delegate to `@m365-actions` → save raw JSON to `/tmp/cal-raw-<date>.json` → normalize → score
2. **Mail**: Delegate to `@m365-actions` → save raw JSON to `/tmp/mail-raw-<date>.json` → normalize
3. **Assemble**: Use scored calendar + normalized mail + CRM data to build the triage note

```bash
# Full calendar pipeline
cat /tmp/cal-raw-2026-03-26.json \
  | node scripts/helpers/normalize-calendar.js --tz America/Chicago --user-email jin.lee@microsoft.com \
  | node scripts/helpers/score-meetings.js --vip-list "$VAULT_DIR/_lcg/vip-list.md" \
  > /tmp/cal-scored-2026-03-26.json

# Mail pipeline
node scripts/helpers/normalize-mail.js /tmp/mail-raw-2026-03-26.json \
  --vip-list "$VAULT_DIR/_lcg/vip-list.md" \
  > /tmp/mail-normalized-2026-03-26.json
```

## Rules

- **Always use these scripts** for M365 data processing and bulk vault sync — do not write inline parsing code.
- All scripts accept stdin or a file path argument.
- All scripts output JSON to stdout.
- Scripts are composable via Unix pipes.
- Date temp files use pattern `/tmp/<type>-<date>.json`.

### vault-sync.js
Bulk CRM → vault sync engine. Bypasses OIL MCP round-trips for batch operations by rendering templates and writing directly to the vault filesystem.
- Renders opportunity, milestone, and people notes from CRM data using the same templates as `vault-sync` skill
- Preserves user-authored content below `<!-- end-crm-sync -->` and `## Task Activity Log`
- Supports `--config` for persistent scope (which customers/entities to sync)
- Supports `--dry-run` for previewing changes
- Supports `--entities` filter (opportunities, milestones, people)
- Uses `secure-path.js` for vault boundary validation

```bash
# Agent pulls CRM data → saves to temp → runs bulk sync
node scripts/helpers/vault-sync.js /tmp/crm-sync-2026-04-03.json \
  --vault "$OBSIDIAN_VAULT"

# With config (scoped to specific customers)
node scripts/helpers/vault-sync.js /tmp/crm-sync-2026-04-03.json \
  --vault "$OBSIDIAN_VAULT" \
  --config "$OBSIDIAN_VAULT/_sync/sync-config.json"

# Dry run
node scripts/helpers/vault-sync.js /tmp/crm-sync-2026-04-03.json \
  --vault "$OBSIDIAN_VAULT" --dry-run
```

## Standard Pipeline for Bulk Vault Sync

1. **CRM Pull**: `get_my_active_opportunities({ includeDealTeam: true })` for deal-team-scoped opps → `get_milestones` per customer → resolve systemuser GUIDs → assemble into input JSON → save to `/tmp/crm-sync-<date>.json`
2. **Sync**: `node scripts/helpers/vault-sync.js /tmp/crm-sync-<date>.json --vault "$OBSIDIAN_VAULT"` → writes all entity notes in one pass
3. **Summary**: Script outputs JSON summary of created/updated/skipped entities

**Default scope is deal-team only.** The vault is personal working context, not a portfolio mirror. For portfolio-wide analytics, use PBI reports or MSX views.

This replaces the N×2 OIL MCP round-trips (get_note_metadata + atomic_replace per file) with a single filesystem pass.
