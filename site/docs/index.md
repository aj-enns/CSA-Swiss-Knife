---
title: MCAPS IQ — AI-Powered Sales Operations
description: Talk to Copilot in plain English to manage your MSX pipeline — no coding required.
hide:
  - toc
  - tags
  - navigation
---

<div class="hero" markdown>

![MCAPS IQ](assets/avatar.png){ width="160" }

# MCAPS IQ

**Talk to Copilot in plain English to manage your MSX pipeline.**{ .tagline }

[:octicons-rocket-16: Get Started in 15 minutes](getting-started/index.md){ .md-button .md-button--primary }
[:octicons-book-16: Guided Experience](guided/index.md){ .md-button }

</div>

<div class="value-pillars" markdown>

<div class="value-pillar" markdown>
<div class="vp-icon">⏱️</div>
<div markdown>

### Save Time

Eliminate MSX screen-hopping. Pipeline, milestones, tasks, and meeting prep — all in one chat window.

</div>
</div>

<div class="value-pillar" markdown>
<div class="vp-icon">⚡</div>
<div markdown>

### Stay Sharp

AI surfaces risks, stale deals, and missed follow-ups before you even ask. Proactive, not reactive.

</div>
</div>

<div class="value-pillar" markdown>
<div class="vp-icon">👥</div>
<div markdown>

### Work Together

Cross-role context flows automatically — handoffs, coverage gaps, and relationship health are visible across the team.

</div>
</div>

</div>

<div style="text-align:center" markdown>
<span class="trust-badge">🛡️ Read-only by default · Always asks before writing · Every output is a draft for your judgment</span>
</div>

<div class="stat-strip" markdown>
<div class="stat"><span class="num">52</span><span class="label">Skills</span></div>
<div class="stat"><span class="num">28</span><span class="label">Slash Prompts</span></div>
<div class="stat"><span class="num">5</span><span class="label">Agents</span></div>
<div class="stat"><span class="num">8</span><span class="label">MCAPS Roles</span></div>
<div class="stat"><span class="num">9</span><span class="label">MCP Servers</span></div>
</div>

<div class="diagram-embed">
<div class="diagram-embed-label">How It All Fits Together</div>
<div class="diagram-frame-wrapper" id="diagram-wrapper">
<iframe src="assets/overview-diagram.html" loading="lazy" title="MCAPS IQ Overview Diagram"></iframe>
</div>
<p class="diagram-hint">Scroll to explore · or open full size ↓</p>
<div class="diagram-actions">
<a href="assets/overview-diagram.html" target="_blank" class="md-button md-button--primary">↗️ View Full Size</a>
<a href="getting-started/" class="md-button">Get Started</a>
<a href="prompts/by-role/" class="md-button">Browse Prompts by Role</a>
</div>
</div>

<script>
(function() {
  function fitDiagram() {
    var w = document.getElementById('diagram-wrapper');
    var f = w && w.querySelector('iframe');
    if (!w || !f) return;
    var z = w.clientWidth / 1680;
    f.style.zoom = z;
  }
  window.addEventListener('load', fitDiagram);
  window.addEventListener('resize', fitDiagram);
  setTimeout(fitDiagram, 300);
  if (typeof document$ !== 'undefined') document$.subscribe(function(){ setTimeout(fitDiagram, 200); });
})();
</script>

<div class="diagram-embed">
<div class="diagram-embed-label">How It Works — Architecture</div>
<div class="diagram-frame-wrapper" id="arch-diagram-wrapper">
<iframe src="assets/architecture-diagram.html" loading="lazy" title="MCAPS IQ Architecture Diagram"></iframe>
</div>
<p class="diagram-hint">Scroll to explore · or open full size ↓</p>
<div class="diagram-actions">
<a href="assets/architecture-diagram.html" target="_blank" class="md-button">↗️ View Architecture Full Size</a>
<a href="architecture/" class="md-button">Deep Dive: How It Works</a>
</div>
</div>

<script>
(function() {
  function fitArchDiagram() {
    var w = document.getElementById('arch-diagram-wrapper');
    var f = w && w.querySelector('iframe');
    if (!w || !f) return;
    var z = w.clientWidth / 1680;
    f.style.zoom = z;
  }
  window.addEventListener('load', fitArchDiagram);
  window.addEventListener('resize', fitArchDiagram);
  setTimeout(fitArchDiagram, 300);
  if (typeof document$ !== 'undefined') document$.subscribe(function(){ setTimeout(fitArchDiagram, 200); });
})();
</script>

---

!!! note "This is a showcase of GitHub Copilot's extensibility"
    The core value here is GitHub Copilot and the agentic era it enables. This project tackles MCAPS internal tooling as the problem domain, but the pattern is universal: connect Copilot to your enterprise systems through MCP servers, layer in domain expertise via instructions and skills, and let your team operate complex workflows in plain language. **Fork the pattern and build your own version.**
