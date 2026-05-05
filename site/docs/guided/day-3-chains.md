---
title: "Day 3: Multi-Skill Chains"
description: Issue a single prompt that orchestrates multiple skills in sequence.
tags:
  - guided
  - day-3
  - chains
  - advanced
hide:
  - toc
---

# Day 3: Multi-Skill Chains

<div class="timeline-nav tl-guided">
<a href="../day-1-hello/" class="tl-step done"><div class="tl-node"><span class="tl-num">1</span></div><div class="tl-label">Day 1</div></a>
<a href="../day-2-pipeline/" class="tl-step done"><div class="tl-node"><span class="tl-num">2</span></div><div class="tl-label">Day 2</div></a>
<a href="./" class="tl-step active"><div class="tl-node"><span class="tl-num">3</span></div><div class="tl-label">Day 3</div></a>
<a href="../day-5-lightbulb/" class="tl-step"><div class="tl-node"><span class="tl-num">5</span></div><div class="tl-label">Day 5</div></a>
</div>

<div class="journey-hero" markdown>

## :material-link-variant: One prompt. Multiple skills. Comprehensive output.

**Time:** ~15 minutes · You'll describe the outcome you want, and Copilot figures out the workflow.

</div>

---

## Why Chains Matter

On Day 2, you asked individual questions: _"Show milestones," "Check tasks," "Write a summary."_ That's useful, but it's still you orchestrating the workflow.

**Chains flip the model.** You describe the _outcome_, and Copilot orchestrates multiple skills in the right order automatically.

<div class="skill-chain">
<div class="sc-node sc-input"><span class="sc-icon">💬</span> Your prompt</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">🔍</span> pipeline-hygiene-triage</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">⚠️</span> risk-surfacing</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">✅</span> handoff-readiness</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-output"><span class="sc-icon">📋</span> Prioritized actions</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">1</div>
<h3>The Weekly Review Chain</h3>
<span class="exercise-time">⏱️ 5 min</span>
</div>
<div class="exercise-body" markdown>

Pick your role tab below and try the prompt:

=== ":material-briefcase: Specialist"

    ```
    I'm a Specialist. Run my full weekly review — pipeline hygiene, 
    any deals ready to hand off, and flag risks across my active opps.
    ```

    **Skills that run:** 🔍 pipeline-hygiene-triage → 🤝 handoff-readiness-validation → ⚠️ risk-surfacing → 📋 **Prioritized action list**

=== ":material-shield-account: CSAM"

    ```
    Before my governance meeting Thursday, tell me: what stage are we 
    really in on the Contoso deal, what's the milestone health, and 
    prepare a customer evidence pack for the last 30 days.
    ```

    **Skills that run:** 📍 mcem-stage-identification → 🏥 milestone-health-review → 📦 customer-evidence-pack → 📋 **Governance briefing**

=== ":material-cog: CSA"

    ```
    I'm a CSA. Run my weekly execution sweep — what's at risk across 
    my committed milestones?
    ```

    **Skills that run:** 🔧 execution-monitoring → 📋 task-hygiene-flow → ⚡ **Execution risk punch-list**

=== ":material-wrench: Solution Engineer"

    ```
    I'm an SE. Check my task hygiene, show me any execution blockers 
    on committed milestones, and tell me if there are Unified constraints 
    I should flag today.
    ```

    **Skills that run:** 📋 task-hygiene-flow → 🔧 execution-monitoring → 🏢 unified-constraint-check → 📋 **Morning prep completed**

<div class="lightbulb-callout" markdown>
<div class="lc-icon">💡</div>
<div class="lc-body" markdown>

#### Notice the difference

You didn't name any skills. You didn't specify any tools. You described what you needed, and Copilot identified the relevant skills, ran them in order, passed context between them, and produced a unified output.

</div>
</div>

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">2</div>
<h3>The Deal Triage Chain</h3>
<span class="exercise-time">⏱️ 5 min</span>
</div>
<div class="exercise-body" markdown>

Pick a deal that feels stuck or uncertain:

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">The [opportunity name] deal feels stuck. What stage is it actually in, are exit criteria met, what are the risks, and who should own the next action?</div>
</div>
</div>

