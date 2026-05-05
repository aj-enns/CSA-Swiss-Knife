---
title: "Day 2: Read Your Pipeline"
description: Explore opportunities, milestones, and tasks through natural language.
tags:
  - guided
  - day-2
  - pipeline
hide:
  - toc
---

# Day 2: Read Your Pipeline

<div class="timeline-nav tl-guided">
<a href="../day-1-hello/" class="tl-step done"><div class="tl-node"><span class="tl-num">1</span></div><div class="tl-label">Day 1</div></a>
<a href="./" class="tl-step active"><div class="tl-node"><span class="tl-num">2</span></div><div class="tl-label">Day 2</div></a>
<a href="../day-3-chains/" class="tl-step"><div class="tl-node"><span class="tl-num">3</span></div><div class="tl-label">Day 3</div></a>
<a href="../day-5-lightbulb/" class="tl-step"><div class="tl-node"><span class="tl-num">5</span></div><div class="tl-label">Day 5</div></a>
</div>

<div class="journey-hero" markdown>

## :material-chart-timeline-variant: Navigate your entire pipeline in natural language

**Time:** ~15 minutes · You'll drill from portfolio → opportunity → milestone → task and get governance-ready output.

</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">1</div>
<h3>Portfolio Overview</h3>
<span class="exercise-time">⏱️ 3 min</span>
</div>
<div class="exercise-body" markdown>

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">Give me a summary of my pipeline — stages, values, and what needs attention.</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot calls <code>list_opportunities</code> and synthesizes results</li>
<li>Opportunities grouped or sorted by MCEM stage</li>
<li>Deals with approaching close dates or stale stages are highlighted</li>
</ul>

!!! info "Behind the scenes"
    This prompt may activate the `pipeline-hygiene-triage` skill if it detects issues. Watch for it mentioning "hygiene" or "flag" — that's a skill doing work.

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">2</div>
<h3>Drill Into a Deal</h3>
<span class="exercise-time">⏱️ 3 min</span>
</div>
<div class="exercise-body" markdown>

Pick one of the opportunities from Exercise 1 and ask:

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">Show me the milestones for [Opportunity Name].</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot calls <code>get_milestones</code> for that specific opportunity</li>
<li>Returns milestones with status, target dates, and owners</li>
<li>Overdue or uncommitted milestones may be flagged</li>
</ul>

??? tip "Natural variations — all of these work"
    - `What's the milestone status on the Contoso deal?`
    - `Any overdue milestones on my Fabrikam opportunity?`
    - `Show me the timeline for Northwind milestones.`

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">3</div>
<h3>Task-Level Detail</h3>
<span class="exercise-time">⏱️ 3 min</span>
</div>
<div class="exercise-body" markdown>

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">What tasks are attached to the [milestone name] milestone? Any stale or unassigned?</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot drills from milestone to tasks</li>
<li>Identifies tasks with no owner, past due dates, or missing status updates</li>
<li>If you're an SE, this may activate <code>task-hygiene-flow</code></li>
</ul>

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">4</div>
<h3>Governance-Ready Status</h3>
<span class="exercise-time">⏱️ 3 min</span>
</div>
<div class="exercise-body" markdown>

Here's where it gets powerful:

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">Write me a customer-safe status summary for [Opportunity Name] that I can use in governance this week.</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot synthesizes opportunity data, milestone health, and task status</li>
<li>Produces <strong>two outputs</strong>: customer-facing bullets (no internal jargon) and internal remediation notes</li>
<li>This activates the <code>milestone-health-review</code> skill</li>
</ul>

<div class="lightbulb-callout" markdown>
<div class="lc-icon">⚡</div>
<div class="lc-body" markdown>

#### Real time savings

Instead of opening MSX, clicking through each milestone, checking tasks, and writing a summary in OneNote — you got a governance-ready update in one prompt.

</div>
</div>

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">5</div>
<h3>Cross-Opportunity View</h3>
<span class="exercise-time">⏱️ 3 min</span>
</div>
<div class="exercise-body" markdown>

If you have multiple active deals:

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">Across all my active opportunities, which milestones are at risk? Rank by urgency.</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot queries across all your opportunities (not just one)</li>
<li>Aggregates milestones and applies risk logic (overdue, stalled, missing owners)</li>
<li>Ranks results so you know where to focus</li>
</ul>

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">6</div>
<h3>M365 Evidence (Optional)</h3>
<span class="exercise-time">⏱️ 3 min</span>
</div>
<div class="exercise-body" markdown>

If you have `workiq` running:

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">Find any recent Teams messages or emails about [customer name] from the last 2 weeks.</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot calls <code>ask_work_iq</code> with a scoped query</li>
<li>Returns relevant Teams chats, email threads, or meeting notes</li>
<li>Cross-references with CRM data for context</li>
</ul>

<div class="lightbulb-callout" markdown>
<div class="lc-icon">🔗</div>
<div class="lc-body" markdown>

#### Cross-medium intelligence

WorkIQ bridges the gap between CRM records and actual communication. A milestone might show "green" in CRM while the customer's emails reveal frustration. This cross-medium view is where real intelligence lives.

</div>
</div>

</div>
</div>

---

## What You Learned Today

<div class="learned-strip" markdown>
<div class="ls-item" markdown>

#### Drill-Down Navigation

Portfolio → Opportunity → Milestone → Task, all via natural language

</div>
<div class="ls-item" markdown>

#### Skill Activation

Copilot loads domain skills automatically based on your prompt

</div>
<div class="ls-item" markdown>

#### Customer-Safe Output

Copilot produces different outputs for different audiences

</div>
<div class="ls-item" markdown>

#### Cross-Medium Queries

CRM + M365 data combined in a single response

</div>
</div>

---

## Before Day 3

Try exploring your own pipeline. Ask questions you'd normally answer by clicking through MSX screens. Notice:

- Which things are faster via Copilot?
- Which things still need you to check MSX directly?
- What questions does Copilot struggle with?

These observations will make Day 3 more impactful.

---

<a class="next-day" href="../day-3-chains/">
<div class="nd-arrow">→</div>
<div class="nd-body">
<h4>Continue to Day 3: Multi-Skill Chains</h4>
<p>One prompt, multiple skills, comprehensive output — experience real orchestration.</p>
</div>
</a>
