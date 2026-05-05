---
title: Prompts by Role
description: Visual role cards for Specialist, SE, CSA, CSAM, AE, ATS, and ATU Sales Director — with example prompts, skill routing, and data source indicators.
tags:
  - prompts
  - roles
  - specialist
  - se
  - csa
  - csam
  - ae
  - ats
hide:
  - toc
---

# Prompts by Role

Copy-paste any example into the Copilot chat. Each triggers the right [skills](index.md#prompts-vs-skills) automatically — you don't name them, just describe what you need.

!!! tip "New here?"
    Start with `/getting-started` or `/my-role` instead. Come back to these once you're comfortable.

<div class="source-legend" markdown>
  <div class="sl-item"><div class="sl-dot" style="background: var(--mcaps-blue);"></div> CRM</div>
  <div class="sl-item"><div class="sl-dot" style="background: var(--mcaps-teal);"></div> M365</div>
  <div class="sl-item"><div class="sl-dot" style="background: var(--mcaps-green);"></div> Vault</div>
  <div class="sl-item"><div class="sl-dot" style="background: var(--mcaps-purple);"></div> PBI</div>
</div>

---

## Getting Oriented

These work for any role:

<div class="prompt-lane lane-setup" markdown>
<div class="lane-sidebar">Start</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">🪪</div><div><h4>Check CRM Identity</h4></div></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Who am I in MSX?</div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span></div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">📋</div><div><h4>Active Pipeline</h4></div></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Show me my active opportunities.</div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span></div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">🔧</div><div><h4>Available Tools</h4></div></div>
<div class="prompt-example"><div class="pe-avatar">You</div> What MCP tools do I have available for MSX?</div>
</div>

</div>
</div>

---

<!-- ══════════════════════════════════════════════════════
     SPECIALIST
     ══════════════════════════════════════════════════════ -->

<div class="catalog-header" markdown>
  <div class="ch-icon" style="background: var(--mcaps-blue);">🎯</div>
  <h2>Specialist</h2>
  <div class="ch-count">Pipeline builder & deal driver</div>
</div>

<div class="filter-bar" markdown>
  <span class="fb-label">Key Skills:</span>
  <span class="fb-tag">pipeline-hygiene-triage</span>
  <span class="fb-tag">pipeline-qualification</span>
  <span class="fb-tag">handoff-readiness-validation</span>
  <span class="fb-tag">risk-surfacing</span>
  <span class="fb-tag">proof-plan-orchestration</span>
  <span class="fb-tag">mcem-flow</span>
</div>

<div class="prompt-lane lane-analysis" markdown>
<div class="lane-sidebar">Specialist</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-blue);">🔍</div><div><h4>Qualify a Signal</h4></div></div>
<p class="ptile-desc">Score inbound signal for commercial fit, solution-play alignment, and scaffold a draft opportunity.</p>
<div class="chain-flow">
  <span class="chain-node">pipeline-qualification</span>
  <span class="chain-arrow">→</span>
  <span class="chain-node">customer-outcome-scoping</span>
</div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> I got a signal from the Contoso account team about an Azure migration interest. Should I create an opportunity?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-blue);">📆</div><div><h4>Weekly Pipeline Review</h4></div></div>
<p class="ptile-desc">Flags stale opps, missing fields, close-date slippage, and low-quality entries.</p>
<div class="chain-flow">
  <span class="chain-node">pipeline-hygiene-triage</span>
  <span class="chain-arrow">→</span>
  <span class="chain-node">handoff-readiness-validation</span>
  <span class="chain-arrow">→</span>
  <span class="chain-node">risk-surfacing</span>
</div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> It's Monday — run my weekly pipeline review. What needs cleanup across my Stage 2 and 3 opps?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-blue);">✈️</div><div><h4>Handoff Readiness</h4></div></div>
<p class="ptile-desc">Validates business-case summary, outcomes, proof artifacts, and CSU-aligned owners.</p>
<div class="chain-flow">
  <span class="chain-node">handoff-readiness-validation</span>
