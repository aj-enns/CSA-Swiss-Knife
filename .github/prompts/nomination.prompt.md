---
description: "Generate an Americas Living Our Culture nomination for an account team that drove GitHub Copilot adoption and committed a milestone through cross-role strategic collaboration. Use: 'let's nominate [Account Name]'"
---

# Nominate Account Team

Generate an **Americas Living Our Culture** nomination for the cross-role team that strategically drove adoption on **{{ account_name }}** and committed a GHCP milestone.

## Context

This nomination recognizes the SE, SSP, and GitHub Account Executive who came together, built a game plan, executed adoption resources for the customer, and committed a milestone backed by verified production consumption.

## Steps

1. **Check prior nominations** — search `Nominations/` in the vault for existing nominations. If any exist, review tone, structure, and level of detail to ensure consistency. Match the style — especially how generic or specific enablement references are.
2. **Confirm award category** — default to **"Make it Happen"** for standard 3-person teams. If the user specifies a category in their request, use it without re-confirming. Only present the category table and ask when the user hasn't indicated a preference.
3. **Resolve the account** — pull full customer context from the vault via `oil:get_customer_context` for `{{ account_name }}`. Extract:
   - Committed ACR on the milestone (the number that matters)
   - Active Copilot seats — proof that adoption is real
   - Seat whitespace — the expansion opportunity
   - Milestone ID and opportunity linkage
   - Team: SSP name, GH AE name, SE name (from Agent Insights / Teams transcripts)
   - Key dates of collaboration
   - Adoption actions taken — keep generic ("enablement sessions", "technical resources") unless user confirms specific programs were delivered. Match the specificity level of prior nominations in the vault.
   - Customer engagement signals — subsidiary structures, BU adoption, expansion interest
4. **If vault data is insufficient** — check CRM via `crm_get_record` or `get_milestones` for current milestone values. Cross-reference with MSXI seat data. **ACR source hierarchy: GH AE-confirmed number > CRM committed value > MSXI/OctoDash.** See the ACR Verification Protocol section below.
5. **Generate the nomination** matching the form fields defined in the Form Field Constraints section below:
   - **Project Name** (≤90 chars) — concise title for the achievement
   - **3 separate Headlines** (≤300 chars each) — strategic alignment, cross-role execution, measurable impact
   - **Per-nominee contribution** — what each person specifically did
   - **"What's Your Story?" narrative** (≤6,000 chars) — 300–500 word story following the arc: Opportunity → Approach → Impact
   - **CRITICAL**: Frame the narrative as adoption-driven strategy → committed milestone. NEVER reference prior CRM values, deltas, or corrections. The committed amount is the outcome of the team's game plan — not a fix.
6. **Compliance check** — run the checklist from the Compliance Rules section against the output.
7. **Present** the full nomination ready to paste into the form. Offer to adjust tone, switch categories, or add/remove details.

---

## Post-Nomination Actions — MANDATORY GATE

**⛔ STOP after Step 7.** Once the user approves the nomination text, run the analysis below and present the action selector. Do NOT silently proceed to form fill. Do NOT skip to vault save. Present options and wait.

### Pre-flight analysis (runs automatically, not shown as raw data)

Before presenting options, the agent silently evaluates:

1. **Wins channel fitness** — score the story against the 7-dimension rubric from `wins-channel-post.instructions.md` (Customer Significance, Metric Impact, Competitive Narrative, Team Orchestration, Customer Journey, Expansion Signal, Peer Learning Value). Produce a score /14.
2. **Prior channel posts** — delegate to `m365-actions`: search the Wins & Customer Impact channel (Group `28d45944-2cd9-4b56-ae66-7369cac7357b`, Channel `19:16065ac38a6a4e0893e68c60892b6bae@thread.tacv2`) for recent posts mentioning `{{ account_name }}`. Flag if duplicate exists in last 30 days.
3. **Vault nomination history** — check `Nominations/` for existing nominations and posts for this account.

### Action Selector

Present a table with the agent's recommendation per action:

| # | Action | Agent Assessment | Recommendation |
|---|--------|-----------------|----------------|
| A | **Submit nomination** — fill the Living Our Culture form via browser | Ready ✅ | _(always available)_ |
| B | **Post to Wins channel** — transform into a peer-facing channel post | Fitness: [X]/14 [emoji] | [Recommended / Viable / Not recommended — with one-line reason] |
| C | **Save to vault only** — archive nomination text without submitting | — | _(always available)_ |
| D | **All of the above** — submit form + post to channel + save to vault | Fitness: [X]/14 [emoji] | [Recommended only if B is Recommended] |

