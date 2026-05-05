# Signal-Driven Discovery — Full Reference

Loaded on demand by `role-se-ms-activities` SKILL.md during batch activity scans.

## Discovery Flow

The flow is staged by dependency, not sequential. Launch independent calls in parallel where possible.

```
┌─ Stage A (parallel, no dependencies) ─────────────────────────┐
│  get_milestones(mine:true)    ListCalendarView(start, end)    │
│         ~5-15s                   ~10-20s → save to /tmp       │
└───────────┬──────────────────────────────┬────────────────────┘
            │                              │
            ▼                              ▼
┌─ Stage B (parallel, after Stage A) ───────────────────────────┐
│  Build customer filter list     normalize-calendar.js │ score │
│  from milestones (~instant)     ~2s local pipeline            │
└───────────┬──────────────────────────────┬────────────────────┘
            │                              │
            ▼                              │
┌─ Stage C (parallel, needs filter list) ──┤────────────────────┐
│  SearchMessages batch 1                  │                    │
│  SearchMessages batch 2                  │                    │
│  ask_work_iq (all customers)             │                    │
│         ~15-30s each                     │                    │
└───────────┬──────────────────────────────┘────────────────────┘
            │
            ▼
┌─ Stage D (all results available) ─────────────────────────────┐
│  Correlate signals → milestones → Classify → Present          │
└───────────────────────────────────────────────────────────────┘
```

### Stage A — Parallel Launch (no dependencies)

1. **Retrieve milestones** — call `get_milestones(mine: true, statusFilter: "active")`. Do **not** call `get_my_active_opportunities` first — milestones already embed opportunity name, GUID, and customer context.
2. **Retrieve calendar** — call `ListCalendarView` for the date window. Calendar is the user's own calendar and needs no customer scope. Save raw response to `/tmp/cal-raw-{date}.json`.

Both calls launch **simultaneously**.

### Stage A′ — Fiscal Year Filter (immediately after milestones return)

Before building the customer filter list, **drop milestones whose target date (`msp_milestonedate`) falls before the previous fiscal year**. Microsoft fiscal years run July 1 – June 30; FY*N* starts July 1 of calendar year *N*−1. The rule is: keep milestones where `msp_milestonedate >= July 1 of (currentFY − 2)`.

| Today's FY | Oldest FY kept | Cutoff date |
|---|---|---|
| FY26 (Jul 2025 – Jun 2026) | FY25 | `2024-07-01` |
| FY27 (Jul 2026 – Jun 2027) | FY26 | `2025-07-01` |

**Why target date, not `createdon`?** `get_milestones` does not return `createdon`. Target date is a reliable proxy: milestones with target dates years in the past were never closed and have no current delivery relevance. If a milestone was created recently but targets a past FY — it is still stale and should be excluded.

Apply this filter silently. If all milestones for a customer are dropped, that customer is excluded from signal scanning. Briefly note dropped milestones in the final output so the user knows they were skipped (e.g., *"2 milestones on xyz - Security filtered out (FY22/FY23 — before FY25 cutoff)"*).

### Stage B — Process First Results (after Stage A + FY filter)

3. **Build customer filter list** — from the **filtered** milestone set, extract customer names, domains, milestones, and opportunity context (see Phase 1).
4. **Run calendar helper pipeline** — `normalize-calendar.js | score-meetings.js` on the saved raw file. Runs locally in ~2 seconds.

### Stage C — Domain-Dependent Queries (after filter list is built)

5. **Launch batched mail + WorkIQ** — in parallel. These need the customer filter list for domain batching (mail) and customer names (WorkIQ). See Phase 2.

### Stage D — Correlate and Classify

6. **Match signals to milestones** — correlate customer/opportunity/topic from all signal sources with milestone context.
7. **Classify each candidate** — apply Activity Classification rules (in SKILL.md).
8. **Present only significant activities** — if no signals are found for a customer, give no recommendation for that customer.

## Signal Filter Strategy

M365 mailboxes and calendars are high-volume. Unscoped queries return noise and blow context budgets. Apply these filters in order:

### Phase 1 — Build Customer Scope from Milestones