<div class="skill-chain">
<div class="sc-node sc-skill"><span class="sc-icon">📍</span> mcem-stage-identification</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">✅</span> exit-criteria-validation</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">⚠️</span> risk-surfacing</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">👥</span> role-orchestration</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-output"><span class="sc-icon">📋</span> Full triage report</div>
</div>

This is **four workflows** compressed into one prompt. The output connects them — risks inform the next-action recommendation, stage position informs which exit criteria matter.

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">3</div>
<h3>The Commit-or-Loopback Decision</h3>
<span class="exercise-time">⏱️ 3 min</span>
</div>
<div class="exercise-body" markdown>

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">The team wants to commit the [milestone name] milestone, but I heard the proof had issues. Check if we should commit or loop back.</div>
</div>
</div>

<div class="skill-chain">
<div class="sc-node sc-skill"><span class="sc-icon">🚪</span> commit-gate-enforcement</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">🔄</span> non-linear-progression</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">👤</span> delivery-accountability-mapping</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-output"><span class="sc-icon">✅</span> Commit / loopback decision</div>
</div>

A clear commit/loopback recommendation with evidence, not opinion.

</div>
</div>

---

<div class="exercise" markdown>
<div class="exercise-header">
<div class="exercise-num">4</div>
<h3>Post-Proof Handoff (CSA → CSAM)</h3>
<span class="exercise-time">⏱️ 3 min</span>
</div>
<div class="exercise-body" markdown>

<div class="try-it">
<div class="try-it-icon">💬</div>
<div class="try-it-content">
<div class="try-it-label">Try this prompt</div>
<div class="try-it-prompt">I'm a CSA. The Contoso proof just completed successfully. Check architecture feasibility, create the handoff note, and validate that the Specialist handoff is clean.</div>
</div>
</div>

<div class="skill-chain">
<div class="sc-node sc-skill"><span class="sc-icon">🏗️</span> architecture-feasibility-check</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">📄</span> architecture-execution-handoff</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-skill"><span class="sc-icon">✅</span> handoff-readiness-validation</div>
<div class="sc-arrow">→</div>
<div class="sc-node sc-output"><span class="sc-icon">📦</span> Complete handoff package</div>
</div>

</div>
</div>

---

## Understanding Chain Behavior

??? info "How Copilot chains skills"
    1. **Intent matching** — Copilot reads your prompt and identifies which skills' `description` keywords match
    2. **Ordering** — Skills declare which other skills they chain with in their docs
    3. **Context forwarding** — Output from skill 1 becomes input context for skill 2
    4. **Unified output** — The final response synthesizes all skill outputs into one coherent answer

??? question "What if a skill in the chain has no relevant data?"
    Copilot handles this gracefully — it notes "no issues found" for that skill and continues the chain. You won't get an error; you'll get a shorter answer.

??? question "Can I force a specific chain order?"
    You can, but you usually don't need to. If you want control:
    ```
    First run pipeline-hygiene-triage, then risk-surfacing, 
    then give me a prioritized action list.
    ```

---

## What You Learned Today

<div class="learned-strip" markdown>
<div class="ls-item" markdown>

#### Skill Chaining

Multiple skills execute in sequence from a single prompt

</div>
<div class="ls-item" markdown>

#### Intent-Driven Orchestration

Describe the outcome; Copilot picks the workflow

</div>
<div class="ls-item" markdown>

#### Context Forwarding

Each skill's output enriches the next skill's input

</div>
<div class="ls-item" markdown>

#### One Prompt, Full Picture

Complex multi-step investigations in a single interaction

</div>
</div>

---

## Take Day 4 for Yourself

Before Day 5, spend a day using chains on your _real_ pipeline. Try:

- A weekly review for your actual role
- A triage on a deal that's actually problematic
- A governance prep for a meeting you actually have

The more you use real data, the more impressed (or occasionally frustrated) you'll be — and both reactions are valuable learning.

---

<a class="next-day" href="../day-5-lightbulb/">
<div class="nd-arrow">→</div>
<div class="nd-body">
<h4>Continue to Day 5: The Lightbulb Moment</h4>
<p>Cross-medium synthesis, strategic intelligence, and the difference between a chatbot and an agent.</p>
</div>
</a>
