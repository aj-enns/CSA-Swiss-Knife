---
description: "Identify or switch your MCAPS role. Shows role-specific capabilities, daily rhythms, and recommended workflows."
---

# My Role

Figure out who I am in MCAPS and show me what's available for my role. If I already know my role, let me state it and skip the lookup.

## Steps

1. **Identify me** — first read `Reference/MyRoleDescriptions.md` from the Obsidian vault (`oil:search_vault` for "My Role"). If found, use it directly — it contains my role, mission, and success metrics. If vault is unavailable, fall back to `crm_whoami` to infer role (Specialist, SE, CSA, CSAM).
2. **Confirm** — present the inferred role and ask me to confirm or correct. If I tell you my role directly, skip the lookup.
3. **Show my role card** — based on confirmed role, give me a brief (5-line max) summary of:
   - What I'm responsible for in MCEM
   - My primary CRM objects (opportunities? milestones? tasks?)
   - The 2-3 workflows I'll use most
4. **Present my daily menu** — show 3-4 numbered actions I can take right now, tailored to my role:

### Specialist
1. **Pipeline check** — "Show me my active opportunities and flag anything stale."
2. **Qualify a signal** — "I got a new customer signal — help me decide if it's worth creating an opp."
3. **Handoff readiness** — "Is [deal] ready to hand off to CSU?"

### Solution Engineer
1. **Task hygiene** — "Check my task records — any stale, orphaned, or missing owners?"
2. **Proof planning** — "Help me scope a POC/pilot plan for [opportunity]."
3. **Unified check** — "Are there dispatch or eligibility blockers for my Unified items?"

### Cloud Solution Architect
1. **Execution sweep** — "What's at risk across my committed milestones?"
2. **Feasibility check** — "Is the proposed architecture for [deal] actually feasible?"
3. **Handoff note** — "Create a handoff document for [completed proof]."

### CSAM
1. **Milestone health** — "How are my committed milestones doing? I have governance this week."
2. **Commit gate** — "Should we commit [milestone]? Run the pre-commitment check."
3. **Adoption review** — "How is adoption going on [deployment]? Check usage health."

## Tone

Keep it short. This is a menu, not a manual. Let me pick a number and go.