From the **FY-filtered** `get_milestones` response, extract per customer:
- **Customer name** — parsed from the opportunity name field (`_msp_opportunityid_value@OData.Community.Display.V1.FormattedValue`). Most opportunity names follow patterns like `[Tag] Customer | Description` or `Customer | Project`. Extract the customer name by matching against known patterns or the account name if available.
- **Opportunity name + GUID** — carried inline on each milestone (`_msp_opportunityid_value`). Group milestones by opportunity GUID to deduplicate.
- **Customer email domain(s)** — resolve via vault people notes (`oil:get_customer_context`) or ask the user once for all unknown domains. Cache domains for the session.
- **Key contact names** — from vault people notes or milestone team members with external domains.
- **Milestone count per customer** — used to prioritize M365 query batching if domain count exceeds batch limits.

This produces a **customer filter list**: `[{ name, domains[], contacts[], milestones[], opportunityIds[] }]`

**Parallel launch point**: Once the customer filter list is built, launch Phase 2 mail + WorkIQ queries immediately. Calendar was already retrieved in Stage A (parallel with milestones) and the helper pipeline runs in Stage B alongside filter list construction.

### Phase 2 — Batched M365 Queries (all customers per call)

**Design goal**: Minimize API round-trips. Batch customer domains into a small number of queries instead of one-per-customer.

#### Mail — batched by domain groups (delegate to `m365-actions`)

KQL supports OR-chaining of domain clauses. Group all customer domains from Phase 1 into **batches of 5–7 domains** per query to stay within KQL length limits (~1024 chars). Each batch produces one `SearchMessages` call.

```
SearchMessages with KQL:
  (from:{userEmail} OR to:{userEmail} OR cc:{userEmail})
  AND (from:@{domain1} OR to:@{domain1} OR cc:@{domain1}
       OR from:@{domain2} OR to:@{domain2} OR cc:@{domain2}
       OR from:@{domain3} OR to:@{domain3} OR cc:@{domain3}
       ... up to 5-7 domains per batch)
  AND received:{startDate}..{endDate}
  top: 50
```

Batching rules:
- Build domain list from the customer filter list (Phase 1). If a customer has multiple domains, each counts toward the batch limit.
- Target **2–3 batches** total for a typical 10–15 customer portfolio. With 14 customers × 1 domain each = 2 batches of 7.
- Use `top: 50` per batch (not 10) since results span multiple customers. Increase to 100 if the user has a very active window.
- After results return, **tag each message to its customer** by matching sender/recipient domains back to the customer filter list.
- The `from/to/cc:{userEmail}` clause ensures only messages where the SE is a **direct participant** — excludes distribution list fan-out.
- If a customer has multiple domains, include all in the OR chain: `from:@contoso.com OR from:@contoso.onmicrosoft.com`.
- **Never search without domain filters.** If domains are unknown and unresolvable, skip that customer for mail and note the gap.
- If total domain count exceeds 21 (~3 batches), prioritize customers with the most active milestones or nearest due dates.

Example for 14 customers:
```
# Batch 1 (domains 1-7):
(from:Simon.Schwingel@microsoft.com OR to:Simon.Schwingel@microsoft.com)
AND (from:@fraport.de OR to:@fraport.de OR cc:@fraport.de
     OR from:@enercon.de OR to:@enercon.de OR cc:@enercon.de
     OR from:@siegwerk.com OR to:@siegwerk.com OR cc:@siegwerk.com
     OR from:@brenntag.de OR to:@brenntag.de OR cc:@brenntag.de
     OR from:@fischer.de OR to:@fischer.de OR cc:@fischer.de
     OR from:@altana.com OR to:@altana.com OR cc:@altana.com
     OR from:@evonik.com OR to:@evonik.com OR cc:@evonik.com)
AND received:2026-03-26..2026-04-09

# Batch 2 (domains 8-14):
... remaining domains ...
```

#### Calendar — helper-script pipeline (mandatory)

Raw `ListCalendarView` responses are multi-MB payloads that overwhelm agent context when parsed inline. **Always** pipe through the helper scripts instead of manual parsing.

**Step 1 — Retrieve and save raw calendar:**
```
ListCalendarView with start/end for the time window → save to /tmp/cal-raw-{date}.json
```

**Step 2 — Normalize + score via helper pipeline:**
```bash
cat /tmp/cal-raw-{date}.json \
  | node scripts/helpers/normalize-calendar.js \
      --tz Europe/Berlin \
      --user-email {userEmail} \
  | node scripts/helpers/score-meetings.js \
  > /tmp/cal-scored-{date}.json
```

