---
title: "Day 1: Hello MCAPS IQ"
description: Verify everything works and understand what you're talking to.
tags:
  - guided
  - day-1
  - beginner
hide:
  - toc
---

# Day 1: Hello MCAPS IQ

<div class="timeline-nav tl-guided">
<a href="./" class="tl-step active"><div class="tl-node"><span class="tl-num">1</span></div><div class="tl-label">Day 1</div></a>
<a href="../day-2-pipeline/" class="tl-step"><div class="tl-node"><span class="tl-num">2</span></div><div class="tl-label">Day 2</div></a>
<a href="../day-3-chains/" class="tl-step"><div class="tl-node"><span class="tl-num">3</span></div><div class="tl-label">Day 3</div></a>
<a href="../day-5-lightbulb/" class="tl-step"><div class="tl-node"><span class="tl-num">5</span></div><div class="tl-label">Day 5</div></a>
</div>

<div class="journey-hero" markdown>

## :material-hand-wave: Welcome — let's make sure everything works

**Time:** ~10 minutes · You'll verify your CRM connection and learn how Copilot reads your data.

</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">1</div>
<h3>Who Are You?</h3>
<span class="exercise-time">⏱️ 2 min</span>
</div>
<div class="exercise-body" markdown>

Open Copilot Chat (++cmd+shift+i++) and type:

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">Who am I in MSX?</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot calls the <code>crm_whoami</code> tool (you'll see it in the tool call indicator)</li>
<li>Returns your name, alias, role, and business unit</li>
<li>The data matches your actual MSX profile</li>
</ul>

<div class="result-preview">
<div class="result-preview-header"><span class="rp-dot"></span> Sample output</div>
<div class="result-preview-body">
<div class="rp-field"><span class="rp-key">Name</span><span class="rp-val">Jin Lee</span></div>
<div class="rp-field"><span class="rp-key">Alias</span><span class="rp-val">jinle</span></div>
<div class="rp-field"><span class="rp-key">Role</span><span class="rp-val">Solution Engineer</span></div>
<div class="rp-field"><span class="rp-key">Business Unit</span><span class="rp-val">US Health & Life Sciences</span></div>
</div>
</div>

<div class="lightbulb-callout" markdown>
<div class="lc-icon">💡</div>
<div class="lc-body" markdown>

#### Checkpoint

If you see your name and role, authentication is working. You're connected to real MSX data.

</div>
</div>

??? question "What if it gets my role wrong?"
    CRM role detection depends on your Dynamics 365 assignments. You can always tell Copilot your role explicitly:
    ```
    I'm a Specialist. Remember that for this session.
    ```

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">2</div>
<h3>What Tools Do You Have?</h3>
<span class="exercise-time">⏱️ 2 min</span>
</div>
<div class="exercise-body" markdown>

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">What MCP tools do you have available for MSX?</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>A list of ~23 tools (if <code>msx</code> is running)</li>
<li>Tools include <code>crm_whoami</code>, <code>crm_query</code>, <code>list_opportunities</code>, <code>get_milestones</code>, etc.</li>
<li>If <code>workiq</code> is running, you'll also see <code>ask_work_iq</code></li>
</ul>

!!! info "Why this matters"
    Understanding the available tools helps you understand what Copilot _can_ do. Each tool is a capability — and Copilot automatically selects the right ones based on your prompt.

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">3</div>
<h3>A Simple Read</h3>
<span class="exercise-time">⏱️ 2 min</span>
</div>
<div class="exercise-body" markdown>

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">Show me my active opportunities.</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot calls <code>list_opportunities</code> (not <code>crm_query</code> — it knows the right tool)</li>
<li>Returns a structured list with opportunity names, stages, and values</li>
<li>The data matches what you'd see in MSX</li>
</ul>

??? tip "Try variations — Copilot understands intent, not exact phrasing"
    - `What's in my pipeline?`
    - `List my open deals.`
    - `Any active opps assigned to me?`

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">4</div>
<h3>Ask a Follow-Up</h3>
<span class="exercise-time">⏱️ 2 min</span>
</div>
<div class="exercise-body" markdown>

After seeing your opportunities, try:

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">Tell me more about the first one.</div>
</div>
</div>

**What to expect:**

<ul class="expect-list">
<li>Copilot maintains <strong>context</strong> from the previous response</li>
<li>It calls <code>crm_get_record</code> to fetch the full opportunity details</li>
<li>You'll see fields like estimated close date, revenue, stage, and deal team info</li>
</ul>

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">5</div>
<h3>Peek Behind the Curtain</h3>
<span class="exercise-time">⏱️ 2 min</span>
</div>
<div class="exercise-body" markdown>

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">How did you know which CRM queries to run for that?</div>
</div>
</div>

This isn't about CRM data — it's about understanding the system. Copilot will explain which instruction files guided its behavior, which skill (if any) it activated, and which MCP tool calls it made.

<div class="lightbulb-callout" markdown>
<div class="lc-icon">💡</div>
<div class="lc-body" markdown>

#### The "aha" moment

Most users have their first "wait, really?" moment here. Copilot isn't guessing — it's following a structured playbook defined in the `.github/skills/` and `.github/instructions/` files. The quality of the output directly reflects the quality of the instructions.

</div>
</div>

</div>
</div>

---

## What You Learned Today

<div class="learned-strip" markdown>
<div class="ls-item" markdown>

#### MCP Tools

The bridge between Copilot and your CRM data

</div>
<div class="ls-item" markdown>

#### Natural Language Routing

Copilot picks the right tool based on your intent

</div>
<div class="ls-item" markdown>

#### Context Persistence

Follow-up questions build on previous answers

</div>
<div class="ls-item" markdown>

#### Instruction-Driven

Copilot's behavior is shaped by `.github/` files you can edit

</div>
</div>

---

## Troubleshooting Day 1

??? failure "Copilot says it can't access CRM"
    1. Is `msx` running? (check `.vscode/mcp.json`)
    2. Is `az login` current? (run it again if unsure)
    3. Are you on VPN?

??? failure "Results look empty or wrong"
    Your CRM data depends on your role assignments in MSX. If you don't have active opportunities, that's normal — try:
    ```
    Show opportunities for the Contoso account.
    ```

??? failure "Copilot doesn't seem to use MCP tools"
    Try being explicit:
    ```
    Use the MSX CRM tools to check who I am.
    ```

---

<a class="next-day" href="../day-2-pipeline/">
<div class="nd-arrow">→</div>
<div class="nd-body">
<h4>Continue to Day 2: Read Your Pipeline</h4>
<p>Navigate from portfolio to milestones to tasks — all in natural language.</p>
</div>
</a>
