# Form Map — Living Our Culture Nomination

Element structure captured from `https://wwrrnomination.azurewebsites.net/LivingOurCulture/SubmitNomination` (March 2026). Use this to identify the correct elements when filling the form via Playwright MCP.

> **Note:** Element `ref=` values may change between sessions. Always `browser_snapshot` first and match by label/role, not by ref ID.

## Page Header

| Element | Role | Label / Text |
|---|---|---|
| Nominator selector | combobox | "Select Nominator" — defaults to "Myself" |
| Language selector | button | "Select Language" — defaults to "English" |
| Help link | link | "HELP" → `mailto:AmericasAwards@microsoft.com` |
| User badge | button | "Signed in user: [Name]" |

## Tab Bar

| Tab | Label | Default |
|---|---|---|
| Nominate | "NOMINATE" | Selected |
| My Nomination | "My Nomination" | — |

## Step 1 — Category & Nominees

### Award Category Radio Buttons

Match by radio button label text:

| Category | Radio label |
|---|---|
| Team First | "Team First" |
| Create a Place of Belonging | "Create a Place of Belonging" |
| Try New Things | "Try New Things" |
| Manager of the Quarter | "Manager of the Quarter" |
| Leading with Compliance | "Leading with Compliance" |
| Make it Happen | "Make it Happen" |

Separate radio group:

| Category | Radio label |
|---|---|
| One AMI | "Select One AMI option" → displays as "One AMI" |

### Nomination Type

| Type | Radio label | Default |
|---|---|---|
| Individual | "Individual Nomination" | Checked |
| Team | "Team Nomination" | — |

### Nominee Search

| Element | Role | Placeholder |
|---|---|---|
| Nominee input | textbox | "Enter a name or alias..*" |

**Workflow:** Type name/alias → wait for autocomplete dropdown → click matching result. Repeat for additional nominees.

### Navigation

| Button | Label | State |
|---|---|---|
| BACK | "BACK" | Disabled on Step 1 |
| NEXT | "Click to go next step." / "NEXT" | Enabled after required fields filled |

## Step 2 — Write-up

> Step 2 is labeled "Step 2: Write-up your Nomination" — collapsed by default, expands after clicking NEXT from Step 1.

Expected fields (capture via `browser_snapshot` after advancing):
- **Summary / Headline field** — for the 3-Point Summary
- **Story / Narrative field** — for "What's Your Story?"

**Note:** Exact field labels and refs must be captured live — they are not visible until Step 1 is completed and NEXT is clicked.

## Step 3 — Attachments

> "Step 3: Attach Documentation or Links to Boost the Story! – (Optional)"

Expected fields:
- Link input fields or file upload controls
- This step is optional — can be skipped by clicking NEXT

## Step 4 — Submit or Save

> "Step 4: Submit or Save as Draft"

Review text confirms:
- Only submitted nominations are eligible for winner selection
- Confirmation email sent from `AmericasAwards@microsoft.com`
- Draft nominations are NOT final

### Action Buttons (always visible at bottom)

| Button | Label | Action |
|---|---|---|
| Save to Draft | "Click to Save to Draft nomination" / "Save to Draft" | Saves without submitting |
| Submit Nomination | "Click to Submit Nomination" / "Submit Nomination" | Final submission — **requires user confirmation** |

## Program Info Sidebar

Key reference data visible on the page:
- **Frequency:** Quarterly
- **Cash Award Cap:** 2 Awards per FY, capped at $3,500 USD
- **Timeline:** Links to SharePoint awards timeline
- **Eligibility:** Americas FTE, good standing with HR, no active compliance cases
