---
name: azure-pricing-model
description: 'Azure pricing model assembler: retrieves Azure service pricing data, structures cost components into a logical pricing model, and outputs an Excel-ready breakdown covering compute, storage, networking, licensing, and support tiers. Captures wider context — consumption patterns, reserved vs pay-as-you-go tradeoffs, regional variance, and Unified/EDE coverage alignment. Chains with value-realization-pack and proof-plan-orchestration for cost-justified delivery planning. Triggers: Azure pricing, cost model, pricing spreadsheet, Azure cost breakdown, service pricing, pricing document, cost estimate, Azure estimate, TCO, total cost of ownership, pricing export, cost comparison, Azure spend, consumption cost, reserved instance pricing, Azure pricing Excel.'
argument-hint: 'Provide a list of Azure services, a solution architecture description, or an opportunityId to derive services from the proof plan'
---

## Purpose

Retrieves and structures Azure service pricing into a normalized, Excel-exportable cost model. Captures compute, storage, networking, licensing, support, and discount dimensions so account teams can present transparent pricing to customers and align cost expectations with opportunity milestones.

## When to Use

- Customer asks "how much will this cost?" for an Azure-based solution
- Specialist or SE needs a cost model to attach to a proof plan or milestone
- Pre-governance pricing review before committing delivery milestones
- Comparing reserved instance vs pay-as-you-go for a customer proposal
- Building a TCO comparison (on-premises vs Azure migration)
- Exporting structured pricing data to Excel for customer-facing delivery

## Freedom Level

**Medium** — Service identification and pricing structure are rule-based; cost optimization recommendations and contextual notes require judgment.

## Runtime Contract

| Tool | Server | Purpose | Required |
|---|---|---|---|
| `pricing_get` | `pricing` (Azure MCP) | Structured retail pricing retrieval — PAYG, RI, Spot, Dev/Test, Savings Plan | **Primary** — preferred when available |
| `fetch_webpage` | built-in | Web fallback for Azure pricing pages | **Fallback** — when Pricing MCP unavailable |
| `crm_get_record` | `msx` | Opportunity details, solution play, estimated ACR | Optional — for opportunity-grounded sizing |
| `get_milestones` | `msx` | Milestone/task data for SKU and quantity extraction | Optional — for opportunity-grounded sizing |
| `get_customer_context` | `oil` | Vault context — prior budgets, architecture decisions, spend baselines | Optional — enriches estimates |

## Medium Availability Probe

Before executing the flow, probe which pricing mediums are reachable:

| Medium | Probe | If unavailable |
|---|---|---|
| **Azure Pricing MCP** | `pricing:pricing_get` with `{ service: "Virtual Machines", sku: "Standard_D2s_v5", region: "eastus" }` — confirm structured pricing returns | Fall back to `fetch_webpage` for pricing pages; flag `pricing_source: web_scrape` |
| **CRM** | `msx:crm_auth_status` | Skip opportunity/milestone sizing; require explicit service list |
| **Vault** | `oil:get_vault_context()` | Skip vault-prefetch; operate CRM-only or explicit list |

Cache probe results. When the Azure Pricing MCP is available, it is the **primary and preferred** pricing source — it returns structured, machine-readable retail pricing with PAYG, RI, Spot, Dev/Test, and Savings Plan data in a single call per SKU.

## Flow

### Phase 1 — Scope the Services

Determine which Azure services need pricing. Use one of these entry points:

| Entry point | How | When |
|---|---|---|
| **Explicit list** | User provides service names directly | User says "price out AKS, Cosmos DB, and Azure OpenAI" |
| **Architecture description** | Parse solution description → extract service names | User describes a solution or shares an architecture doc |
| **From opportunity** | `msx:crm_get_record` on opportunityId → solution play + `msx:get_milestones` → extract service/SKU signals from milestone comments and monthly usage fields | User provides an opportunityId |
| **From proof plan** | Chain from `proof-plan-orchestration` output → extract environment/service requirements | Post-proof cost modeling |

For each identified service, normalize to the canonical Azure service name (e.g., "Kubernetes" → "Azure Kubernetes Service", "SQL" → "Azure SQL Database").

#### Opportunity-Grounded Sizing (when opportunityId provided)

When scoping from an opportunity, extract sizing signals to produce grounded estimates rather than generic tier assumptions:

1. `msx:crm_get_record` on opportunityId — read `estimatedvalue`, solution play, and description.
2. `msx:get_milestones({ opportunityId, includeTasks: true })` — for each milestone:
   - Parse `msp_monthlyuse` for consumption/usage targets (maps to quantity estimates).
   - Read milestone comments for SKU mentions, environment specs, or sizing notes.
   - Read task descriptions for infrastructure requirements (e.g., "provision 3-node AKS cluster", "set up D4s_v5 VMs").
