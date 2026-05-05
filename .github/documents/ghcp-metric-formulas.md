# GHCP Metric Glossary & Formulas Reference

Canonical source: **Dev Services Hub — Metric Glossary** (OneNote, maintained by the MSXI dashboard team).
Report: **GHCP & Dev Services Hub** in MSX Insights → Acc. View tab.
Semantic Model: `a0239518-1109-45a3-a3eb-1872dc10ac15` (Business Precision workspace).

---

## Key Formulas

### GHCP Seat Opportunity (TAM)

```
Seat Oppty = MAX(GHE License Seats + GHE Metered Seats, ADO Seats)
```

- Calculated at the **account (TPID) level**
- Group totals = sum of per-account maxima (not max of aggregated totals)

### Remaining Seat Opportunity

```
Remaining Seat Opp = Seat Oppty − GHCP Seats − Qualified Pipeline Seats − Unqualified Pipeline Seats
```

- **Qualified Pipeline Seats (QP)**: milestone-level seats beyond earliest sales stage, approved statuses, POC/Pilot or Production, open fiscal periods. Converted via Seat Ratio ($16/seat).
- **Unqualified Pipeline Seats (NQP)**: at earliest sales stage (Sales Stage Number = 1).
- Simple `Seat Oppty − GHCP Seats` does **not** match — the model subtracts ALL pipeline.

### GHCP Attach Rate & ARPU

```
GHCP Attach = GHCP Seats / GHCP Seat Opportunity
ARPU        = GHCP ACR ($) / GHCP Seats
```

### Worked Example — TPID 719650 (Millennium Partners)

| Metric | Value |
|---|---|
| GHE License Seats | 3,753 |
| GHE Metered Seats | 0 |
| ADO Seats | 8 |
| **Seat Oppty** | **3,753** (MAX(3753, 8)) |
| GHCP Seats | 1,282 |
| Qualified Pipeline | 63 |
| Unqualified Pipeline | ~937 |
| **Remaining** | **1,471** (3,753 − 1,282 − 63 − ~937) |

---

## GHCP Seat Metrics

### Seats & ACR by Tier

| Metric | Definition |
|---|---|
| **GHCP Seats / ACR ($)** | Total paid GHCP units or ACR — includes Business, Enterprise, and Standalone |
| **GHCP Ent Seats / ACR ($)** | Copilot Enterprise tier |
| **GHCP Business Seats / ACR ($)** | Copilot Business tier |
| **GHCP Standalone Seats / ACR ($)** | Copilot Standalone offer |

> When Strategic Pillar = GitHub Copilot, ACR may differ from "GHCP ACR ($)" because the strategic pillar includes PRU revenue.

### Seat Adds & Targets

| Metric | Definition |
|---|---|
| **Seat Adds** | MoM net change in GHCP seats (e.g., Dec Adds = Dec seats − Nov seats) |
| **Seat Adds VTT** | Actual Seat Adds minus budgeted Seat Adds |
| **Gap to June Target** | June seat budget minus GHCP seats as of last closed month |
| **Seat Ratio** | ACR-to-seat conversion: **$16 per seat** |

> Seat Targets are authoritative only at Field Accountability Unit (area) and STB Mid-Segment (segment) levels. Lower-level values are derived approximations.

### Pipeline Seats

| Type | Definition |
|---|---|
| **Qualified Pipeline (QP)** | Beyond earliest stage, approved status, POC/Pilot or Production, open fiscal. Seat Ratio applied. |
| **Committed Pipeline (CP)** | Subset of QP marked committed |
| **Uncommitted Pipeline (UC)** | Subset of QP marked uncommitted |
| **Non-Qualified Pipeline (NQP)** | At earliest sales stage (Stage = 1) |

### Opportunity & Whitespace

| Metric | Definition |
|---|---|
| **GHCP Seat Opportunity** | `MAX(GHE License + GHE Metered, ADO Seats)` |
| **Remaining Seat Opp** | `Seat Oppty − GHCP Seats − QP Seats − NQP Seats` |
| **GHCP Attach** | `GHCP Seats / Seat Oppty` |
| **ARPU** | `GHCP ACR ($) / GHCP Seats` |
| **GHCP Monthly Whitespace** | `Seat Oppty − GHCP Seats (monthly)` |