**Fitness emoji mapping**: 🟢 10–14 (strong) · 🟡 6–9 (viable, could be enriched) · 🔴 0–5 (not recommended)

**Agent recommendation rules**:
- **B = "Recommended"** when fitness ≥ 10 and no duplicate in channel
- **B = "Viable — could be stronger"** when fitness 6–9. Note the weak dimensions.
- **B = "Not recommended"** when fitness < 6. Show top 2 reasons and what would make it channel-worthy.
- **B = "Duplicate detected"** when a recent post exists for this account. Suggest updating the existing post or skipping.
- **D = "Recommended"** only when B is "Recommended"

Ask: **"Which actions? (e.g., 'A and C', 'D', 'just A')"** — then STOP and WAIT.

**Skip rule**: If the user already specified actions in their original request (e.g., "nominate and post to channel", "just the form", "nominate but don't post"), skip the gate and execute the specified actions. Still run the fitness check silently for B — if fitness < 6 and user requested B, trigger the pushback protocol from `wins-channel-post.instructions.md` before proceeding.

### Cross-action optimization

- **A + B selected** → run form fill first, then generate channel post (nomination data is warm in context)
- **B alone** → chain to `wins-channel-post.prompt.md` directly with nomination data
- **C alone or with others** → vault save runs in parallel with other actions (no dependency)

---

## Action Execution

### Action A — Submit Nomination Form

8. **Save to vault** — save the approved nomination to `Nominations/{customer}_nomination_{date}.md` in the vault. The user may skip this step — if they say "skip vault" or "don't save", proceed directly to form fill.
9. **Open the form in browser** — delegate to `@doctor` to fill the form using the `nomination` skill (`.github/skills/nomination/SKILL.md`). Pass the approved category, nomination type, nominee(s) with contribution text, Project Name, TPID, 3 headlines, and narrative text. The skill drives the Playwright MCP browser workflow, fills all form steps, and pauses before submitting for final user confirmation.

### Action B — Post to Wins Channel

10. **Chain to `wins-channel-post.prompt.md`** — pass `{{ account_name }}` and the nomination data (ACR, nominees, team roles, headlines, narrative, competitive context, customer industry). The wins-channel-post workflow:
    - Uses the pre-computed fitness score from the action selector
    - Selects the best post archetype (Competitive Displacement / Strategic Partnership / Innovation / Quick Snapshot)
    - Transforms nomination content into a peer-facing post (NOT a copy-paste)
    - Resolves @mentions for team members
    - Presents the post for user approval
    - Posts to the channel via `m365-actions` delegation
    - **May push back** if fitness is marginal — this is by design. The channel's quality bar is independent of the nomination's worthiness.

### Action C — Save to Vault Only

11. **Save nomination** to `Nominations/{customer}_nomination_{date}.md`. No form fill, no channel post.

## Variables

- `{{ account_name }}` — the customer account name
- The team is always: the SE (me), the SSP, and the GH Account Executive aligned to this account

---

# Reference — Award Categories, Form Constraints, Narrative Rules

Everything below is reference material the agent uses during generation. It does not need to be loaded separately.

---

## Award Categories — Selection Guide

Choose the category that best fits the team size and achievement. **Default: Make it Happen** for standard 3-person ACR nominations. If the user specifies a category in their request, use it without re-confirming. Only present the table and ask when the user hasn't indicated a preference.

| Category | Team Size | Reward | Best For |
|---|---|---|---|
| **Make it Happen** | Individuals or up to 4 | $1,500/person | Going the distance, cross-role execution, measurable business outcomes |
| **Try New Things** | Individuals or up to 4 | $1,500/person | Bold thinking, creative problem solving, growth mindset |
| **Team First** | 5–10 FTEs, 2+ OUs | $1,500/person | Large cross-segment collaborative impact |
| **Create a Place of Belonging** | Individuals or up to 4 | $1,500/person | Inclusion, community building, diverse perspectives |
| **Manager of the Quarter** | Individual only | $2,000 | Model, Coach, Care leadership |
| **Leading with Compliance** | Individuals or up to 4 | $1,500/person | Compliance culture, integrity, Trust Code |
| **oneAMI Award** | Up to 4, multi-OU | $1,500/person | Customer Zero AI adoption, Frontier journey, AI socket wins |

**Cash Award Cap**: 2 Living Our Culture Awards per fiscal year, capped at $3,500 USD total.

