---
title: Obsidian Vault Integration (OIL)
description: "The recommended persistent memory layer for MCAPS IQ — fully local, import-ready, and built for agentic workflows."
tags:
  - integrations
  - obsidian
  - oil
hide:
  - toc
---

# Obsidian Vault Integration (OIL)

!!! tip "Strongly recommended"
    While MCAPS IQ works without Obsidian (stateless CRM-only mode), **the vault is what makes the agent truly yours.** It's the difference between a chatbot that forgets everything and an assistant that accumulates institutional knowledge over time.

The **Obsidian Intelligence Layer (OIL)** turns your local [Obsidian](https://obsidian.md/) vault into a durable, queryable knowledge layer for AI agents. Instead of starting every conversation from scratch, OIL gives agents persistent memory — customer context, meeting history, relationship maps, and accumulated insights — all indexed and searchable through MCP tools.

---

## The Problem: Agents Without Memory

Every AI agent session starts from zero. You ask about a customer — the agent queries CRM, builds context, gives you an answer. Next session? It's forgotten everything. You re-explain, re-query, re-build. Multiply that across 20+ accounts over months.

<div class="oil-compare" markdown>

<div class="oil-diagram oil-before">
<div class="oil-diagram-title before"><span class="icon">⚠️</span> Without OIL — Stateless Loop</div>

<div class="oil-stack">

<div class="oil-node n-user">
<span class="node-icon">👤</span>
<div><span class="node-label">You</span><span class="node-sub">"Tell me about Contoso"</span></div>
</div>

<div class="oil-arrow red"><span class="arrow-line">↓</span> same question, every session</div>

<div class="oil-node n-agent">
<span class="node-icon">🤖</span>
<div><span class="node-label">AI Agent</span><span class="node-sub">No memory of past work</span></div>
</div>

<div class="oil-arrow red"><span class="arrow-line">↓</span> full API calls every time</div>

<div class="oil-flow-row">
<div class="oil-node n-crm" style="flex:1">
<span class="node-icon">📊</span>
<div><span class="node-label">CRM</span><span class="node-sub">Re-query opps, milestones</span></div>
</div>
<div class="oil-node n-m365" style="flex:1">
<span class="node-icon">📧</span>
<div><span class="node-label">M365</span><span class="node-sub">Re-search mail, calendar</span></div>
</div>
</div>

<div class="oil-arrow red"><span class="arrow-line">↓</span> result vanishes after session</div>

<div class="oil-node n-dead">
<span class="node-icon">💨</span>
<div><span class="node-label">Gone</span><span class="node-sub">Context lost. Start over tomorrow.</span></div>
</div>

</div>

<div style="text-align:center; margin-top: 0.75rem;">
<span class="oil-badge pain">🔄 Repetitive queries</span>
<span class="oil-badge pain">🧠 No learning</span>
<span class="oil-badge pain">🔌 Context lost between sessions</span>
<span class="oil-badge pain">📉 Slow API round-trips</span>
</div>

</div><!-- /oil-before -->

<div class="oil-diagram oil-after">
<div class="oil-diagram-title after"><span class="icon">✅</span> With OIL — Persistent Knowledge</div>

<div class="oil-stack">

<div class="oil-node n-user">
<span class="node-icon">👤</span>
<div><span class="node-label">You</span><span class="node-sub">"Prep me for Contoso governance"</span></div>
</div>

<div class="oil-arrow green"><span class="arrow-line">↓</span> vault-first lookup</div>

<div class="oil-node n-vault">
<span class="node-icon">🏛️</span>
<div><span class="node-label">Obsidian Vault</span><span class="node-sub">Customers → People → Meetings → Projects<br/>Graph-traversed in O(1)</span></div>
</div>

<div class="oil-arrow green"><span class="arrow-line">↓</span> only fetch what's missing</div>

<div class="oil-flow-row">
<div class="oil-node n-crm" style="flex:1">
<span class="node-icon">📊</span>
<div><span class="node-label">CRM</span><span class="node-sub">Scoped query (60-80% less)</span></div>
</div>
<div class="oil-node n-m365" style="flex:1">
<span class="node-icon">📧</span>
<div><span class="node-label">M365</span><span class="node-sub">Targeted lookups only</span></div>
</div>
</div>

<div class="oil-arrow green"><span class="arrow-line">↓</span> new insights persisted back</div>

<div class="oil-node n-output">
<span class="node-icon">📋</span>
<div><span class="node-label">Rich Result + Vault Updated</span><span class="node-sub">Context accumulates. Next session starts smarter.</span></div>
</div>

</div>

<div style="text-align:center; margin-top: 0.75rem;">
<span class="oil-badge gain">⚡ Instant local context</span>
<span class="oil-badge gain">🧠 Learns over time</span>
<span class="oil-badge gain">🔗 Graph relationships</span>
<span class="oil-badge gain">✈️ Works offline</span>
</div>

</div><!-- /oil-after -->

</div><!-- /oil-compare -->

---

## How MCAPS IQ Leverages OIL

OIL isn't just "note storage." MCAPS IQ uses it as a **structured operational layer** — standardizing how customer data flows, how lookups happen, and what the agent can render.

<div class="oil-diagram">
<div class="oil-diagram-title"><span class="icon">🔧</span> The OIL Integration Architecture</div>

<div class="oil-arch">

<div class="oil-arch-side">
<div class="oil-diagram-title" style="font-size:0.65rem; margin-bottom:0.5rem;">📥 Data Sources</div>
<div class="oil-node n-crm">
<span class="node-icon">📊</span>
<div><span class="node-label">MSX CRM</span><span class="node-sub">Opps, milestones, deal teams</span></div>
</div>
<div class="oil-node n-m365">
<span class="node-icon">📧</span>
<div><span class="node-label">M365</span><span class="node-sub">Mail, Teams, calendar</span></div>
</div>
<div class="oil-node n-pbi">
<span class="node-icon">📈</span>
<div><span class="node-label">Power BI</span><span class="node-sub">ACR, GHCP seats, telemetry</span></div>
</div>
<div class="oil-node n-user">
<span class="node-icon">🗒️</span>
<div><span class="node-label">Your Notes</span><span class="node-sub">OneNote imports, manual notes</span></div>
</div>
</div>

<div class="oil-arch-center">
<div class="oil-diagram-title" style="font-size:0.65rem; margin-bottom:0.5rem;">🏛️ Obsidian Vault (OIL)</div>
<div class="oil-node n-vault" style="width:100%;">
<span class="node-icon">🔍</span>
<div><span class="node-label">Search</span><span class="node-sub">semantic_search → fuzzy (fuse.js) + lexical content search, capped at 20 results</span></div>
</div>
<div class="oil-node n-vault" style="width:100%;">
<span class="node-icon">📂</span>
<div><span class="node-label">Read</span><span class="node-sub">get_note_metadata → read_note_section → query_frontmatter (token-efficient, section-level)</span></div>
</div>
<div class="oil-node n-vault" style="width:100%;">
<span class="node-icon">🔗</span>
<div><span class="node-label">Graph</span><span class="node-sub">get_related_entities → wikilink traversal, backlinks, max 3 hops, 50 results</span></div>
</div>
<div class="oil-node n-sync" style="width:100%;">
<span class="node-icon">✏️</span>
<div><span class="node-label">Write</span><span class="node-sub">atomic_append + atomic_replace — mtime-checked concurrency, no stale overwrites</span></div>
</div>
</div>

<div class="oil-arch-side">
<div class="oil-diagram-title" style="font-size:0.65rem; margin-bottom:0.5rem;">📤 What You Get</div>
<div class="oil-node n-output">
<span class="node-icon">⚡</span>
<div><span class="node-label">Instant Context</span><span class="node-sub">Vault-first means no waiting for APIs</span></div>
</div>
<div class="oil-node n-output">
<span class="node-icon">📊</span>
<div><span class="node-label">Live Dashboards</span><span class="node-sub">Pipeline views, scorecards, risk grids</span></div>
</div>
<div class="oil-node n-output">
<span class="node-icon">🔗</span>
<div><span class="node-label">Cross-Medium Links</span><span class="node-sub">CRM + M365 + vault correlated in one view</span></div>
</div>
<div class="oil-node n-output">
<span class="node-icon">✈️</span>
<div><span class="node-label">Offline Ready</span><span class="node-sub">Full context without VPN or internet</span></div>
</div>
</div>

</div>

</div><!-- /oil-arch-diagram -->

---

## What OIL Standardizes

MCAPS IQ doesn't just read Obsidian notes — it enforces a **structured schema** so every customer, person, meeting, and milestone follows the same pattern. This makes lookups predictable and agents reliable.

<div class="oil-ring">
<div class="oil-ring-card rc-green">
<div class="ring-icon">📁</div>
<div class="ring-title">Normalized Customer Notes</div>
<div class="ring-desc">Every customer follows the same template: frontmatter (TPID, segment, territory), sections (overview, milestones dataview, risk register, agent insights). Agent can rely on structure.</div>
</div>
<div class="oil-ring-card rc-blue">
<div class="ring-icon">👥</div>
<div class="ring-title">People → Customer Resolution</div>
<div class="ring-desc">Wikilinks from People/ notes to Customers/ notes let the agent resolve "who do I know at Contoso?" by graph traversal, not CRM round-trips.</div>
</div>
<div class="oil-ring-card rc-teal">
<div class="ring-icon">🔄</div>
<div class="ring-title">One-Way CRM → Vault Sync</div>
<div class="ring-desc">vault-sync writes CRM state (opps, milestones, deal teams, tasks) to vault notes in bulk. Vault is always the local mirror — never writes back to CRM.</div>
</div>
<div class="oil-ring-card rc-purple">
<div class="ring-icon">🔍</div>
<div class="ring-title">Fuzzy + Lexical Search</div>
<div class="ring-desc">Fuzzy search via fuse.js with lexical content fallback. Agent finds what you wrote even with typos or different phrasing. Results capped at 20 with context snippets — not full notes.</div>
</div>
<div class="oil-ring-card rc-amber">
<div class="ring-icon">🖼️</div>
<div class="ring-title">Renderable Output</div>
<div class="ring-desc">Agents write DataviewJS blocks, Charts, Mermaid, and styled HTML directly into vault notes. Obsidian renders them — no external tools needed. Living dashboards, not static text.</div>
</div>
<div class="oil-ring-card rc-red">
<div class="ring-icon">🛡️</div>
<div class="ring-title">Write Safety</div>
<div class="ring-desc">All vault writes use mtime-based concurrency checks — if the file changed since you last read it, the write is rejected. Stateless, no pending queue. User-authored content below sentinel markers is preserved during syncs.</div>
</div>
</div>

---

## Why Obsidian?

<div class="oil-features">

<div class="oil-feat ft-green">
<div class="feat-head"><span class="feat-icon">🔒</span><span class="feat-title">100% Local</span></div>
<div class="feat-desc">Notes never leave your machine. No cloud sync, no data residency questions. Critical for enterprise account data.</div>
</div>

<div class="oil-feat ft-blue">
<div class="feat-head"><span class="feat-icon">🔗</span><span class="feat-title">Graph-Native Links</span></div>
<div class="feat-desc"><code>[[wikilinks]]</code> give OIL a pre-built relationship graph — people ↔ customers ↔ meetings — traversed in O(1).</div>
</div>

<div class="oil-feat ft-teal">
<div class="feat-head"><span class="feat-icon">📝</span><span class="feat-title">Markdown Forever</span></div>
<div class="feat-desc">Plain <code>.md</code> files. No vendor lock-in. Git them, grep them, back them up. Still readable if you leave Obsidian.</div>
</div>

<div class="oil-feat ft-purple">
<div class="feat-head"><span class="feat-icon">📥</span><span class="feat-title">Import Existing Notes</span></div>
<div class="feat-desc">Bootstrap with years of knowledge on day one — don't start from zero.</div>
<div class="oil-import-chips">
<a class="oil-chip" href="https://help.obsidian.md/import/onenote">📓 OneNote</a>
<a class="oil-chip" href="https://help.obsidian.md/import/evernote">🐘 Evernote</a>
<a class="oil-chip" href="https://help.obsidian.md/import/notion">📄 Notion</a>
<a class="oil-chip" href="https://help.obsidian.md/import/apple-notes">🍎 Apple Notes</a>
<a class="oil-chip" href="https://help.obsidian.md/import/google-keep">📌 Google Keep</a>
<a class="oil-chip" href="https://help.obsidian.md/import/html">🌐 HTML</a>
</div>
</div>

<div class="oil-feat ft-amber">
<div class="feat-head"><span class="feat-icon">⚡</span><span class="feat-title">Renders HTML & JS</span></div>
<div class="feat-desc">DataviewJS dashboards, Charts, Mermaid diagrams, Excalidraw maps — the vault is a <strong>living dashboard</strong>, not a static notebook.</div>
</div>

<div class="oil-feat ft-red">
<div class="feat-head"><span class="feat-icon">✈️</span><span class="feat-title">Works Offline</span></div>
<div class="feat-desc">Obsidian doesn't even need to be running. OIL reads the vault folder directly. No VPN, no internet, full context.</div>
</div>

</div>

---

## With vs. Without the Vault

<div class="oil-vs-grid">
<div class="oil-vs-head vs-without">❌ Without Vault</div>
<div class="oil-vs-head vs-with">✅ With Vault</div>

<div class="oil-vs-label">Customer Context</div>
<div class="oil-vs-cell"><span class="vs-icon">🔄</span> Re-query CRM every session</div>
<div class="oil-vs-cell"><span class="vs-icon">⚡</span> Instant local graph lookup</div>

<div class="oil-vs-label">Meeting Prep</div>
<div class="oil-vs-cell"><span class="vs-icon">🐌</span> Search CRM + M365 from scratch</div>
<div class="oil-vs-cell"><span class="vs-icon">📋</span> Pre-indexed history + notes</div>

<div class="oil-vs-label">People Relationships</div>
<div class="oil-vs-cell"><span class="vs-icon">🔍</span> Manual lookup per person</div>
<div class="oil-vs-cell"><span class="vs-icon">🔗</span> Graph-traversed via wikilinks</div>

<div class="oil-vs-label">Agent Memory</div>
<div class="oil-vs-cell"><span class="vs-icon">💨</span> Forgets between sessions</div>
<div class="oil-vs-cell"><span class="vs-icon">🧠</span> Durable insights persist</div>

<div class="oil-vs-label">API Load</div>
<div class="oil-vs-cell"><span class="vs-icon">📉</span> Full CRM calls every time</div>
<div class="oil-vs-cell"><span class="vs-icon">📊</span> Vault-first: 60-80% fewer calls</div>

<div class="oil-vs-label">Dashboards</div>
<div class="oil-vs-cell"><span class="vs-icon">📄</span> Text-only output</div>
<div class="oil-vs-cell"><span class="vs-icon">📊</span> Interactive DataviewJS + Charts</div>

<div class="oil-vs-label">Offline</div>
<div class="oil-vs-cell"><span class="vs-icon">🚫</span> Nothing works without VPN</div>
<div class="oil-vs-cell"><span class="vs-icon">✈️</span> Full context on the plane</div>
</div>

---

## Setup

### 1. Install Obsidian

Download [Obsidian](https://obsidian.md/) (free for personal use). Create a new vault or point it at an existing folder of Markdown files.

### 2. Set Up the Vault Structure

OIL expects this minimal folder structure:

```
YourVault/
├── Customers/       # One .md per customer (e.g., Contoso.md)
├── People/          # One .md per contact (e.g., Alice Smith.md)
├── Meetings/        # Meeting notes with wikilinks to customers/people
├── Projects/        # Optional — project notes linked to milestones
├── _Dashboard/      # Optional — DataviewJS scorecards and pipeline views
└── oil.config.yaml  # Optional — customize folder paths and field names
```

!!! tip "Bootstrap from existing notes"
    If you have OneNote notebooks with customer notes, use the [Obsidian Importer](https://help.obsidian.md/import/onenote) to bring them in first. Then organize into the folder structure above. You'll have years of context available to the agent immediately.

### 3. Enable in MCP Config

Open `.vscode/mcp.json` and uncomment the `"oil"` block:

```jsonc
"oil": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@jinlee794/obsidian-intelligence-layer@latest", "mcp"],
    "env": {
        "OBSIDIAN_VAULT_PATH": "${input:vault_path}"
    }
}
```

### 4. Start the Server

Click **Start** on `oil` in VS Code. When prompted, enter the absolute path to your vault.

!!! note "Entered the wrong path?"
    Run `npm run vault:reconfigure` to re-enter it, or edit `.env` directly.

See the upstream [OIL repository](https://github.com/JinLee794/Obsidian-Intelligence-Layer) for example template files, sample vault fixtures, and advanced configuration.

---

## Recommended Plugins

<div class="oil-plugins">
<a class="oil-plugin" href="https://blacksmithgu.github.io/obsidian-dataview/"><span class="plug-icon">📊</span> Dataview <span class="plug-tag">Key</span></a>
<a class="oil-plugin" href="https://github.com/SilentVoid13/Templater"><span class="plug-icon">📝</span> Templater</a>
<a class="oil-plugin" href="https://github.com/phibr0/obsidian-charts"><span class="plug-icon">📈</span> Charts</a>
<a class="oil-plugin" href="https://github.com/mProjectsCode/obsidian-meta-bind-plugin"><span class="plug-icon">🎛️</span> Meta Bind</a>
<a class="oil-plugin" href="https://github.com/zsviczian/obsidian-excalidraw-plugin"><span class="plug-icon">🎨</span> Excalidraw</a>
<a class="oil-plugin" href="https://github.com/mgmeyers/obsidian-style-settings"><span class="plug-icon">🎨</span> Style Settings</a>
<a class="oil-plugin" href="https://github.com/mgmeyers/obsidian-kanban"><span class="plug-icon">📋</span> Kanban</a>
<a class="oil-plugin" href="https://help.obsidian.md/import"><span class="plug-icon">📥</span> Importer</a>
</div>

---

## OIL v2 Tools (7 Total)

OIL's tool surface is deliberately minimal — the LLM orchestrates, OIL provides token-efficient reads and safe writes.

<div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--mcaps-green); margin-bottom:0.5rem;">📖 Retrieve (5 tools)</div>

<div class="oil-tools">
<div class="oil-tool t-read">
<div class="tool-name">get_note_metadata</div>
<div class="tool-desc">Peek before loading — frontmatter, timestamps, word count, headings</div>
</div>
<div class="oil-tool t-read">
<div class="tool-name">read_note_section</div>
<div class="tool-desc">Read one heading section, not an entire 5,000-word note</div>
</div>
<div class="oil-tool t-read">
<div class="tool-name">get_related_entities</div>
<div class="tool-desc">Graph traversal — linked notes via wikilinks, max 3 hops</div>
</div>
<div class="oil-tool t-read">
<div class="tool-name">semantic_search</div>
<div class="tool-desc">Fuzzy (fuse.js) + lexical fallback — snippets with scores, capped at 20</div>
</div>
<div class="oil-tool t-read">
<div class="tool-name">query_frontmatter</div>
<div class="tool-desc">Fast in-memory index lookup by key + value — no disk scan</div>
</div>
</div>

<div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--mcaps-amber); margin-bottom:0.5rem; margin-top:1rem;">✏️ Write (2 tools)</div>

<div class="oil-tools">
<div class="oil-tool t-write">
<div class="tool-name">atomic_append</div>
<div class="tool-desc">Append under a heading — mtime-checked, rejects stale writes</div>
</div>
<div class="oil-tool t-write">
<div class="tool-name">atomic_replace</div>
<div class="tool-desc">Full-file rewrite — same mtime safety, for when append isn't enough</div>
</div>
</div>

!!! info "v1 → v2"
    OIL v1 had 22 tools. v2 consolidated to 7 — the LLM handles orchestration, OIL focuses on efficient reads and safe atomic writes.

---

## Try It

<div class="oil-prompts">
<div class="oil-prompt"><span class="prompt-icon">💬</span> What do I know about the Contoso account from my vault notes?</div>
<div class="oil-prompt"><span class="prompt-icon">💬</span> Find meeting notes mentioning the Northwind project from last month.</div>
<div class="oil-prompt"><span class="prompt-icon">💬</span> Prep me for my Fabrikam governance meeting.</div>
<div class="oil-prompt"><span class="prompt-icon">💬</span> Sync my active pipeline to the vault for offline travel context.</div>
<div class="oil-prompt"><span class="prompt-icon">💬</span> Create a pipeline dashboard in my vault with DataviewJS scorecards.</div>
<div class="oil-prompt"><span class="prompt-icon">💬</span> Import my OneNote customer notebooks, then run customer hygiene.</div>
</div>