---

## GitHub Enterprise (GHE) Seats

| Metric | Definition |
|---|---|
| **GHE License Seats** | Licensed, non-metered GHE seats (entitlement-based) |
| **GHE Metered Seats / ACR ($)** | Consumption-based metered GHE usage |
| **GHE Total Seats** | GHE License + GHE Metered |

## Azure DevOps (ADO) Seats

| Metric | Definition |
|---|---|
| **ADO Seats** | Total ADO seats (Repos/Boards Basic + Test Plans) |
| **ADO Seats Basic** | Seats associated with Azure Repos and Boards (Basic) |
| **ADO Seats Test** | Seats associated with Azure Test Plans |

## GitHub Advanced Security (GHAS)

| Metric | Definition |
|---|---|
| **GHAS Seats / ACR ($) (metered)** | Metered GHAS usage |
| **GHAzDO Seats (metered)** | GHAS via Azure DevOps |
| **GHAS Seats (license)** | Paid GHAS license seats |
| **GHAS Total** | GHAS metered + GHAS license seats |

## Other Seat Metrics

| Metric | Definition |
|---|---|
| **Visual Studio Seats** | Licensed Visual Studio entitlements purchased by the customer. License-based, not usage or ACR-based. |
| **Number of Developers** | Developer count from MSX Account section ("Number of Professional Developers"). Blank if not entered in MSX. |
| **Total GH** | Total GitHub-related ACR for an account/period. Sum of GHCP ACR + PRU ($) + GHE Metered ACR + GHAS Metered ACR. |

---

## Premium Request Units (PRU)

> PRU ($) and PRU Units reflect **billable usage only** — consumption within monthly allowance is excluded.