</div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> The Fabrikam AI Copilot deal just got customer agreement. Is it ready to hand off to CSU?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-blue);">🧪</div><div><h4>Plan a Proof</h4></div></div>
<p class="ptile-desc">POC/Pilot/Demo blueprint — scope, acceptance criteria, timeline, roles.</p>
<div class="chain-flow"><span class="chain-node">proof-plan-orchestration</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> We need a POC plan for the Northwind opportunity. What should the proof cover and who owns what?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-blue);">📊</div><div><h4>Prioritize Accounts</h4></div></div>
<p class="ptile-desc">5-tier ranking by GHCP whitespace, pipeline readiness, adoption health.</p>
<div class="ptile-sources"><span class="ptile-src src-pbi">PBI</span><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Rank my accounts by GHCP growth potential — where should I focus?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-blue);">🏥</div><div><h4>Full Account Review</h4></div></div>
<p class="ptile-desc">Multi-signal health dashboard — seats, engagement, pipeline.</p>
<div class="ptile-sources"><span class="ptile-src src-pbi">PBI</span><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-m365">M365</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Run a full account review for Contoso — seats, engagement, and pipeline.</div>
</div>

</div>
</div>

---

<!-- ══════════════════════════════════════════════════════
     SOLUTION ENGINEER
     ══════════════════════════════════════════════════════ -->

<div class="catalog-header" markdown>
  <div class="ch-icon" style="background: var(--mcaps-teal);">🔧</div>
  <h2>Solution Engineer</h2>
  <div class="ch-count">Technical proof executor & HoK driver</div>
</div>

<div class="filter-bar" markdown>
  <span class="fb-label">Key Skills:</span>
  <span class="fb-tag">se-execution-check</span>
  <span class="fb-tag">proof-plan-orchestration</span>
  <span class="fb-tag">hok-readiness-check</span>
  <span class="fb-tag">architecture-review</span>
  <span class="fb-tag">morning-brief</span>
</div>

<div class="prompt-lane lane-rhythm" markdown>
<div class="lane-sidebar">SE</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-teal);">✅</div><div><h4>Daily Task Hygiene</h4></div></div>
<p class="ptile-desc">Task hygiene, architecture guardrails, Unified constraint validation in one pass.</p>
<div class="chain-flow">
  <span class="chain-node">se-execution-check</span>
</div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM Tasks</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Run my daily task hygiene check — any stale tasks or missing owners on my active milestones?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-teal);">🧪</div><div><h4>Proof Scoping</h4></div></div>
<p class="ptile-desc">Align SE and Specialist on success criteria, environment needs, and role assignments.</p>
<div class="chain-flow">
  <span class="chain-node">proof-plan-orchestration</span>
  <span class="chain-arrow">→</span>
  <span class="chain-node">hok-readiness-check</span>
</div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> The SE and Specialist need to align on success criteria for the Contoso pilot. Help us scope the proof plan.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-teal);">📈</div><div><h4>Activity Impact</h4></div></div>
<p class="ptile-desc">Correlates your VBDs and meetings with GHCP seat growth — proves engagement value.</p>
<div class="ptile-sources"><span class="ptile-src src-vault">Vault</span><span class="ptile-src src-m365">M365</span><span class="ptile-src src-pbi">PBI</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Did my VBDs with Contoso actually drive GHCP seat growth? Show me before/after data.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-teal);">🤝</div><div><h4>Meeting Prep</h4></div></div>
<p class="ptile-desc">Pre-populate meeting note with vault context, CRM pipeline state, and attendee info.</p>
<div class="ptile-sources"><span class="ptile-src src-vault">Vault</span><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-m365">Calendar</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Prep me for the Contoso QBR tomorrow — pull context from vault and CRM.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-teal);">📏</div><div><h4>SE Productivity</h4></div></div>
<p class="ptile-desc">HoK activities, milestones engaged, committed pipe, customer coverage.</p>
<div class="ptile-sources"><span class="ptile-src src-pbi">SE FY26</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> How am I doing? Run my SE productivity review.</div>
</div>