### Default Recommendation for ACR Account Nominations

For the standard use case (SE + SSP + GH AE = 3 people, measurable ACR outcome):

- **Primary**: **Make it Happen** — fits team size (up to 4), emphasizes going the distance for customers, working together for the right outcome, driving and implementing change successfully.
- **Alternative**: **Try New Things** — if the nomination emphasizes the innovative data cross-referencing approach and growth mindset.
- **If 5+ nominees across accounts**: Consider **Team First** (requires 2+ OUs — MSFT + GitHub qualifies).

---

## Form Field Constraints — VERIFIED FROM LIVE FORM

These are the actual character limits enforced by the Living Our Culture nomination form. The agent MUST respect these when generating content.

| Field | Max Chars | Notes |
|---|---|---|
| **Project Name** | 90 | Short title for the nomination (e.g., "[Customer] — GitHub Copilot Adoption & Milestone Commitment") |
| **TPID** | free text | Customer TPID — goes in a dedicated field, NEVER in narrative prose |
| **Headline 1** | 300 | Strategic alignment — what the team set out to do |
| **Headline 2** | 300 | Cross-role execution — what each person contributed |
| **Headline 3** | 300 | Measurable impact — the committed outcome |
| **Story narrative** | 6,000 | "What's Your Story?" — full narrative |
| **Per-nominee contribution** | free text | One field per nominee — what that person specifically contributed |

**Important:** The form has 3 SEPARATE headline fields, not one combined summary text box. Generate each headline independently, sized to fit within 300 characters.

---

## Form Structure — MANDATORY FORMAT

The nomination form has 4 steps. The agent MUST generate content that maps to these fields.

### Step 1 — Category, Type & Nominees
- Award category (radio button)
- Nomination type: Individual or Team (radio button)
- Nominee search (by name or alias) — one per field, add more for team nominations
- **Per-nominee contribution text** — a short description of what each person specifically did

### Step 2 — Write-up

**Project Name** (90 chars) — A concise title for the team's achievement.

**TPID** — The customer's TPID. Dedicated field.

**3 Headlines** (300 chars each) — These are the evaluator's first impression. Structure:
1. **Strategic Alignment & Initiative**: How the team came together with a game plan and what strategy they built
2. **Cross-Role Execution & Collaboration**: What each role uniquely contributed to the customer's success
3. **Measurable Business Impact**: The committed outcome — ACR committed, seats adopted, expansion signals identified

**Example pattern:**
> **Headline 1**: The SSP, GitHub Account Executive, and Solution Engineer proactively aligned on a strategic adoption plan for [Customer], combining account intelligence, GitHub platform expertise, and Microsoft technical resources to drive GitHub Copilot adoption.
> **Headline 2**: Each team member brought a unique lens — the SSP navigated the customer's organizational structure, the GitHub AE delivered platform insights and customer engagement, and the SE connected adoption workshops, certification pathways, and enablement resources.
> **Headline 3**: Through this coordinated effort, the team committed $X/mo in GHCP ACR on the milestone, validated by production consumption across N active Copilot seats — with a clear expansion path.

**Story — "What's Your Story? How the Team Achieved Results?"** (6,000 chars)

This is the narrative section — 300–500 words. Written as a cohesive story with clear beginning, middle, and end.

**Narrative arc:**

**Opening — The Opportunity (2–3 sentences)**
Set the context. The team identified an adoption opportunity and built a strategy to drive GitHub Copilot usage and commit the milestone. Frame this as a proactive game plan — not a reactive correction.

**Middle — The Approach (150–250 words)**
- What triggered the alignment (account strategy review, customer engagement signal, adoption opportunity)
- How the team built the game plan: SSP brought account relationships, GH AE positioned adoption resources, SE connected technical enablement
- Customer-facing actions — **keep references generic by default** (e.g., "enablement sessions tailored to the customer's workflows", "technical resources aligned to the customer's priorities"). Do NOT name specific programs (Z2A, bootcamps, certifications, Developer Day) unless the user explicitly confirms those programs were delivered for this customer. If prior nominations in the vault use generic language, match that level.
- What each role contributed:
  - **SSP**: Account relationships, customer organizational intelligence, subsidiary/BU strategy, cross-team alignment
  - **GH Account Executive**: GitHub platform expertise, proprietary consumption intelligence, enterprise support confirmation, customer-facing engagement
  - **SE**: Technical enablement, tailored resources, multi-platform analysis, verified consumption baseline, milestone orchestration
