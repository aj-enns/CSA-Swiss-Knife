---
name: pbi-portfolio-navigator
description: 'Power BI report router: detects which PBI report a user is asking about and routes to the correct pre-configured prompt, or guides discovery when the report is unclear. Matches natural-language phrases (e.g., "azure all in one", "customer incidents", "GHCP new logo", "service deep dive", "SE productivity") to existing pbi-*.prompt.md files. Falls back to pbi-prompt-builder when no match exists. Triggers: PBI report, Power BI report, azure all in one, all-in-one, AIO, customer incidents, outages, CMI, GHCP, new logo incentive, service deep dive, SL5, ACR by service, SE productivity, SE scorecard, seller productivity, which PBI report, what reports, show me reports, consumption report, portfolio report, pipeline report, run PBI prompt, open PBI prompt.'
argument-hint: 'Describe what you want to analyze or name the Power BI report'
---

## Purpose

Routes user queries about Power BI reports to the correct pre-configured `pbi-*.prompt.md` file, eliminating the need to remember exact prompt names. When no match is found, presents the catalog and optionally chains to `pbi-prompt-builder` to create a new prompt.

## When to Use

- User mentions a PBI report by name or nickname (e.g., "azure all in one", "CMI", "GHCP")
- User asks a data question answerable by a known PBI report
- User asks "what reports do we have?" or "which PBI prompts are available?"
- User wants to run a PBI analysis but isn't sure which report to use

## Report Catalog

> **This is the single source of truth for routing.** When new `pbi-*.prompt.md` files are added to `.github/prompts/`, add a row here.

| ID | Aliases | Prompt File | Semantic Model | Answers |
|----|---------|-------------|----------------|---------|
| `aio` | azure all in one, all-in-one, AIO, portfolio review, gap to target, azure consumption, enterprise consumption | `pbi-azure-all-in-one-review.prompt.md` | MSA_AzureConsumption_Enterprise | Gap to target, pipeline conversion ranking, recommended actions |
| `sl5` | service deep dive, SL5, ACR by service, service-level, consumption by service, which services growing | `pbi-azure-service-deep-dive-sl5-aio.prompt.md` | MSA_AzureConsumption_Enterprise + WWBI_ACRSL5 | Service growth/decline trends, attainment by pillar, service-level gap actions |
| `cmi` | customer incidents, outages, CMI, CritSit, escalations, incident review, reactive support, AA&MSXI | `pbi-customer-incident-review.prompt.md` | AA&MSXI (CMI) | Active incidents, escalations, outage trends, reactive support health |
| `cxo` | CXObserve, CXP, support experience, customer health, customer support review, support overview, TPID lookup, account support, customer experience | `pbi-cxobserve-account-review.prompt.md` | AA&MSXI (CMI) | Single-customer support experience: health scorecard, active incidents, escalations, satisfaction, trends — CXObserve portal equivalent |
| `ghcp` | GHCP, new logo, new logo incentive, growth incentive, GHCP new logo | `pbi-ghcp-new-logo-incentive.prompt.md` | MSXI (DIM_GHCP_Initiative) | Account eligibility, qualifying status, realized ACR against thresholds |
| `sep` | SE productivity, seller productivity, my SE metrics, SE scorecard, SE review, SE performance, how am I doing, individual seller review, HoK activity count, milestones engaged, committed pipe engaged | `pbi-se-productivity-review.prompt.md` | Azure Individual Seller Productivity FY26 | SE scorecard, HoK activities, customer coverage, milestone detail, engagement velocity |

## Routing Flow

### Step 1 — Match Intent

Extract the user's intent and compare against the **Aliases** column above. Matching rules:

1. **Exact alias match** → route immediately.
2. **Question-based match** — map the user's data question to the **Answers** column:
   - "What is my gap?" → `aio`
   - "Show me incidents for Contoso" → `cmi`
   - "CXObserve for TPID 12345" or "support experience for Contoso" → `cxo`
   - "Which services are growing?" → `sl5`
   - "Am I qualifying for the growth incentive?" → `ghcp`
   - "How am I doing?" or "SE scorecard" or "my productivity" → `sep`
3. **Ambiguous or partial match** → present the top 1–2 candidates with a one-line description and ask the user to confirm.
4. **No match** → go to Step 2.

### Step 2 — No Match: Present Catalog

If no alias or question matches, present the full catalog:

> I have these pre-configured Power BI reports:
>
> | # | Report | What It Answers |
> |---|--------|-----------------|
> | 1 | **Azure All-in-One** — portfolio gap, pipeline ranking, actions | `aio` |
> | 2 | **Service Deep Dive (SL5)** — service-level consumption trends | `sl5` |
> | 3 | **Customer Incidents (CMI)** — outages, CritSits, reactive support | `cmi` |
> | 4 | **CXObserve Account Review** — single-customer support experience (health, incidents, escalations, satisfaction, trends) | `cxo` |
> | 5 | **GHCP New Logo Incentive** — account eligibility & qualifying status | `ghcp` |
> | 6 | **SE Productivity** — SE scorecard, HoK activities, customer coverage, milestones (SE role) | `sep` |
> | 7 | **None of these** — help me build a new one |
>
> Which one are you looking for? (pick a number or describe your question)

- If user picks 1–6 → route to the prompt.
- If user picks 7 or describes something not in the catalog → chain to `pbi-prompt-builder` skill.

### Step 3 — Execute the Prompt

Once matched, load and execute the full prompt file:

1. Read the matched `pbi-*.prompt.md` from `.github/prompts/`.
2. Follow the prompt's workflow exactly — it handles auth pre-check, scoping, DAX execution, and output formatting.
3. If the prompt requires account scoping and the user hasn't provided it, ask before proceeding.

## Edge Cases

| Situation | Action |
|---|---|
| User asks about a report not in the catalog | Show catalog, then offer to chain to `pbi-prompt-builder` |
| User asks about multiple reports at once | Route to each sequentially; warn about context window cost for multi-report runs |
| User says "run the PBI prompt" without specifying which | Present the catalog (Step 2) |
| Query could match two reports (e.g., "Azure consumption" → `aio` or `sl5`) | Present both candidates with their key differentiator and ask user to pick |
| User wants to customize an existing prompt | Point them to the Configuration table in the matched prompt file |
| Power BI auth fails during execution | Follow the auth recovery pattern from the prompt file — do not retry silently |

## Chaining

- **Downstream**: Matched prompt file (executes via `@pbi-analyst` subagent for heavy DAX)
- **Fallback**: `pbi-prompt-builder` skill (when no catalog match)
- **Context bridge**: `pbi-context-bridge.instructions.md` (when PBI output feeds CRM/vault/WorkIQ)