This runs locally in ~2 seconds and produces compact JSON (~5-10KB vs 5MB raw) with:
- External attendees pre-extracted with domains (for customer matching)
- All-day events, declined, and cancelled events already flagged
- Priority scores pre-computed (+50 customer-facing, +25 VIP, -40 declined, -15 low-signal recurring)
- Conflict clusters detected

**Step 3 — Read scored output and match to customers:**

Read `/tmp/cal-scored-{date}.json` into the agent context. For each scored event, match to a customer from the filter list by:

| Signal | Relevance | Weight |
|---|---|---|
| `externalAttendees[].domain` matches a known `customerDomain` | Strong | High |
| `subject` contains a customer name, opportunity keyword, or milestone topic | Strong | High |
| `subject` contains a solution area keyword (e.g., "Azure migration", "Copilot POC", "AKS") matching a milestone | Moderate | Medium |
| Internal-only meeting but `subject` references a customer by name | Moderate | Medium |
| All-internal, generic subject, no customer cue | Weak | Low |

**Filtering rules** (applied to the pre-scored output):
- Events with `isAllDay: true`, `isDeclined: true`, or `isCancelled: true` → **drop** (already flagged by normalize script).
- Events with **at least one Strong signal** are included as candidates.
- Events with only **Moderate signals** are included if they correlate with an active milestone topic.
- Events with only **Weak or no signals** are excluded.
- Internal meetings **are not excluded** — they are relevant when `subject` carries customer context (e.g., "Contoso migration sync", "Prep for Fabrikam ADS").
- Events with `isCustomerFacing: true` (from normalize script) automatically qualify as Strong signal.

**Never parse raw calendar JSON inline.** If the helper scripts are unavailable (e.g., workspace not mounted), fall back to delegating calendar correlation to a subagent with explicit instructions to read in chunks — but note this is 10-20x slower.

#### Teams + broader signals — single WorkIQ sweep

Use one `workiq:ask_work_iq` call instead of N individual `SearchTeamsMessages` calls. WorkIQ is purpose-built for broad multi-source discovery across meetings + chats + email in a single sweep.

```
ask_work_iq:
  "What customer-facing interactions did I have in the past {N} days
   related to: {comma-separated customer names from Phase 1}?
   Include Teams chats, meeting follow-ups, and action items.
   Focus on technical discussions, deliverables, and decisions."
```

WorkIQ scoping rules:
- Include **all customer names** from Phase 1 in a single query. WorkIQ handles multi-entity scoping internally.
- The query targets meetings, chats, and email in one pass — no need to split by source type.
- WorkIQ is user-centric: it returns activity where the SE was mentioned or directly participated. Silent activity in group chats where the user was not mentioned may be missed — this is acceptable for activity recording (we only record what the SE did).
- After results return, **tag each signal to its customer** by matching customer names and contact names.
- If WorkIQ returns a specific Teams thread that warrants deeper investigation, delegate a targeted `ListChatMessages` to `m365-actions` for that thread only.

**When to fall back to per-customer Teams searches:**
- WorkIQ is unavailable or returns an error → delegate individual `SearchTeamsMessages` calls to `m365-actions` for the top 5 customers by milestone count. Use `top: 10` each.
- WorkIQ returns suspiciously sparse results for a customer known to be active → supplement with one targeted `SearchTeamsMessages` for that customer.

**Total API calls (typical 14-customer portfolio):**
| Source | Old pattern | New pattern |
|---|---|---|
| Mail | 14 calls (1 per customer) | **2–3 batched calls** |
| Calendar | 1 call | 1 call (unchanged) |
| Teams | 8+ calls (1 per customer) | **1 WorkIQ call** (+ 0-2 targeted fallbacks) |
| **Total** | **23+ calls** | **4–6 calls** |

### Phase 3 — Deduplication and Correlation

- A meeting and its follow-up email thread about the same topic count as **one activity** (multiple signals, not multiple activities).
- Group signals by `{customer × milestone × topic}` before classification.
- Prefer the signal with the richest context (meeting with attendees > email thread > Teams message) as the primary evidence; cite others as supporting.

## Evidence Requirement

Every proposed activity must cite the source signals that justify it: meeting subject + date, email thread subject + date, or Teams message context. Evidence is shown to the user in the recommendation but is **not** passed to the CRM tool call.