</div>
</div>

---

<!-- ══════════════════════════════════════════════════════
     CSA
     ══════════════════════════════════════════════════════ -->

<div class="catalog-header" markdown>
  <div class="ch-icon" style="background: var(--mcaps-purple);">🏗️</div>
  <h2>Cloud Solution Architect</h2>
  <div class="ch-count">Architecture & execution owner</div>
</div>

<div class="filter-bar" markdown>
  <span class="fb-label">Key Skills:</span>
  <span class="fb-tag">architecture-review</span>
  <span class="fb-tag">se-execution-check</span>
  <span class="fb-tag">milestone-health-review</span>
  <span class="fb-tag">stage-5-review</span>
</div>

<div class="prompt-lane lane-pbi" markdown>
<div class="lane-sidebar">CSA</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-purple);">🏗️</div><div><h4>Architecture Feasibility</h4></div></div>
<p class="ptile-desc">Reviews environment prerequisites, dependency sequencing, capacity headroom, and design risks.</p>
<div class="chain-flow"><span class="chain-node">architecture-review</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Is the proposed architecture for the Cencora migration actually feasible? Check delivery dependencies and technical risk.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-purple);">📦</div><div><h4>Handoff to Delivery</h4></div></div>
<p class="ptile-desc">Produces structured handoff artifacts — decisions, constraints, guardrails, KPIs.</p>
<div class="chain-flow">
  <span class="chain-node">architecture-review (handoff mode)</span>
  <span class="chain-arrow">→</span>
  <span class="chain-node">handoff-readiness-validation</span>
</div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> The Contoso proof is complete. Create a handoff note summarizing architecture decisions, risks, and next actions for delivery.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-purple);">🔎</div><div><h4>Execution Sweep</h4></div></div>
<p class="ptile-desc">Weekly scan of committed milestones for at-risk items.</p>
<div class="chain-flow"><span class="chain-node">milestone-health-review</span><span class="chain-arrow">→</span><span class="chain-node">se-execution-check</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Run my weekly execution sweep — what's at risk across my committed milestones?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-purple);">📐</div><div><h4>Value Realization</h4></div></div>
<p class="ptile-desc">Validates measurable outcomes against committed milestones.</p>
<div class="chain-flow"><span class="chain-node">stage-5-review</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> We're entering Realize Value for the Northwind deal. Are our committed milestones tracking measurable outcomes?</div>
</div>

</div>
</div>

---

<!-- ══════════════════════════════════════════════════════
     CSAM
     ══════════════════════════════════════════════════════ -->

<div class="catalog-header" markdown>
  <div class="ch-icon" style="background: var(--mcaps-green);">🤝</div>
  <h2>CSAM</h2>
  <div class="ch-count">Customer-success orchestrator</div>
</div>

<div class="filter-bar" markdown>
  <span class="fb-label">Key Skills:</span>
  <span class="fb-tag">customer-outcome-scoping</span>
  <span class="fb-tag">commit-gate-enforcement</span>
  <span class="fb-tag">milestone-health-review</span>
  <span class="fb-tag">delivery-accountability-mapping</span>
  <span class="fb-tag">stage-5-review</span>
</div>