- Any complexities navigated (subsidiary structures, multi-BU adoption, enterprise consolidation)

**Closing — The Impact (100–150 words)**
- Committed milestone with quantified ACR amount
- Active Copilot seats in production — the proof that adoption is real
- Forward-looking: expansion vectors (seat whitespace, Advanced Security interest, migration pipeline)
- One sentence on why this matters: the team's alignment model positions the account for sustained growth

### Step 3 — Attachments (optional)
Links or file uploads supporting the nomination. Usually skipped.

### Step 4 — Review & Submit
Full review of all fields before submission.

---

## Narrative Framing — MANDATORY RULES

### Core principle: Adoption-first, commitment-as-outcome

The nomination tells the story of a team that **built a strategic adoption plan, executed it, and committed a milestone** as the natural result. The ACR commitment is the *outcome* of the strategy — never the discovery of a gap.

Leadership reads these nominations. If the narrative implies ACR was previously missed, understated, or incorrectly tracked, it reflects poorly on the team — even if the intent is positive. The framing must always be: "we drove adoption and committed the milestone."

### What to say — strategic adoption language
- The team built a game plan to drive adoption and commit the milestone
- The team combined account intelligence, platform expertise, and technical enablement to accelerate the customer's time-to-value
- Adoption workshops, certification pathways, and hands-on enablement resources gave the customer a fast on-ramp
- The team committed $X/mo in ACR on the milestone, backed by verified production consumption
- The strategy opened multiple expansion vectors for sustained growth

### What NEVER to say — forbidden framing
- Do NOT reference any prior CRM value, "before" number, or ACR delta
- Do NOT frame the commitment as a correction, update, or reconciliation
- Do NOT imply the ACR was previously missed, understated, unaccounted, or incorrectly tracked
- Do NOT use: "discovered," "found," "corrected," "gap," "variance," "discrepancy," "underreported," "understated," "missing," "unaccounted"
- Do NOT reference CRM data quality or imply the milestone was in a wrong state
- Do NOT attribute blame to any individual, team, system, or prior process
- Do NOT mention "before" and "after" numbers — only state the committed amount

### Preferred language substitutions
| Instead of... | Say... |
|---|---|
| "ACR was missing from CRM" | "The team committed $X/mo in GHCP ACR" |
| "CRM had the wrong number" | "The team validated production consumption and committed the milestone" |
| "We discovered a gap" | "The team committed the verified monthly ACR" |
| "The milestone was underreported" | "The team committed the milestone backed by verified consumption" |
| "Nobody was tracking this" | "The team drove adoption and committed the milestone" |
| "Updated from $X to $Y" | "Committed $Y/mo in GHCP ACR on the milestone" |
| "N-fold increase over prior baseline" | "$Y/mo in committed ACR across N active seats" |
| "Cross-referenced to find the real number" | "Built the verified consumption baseline to anchor the commitment" |

---

## Category-Specific Narrative Hooks

When generating the nomination, weave in the language that matches the selected award category:

### Make it Happen
- "Went the distance" — the team built a game plan and executed it across account strategy, adoption enablement, and milestone commitment
- "Worked together for the right outcome" — SSP + GH AE + SE each contributed their unique lens to drive the customer's adoption
- "Drove and implemented change successfully" — the team committed the milestone backed by verified production consumption
- "Agile mindset" — adapted to customer needs, navigated subsidiary structures and licensing complexity

### Try New Things
- "Thought boldly and outside the box" — combined Microsoft and GitHub resources in a cross-ecosystem adoption strategy
- "Exercised a growth mindset" — first-time alignment between these roles produced immediate measurable commitment
- "Creative problem solving for customers" — tailored adoption resources to the customer's specific workflows and organizational structure

### Team First (if 5+ nominees)
- "Cross-functional, collaborative team impact" — MSFT (SE + SSP) + GitHub (AE) across organizational boundaries
- "Accountability as a team for decisions, actions, measurable results" — each role owned their contribution to the adoption strategy
- "Working as a collective team to achieve more" — the combined approach delivered a committed milestone that no single role could have achieved alone

---

## ACR Verification Protocol

The nomination ACR must come from a **GH AE-confirmed number**, not from MSXI or OctoDash alone.

**Source hierarchy (highest authority wins):**
1. **GH Account Executive confirmation** — the GH AE's stated number is the truth. This is the number that goes into the nomination.
2. **CRM committed value** — if the milestone has already been committed with the GH AE-confirmed number, use that.
3. **MSXI / OctoDash** — these are _starting points for the conversation_, not the final number. Use them to initiate the ACR verification with the GH AE via the account Teams channel.