3. `oil:get_customer_context({ customer })` (if vault available) — pull prior architecture decisions, approved SKUs, and spend baselines from vault notes.
4. Build a **service manifest** — each entry has: service name, candidate SKU (if found), estimated quantity/scale, and source (milestone | task | vault | assumption).

This manifest feeds Phase 2 with specific SKUs for grounded pricing rather than generic tier lookups.

### Phase 2 — Gather Pricing Data

For each service in the manifest, retrieve pricing using a tiered strategy:

#### Strategy A: Azure Pricing MCP (preferred — when available)

Call `pricing:pricing_get` per service/SKU. This returns structured retail pricing including PAYG, Reservation, Dev/Test, Spot, and Savings Plan rates.

**Per-service call pattern:**
```
pricing:pricing_get({
  service: "{service name}",       // e.g., "Virtual Machines", "Azure Cosmos DB"
  sku: "{ARM SKU name}",           // e.g., "Standard_D4s_v5" — from manifest or user
  region: "{target region}",       // e.g., "eastus"
  include-savings-plan: true        // includes nested savingsPlan array
})
```

**Response processing — extract and classify each price record:**

| Field | Maps to |
|---|---|
| `retailPrice` where `priceType: "Consumption"` and no Spot/Low Priority in `skuName` | PAYG unit price |
| `retailPrice` where `priceType: "Reservation"`, `reservationTerm: "1 Year"` | RI 1-year total (divide by 8760 for hourly, or by 12 for monthly) |
| `retailPrice` where `priceType: "Reservation"`, `reservationTerm: "3 Years"` | RI 3-year total (divide by 26280 for hourly, or by 36 for monthly) |
| `retailPrice` where `priceType: "DevTestConsumption"` | Dev/Test unit price |
| `skuName` containing "Spot" | Spot pricing |
| `skuName` containing "Low Priority" | Low Priority pricing |
| nested `savingsPlan` array (when `include-savings-plan: true`) | 1-year and 3-year Savings Plan rates |
| `productName` containing "Windows" vs not | OS licensing dimension |

**Batch strategy**: For solutions with multiple services, call `pricing:pricing_get` once per service+SKU combination. These calls are independent and can be parallelized.

**Monthly cost calculation**: `retailPrice (per hour) × 730 hours` for compute. For storage/transactions, use the `unitOfMeasure` field to determine the multiplication factor.

#### Strategy B: Web Fallback (when Pricing MCP unavailable)

Use `fetch_webpage` against Azure pricing pages:
- Base URL pattern: `https://azure.microsoft.com/en-us/pricing/details/{service-slug}/`
- Parse the page for pricing tiers, SKU options, and metering dimensions.
- Flag `pricing_source: web_scrape` — data is less structured and may be incomplete.

#### Supplementary Context (always, when available)

1. **Vault context** — `oil:get_customer_context({ customer })`:
   - Prior pricing discussions or approved budgets
   - Existing Azure spend baselines from customer notes
   - Discount/EA agreement context

2. **CRM context** (if opportunityId provided and not already gathered in Phase 1):
   - `msx:crm_get_record` — opportunity value, solution play, estimated ACR
   - Cross-reference `estimatedvalue` against the pricing total as a sanity check

3. **Azure CLI** (if authenticated and user has existing deployments):
   - `az consumption usage list` for actual consumption baselines
   - Use only to validate estimates against real usage — not as the primary pricing source

### Phase 3 — Structure the Pricing Model

Organize pricing data into the normalized schema below. Every Azure service decomposes into these cost dimensions:

#### Cost Dimension Taxonomy

| Dimension | Description | Examples |
|---|---|---|
| **Compute** | Processing capacity — vCPUs, memory, GPU hours | VM SKUs, AKS node pools, App Service plans |
| **Storage** | Data at rest — volume, tier, redundancy | Blob (Hot/Cool/Archive), Managed Disks, Cosmos DB RU storage |
| **Networking** | Data in motion — egress, peering, load balancing | Bandwidth egress, VNet peering, Application Gateway |
| **Transactions** | Per-operation charges — API calls, messages, executions | Cosmos DB RUs, Function executions, Event Grid events |
| **Licensing** | Software/IP costs bundled or separate | SQL Server license (AHUB vs included), Windows Server |
| **Support** | Support plan alignment | Standard, Professional Direct, Unified (EDE-linked) |
| **Discounts** | Pricing reductions | Reserved Instances (1yr/3yr), Savings Plans, EA/CSP rates, Dev/Test pricing |

#### Per-Service Pricing Record

