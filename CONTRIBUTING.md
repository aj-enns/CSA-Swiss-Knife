# Contributing to MCAPS IQ

Thank you for contributing to MCAPS IQ! This guide covers the development workflow, coding standards, and PR process for v-team collaborators.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Fork and Clone](#fork-and-clone)
- [Branch Naming](#branch-naming)
- [Running MCP Servers Locally](#running-mcp-servers-locally)
- [Running Tests and Linting](#running-tests-and-linting)
- [Pull Request Process](#pull-request-process)
- [Project Board](#project-board)
- [Label Taxonomy](#label-taxonomy)

---

## Prerequisites

Before you start, make sure you have:

- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **Azure CLI** — [install guide](https://learn.microsoft.com/cli/azure/install-azure-cli)
- **VS Code** with the [GitHub Copilot extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat)
- A Microsoft corporate account and VPN access (required for MSX CRM features)
- A GitHub account with write access or a fork of the repo

---

## Fork and Clone

This project uses a **trunk-based development** model. All changes are made in short-lived branches off `main` and merged back quickly.

### 1. Fork the repository

Click **Fork** on [github.com/microsoft/MCAPS-IQ](https://github.com/microsoft/MCAPS-IQ) to create your own copy.

### 2. Clone your fork

```bash
git clone https://github.com/<your-username>/MCAPS-IQ.git
cd MCAPS-IQ
```

### 3. Add the upstream remote

```bash
git remote add upstream https://github.com/microsoft/MCAPS-IQ.git
```

### 4. Install dependencies

```bash
npm install
```

This runs a post-install script that installs and builds all MCP sub-projects automatically.

### 5. Keep your fork in sync

Before starting any new branch, sync with upstream `main`:

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

---

## Branch Naming

Use short-lived branches off `main`. Delete branches after merging.

| Type             | Pattern                         | Example                         |
| ---------------- | ------------------------------- | ------------------------------- |
| New feature      | `feature/<short-description>` | `feature/morning-brief-skill` |
| Bug fix          | `fix/<short-description>`     | `fix/crm-auth-retry`          |
| Documentation    | `site/docs/<short-description>`    | `site/docs/obsidian-setup`         |
| Refactor / chore | `chore/<short-description>`   | `chore/update-dependencies`   |

**Rules:**

- Branch names are lowercase with hyphens — no underscores or spaces.
- Keep branch names concise (3–5 words max).
- Branch directly off `main`; never branch off another feature branch.
- Merge or close branches within a few days. Stale branches (>2 weeks, no activity) may be deleted.

---

## Running MCP Servers Locally

### Sign in to Azure

```bash
az login
```

Use your Microsoft corporate account. You must be on the corporate VPN.

### Verify Installation in VS Code

1. Open `.vscode/mcp.json` — you'll see **Start** buttons above each server definition.
2. Click **Start** on `msx` (required).
3. Click **Start** on `workiq` (optional, for M365 searches).

Once started, each server shows a **Running** status with the number of available tools.

### Verify Installation from the terminal

```bash
# MSX CRM server
node scripts/msx-start.js

# OIL (Obsidian Intelligence Layer) server
node scripts/oil-start.js
```

### Verify the environment

```bash
npm run check
```

This runs the environment checker and reports any missing tools or configuration issues.

---

## Running Tests and Linting

### Context health lint

The CI pipeline runs a context linter against Copilot instructions and skills. Run it locally before opening a PR:

```bash
cd .github/eval
npm ci
node lint-descriptions.mjs
node lint-instructions.mjs --cross
node lint-context.mjs
```

These checks validate:

- Skill `description` frontmatter is keyword-rich and unique.
- Instruction files have correct `applyTo` globs and `description` fields.
- The total context token budget is within limits.

### MCP server tests

```bash
npm run check
npm run eval
```

MSX and OIL are consumed as published npm packages via `npx` in this repo. If you need to run unit tests for those servers directly, run them in their source repositories.

### Docs site (optional)

To preview the MkDocs documentation site locally:

```bash
npm run docs:install   # install Python deps (once)
npm run docs:serve     # starts at http://127.0.0.1:8000
```

---

## Pull Request Process

### Before opening a PR

- [ ] Sync your branch with `upstream/main`.
- [ ] Run `npm run check` and fix any issues.
- [ ] Run the context linter if you changed `.github/` files.
- [ ] Run relevant MCP server tests.
- [ ] Keep the PR focused — one logical change per PR.

### PR title format

Use the same prefix as your branch type:

```
feat: add morning-brief skill
fix: retry CRM auth on token expiry
docs: add Obsidian setup walkthrough
chore: update @modelcontextprotocol/sdk to 1.9
```

### PR description

Include:

1. **What** — a brief summary of the change.
2. **Why** — the linked issue or motivation.
3. **How** — any non-obvious implementation decisions.
4. **Testing** — how you verified the change.

Link the relevant issue by adding `Closes #<issue-number>` in the description.

### Review expectations

- All PRs require **at least one approving review** from a v-team member before merging.
- Reviewers should respond within **2 business days**.
- Resolve all review comments before merging — don't dismiss without addressing.
- Prefer **squash merge** to keep the `main` history clean.
- Delete the branch after merging.

### Draft PRs

Open a **Draft PR** early if you want feedback on an approach before the implementation is complete. Mark it ready for review when it meets the acceptance criteria.

---

## Project Board

Issues and PRs are tracked on the **[V-Team Iterative Dev](https://github.com/orgs/microsoft/projects?query=MCAPS+IQ)** GitHub Project board.

### Board columns

| Column                | Meaning                                    |
| --------------------- | ------------------------------------------ |
| **Backlog**     | Triaged and ready to be picked up          |
| **In Progress** | Actively being worked on (assign yourself) |
| **In Review**   | PR is open and awaiting review             |
| **Done**        | Merged or closed                           |

### Workflow

1. Pick an issue from **Backlog** and assign it to yourself.
2. Move it to **In Progress** when you start a branch.
3. Open a PR and move the issue to **In Review**.
4. After the PR merges, the issue moves to **Done** automatically (via `Closes #N`).

If you're unsure what to pick up, look for issues labelled [`good first issue`](#label-taxonomy) or ask in the team channel.

---

## Label Taxonomy

Labels are used on both issues and PRs.

### Type labels

| Label        | Description                                |
| ------------ | ------------------------------------------ |
| `feature`  | New capability or enhancement              |
| `fix`      | Bug fix or correction                      |
| `docs`     | Documentation-only change                  |
| `chore`    | Maintenance, dependency updates, tooling   |
| `refactor` | Code restructuring with no behavior change |

### Area labels

| Label                  | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `area: mcp-msx`      | Changes that impact MSX CRM MCP integration                |
| `area: mcp-oil`      | Changes that impact OIL (Obsidian) MCP integration         |
| `area: skills`       | Changes to Copilot skills (`.github/skills/`)             |
| `area: instructions` | Changes to Copilot instructions (`.github/instructions/`) |
| `area: docs`         | Changes to documentation (`docs/`, `site/`)             |
| `area: ci`           | Changes to GitHub Actions workflows                         |

### Priority labels

| Label                | Description                          |
| -------------------- | ------------------------------------ |
| `priority: high`   | Blocking or time-sensitive           |
| `priority: medium` | Normal sprint priority               |
| `priority: low`    | Nice-to-have, pick up when available |

### Workflow labels

| Label                | Description                                  |
| -------------------- | -------------------------------------------- |
| `good first issue` | Well-scoped entry-point for new contributors |
| `help wanted`      | Extra eyes or expertise needed               |
| `blocked`          | Waiting on an external dependency            |
| `wontfix`          | Acknowledged but out of scope                |

---

## Code Style

- **JavaScript**: Follow the existing style in each sub-project. Most files use ES modules (`import`/`export`).
- **Markdown**: Keep line lengths reasonable; use ATX-style headings (`#`).
- **Commit messages**: Follow the [Conventional Commits](https://www.conventionalcommits.org/) prefix style (`feat:`, `fix:`, `docs:`, `chore:`).
- **No secrets**: Never commit credentials, tokens, or `.env` files. Use `.env.example` as the template.

---

## Getting Help

- Open a [GitHub Discussion](https://github.com/microsoft/MCAPS-IQ/discussions) for questions or ideas.
- For security issues, see [SECURITY.md](SECURITY.md).
- For bugs or feature requests, open a [GitHub Issue](https://github.com/microsoft/MCAPS-IQ/issues).