<div class="prompt-lane lane-vault" markdown>
<div class="lane-sidebar">CSAM</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-green);">📏</div><div><h4>Define Outcomes</h4></div></div>
<p class="ptile-desc">Captures business objectives, success metrics, and baseline measurements.</p>
<div class="chain-flow"><span class="chain-node">customer-outcome-scoping</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> I'm in Listen and Consult with a new engagement. Help me define measurable customer outcomes before we move to Stage 2.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-green);">🚦</div><div><h4>Commit Gate</h4></div></div>
<p class="ptile-desc">Checks resource staffing, delivery-path named, and target-date realism.</p>
<div class="chain-flow"><span class="chain-node">commit-gate-enforcement</span><span class="chain-arrow">→</span><span class="chain-node">non-linear-progression</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> The team wants to commit the Fabrikam migration milestone. Is it actually ready? Run the commit gate check.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-green);">💊</div><div><h4>Milestone Health</h4></div></div>
<p class="ptile-desc">Date drift, overdue completions, stalled items. Customer-safe + internal remediation.</p>
<div class="chain-flow"><span class="chain-node">milestone-health-review</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> How are my committed milestones doing? I have governance this week and need a health summary.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-green);">👤</div><div><h4>Delivery Ownership</h4></div></div>
<p class="ptile-desc">Maps delivery owners (Partner, ISD, Unified, internal) and clarifies CSAM vs delivery roles.</p>
<div class="chain-flow"><span class="chain-node">delivery-accountability-mapping</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> I keep getting tagged for delivery delays on the Vocera milestone but I'm not the delivery owner. Who actually owns execution here?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-green);">📈</div><div><h4>Adoption Review</h4></div></div>
<p class="ptile-desc">Usage telemetry vs targets, consumption scorecard, expansion signals.</p>
<div class="chain-flow"><span class="chain-node">stage-5-review</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-pbi">PBI</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> How is adoption going on the Contoso AI deployment? Check usage health and consumption targets.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-green);">📋</div><div><h4>Evidence Pack</h4></div></div>
<p class="ptile-desc">Assembles CRM status + M365 customer communications into consolidated briefing.</p>
<div class="chain-flow"><span class="chain-node">milestone-health-review (evidence mode)</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-m365">M365</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> I have a QBR with Northwind next week. Prepare an evidence pack with CRM status and recent customer communications from the last 30 days.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-green);">🚀</div><div><h4>Expansion Routing</h4></div></div>
<p class="ptile-desc">Captures growth signals and routes to Specialist for new opportunity creation.</p>
<div class="chain-flow"><span class="chain-node">stage-5-review (expansion)</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> During the Fabrikam optimization review, the customer mentioned interest in expanding to a second region. Should this be a new opportunity?</div>
</div>

</div>
</div>

---

<!-- ══════════════════════════════════════════════════════
     AE
     ══════════════════════════════════════════════════════ -->

<div class="catalog-header" markdown>
  <div class="ch-icon" style="background: #E8590C;">💼</div>
  <h2>Account Executive</h2>
  <div class="ch-count">Customer relationship owner & strategic orchestrator</div>
</div>

<div class="filter-bar" markdown>
  <span class="fb-label">Key Skills:</span>
  <span class="fb-tag">account-landscape-awareness</span>
  <span class="fb-tag">risk-surfacing</span>
  <span class="fb-tag">mcem-flow</span>
  <span class="fb-tag">pipeline-hygiene-triage</span>
</div>

<div class="prompt-lane lane-write" markdown>
<div class="lane-sidebar">AE</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: #E8590C;">🏥</div><div><h4>Full Account Review</h4></div></div>
<p class="ptile-desc">Multi-signal review — seats, engagement, pipeline. Pick sections or full review.</p>
<div class="ptile-sources"><span class="ptile-src src-pbi">PBI</span><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-m365">M365</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Run a full account review for Contoso — seats, engagement, and pipeline. Where are we exposed?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: #E8590C;">🗺️</div><div><h4>Account Landscape</h4></div></div>
<p class="ptile-desc">Surfaces cross-role pipeline, swarm opportunities, and EDE coverage gaps.</p>
<div class="chain-flow"><span class="chain-node">account-landscape-awareness</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> What's the full landscape for Contoso? Show me cross-role pipeline and where we have gaps.</div>
</div>

</div>
</div>

---

<!-- ══════════════════════════════════════════════════════
     ATS
     ══════════════════════════════════════════════════════ -->

<div class="catalog-header" markdown>
  <div class="ch-icon" style="background: #0E566C;">🧭</div>
  <h2>Account Technology Strategist</h2>
  <div class="ch-count">AI & Security strategy leader</div>
</div>