For each service, produce one record:

```
Service: {canonical name}
Region: {target region}
SKU/Tier: {specific SKU or tier}
Dimensions:
  - Compute: {unit} × {unit price} × {estimated quantity} = {monthly cost}
  - Storage: {unit} × {unit price} × {estimated quantity} = {monthly cost}
  - Networking: {unit} × {unit price} × {estimated quantity} = {monthly cost}
  - Transactions: {unit} × {unit price} × {estimated quantity} = {monthly cost}
  - Licensing: {model} = {monthly cost}
Subtotal (pay-as-you-go): {sum}
Subtotal (reserved 1yr): {sum with RI discount %}
Subtotal (reserved 3yr): {sum with RI discount %}
Notes: {scaling triggers, tier thresholds, free-tier limits}
```

### Phase 4 — Contextualize

Add wider context that affects pricing decisions:

1. **Consumption pattern analysis** — Classify each service as:
   - **Steady-state** (predictable load → RI candidate)
   - **Burst** (spiky demand → PAYG or autoscale)
   - **Growth** (ramp-up trajectory → Savings Plan candidate)

2. **Regional variance** — Flag if the target region has pricing differences vs. primary regions (East US, West Europe). Note region pairs for DR cost modeling.

3. **Free tier / included allowances** — Document monthly free amounts per service (e.g., Cosmos DB 1000 RU/s free tier, 250 GB Azure SQL serverless auto-pause).

4. **Scaling triggers** — Document at what thresholds costs step up (e.g., "above 10 DTUs, next tier at 50 DTUs" or "beyond 5 TB, per-GB pricing changes").

5. **Unified/EDE alignment** — If vault context shows Unified Support coverage or EDE assignment, note which services fall under support scope and which would need additional coverage.

6. **Optimization recommendations** — For each service, one sentence on the best cost-optimization lever (RI, right-sizing, tier selection, autoscale config).

### Phase 5 — Generate Excel-Ready Output

Produce the data in a structure that maps directly to the `processing-spreadsheets` skill:

#### Sheet 1: Cost Summary

| Column | Content |
|---|---|
| A: Service | Canonical Azure service name |
| B: SKU/Tier | Selected pricing tier |
| C: Region | Deployment region |
| D: Monthly PAYG | Pay-as-you-go monthly estimate |
| E: Monthly RI 1yr | 1-year reserved estimate |
| F: Monthly RI 3yr | 3-year reserved estimate |
| G: Annual PAYG | D × 12 |
| H: Annual RI 1yr | E × 12 |
| I: Annual RI 3yr | F × 12 |
| J: Optimization Note | One-line recommendation |

**Bottom row**: SUM formulas for columns D–I.

#### Sheet 2: Detailed Breakdown

| Column | Content |
|---|---|
| A: Service | Canonical name |
| B: Dimension | Compute / Storage / Networking / Transactions / Licensing |
| C: Unit | Pricing unit (vCPU/hr, GB/mo, 10K transactions) |
| D: Unit Price | Per-unit price |
| E: Est. Quantity | Estimated monthly usage |
| F: Monthly Cost | D × E |
| G: Notes | Tier thresholds, free allowances, scaling triggers |

#### Sheet 3: Assumptions & Context

| Column | Content |
|---|---|
| A: Parameter | Assumption label |
| B: Value | Assumed value |
| C: Source | Where the assumption comes from |
| D: Sensitivity | Low / Medium / High — impact if assumption changes |

Standard assumptions to include:
- Target region
- Utilization rate (for compute right-sizing)
- Data growth rate (for storage projections)
- Egress volume estimate
- Support tier
- License model (AHUB eligibility)
- Contract type (EA / CSP / PAYG)
- Currency

#### Sheet 4: Comparison (optional, for migration/TCO scenarios)

| Column | Content |
|---|---|
| A: Component | Workload component |
| B: Current (On-Prem) | Current annual cost |
| C: Azure PAYG | Azure annual estimate |
| D: Azure RI 3yr | Azure reserved estimate |
| E: Savings | B − D |
| F: Savings % | E / B |

### Phase 6 — Produce the Spreadsheet

Invoke the `processing-spreadsheets` skill to generate the actual `.xlsx` file:

1. Write a Node.js script using `exceljs` following the sheet structure above.
2. Apply formatting:
   - Header row: bold, #003366 background, white text, frozen row.
   - Currency columns: `$#,##0.00` number format.
   - Percentage columns: `0.0%` format.
   - Conditional formatting: highlight cells where RI savings > 30% in green.
   - Auto-filter on all header rows.
3. Save to the vault `MCAPS-IQ-Artifacts/` folder when OIL is available, otherwise `.copilot/docs/` (see `shared-patterns` skill § Artifact Output Directory). Honor the user's specified path if provided.

