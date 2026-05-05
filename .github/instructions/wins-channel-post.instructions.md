---
description: "Instructions for generating and evaluating 'Wins and Customer Impact' Teams channel posts. Covers channel conventions, post format archetypes, fitness rubric, pushback criteria, and content transformation from nomination data. Load when wins-channel-post.prompt.md runs or when user asks about posting a win to the team channel."
applyTo: ".github/prompts/wins-channel-post.prompt.md"
---

# Wins and Customer Impact — Channel Post Instructions

## Purpose

Guide the agent to evaluate whether a customer win story belongs in the **"1. Wins and Customer Impact"** Teams channel, and if so, transform it into a channel-appropriate post. The channel is a high-bar, peer-facing celebration artifact — not a dump of nomination text.

---

## Channel Profile

| Property | Value |
|---|---|
| **Channel** | 1. Wins and Customer Impact |
| **Group ID** | `28d45944-2cd9-4b56-ae66-7369cac7357b` |
| **Channel ID** | `19:16065ac38a6a4e0893e68c60892b6bae@thread.tacv2` |
| **Audience** | Peers — Account Executives, CSAs, CSAMs, SEs, Sales Specialists, Industry leads |
| **Cadence** | 2–4 posts per week; posts are investment-grade, not quick updates |
| **Tone** | Celebratory but professional. Customer-first, metric-driven, team-crediting, authentically proud |

---

## Post ≠ Nomination

A nomination and a channel post serve **different audiences** with **different purposes**. The agent MUST transform, not copy-paste.

