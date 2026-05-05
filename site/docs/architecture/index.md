---
title: How It Works
description: Understand the architecture, tools, and design principles behind MCAPS IQ.
tags:
  - architecture
  - how-it-works
hide:
  - toc
---
# How It Works

MCAPS IQ is a collection of **MCP servers**, **domain skills**, and **instruction files** that extend GitHub Copilot's capabilities into enterprise sales operations.

<div class="diagram-embed">
<div class="diagram-embed-label">Visual Architecture Guide</div>
<div class="diagram-frame-wrapper" id="arch-diagram-wrapper">
<iframe src="../assets/architecture-diagram.html" loading="lazy" title="MCAPS IQ Architecture Diagram"></iframe>
</div>
<p class="diagram-hint">Scroll to explore · or open full size ↓</p>
<div class="diagram-actions">
<a href="../assets/architecture-diagram.html" target="_blank" class="md-button md-button--primary">↗️ View Full Size</a>
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

## Deep Dives

<div class="grid cards" markdown>

-   :material-map:{ .lg .middle } __[System Overview](overview.md)__

    ---

    How the pieces fit together — from your prompt to CRM data and back.

-   :material-server:{ .lg .middle } __[MCP Servers & Tools](mcp-servers.md)__

    ---

    The data bridges: MSX CRM, WorkIQ, Obsidian, Power BI.

-   :material-brain:{ .lg .middle } __[Skills & Instructions](skills-instructions.md)__

    ---

    How Copilot knows what to do — the 4-tier context loading model.

-   :material-layers:{ .lg .middle } __[Skill Architecture](skill-architecture.md)__

    ---

    MCEM process spine, atomic skills, role cards, Verifiable Outcomes, and governing principles.

-   :material-tune:{ .lg .middle } __[Context Optimization](context-optimization.md)__

    ---

    How context budget is managed — instruction trimming, subagent delegation, MCP response shaping.

-   :material-shield-check:{ .lg .middle } __[Safety & Write Operations](safety.md)__

    ---

    How write operations work and why you're always in control.

-   :material-shield-alert:{ .lg .middle } __[Threat Model](threat-model.md)__

    ---

    STRIDE analysis, trust boundaries, mitigations, and residual risks for the full MCP toolchain.

-   :material-test-tube:{ .lg .middle } __[Evaluation Framework](eval/index.md)__

    ---

    Automated testing for skill routing, tool correctness, anti-patterns, and output quality. Baseline: 92.9%.

</div>
