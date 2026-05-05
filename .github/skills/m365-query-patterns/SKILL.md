---
name: m365-query-patterns
description: "M365 MCP query patterns for Calendar, Mail, and Teams native tools. Covers efficient retrieval, payload management, and write patterns. Triggers: calendar search, find meeting, list events, schedule meeting, email search, find email, search Outlook, mail thread, attachment, reply to email, Teams search, find chat, search Teams messages, list chats, Teams channel, post to Teams, send to person, meeting chat, direct message, 1:1 chat."
---

# M365 Query Patterns

Efficient patterns for Calendar, Mail, and Teams MCP tools. For **broad multi-source discovery** across meetings + chats + email + files in one sweep, use the `workiq-operations` skill instead.

---

## Calendar (`calendar:*`)

### Critical Rule

**Always use `ListCalendarView` with explicit start/end datetimes.** `ListEvents` is unbounded and doesn't expand recurring events.

### Tools

| Tool | Purpose | Risk |
|---|---|---|
| `ListCalendarView` | Events in a time window | LOW (bounded) |
| `GetUserDateAndTimeZoneSettings` | User timezone | LOW |
| `FindMeetingTimes` | Available slots for attendees | LOW |
| `GetRooms` | Meeting rooms | LOW |
| `CreateEvent` | Create event (sends invites) | WRITE |
| `UpdateEvent` / `CancelEvent` / `DeleteEventById` | Modify/remove | WRITE |
| `AcceptEvent` / `DeclineEvent` / `TentativelyAcceptEvent` | Respond | WRITE |

### Patterns

**Today's schedule**: `GetUserDateAndTimeZoneSettings` → `ListCalendarView` with today's boundaries.

**Find available time**: `FindMeetingTimes` with attendees + time range + duration (ISO 8601: `PT1H`, `PT30M`).

**Room booking**: `GetRooms` → include room as attendee/location in `CreateEvent`.

**Create meeting**: `CreateEvent` with `isOnlineMeeting: true` for auto Teams link.

**Cancel vs Delete**: `CancelEvent` notifies attendees (organizer). `DeleteEventById` silently removes (attendee).

### OrderBy — `ListCalendarView`

**NEVER use `start/dateTime` in `orderby`.** The Graph SDK property names are PascalCase, not OData path syntax.

| Intent | Correct | WRONG |
|---|---|---|
| Sort by start time | `Start` | `start/dateTime` ❌ |
| Sort by end time | `End` | `end/dateTime` ❌ |
| Sort by subject | `Subject` | `subject` ❌ |

Valid `orderby` values (PascalCase only): `Start`, `End`, `Subject`, `IsAllDay`, `Importance`, `Sensitivity`, `CreatedDateTime`, `LastModifiedDateTime`.

**Error signature** (indicates wrong casing/path):
```
Error: Invalid property name(s) in 'orderby' parameter: start/dateTime.
Please use valid properties from this list: Start, End, Subject, ...
```

**Fix**: replace `start/dateTime` → `Start` (and append ` asc`/` desc` as needed).

---

## Mail (`mail:*`)

### Search (KQL)

Always include at least 2 filters. Always include a date range.

| KQL | Example |
|---|---|
| `from:` | `from:satyan@microsoft.com` |
| `subject:` | `subject:"Quarterly Review"` |
| `received:` | `received:2026-03-01..2026-03-14` |
| `hasattachment:true` | Messages with attachments |
| `isflagged:true` / `isread:false` | Flagged / unread |

**Two-pass**: `SearchMessages` (top: 5-10) → `GetMessage` for specific IDs.

### SearchMessagesQueryParameters Restrictions

`SearchMessagesQueryParameters` uses OData `$filter`/`$search`/`$orderby`. Key restrictions:

- **NEVER combine `$orderby` with `$search`.** Microsoft Graph rejects this with `The query parameter $orderby is not supported with $search`. Omit `orderby` and sort client-side.
- **NEVER use `$filter` on nested complex-type properties** (`from/emailAddress/address`). Use KQL `SearchMessages` instead.
- Only use `SearchMessagesQueryParameters` for simple top-level filters (`receivedDateTime`, `isRead`) when KQL is not an option.

### Attachment Safety

1. `GetAttachments` first — check names and sizes.
2. Skip >5MB unless explicitly requested.
3. `UploadLargeAttachment` for files >3MB.

### Write Patterns

| Action | Tool |
|---|---|
| New email | `SendEmailWithAttachments` |
| Reply | `ReplyToMessage` / `ReplyAllToMessage` |
| Reply with thread | `ReplyWithFullThread` / `ReplyAllWithFullThread` |
| Forward | `ForwardMessage` / `ForwardMessageWithFullThread` |
| Draft workflow | `CreateDraftMessage` → `UpdateDraft` → `SendDraftMessage` |

### Payload Management

- Always use `top` on `SearchMessages` (start: 5-10).
- Always include date range in KQL.
- Prefer `ReplyToMessage` over `ReplyWithFullThread` when recipient has context.

---

## Teams (`teams:*`)

### Chat Topology

| Type | `chatType` | ID Pattern | Notes |
|---|---|---|---|
| 1:1 direct | `oneOnOne` | `19:<hex>@thread.v2` | Permanent, not meeting-tied |
| Group | `group` | `19:<hex>@thread.v2` | 3+ participants |
| Meeting | `meeting` | `19:meeting_<base64>@thread.v2` | Calendar event thread |
| Self-chat | N/A | `48:notes` | Not in `ListChats` |

**Critical**: Meeting chats are often named "1:1 - [Name]" but their IDs contain `meeting_`. **Never rely on display names** — check the ID.

### UPN Resolution (Vault-First)

```
1. oil:get_person_context({ name }) → email / teams_id?
   └ Found → USE IT
2. teams:SearchTeamsMessages → find chatIds → ListChatMembers → extract email + userId
3. calendar:ListCalendarView → extract UPN from attendees
4. All fail → ASK USER
5. ALWAYS persist discovered UPNs to vault via oil:patch_note
```

**Never guess UPNs from aliases.** `jinle@microsoft.com` ≠ `jin.lee@microsoft.com`.

### Retrieval Patterns

**Topic search**: `SearchTeamsMessages` with `top: 5-10` → extract chatId/channelId for drill-down.

**Person's direct messages**: Vault UPN → `ListChats` (filter `chatType == "oneOnOne"`) → `ListChatMessages`.

**Channel content**: `ListTeams` → `ListChannels` → `ListChannelMessages`. Cache teamId/channelId.

### Write Patterns

**Post to chat**: Verify chatId first (`GetChat` if unsure). Confirm chatType matches intent. `PostMessage`.

**Post to channel**: `PostChannelMessage` with teamId + channelId.

**Reply in thread**: `ReplyToChannelMessage` with teamId + channelId + parent messageId.

**Create chat**: Resolve all member UPNs via vault first. `CreateChat` with chatType + members.

### Payload Management

- Always set `top` on `SearchTeamsMessages` (start: 5-10).
- Search results can exceed 20KB due to HTML/adaptive cards.
- Use search only for ID discovery, then `GetChatMessage` for specific content.
