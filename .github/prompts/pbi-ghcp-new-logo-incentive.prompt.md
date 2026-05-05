---
description: "Evaluate portfolio accounts against GHCP New Logo Growth Incentive (FY26). Reads the DIM_GHCP_Initiative table from the MSXI Power BI model to identify eligible, qualifying, and won accounts — based on realized (closed-month) ACR only."
---

# GHCP New Logo Growth Incentive — Account Eligibility Review

Review my tracked accounts and tell me which ones are eligible (or qualifying) for the GHCP New Logo Growth Incentive. Surface accounts with actual realized ACR growth so I can decide where to invest time.

## Why This Exists

> The #1 field complaint about this incentive is that it takes too much manual investigation to figure out which accounts are actually qualifying. Sellers aren't investing time because the effort-to-ACR ratio feels too high.
>
> This prompt removes that friction: it pulls the pre-computed eligibility data from the GHCP New Logo PBI report, filters to your tracked accounts, and tells you in seconds which ones have real growth — so you can focus effort only where ACR is actually landing.

## Reference

- **PBI Report**: [GHCP New Logo Growth Incentive](https://msxinsights.microsoft.com/User/report/1e2a0d7a-1c19-4a7a-b8db-15b39197ac22?reportTab=98f312cee23547be9ec6)
- **Program rules**: Read `.github/documents/GHCP_NewLogoGrowthIncentive.md` if available; otherwise use Key Rules below.

## Key Rules Summary

- **Program window**: December 1, 2025 – June 30, 2026
- **November Baseline**: Each account's November 2025 GHCP ACR is stored in `baseline_acr_nov`
- **Threshold**: The required incremental ACR growth is **per-account**, defined by the `Threshold` column in `DIM_GHCP_Initiative` (segment-driven: $800 Enterprise, $320 SME&C-C, but always read the column — don't hardcode)
- **Qualifying**: Account must show **3 consecutive closed months** where realized ACR ≥ `threshold_acr` (= baseline + threshold)
- **Realized ACR only**: Only months where `isClosed = 1` count. Future/pipeline months are excluded.
- **$0 baseline with no current ACR = not eligible** — an account is not a potential win until ACR has actually landed
- **Max 3 nominations per TPID**; TPID can only win once
- **Q4 treatment**: Late qualifiers (Apr–Jun) must hold ACR through Jul–Aug

## Configuration

> **Managers**: Fork this file and update these values to point at your semantic model and accounts.

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `a0239518-1109-45a3-a3eb-1872dc10ac15` | MSXI dataset — change if using a different workspace/model |
| **PBI Report** | `1e2a0d7a-1c19-4a7a-b8db-15b39197ac22` | MSX Insights report ID (tab: `98f312cee23547be9ec6`) |
| **Account Roster** | `.docs/AccountReference.md` | File with tracked TPIDs (Column B). Change path to your roster |
| **Baseline Month** | November 2025 | Pre-computed in `baseline_acr_nov` column |

## Data Model Reference

The semantic model has a dedicated **`DIM_GHCP_Initiative`** table with pre-computed incentive data per account per month. Key columns:

| Column | Type | Description |
|---|---|---|
| `TPID` | Text | Account identifier |
| `FiscalMonth` | DateTime | Month of the record |
| `baseline_acr_nov` | Integer | November 2025 GHCP ACR baseline |
| `Threshold` | Integer | Required incremental ACR (segment-specific) |
| `threshold_acr` | Integer | Target ACR to beat (= baseline + threshold) |
| `is_eligible` | Text | Pre-computed eligibility flag |
| `months_above_threshold` | Integer | Consecutive months above threshold_acr |
| `win` | Text | Win status |
| `win_month` | DateTime | Month the account qualified |
| `win_Reason` | Text | Qualification reason |
| `Needed ACR` | Double | Remaining ACR needed to reach threshold |
| `EnoughPipe` | Text | Whether pipeline is sufficient |
| `25_08_GHCP_ACR_PRU` … `26_08_GHCP_ACR_PRU` | Integer | Monthly realized GHCP ACR + PRU |
| `26_02_Value` … `26_08_Value` | Double | Monthly value |
| `26_02_isClosed` … `26_08_isClosed` | Integer | 1 = closed month (actual), 0 = still open |

Related measures (folder `v11__GHCP_Initiative` on `__Measure` table):
- `Over Threshold 1 month`, `Over Threshold 2 month`, `Over Threshold 3+ month` — account counts by progress
- `# Eligible`, `threshold_initiative`, `baseline_acr_nov`

## Workflow

### Step 0 — Power BI Auth Pre-Check

Before any data query, run a lightweight auth check against the semantic model listed in Configuration:

```dax
EVALUATE TOPN(1, 'Dim_Calendar')
```

If this returns data → auth is good, proceed.

If this fails with `TypeError: fetch failed` or any auth/connection error → **stop** and tell the user:

> Power BI MCP authentication has expired. Please run:
> ```
> az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
> az account get-access-token --resource https://analysis.windows.net/powerbi/api
> ```
> Then restart `powerbi-remote` in VS Code (MCP icon → restart).

### Step 1 — Load Account Roster

Read the file specified in **Account Roster** (Configuration table) to get the full list of tracked TPIDs.

### Step 2 — Pull Incentive Data from DIM_GHCP_Initiative

Query the semantic model using Power BI Remote MCP. Pull the latest record per TPID from `DIM_GHCP_Initiative`:

```dax
EVALUATE
SELECTCOLUMNS(
    FILTER(
        'DIM_GHCP_Initiative',
        'DIM_GHCP_Initiative'[TPID] IN {"<TPID1>", "<TPID2>", ...}
    ),
    "TPID", 'DIM_GHCP_Initiative'[TPID],
    "FiscalMonth", 'DIM_GHCP_Initiative'[FiscalMonth],
    "Baseline_Nov", 'DIM_GHCP_Initiative'[baseline_acr_nov],
    "Threshold", 'DIM_GHCP_Initiative'[Threshold],
    "Target_ACR", 'DIM_GHCP_Initiative'[threshold_acr],
    "Is_Eligible", 'DIM_GHCP_Initiative'[is_eligible],
    "Months_Above", 'DIM_GHCP_Initiative'[months_above_threshold],
    "Win", 'DIM_GHCP_Initiative'[win],
    "Win_Month", 'DIM_GHCP_Initiative'[win_month],
    "Win_Reason", 'DIM_GHCP_Initiative'[win_Reason],
    "Needed_ACR", 'DIM_GHCP_Initiative'[Needed ACR],
    "Enough_Pipe", 'DIM_GHCP_Initiative'[EnoughPipe],
    "TopParent", RELATED('Dim_Account'[TopParent])
)
ORDER BY [TopParent] ASC, [FiscalMonth] DESC
```

> If you need the per-month ACR breakdown, also pull the monthly columns (`25_12_GHCP_ACR_PRU`, `26_01_GHCP_ACR_PRU`, etc.) and the `isClosed` flags to show which months have realized data.

### Step 3 — Eligibility Validation (Realized ACR Only)

For each account, apply these rules on top of the pre-computed data:

1. **Read `is_eligible`** — the report's pre-computed flag. Trust it as the starting point.
2. **Filter to closed months only** — only months where `isClosed = 1` represent realized ACR. Discard any open/future month data from the qualifying count.
3. **$0 baseline + $0 current ACR = NOT eligible** — even if the report marks it eligible, if no ACR has actually landed (all closed months show $0), the account is not a potential win yet. Flag it separately.
4. **Count consecutive closed months at or above `threshold_acr`** — use the `months_above_threshold` column as a reference, but verify against the monthly `_GHCP_ACR_PRU` columns for closed months only.
5. **3 consecutive closed months ≥ `threshold_acr` → QUALIFYING**
6. **Clock resets** — if ACR dipped below `threshold_acr` in a closed month mid-streak, the consecutive count restarts from zero.

### Step 4 — Report

Present results as a table:

| Account | TPID | Nov Baseline | Threshold | Target ACR | Closed Months Above | Needed ACR | Status | Action |
|---|---|---|---|---|---|---|---|---|

**Status values**:
- **WON** — `win` = true, already qualified
- **QUALIFYING** — 3+ consecutive closed months above `threshold_acr`
- **On track (N/3 months)** — above threshold in N closed months but < 3 consecutive yet
- **Eligible, ACR landed** — eligible and has some ACR, but not yet hitting threshold consistently
- **Eligible, no ACR yet** — eligible on paper but $0 realized ACR — not worth pursuing until consumption starts
- **Not eligible** — baseline already above threshold (not a new logo)

**Action column** — for each account, suggest one of:
- **Nominate** — account is qualifying or has won
- **Monitor** — on track, check again next month
- **Investigate** — has ACR but isn't hitting threshold; may need customer engagement
- **Park** — no realized ACR; don't invest time until consumption starts
- **Skip** — not eligible

### Step 5 — Summary & Recommendations

End with:

1. **Score card**: N eligible → N qualifying → N won → N needing attention
2. **Time remaining**: Days left in program window (ends June 30, 2026); for Q4 qualifiers note the Jul–Aug hold requirement
3. **Top nominations**: Accounts ready to nominate now (if any)
4. **Quick wins**: Accounts closest to qualifying (e.g., 2/3 months done) — these are where a small push could land a win
5. **Don't bother (yet)**: Accounts with $0 realized ACR — be transparent that these aren't worth effort until consumption materializes
6. **Effort guidance**: For accounts on the fence, estimate how much more ACR is needed (`Needed ACR` column) so the seller can judge effort-to-reward
