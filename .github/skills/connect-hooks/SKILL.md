---
name: connect-hooks
description: "Connect hook formatting + evidence schema, Obsidian vault routing for Connect evidence capture. Triggers: connect hook, connect evidence, impact capture, connect impact area, attribution gate, evidence qualification."
---

# Connect Hook Writing Guide

When writing Connect hooks:

- Use the schema below for every hook entry.
- Each hook must map to at least one **Connects impact area**.
- Include concrete evidence and a source pointer.
- Keep each hook to **3–6 lines**.
- Every hook must have a **verifiable claim** backed by at least one primary source.

## Storage Routing

1. **Vault available**: Use `capture_connect_hook({ customer, hook: { ... } })` to append to the customer's vault file under `## Connect Hooks`.
2. **Always**: Write to `.connect/hooks/hooks.md` as a repo-tracked backup.
3. **Vault unavailable**: `.connect/hooks/hooks.md` is the sole destination.

## Schema

```yaml
- Date:
- Impact Area(s): Customer Impact | Business Impact | Culture & Collaboration
- Hook:
- Evidence:
- Source:
- Next step:
```

## Connects Impact Area Definitions

| Impact Area | What qualifies |
|---|---|
| **Customer Impact** | Direct customer deliverable, adoption lift, milestone delivery, risk mitigation, solution readiness |
| **Business Impact** | Revenue influenced, pipeline progression, forecast accuracy, deal velocity, cost avoidance |
| **Culture & Collaboration** | Process improvement, tooling that scales, cross-team enablement, mentoring, knowledge sharing, inclusive practices |

## Attribution Gate (Mandatory)

Before writing any Connect hook, verify the authenticated user has a demonstrable connection:

1. **Resolve identity** — `msx:crm_whoami`.
2. **Check attribution** — user must satisfy at least one of:
   - **(a) CRM owner** — `_ownerid_value` on the milestone or opportunity
   - **(b) Forecast participant** — user's alias in `msp_forecastnotes`
   - **(c) WorkIQ evidence participant** — user in M365 evidence thread
3. **Fail-safe** — if attribution is inferred only from account-level activity, flag:
   ```yaml
   - Evidence: "⚠️ Unverified — user not found in milestone/forecast/communication evidence."
   ```

## Evidence Qualification

Only include evidence that meets at least one of:
- **Quantifiable impact** — revenue influenced, risk reduced, time saved
- **Decision-level influence** — architectural guidance, technical direction
- **Cross-team or customer leadership** — orchestration, alignment
- **Customer outcomes advanced** — milestone progression, delivery acceleration