| Dimension | Nomination (Award Committee) | Channel Post (Peers) |
|---|---|---|
| **Audience** | Senior leadership evaluators | Fellow sellers, architects, delivery leads |
| **Tone** | Executive-ready, compliance-constrained | Celebratory, authentic, peer-to-peer |
| **Length** | 300–500 words (form limit) | 500–3,000 words (varies by story depth) |
| **Framing** | Adoption-first, no "before/after" | Can include competitive context, challenges overcome, honest blockers |
| **Metrics** | Committed ACR, seats, whitespace | Can include broader metrics: deal size, MoM growth, timeline, competitive displacement |
| **Customer context** | Minimal (form doesn't ask) | Rich — industry, challenges, why they matter, competitive landscape |
| **Forbidden language** | "discovered," "gap," "corrected" | **Same content policy** — no CRM gap language. But competitive narrative IS welcomed |
| **Team credit** | Per-nominee contribution (short) | Detailed role-by-role narrative with @mentions |

### Content Policy Carryover

Even in the channel post, the nomination content policy **still applies for CRM references**:
- Do NOT reference prior CRM values, deltas, corrections, or gap discoveries
- Do NOT imply ACR was previously missed or understated
- The committed amount is the outcome of the team's strategy

**What IS different for channel posts:**
- Competitive context is explicitly welcomed (AWS displacement, vendor comparison, platform differentiation)
- Honest challenges overcome make the story more credible and useful to peers
- Industry context and customer significance add weight
- Longer, more detailed team credit builds culture

---

## Fitness Rubric — Should This Be Posted?

Before generating a post, evaluate the story against this rubric. Score each dimension 0–2. **Minimum threshold: 6/14 to proceed. Below 6: push back.**

| Dimension | 0 (Missing) | 1 (Partial) | 2 (Strong) |
|---|---|---|---|
| **Customer Significance** | Routine account, no strategic importance | Mid-tier account or moderate deal | Named/strategic account, large deal, industry leader |
| **Metric Impact** | Vague or no quantifiable outcome | Some metrics but small scale | Clear, impressive metrics ($, seats, %, timeline) |
| **Competitive Narrative** | No competitive context | Implicit platform preference | Explicit displacement or competitive win |
| **Team Orchestration Story** | Single-person effort or unclear roles | 2 roles contributed | 3+ roles with distinct, complementary contributions |
| **Customer Journey Depth** | Just "we committed a milestone" | Some context on what happened | Rich story: challenge → strategy → execution → outcome |
| **Expansion / Forward Signal** | No future opportunity mentioned | Vague expansion possibility | Concrete next phase, whitespace quantified, customer signal |
| **Peer Learning Value** | Nothing others can learn from this | Minor tactical insight | Replicable playbook, competitive intelligence, process innovation |

### Score Interpretation

| Score | Action |
|---|---|
| **10–14** | Strong post. Generate and recommend posting. |
| **6–9** | Viable but could be stronger. Generate with suggestions to enrich. |
| **3–5** | **Push back.** The nomination is great for the award, but the story isn't strong enough for the channel. Explain why and suggest what would make it channel-worthy. |
| **0–2** | **Strong push back.** This doesn't belong in the channel. Celebrate the nomination win internally instead. |

---

## Pushback Protocol

When the fitness score is below threshold, the agent MUST push back using this format:

```
⚠️ **Doctor pushback — Channel fitness: [score]/14**

This nomination is a well-deserved award recognition, but the underlying story 
[may not / doesn't] serve the "Wins and Customer Impact" channel because:

- [Specific reason 1 — e.g., "The story is a routine milestone commitment 
  without competitive context or customer journey depth"]
- [Specific reason 2 — e.g., "The metrics, while real, are modest compared to 
  the channel's typical posts ($X/mo vs. typical $XX-XXX/mo posts)"]
- [Specific reason 3 — e.g., "There's no replicable playbook or peer learning 
  value — the approach was standard"]

**What would make it channel-worthy:**
- [Enrichment suggestion — e.g., "Add the competitive displacement angle — 
  did the customer evaluate alternatives?"]
- [Enrichment suggestion — e.g., "Include the expansion signal — what's the 
  whitespace opportunity?"]

Your options:
1. **Enrich the story** — give me more context and I'll re-evaluate
2. **Post anyway** — I'll generate the best version possible with what we have
3. **Skip the channel post** — celebrate via the nomination only
```

---

## Post Archetypes

Based on channel analysis, posts follow one of these patterns. Choose the best fit for the story.

### Archetype 1: Competitive Displacement Win
**When**: Customer moved from a competitor (AWS, Google, third-party vendor) to Microsoft/GitHub.
**Structure**:
1. **Hook** — One sentence: what happened and why it matters
2. **Customer Context** — Who they are, industry, scale, what they do
3. **The Challenge** — What problem they faced, why the competitor wasn't working
4. **Why Microsoft/GitHub Won** — Differentiation, technical advantage, team strategy
5. **Solution** — What was deployed, architecture highlights
6. **Business Impact** — Metrics: ACR, seats, cost savings, timeline
7. **Winning Team** — Role-by-role credit with @mentions
8. **What's Next** — Expansion signals, growth runway

### Archetype 2: Strategic Partnership / Expansion
**When**: Multi-year deal, new business unit adoption, significant expansion of existing relationship.
**Structure**:
1. **Hook** — The commitment and why it's significant
2. **Customer Context** — Relationship history, industry position
3. **The Strategy** — How the team identified and drove the opportunity
4. **Cross-Role Execution** — Who did what, how roles complemented each other
5. **Measurable Outcome** — ACR, seats, whitespace captured
6. **Growth Runway** — What this unlocks for the future
7. **Team Credit** — @mentions and role-specific shoutouts

### Archetype 3: Innovation / Technical Win
**When**: Novel deployment, first-of-its-kind use case, noteworthy technical achievement.
**Structure**:
1. **Hook** — The innovation and customer outcome
2. **Customer Problem** — What traditional approaches couldn't solve
3. **The Approach** — Technical strategy, proof-of-concept, adoption pathway
4. **Outcome** — Metrics, customer feedback, competitive signal
5. **Peer Learning** — What others can replicate from this playbook
6. **Team** — @mentions

### Archetype 4: Quick Win Snapshot
**When**: Strong metrics but simpler story, doesn't need full narrative depth.
**Length**: 300–600 words.
**Structure**:
1. **One-liner hook** (with metrics)
2. **Context** (2–3 sentences)
3. **Key bullets**: what happened, team involved, what's next
4. **@mentions** for team credit

---

## Formatting Conventions

These conventions match what the channel's best posts use:

- **Bold** for section headers and key metrics
- **Bullets** for team credit and key outcomes
- **@mentions** for team members (resolve to Microsoft alias or UPN)
- **Hyperlinks** to internal Win Wire, customer announcements, or press when available
- **Emoji** used sparingly for emphasis (🏆, 🚀, ✅, 💪) — not for decoration
- **No attachments required** — but images (architecture diagrams, team photos) are welcomed if available
- **Metric specificity**: Use exact numbers for internal posts ($36K/mo, 292 seats). Round only if sharing externally.

---

## Confidentiality — Channel vs. External

The "Wins and Customer Impact" channel is **internal to Microsoft**. The same confidentiality rules as the nomination form apply:
- Customer names are acceptable (internal audience)
- Exact dollar amounts are acceptable (internal audience)
- Partner names / project codes: avoid unless publicly known
- No security incident details

If the user asks to share the post **externally** (customer-facing, LinkedIn, etc.), switch to anonymized framing:
- `[Customer]` instead of name
- Round dollar amounts ("over $35K/mo")
- Generic seat counts ("hundreds of seats")

---

## Delegation Protocol

The actual Teams message posting is handled by the `m365-actions` subagent. When the post is approved:

1. Delegate to `m365-actions` with:
   - **Action**: Post message to Teams channel
   - **Team Group ID**: `28d45944-2cd9-4b56-ae66-7369cac7357b`
   - **Channel ID**: `19:16065ac38a6a4e0893e68c60892b6bae@thread.tacv2`
   - **Message content**: The approved post text (HTML-formatted for Teams rich text)
   - **@mentions**: Resolved UPNs for team members
2. Confirm successful posting with the user
3. Save the post text to vault: `Nominations/{customer}_wins_post_{date}.md`
