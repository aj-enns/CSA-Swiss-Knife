---
name: nomination
description: "Generate and submit Americas Living Our Culture award nominations. Covers award categories, form structure, narrative framing, compliance rules, ACR verification, and optional Playwright browser automation for form submission. Triggers: nomination, Living Our Culture, award nomination, Americas award, Make it Happen, Team First, nominee, nomination form."
---

# Living Our Culture Nomination

## Award Categories

| Category | Team Size | Reward | Best For |
|---|---|---|---|
| **Make it Happen** | Up to 4 | $1,500/person | Going the distance, cross-role execution |
| **Try New Things** | Up to 4 | $1,500/person | Bold thinking, growth mindset |
| **Team First** | 5–10 FTEs, 2+ OUs | $1,500/person | Cross-segment collaborative impact |
| **Create a Place of Belonging** | Up to 4 | $1,500/person | Inclusion, community building |
| **Manager of the Quarter** | Individual | $2,000 | Model, Coach, Care leadership |
| **Leading with Compliance** | Up to 4 | $1,500/person | Compliance culture, integrity |
| **oneAMI Award** | Up to 4, multi-OU | $1,500/person | Customer Zero AI adoption |

**Cash Award Cap**: 2 per fiscal year, $3,500 USD total. **Default for ACR nominations** (SE + SSP + GH AE = 3 people): **Make it Happen**.

## Form Field Constraints

| Field | Max Chars |
|---|---|
| Project Name | 90 |
| TPID | free text (dedicated field — never in narrative) |
| Headline 1/2/3 | 300 each |
| Story narrative | 6,000 |
| Per-nominee contribution | free text |

## Narrative Rules (Mandatory)

**Core principle**: Adoption-first, commitment-as-outcome. The ACR commitment is the *outcome* of the strategy — never a discovery of a gap.

**Forbidden**: Do NOT reference prior CRM values, "before" numbers, ACR deltas, corrections, gaps, variances, discrepancies. Do NOT use: "discovered," "found," "corrected," "underreported," "missing."

| Instead of... | Say... |
|---|---|
| "ACR was missing from CRM" | "The team committed $X/mo in GHCP ACR" |
| "We discovered a gap" | "The team committed the verified monthly ACR" |
| "Updated from $X to $Y" | "Committed $Y/mo in GHCP ACR on the milestone" |

## ACR Verification

1. **GH Account Executive confirmation** — the truth
2. **CRM committed value** — if already committed with GH AE-confirmed number
3. **MSXI / OctoDash** — starting points, not final

## Style Consistency

Check vault `Nominations/` for existing nominations. Match tone and detail level.

---

# Nomination Form Fill (Browser Automation)

Fill the Living Our Culture nomination form at `https://wwrrnomination.azurewebsites.net/LivingOurCulture/SubmitNomination` using Playwright MCP tools.

## When This Skill Triggers

- @mcaps generates a nomination and the user approves it
- @mcaps delegates to @doctor with: category, nominees, summary, narrative
- @doctor loads this skill and executes the browser workflow

## Required Inputs

The delegating agent MUST pass all of these:

| Input | Max Chars | Example |
|---|---|---|
| **Award category** | — | "Make it Happen" |
| **Nomination type** | — | "Individual" or "Team" |
| **Nominee name(s) + alias(es)** | — | "Jane Doe (JANEDOE)" |
| **Per-nominee contribution** | free text | "GitHub AE who delivered platform insights and coordinated adoption workshops" |
| **Project Name** | 90 | "[Customer] — GitHub Copilot Adoption & Milestone Commitment" |
| **TPID** | — | "123456" |
| **Headline 1** | 300 | Strategic alignment text |
| **Headline 2** | 300 | Cross-role execution text |
| **Headline 3** | 300 | Measurable impact text |
| **"What's Your Story?" narrative** | 6,000 | 300–500 word story |
| **Attachments/links** (optional) | — | URLs or file references for Step 3 |

### Character Limit Enforcement

Before typing into any form field, verify the content fits within the character limit. If the delegating agent's text exceeds a limit:
- **Project Name >90 chars**: Truncate intelligently at a word boundary, keep it meaningful
- **Headline >300 chars**: Trim trailing detail while preserving the core message
- **Story >6,000 chars**: This should not happen if the narrative is 300–500 words; flag to user if it does

## Workflow — Low Freedom (strict sequence)