<div class="prompt-lane lane-analysis" markdown>
<div class="lane-sidebar">ATS</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: #0E566C;">🗺️</div><div><h4>Account Landscape</h4></div></div>
<p class="ptile-desc">Full pipeline, cross-role activity, and EDE coverage across accounts.</p>
<div class="chain-flow"><span class="chain-node">account-landscape-awareness</span></div>
<div class="ptile-sources"><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> What's the full account landscape for Fabrikam? Show me cross-role pipeline and EDE coverage.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: #0E566C;">🏥</div><div><h4>Account Review</h4></div></div>
<p class="ptile-desc">Health card + seat analysis + engagement + pipeline across your accounts.</p>
<div class="ptile-sources"><span class="ptile-src src-pbi">PBI</span><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-m365">M365</span></div>
</div>

</div>
</div>

---

<!-- ══════════════════════════════════════════════════════
     ATU SALES DIRECTOR
     ══════════════════════════════════════════════════════ -->

<div class="catalog-header" markdown>
  <div class="ch-icon" style="background: #8B5CF6;">👔</div>
  <h2>ATU Sales Director</h2>
  <div class="ch-count">Sales leader & coaching orchestrator</div>
</div>

<div class="prompt-lane lane-pbi" markdown>
<div class="lane-sidebar">SD</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: #8B5CF6;">📊</div><div><h4>Portfolio Prioritization</h4></div></div>
<p class="ptile-desc">Rank team accounts by GHCP growth potential — composite scoring across 5 tiers.</p>
<div class="ptile-sources"><span class="ptile-src src-pbi">PBI</span><span class="ptile-src src-crm">CRM</span><span class="ptile-src src-vault">Vault</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Rank my team's accounts by GHCP growth potential — where should we focus this quarter?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: #8B5CF6;">📏</div><div><h4>SE Productivity</h4></div></div>
<p class="ptile-desc">SE performance metrics — HoK activities, milestones, engagement velocity.</p>
<div class="ptile-sources"><span class="ptile-src src-pbi">SE FY26</span></div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: #8B5CF6;">☁️</div><div><h4>Azure Portfolio</h4></div></div>
<p class="ptile-desc">ACR attainment, gap to target, pipeline conversion across the team.</p>
<div class="ptile-sources"><span class="ptile-src src-pbi">MSXI</span></div>
</div>

</div>
</div>

---

## Any Role — Cross-Cutting Prompts

These work regardless of role. Each triggers MCEM lifecycle skills automatically.

<div class="prompt-lane lane-setup" markdown>
<div class="lane-sidebar">Any</div>
<div class="lane-body" markdown>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">🔍</div><div><h4>Stage Identification</h4></div></div>
<div class="chain-flow"><span class="chain-node">mcem-diagnostics</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> What stage is the Contoso deal actually in? The CRM says Stage 3 but activity looks like Stage 2.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">✅</div><div><h4>Exit Criteria</h4></div></div>
<div class="chain-flow"><span class="chain-node">mcem-diagnostics</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Are we ready to advance to Stage 4 on the Northwind opportunity? Check exit criteria.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">🔄</div><div><h4>Stage Loopback</h4></div></div>
<div class="chain-flow"><span class="chain-node">non-linear-progression</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> The proof failed — customer environment wasn't ready. Should we loop back to Stage 2?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">⚠️</div><div><h4>Risk Review</h4></div></div>
<div class="chain-flow"><span class="chain-node">risk-surfacing</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> What risks am I missing on the Cencora account? Do a full risk review.</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">👥</div><div><h4>Role Orchestration</h4></div></div>
<div class="chain-flow"><span class="chain-node">mcem-flow</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> Three roles are involved on the Fabrikam deal and nobody's moving. Who should lead the next action?</div>
</div>

<div class="ptile" markdown>
<div class="ptile-head"><div class="ptile-icon" style="background: var(--mcaps-gray);">🤝</div><div><h4>Partner Motion</h4></div></div>
<div class="chain-flow"><span class="chain-node">shared-patterns (partner)</span></div>
<div class="prompt-example"><div class="pe-avatar">You</div> The Contoso opportunity has a partner co-sell motion. How does that change ownership and delivery attribution?</div>
</div>

</div>
</div>