| Metric | Definition |
|---|---|
| **PRU ($)** | ACR from Premium Request workloads |
| **PRU Units (#)** | Number of Premium Request units consumed |

---

## GHCP Growth Framework (Cohort Classification)

### Decision Tree

```
function classifyCohort(account):
    hasDevPlatform = GHE_Total_Seats > 0 OR ADO_Seats > 0

    if NOT hasDevPlatform AND GHCP_Seats == 0:
        return Cohort 0  # No platform

    if GHCP_Seats < 50:
        return Cohort 1  # Limited GHCP

    if GHCP_Attach < 50%:
        return Cohort 2  # Low attach

    if ARPU < $30:
        return Cohort 3  # Low ARPU

    return Cohort 4      # High value
```

### Cohort Definitions

| Cohort | Name | Criteria | Action | Recommended Next Steps |
|---|---|---|---|---|
| **0** | No platform | No GHE, no ADO, no GHCP | Land Copilot | Identify developer population, establish GHE/ADO baseline, pitch POC |
| **1** | Limited GHCP | GHE/ADO present, <50 GHCP seats | Land Copilot | Drive initial POC/pilot, team-level adoption, target 50+ seats |
| **2** | Low attach | >50 GHCP seats, <50% attach | Expand Copilot | Expand across teams, increase attach rate, target 50%+ coverage |
| **3** | Low ARPU | >50 GHCP, >50% attach, ARPU <$30 | Upsell to Enterprise | Upsell Business→Enterprise, drive PRU/custom models, target ARPU >$30 |
| **4** | High value | >50 GHCP, >50% attach, ARPU >$30 | Nurture & Cross-sell | GHAS, AI Foundry, AKS, Fabric, PGSQL, CSPM; protect base |

### Thresholds

| Threshold | Value | Purpose |
|---|---|---|
| Penetration (Enterprise) | 50 seats | Cohort 1→2 boundary |
| Penetration (SME&C) | 20 seats | SME&C penetration marker |
| Attach Rate Benchmark | 50% | Cohort 2→3 boundary |
| ARPU Threshold | $30/seat | Cohort 3→4 boundary; Enterprise vs Business monetization |
| Seat Ratio | $16/seat | Pipeline ACR-to-seat conversion |

### Report Action Column Mapping

The `Action` column in the PBI model maps to cohorts:
- `1. Land Copilot` = Cohort 0 or 1
- `2. Drive GHCP Expansion` = Cohort 2
- `3. Upsell to Enterprise` = Cohort 3
- `4. Nurture & Cross-sell` = Cohort 4

---

## Penetration Metrics

| Metric | Definition |
|---|---|
| **# GHCP Acc (LCM)** | Accounts with any GHCP ACR in last closed month |
| **Acc. Penetrated** | >50 GHCP seats (Enterprise) or >20 (SME&C) |
| **% Acc. Penetrated** | Penetrated accounts / total accounts |
| **# Acc with QP** | Accounts with ≥1 qualified pipeline milestone |
| **# Acc with CP** | Accounts with ≥1 committed pipeline milestone |
| **% Unified Support** | Percentage of total accounts that have Unified Support |

### Pipeline Segmentation (Mutually Exclusive)

| Category | Definition |
|---|---|
| **Acc QP > Threshold** | QP > 50 seats (Enterprise) or > 20 (SME&C) |
| **Acc QP < Threshold** | QP > 0 but ≤ threshold |
| **Acc NQP** | No QP, has NQP |
| **Acc No Pipe** | No pipeline at all |

---

## Seat Movement (NPSA Change Analysis)

Classifies accounts by MoM seat change:

| Category | Rule |
|---|---|
| **New** | Previous = 0, Current > 0 |
| **Increase** | Both > 0, MoM gain exceeds threshold |
| **Flat** | Both > 0, MoM change within threshold |
| **Decrease** | Both > 0, MoM loss exceeds threshold |
| **Loss** | Previous > 0, Current = 0 |
| **Not Customers** | Both = 0 |

Aggregate per category: **Count (#)**, **ACR ($)**, **Seats**.

### Penetration Change Analysis

| Category | Previous Month | Current Month |
|---|---|---|
| **Sustained Penetration** | Penetrated | Penetrated |
| **Newly Penetrated** | Not penetrated | Penetrated |
| **Lost Penetration** | Penetrated | Not penetrated |
| **Not Penetrated** | Not penetrated | Not penetrated |

---

## Engagement Metrics (from OctoDash)

| Metric | Definition |
|---|---|
| **Active User** | Using Code Completion, Chat, CLI, PR Summary, Knowledge Base, or API. Auth alone ≠ active. |
| **Engaged User** | Active + Code Completion suggestion must be **accepted** |
| **% Active User** | Active / Copilot licensed users |
| **% Engaged User** | Engaged / Copilot licensed users |

---

## GH + Azure Cross-Sell Metrics

| Metric | Definition |
|---|---|
| **MDC ACR ($)** | Total ACR from Microsoft Defender for Cloud across all service levels |
| **SRE Agent ACR ($)** | Azure AI Agent usage |
| **AI Foundry ACR ($)** | Azure AI workloads (MaaS, OpenAI, AI services). Min: $1K SME&C, $5K Enterprise |
| **AKS ACR ($)** | Azure Kubernetes Service |
| **Fabric ACR ($)** | Microsoft Fabric F-SKU (OneLake, Data Warehousing, FabricDB) |
| **PGSQL ACR ($)** | Azure Database for PostgreSQL |
| **CSPM ACR ($)** | Microsoft Defender CSPM |

---

## Pipeline & Outlook

| Metric | Formula |
|---|---|
| **Baseline** | Last closed month ACR → daily run rate → projected forward |
| **PBO** | ACR actuals + Baseline + Committed Pipeline excl. Blocked |
| **PBO VTB** | PBO − ACR Budget (variance to budget) |
| **PBO VTF** | PBO − ACR Forecast (variance to forecast) |
| **NNR (Budget)** | ACR Budget − (ACR Actual + Baseline) |
| **CP to NNR** | Committed Pipeline excl. Blocked / \|NNR\| |
| **ACR Outlook** | Actuals + Baseline + weighted pipeline (committed × w₁ + uncommitted × w₂ + NQP × w₃) |
| **Seat Outlook** | Cumulative GHCP seats + committed/uncommitted/NQP seat pipeline, each weighted by configurable conversion parameters. Enables what-if analysis for seat growth projections. |

---

## GHCP New Logo Growth Incentive

**Program**: [GitHub Copilot New Logo Growth Incentive](https://msxinsights.microsoft.com/User/report/1e2a0d7a-1c19-4a7a-b8db-15b39197ac22?reportTab=98f312cee23547be9ec6)

### Eligibility

GHC New Customer Adds = customers reaching meaningful GHCP adoption:
- **Enterprise**: >50 seats or >$800/mo ACR
- **SME&C-C**: >20 seats or >$320/mo ACR

Eligibility is determined using **November closed month ACR**. TPIDs below threshold at that point are eligible.

> All calculations use ACR (not seats). ACR values **exclude PRU revenue**.

### Key Metrics

| Metric | Definition |
|---|---|
| **Baseline** | November ACR for eligible customers (below threshold at Nov close) |
| **Threshold** | Baseline (Nov ACR) + $800 (Enterprise) or + $320 (SME&C-C) |
| **Needed ACR** | Threshold − LCM ACR (uplift required) |
| **Enough Pipe** | Whether pipeline exceeds Needed ACR or Threshold has been surpassed in LCM |

### Win Criteria

A win is recorded when an account **exceeds the applicable threshold for 3 consecutive months** — sustained adoption, not a one-time spike.

### Example (Enterprise)

| # | Baseline (Nov) | Dec | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Eligible? | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | $0 | $800 | $800 | $800 | $800 | $800 | $800 | $800 | $800 | $800 | Yes | Met Threshold and 3 Consecutive Months |
| 2 | $0 | $800 | $800 | $800 | $0 | $0 | $0 | $0 | $0 | $0 | Yes | Met Threshold and 3 Consecutive Months |
| 3 | $0 | $0 | $800 | $700 | $700 | $700 | $700 | $800 | $800 | $700 | No | 3 Consecutive Months not Achieved |
| 4 | $0 | $0 | $800 | $700 | $700 | $800 | $800 | $800 | $0 | $800 | Yes | Met Threshold and 3 Consecutive Months |
| 5 | $1,000 | $1,800 | $1,800 | $1,800 | $1,800 | $1,800 | $1,800 | $1,800 | $1,800 | $1,800 | No | TPID ineligible — already a Customer Add |
| 6 | $500 | $0 | $0 | $1,300 | $1,300 | $1,300 | $1,300 | $1,300 | $1,300 | $1,300 | Yes | Met Threshold and 3 Consecutive Months |
| 7 | $500 | $0 | $0 | $0 | $900 | $900 | $900 | $900 | $900 | $900 | No | Did not meet $800 incremental (Baseline was $500) |
| 8 | $100 | $0 | $0 | $0 | $0 | $0 | $900 | $900 | $900 | $900 | Yes | Met Threshold and 3 Consecutive Months |
| 9 | $100 | $0 | $0 | $0 | $0 | $0 | $900 | $900 | $800 | $900 | No | Did not meet 3 Consecutive Months |

> **Questions?** Reach out to devdashboardsupport@microsoft.com

---

## Common Pitfalls

1. **Remaining ≠ Seat Oppty − GHCP Seats** — model also subtracts qualified AND unqualified pipeline seats.
2. **Seat Oppty ≠ GHE Total** for ADO-heavy accounts — Seat Oppty = ADO Seats when ADO > GHE.
3. **Group Seat Oppty** = SUM of per-account MAX values, not MAX of aggregated sums.
4. **Seat Targets** authoritative only at FAU and STB Mid-Segment levels.
5. **New Logo ACR excludes PRU** — remove PRU when comparing to $800/$320 thresholds.
6. **Strategic Pillar ACR ≠ GHCP ACR** — pillar includes PRU + GHE Metered + GHAS Metered.

---

*Source: Dev Services Hub — Metric Glossary (OneNote, dashboard owner: anays@microsoft.com)*
*Validated: 2026-02-27 against TPID 719650 (Millennium Partners).*