## Decision Logic

### Pricing Tier Selection Heuristic

When the user hasn't specified a tier, select based on context:

| Signal | Default tier |
|---|---|
| POC / proof-of-concept | Dev/Test or lowest production tier |
| Production workload, <100 users | Standard / General Purpose |
| Production workload, >100 users | Premium / Business Critical |
| ML / AI workload | GPU-optimized SKUs |
| No context | General Purpose, mid-range — flag as assumption |

### Reserved Instance Recommendation

| Consumption pattern | Recommendation |
|---|---|
| Steady-state, >8hr/day utilization | 1-year RI minimum, evaluate 3-year |
| Burst, <4hr/day | PAYG — no reservation |
| Growth ramp | Savings Plan (flexible across SKUs) |
| Unknown | Show both; flag for customer discussion |

## Output Schema

```markdown
# Azure Pricing Model — {solution/customer name}

**Date**: {date}
**Region**: {target region}
**Currency**: USD (or as specified)
**Contract**: {EA / CSP / PAYG}

## Service Summary

| Service | SKU | Monthly PAYG | Monthly RI 1yr | Monthly RI 3yr |
|---------|-----|-------------|----------------|----------------|
| {service} | {sku} | ${amount} | ${amount} | ${amount} |
| **Total** | | **${sum}** | **${sum}** | **${sum}** |

## Key Assumptions
- {assumption}: {value} (sensitivity: {low/med/high})

## Optimization Recommendations
1. {service}: {one-line recommendation}

## Risks & Caveats
- Pricing retrieved {date} — verify before customer-facing use
- Estimates exclude tax, EA-specific discounts, and negotiated rates
- Egress costs are estimates — actual depends on architecture patterns

## Spreadsheet
Generated: `{filename}.xlsx` with sheets: Cost Summary, Detailed Breakdown, Assumptions, {Comparison if TCO}.
```

- `services_priced`: count of services in the model
- `total_monthly_payg`: headline monthly figure
- `total_annual_ri_3yr`: best-case annual figure
- `optimization_levers`: list of per-service recommendations
- `assumptions_flagged`: count of high-sensitivity assumptions
- `next_action`: "Review assumptions with the customer. Chain with `proof-plan-orchestration` to attach cost model to proof milestones, or `stage-5-review` to track actual vs estimated spend post-deployment."
- `connect_hook_hint`: Impact Area: Customer Value — "Structured Azure pricing model for {solution} covering {n} services — {savings_pct}% potential savings via reserved commitments identified"

## Chaining

| Chain | Direction | When |
|---|---|---|
| `proof-plan-orchestration` → **this skill** | Inbound | Proof plan scoped → cost model needed for budget approval |
| **this skill** → `processing-spreadsheets` | Outbound | Always — produces the .xlsx artifact |
| **this skill** → `stage-5-review` | Outbound | Post-deployment — compare estimated vs actual spend |
| `account-landscape-awareness` → **this skill** | Inbound | Account review surfaces cost optimization opportunities |
| `customer-outcome-scoping` → **this skill** | Inbound | KPI definition includes cost targets → need pricing baseline |

## Gotchas

- **Pricing MCP vs web scrape**: When the Azure Pricing MCP is available, always prefer it — the data is structured, current, and includes all price types in one call. Web scrape is a fallback only.
- **SKU name precision**: `pricing:pricing_get` requires exact ARM SKU names (e.g., `Standard_D4s_v5`, not `D4s v5`). Normalize before calling.
- **Multi-record responses**: A single `pricing_get` call may return multiple records for the same SKU — different OS (Windows/Linux), different price types (Consumption/Reservation/DevTest), Spot, and Low Priority variants. Filter and classify using `productName`, `priceType`, `skuName`, and `reservationTerm` fields.
- **RI pricing units**: Reservation prices are returned as total cost for the term (1-year or 3-year), not per-hour. Divide by months in term for monthly effective cost.
- **Savings Plan availability**: The `include-savings-plan` flag uses a preview API version. Savings Plan data is primarily available for Linux VMs — if the array is empty, note "Savings Plan not available for this SKU."
- Always include a "last retrieved" date on pricing data — Azure pricing updates monthly.
- Do not present pricing as guaranteed — always caveat with contract type and negotiation disclaimer.
- Free tier limits vary by subscription type (Free, PAYG, EA) — confirm subscription context.
- Some services have no RI option — skip RI columns for those (e.g., Azure Functions consumption plan).
- When opportunity-grounded sizing is used, flag which estimates came from milestone/task evidence vs assumptions — this transparency builds customer trust.
