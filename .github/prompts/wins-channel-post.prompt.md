---
description: "Generate a 'Wins and Customer Impact' Teams channel post from a nomination or standalone customer win story. Evaluates story fitness before posting and pushes back when the story doesn't meet channel standards. Use: 'post win for [Account Name]' or chains from nomination.prompt.md after award submission."
---

# Post Win to Team Channel

Evaluate and generate a **"Wins and Customer Impact"** Teams channel post for **{{ account_name }}**. If chained from a nomination, transform the nomination data into a channel-appropriate story. If standalone, gather context fresh.

## Context

The "Wins and Customer Impact" channel is a high-bar, peer-facing celebration space. Posts are investment-grade artifacts — not quick updates or nomination copies. Every post must earn its place by offering concrete metrics, customer journey depth, team orchestration credit, and peer learning value.

## Steps

1. **Load instructions** — read `.github/instructions/wins-channel-post.instructions.md` for channel conventions, fitness rubric, post archetypes, and pushback criteria.

2. **Gather story context** — assemble the raw material:
   - **If chained from nomination**: The nomination data (ACR, seats, team, customer, narrative) is already available from the prior workflow. Use it as the foundation, but plan to enrich it.
   - **If standalone**: Pull from vault via `oil:get_customer_context` for `{{ account_name }}`. Extract: committed ACR, active seats, whitespace, team participants, key dates, adoption actions, competitive context, customer industry.
   - **Enrich from CRM**: `get_milestones({ customerKeyword: "{{ account_name }}" })` for current milestone state. `crm_get_record` for opportunity details (deal team, stage, solution play).
   - **Check for recent channel duplicates**: Delegate to `m365-actions` to search the Wins channel for recent posts mentioning `{{ account_name }}`. If a post exists in the last 30 days, flag it — the user may want to update rather than duplicate.

3. **Score fitness** — evaluate the story against the fitness rubric (7 dimensions, 0–2 each, total /14):
   - Customer Significance
   - Metric Impact
   - Competitive Narrative
   - Team Orchestration Story
   - Customer Journey Depth
   - Expansion / Forward Signal
   - Peer Learning Value

   Present the score transparently:
   ```
   📊 Channel Fitness Score: [X]/14
   
   ✅ Customer Significance: [score] — [one-line justification]
   ✅ Metric Impact: [score] — [one-line justification]
   ...
   ```

4. **Gate decision**:
   - **Score 6+**: Proceed to post generation. Note any weak dimensions that could be enriched.
   - **Score <6**: **Push back.** Use the pushback protocol from the instructions. Present the score breakdown, explain why the story falls short, suggest enrichments, and offer three options (enrich / post anyway / skip). **Do NOT generate the post until the user responds.**

5. **Select archetype** — based on the story, pick the best post archetype:
   - Competitive Displacement Win
   - Strategic Partnership / Expansion
   - Innovation / Technical Win
   - Quick Win Snapshot (if metrics are strong but story is simple)

6. **Generate the post** — transform the nomination/vault data into the selected archetype format:
   - **Do NOT copy the nomination text.** Rewrite for the peer audience.
   - Add customer context, industry, competitive landscape (nomination doesn't have these).
   - Expand team credit with role-by-role narrative and @mention placeholders.
   - Include expansion signals and peer learning value.
   - Follow the formatting conventions (bold headers, bullets, hyperlinks, emoji usage).
   - Respect content policy: no CRM gap language, no "before/after" numbers — same as nomination.

7. **Resolve @mentions** — for each team member, note the Microsoft alias or UPN. If unknown, leave as `@[Name]` and flag for user to confirm.

8. **Present for approval** — show the full post with:
   - The fitness score
   - The selected archetype
   - The formatted post text
   - Any @mention gaps to resolve
   - Option to adjust tone, length, or add images/links

9. **Post to channel** — once the user approves, delegate to `m365-actions`:
   - Post to Teams channel (Group ID: `28d45944-2cd9-4b56-ae66-7369cac7357b`, Channel ID: `19:16065ac38a6a4e0893e68c60892b6bae@thread.tacv2`)
   - Include @mentions with resolved UPNs
   - Confirm successful posting

10. **Save to vault** — save the post to `Nominations/{customer}_wins_post_{date}.md` if vault is available.

## Variables

- `{{ account_name }}` — the customer account name
- `{{ nomination_data }}` — (optional) structured nomination output if chained from nomination.prompt.md: ACR amount, nominees, team roles, headline summaries, narrative text

## Tone

Peer-celebratory. Customer-first, team-crediting, metric-specific. More expansive and narrative than the nomination — this is a story peers will read to learn what winning looks like. Authentic about challenges overcome. Forward-looking about growth opportunity.

## Pushback Commitment

This prompt has an explicit duty to push back when a story isn't a fit for the channel. The agent must:

1. **Never blindly post** just because the user asked. Evaluate first.
2. **Be honest about weak scores** — the user deserves to know why a post might not land well.
3. **Offer constructive enrichment paths** — "here's what would make it channel-worthy."
4. **Respect the user's final decision** — if they say "post anyway" after pushback, generate the best version possible.
5. **Protect the channel's quality bar** — the channel's value comes from its consistently high-quality, substantive posts. Diluting it with weak stories hurts everyone.