**Workflow:** Pull MSXI and OctoDash numbers → present them in the account Teams channel → GH AE confirms the actual ACR → that confirmed number is what goes into the nomination and CRM.

If the GH AE has not yet confirmed the number, the nomination cannot include a committed ACR — flag this to the user.

---

## Style Consistency — Prior Nominations

Before generating a new nomination, check the vault `Nominations/` folder for existing nominations. If prior nominations exist:
- Match the tone, structure, and level of detail
- Keep enablement references at the same level of specificity (or generality) as prior nominations
- Do NOT introduce new patterns (e.g., naming specific programs) if prior nominations kept references high-level

This ensures a consistent voice across all nominations from the same nominator.

---

## Account Data Extraction

When pulling data from the vault, extract these fields for the nomination. Focus on **what was committed** and **what adoption actions were taken** — not on prior CRM states.

1. **From customer frontmatter**: `tpid`, `tier`, `tranche`
2. **From Seat Snapshot**: `GHCP ACR` (current verified ACR), `GHCP Seats`, `GHE Total Seats`, `Remaining Seat Opp` (whitespace)
3. **From Agent Insights** — look for:
   - Committed ACR amount — the milestone value
   - Team participants — SSP name, GH AE name, SE name
   - Adoption actions taken — workshops, certifications, enablement sessions, migration support
   - Customer engagement signals — who was engaged, what was discussed
   - Subsidiary/BU details — multi-entity structures, expansion signals
   - Chat transcript links — evidence of collaboration
4. **From Open Items**: Milestone commitment actions, expansion signals

**Data to NEVER include in the nomination:**
- Prior CRM milestone values ("before" numbers)
- ACR deltas or variances
- Any language about CRM data quality

### Known Account Data

The agent should pull live data from the vault (`oil:get_customer_context`) and CRM (`get_milestones`) for each nomination. Do NOT hardcode account-specific data in this prompt — it goes stale and poses a confidentiality risk in shared repos.

For each account, extract at runtime:
- **Committed ACR** — current milestone monthly use value
- **Milestone #** and **Opportunity #** — for reference fields
- **Team** — SSP, GH AE, SE names from Agent Insights or vault contacts
- **Key adoption details** — subsidiary structures, seat counts, expansion signals
- **Collaboration dates** — from Teams transcripts or Agent Insights timestamps

---

## Compliance Rules (Microsoft Confidential Information Policy)

Every nomination output MUST pass this checklist:

### For the nomination form (internal)
- [ ] Customer name is acceptable in TPID field and internal narrative
- [ ] Exact dollar amounts are acceptable for single-account internal nominations
- [ ] TPID goes only in the designated TPID field — not embedded in narrative prose
- [ ] At least 2 quantitative metrics included (required by form)
- [ ] No partner names or project code names that could identify a specific external engagement
- [ ] No details about security incidents or breaches that could identify a customer

### If shared externally or broadly
- [ ] Use "[Customer]" brackets or generic terms ("an enterprise account," "the account")
- [ ] Round dollar amounts when aggregating ("over $35K/mo" not "$36,405")
- [ ] Describe seat counts generically ("hundreds of seats" not "292 seats")
- [ ] No industry + exact metric combos that fingerprint a single customer

### From the program guidelines examples
The official examples use `[Customer]`, `[Nominee]`, `[partner]`, `$million`, `$XK` as placeholders. Follow this pattern when anonymizing. Exact amounts are shown when the nomination is for internal review only.

---

## Tone

- **Executive-ready**: Written for senior leadership evaluation — assume the audience includes your skip-level
- **Strategy-led**: The team had a game plan from the start, executed it, and committed the result
- **Collaborative**: Every sentence reflects teamwork. The SE, SSP, and GH AE are equal contributors
- **Forward-looking**: The commitment is the starting point for larger growth — always end with expansion vectors
- **Adoption-first**: Lead with what the team did for the customer (workshops, enablement, migration support), not with CRM mechanics
- **Confident but grounded**: State committed amounts and active seats — let the numbers speak
- **Active voice**: "The team committed" not "The milestone was committed"
- **High-level on programs**: Reference adoption workshops, certification pathways, hands-on enablement, and migration support generically — do NOT name specific internal program IDs or codes unless the user explicitly confirms they were delivered
- **Match the program energy**: The examples in the guidelines are direct, outcome-focused, and use strong action verbs. Mirror this tone.