Every step uses `browser_snapshot` after actions to confirm state before proceeding. See `references/form-map.md` for the expected element structure of each step.

### 1. Open & Authenticate

```
browser_navigate → https://wwrrnomination.azurewebsites.net/LivingOurCulture/SubmitNomination
browser_snapshot → confirm page loaded
```

- SSO authenticates automatically via corp account.
- If redirected to login picker: click the `@microsoft.com` account button.
- If SSO fails or page doesn't load after 10s: **STOP.** Report the error. Offer to copy nomination text to clipboard instead.

### 2. Step 1 — Category & Nominees

1. `browser_snapshot` — confirm Step 1 is expanded and radio buttons are visible.
2. `browser_click` the radio button matching the **award category** (e.g., ref for "Make it Happen").
3. If **Team** nomination: click the "Team Nomination" radio button. Otherwise "Individual Nomination" is pre-selected.
4. `browser_click` the nominee search field → `browser_type` the nominee name or alias → wait for dropdown → `browser_click` the matching result.
5. After each nominee is added, locate the **contribution text field** for that nominee → `browser_type` the per-nominee contribution text.
6. Repeat steps 4–5 for each additional nominee.
7. `browser_snapshot` — confirm category selected, all nominees added, and contribution fields populated.
8. `browser_click` the **NEXT** button.

**Nominee search tips:**
- Try Microsoft alias first (e.g., "JANEDOE"), then full name if not found
- For GitHub employees, try their GitHub email or name
- If a nominee is not found after 2 attempts, ask the user to verify the alias

### 3. Step 2 — Write-up

1. `browser_snapshot` — confirm Step 2 fields are visible.
2. Locate the **Project Name** field → `browser_type` the project name (≤90 chars).
3. Locate the **TPID** field → `browser_type` the TPID value.
4. Locate **Headline 1** field → `browser_type` headline 1 text (≤300 chars).
5. Locate **Headline 2** field → `browser_type` headline 2 text (≤300 chars).
6. Locate **Headline 3** field → `browser_type` headline 3 text (≤300 chars).
7. Locate the **story/narrative** field → `browser_type` the "What's Your Story?" text (≤6,000 chars).
8. `browser_snapshot` — confirm all fields populated correctly and no validation errors.
9. `browser_click` the **NEXT** button.

### 4. Step 3 — Attachments (optional)

1. `browser_snapshot` — confirm Step 3 is visible.
2. If attachments/links were provided: fill the link fields or use `browser_file_upload`.
3. If no attachments: skip directly.
4. `browser_click` the **NEXT** button.

### 5. Step 4 — Review & Confirm

1. `browser_snapshot` — capture the full completed form for review.
2. `browser_take_screenshot` — take a visual screenshot as proof.
3. **Present the snapshot to the user.** Show what was filled in each field.
4. Ask the user: **"Save to Draft"** or **"Submit Nomination"?**

### 6. Submit or Save

- If user says **"Submit"**: `browser_click` the "Submit Nomination" button → `browser_snapshot` to confirm success.
- If user says **"Draft"**: `browser_click` the "Save to Draft" button → `browser_snapshot` to confirm saved.
- Report the outcome with a final screenshot.

## Safety Rules

- **NEVER auto-submit.** Always pause at Step 5 for user confirmation.
- **NEVER click "Submit Nomination" without explicit user approval** ("submit", "go ahead", "yes").
- If any form field is missing or doesn't match `form-map.md`: take a screenshot, describe the mismatch, ask the user for guidance.
- If the form structure has changed (new fields, different layout): report what changed and stop.
- If a field won't accept input (disabled, hidden): report it and ask the user.

## Troubleshooting

| Problem | Action |
|---|---|
| SSO login picker appears | Click the `@microsoft.com` corp account |
| Page timeout / network error | Report error, offer clipboard fallback |
| Nominee not found in search | Try alias, then full name. After 2 failures, ask user to verify |
| Category radio button missing | Take screenshot, ask user — form may have changed |
| Step doesn't advance after NEXT | Snapshot for validation errors, report required fields |
| Character limit exceeded | Truncate at word boundary, preserving core message. Report what was trimmed |
| Contribution field not visible | Snapshot — it may appear only after nominee is added. Try clicking on the nominee row |
| Headline fields not separate | Form structure may have changed — take screenshot and report layout to user |
