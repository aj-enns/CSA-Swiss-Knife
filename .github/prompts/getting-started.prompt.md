---
description: "First-time setup verification and guided walkthrough. Use after cloning to confirm everything is working."
---

# Getting Started

Run a quick environment check, identify my role, and walk me into my first real workflow. Don't just verify — guide me.

## Steps

1. **Check prerequisites** — verify that MCP servers are installed and built by running `node scripts/init.js --check` in a terminal. If anything fails, give me the exact fix command — don't assume I know my way around a terminal.
2. **Check Azure sign-in** — run `az account show` to confirm I'm signed in. If not, tell me to run `az login` (remind me I need VPN first).
3. **Verify MCP connectivity** — use `crm_whoami` to confirm CRM is reachable. If it fails, tell me the likely cause (VPN, token expired, etc.).
4. **Identify my role** — first read `Reference/MyRoleDescriptions.md` from the Obsidian vault (`oil:search_vault` for "My Role"). If found, use it directly. If vault is unavailable, infer from the `crm_whoami` result. Present it and ask me to confirm or correct.
5. **Show me what I can do** — based on my confirmed role, present a short menu (3–4 items) of the highest-value things I can do right now. Format as numbered options I can just pick from:
   - Each option should be a single sentence describing the action
   - Include the actual prompt I'd type (or offer to run it for me)
   - Prioritize: daily hygiene first, then pipeline/milestone review, then deeper analysis

## Tone

Be encouraging and brief. This is my first time — don't overwhelm me with every feature. Just get me to one successful action and tell me where to go next.

## After the first action completes

Say: *"Nice — you're set up. Here are the slash commands you'll use most:"* and list:
- `/daily` — your role-specific morning routine
- `/weekly` — weekly review (auto-detects Monday governance prep vs Friday digest)
- `/what-next` — not sure what to do? I'll check your pipeline and suggest actions
- `/account-review` — multi-signal health check on any account (GHCP seats, engagement, pipeline)
- `/meeting` — prep before or process notes after any meeting
