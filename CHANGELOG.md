# Changelog

All notable changes to MCAPS-IQ are documented in this file.

## [0.3.2] — 2026-04-08

### Features

- **SL4 subscription detail prompt** — added Azure consumption deep-dive prompt for SL4-level subscription detail (#79)
- **PSScriptAnalyzer integration** — added PSScriptAnalyzer settings and updated bootstrap script validation process (#76)

### Bug Fixes

- **Bootstrap URL fix** — corrected bootstrap script URLs to point to the Microsoft repository
- **PowerShell bootstrap hardening** — improved error handling during mcaps CLI installation, enhanced product version parsing error logging in `Get-CodeVersion`
- **Windows detection** — improved PowerShell detection and Windows installation instructions
- **Vault path configuration** — improved Obsidian vault path configuration and refactored GitHub packages auth error handling

### Documentation

- **Role descriptions** — updated role descriptions in README to reflect current positions and responsibilities
- **Getting started refresh** — updated setup time estimates, removed outdated documentation files, enhanced security guidelines for private repositories and trusted MCP servers
- **TOON integration spec** — added token-efficient data serialization specification for MCP tools with benchmarks and phased rollout plan
- **Bootstrap guides** — updated PowerShell installation instructions and Windows setup guidance

### Chores & Cleanup

- **Removed outdated packaging spec** — removed outdated packaging options spec document

## [0.3.1] — 2026-04-06

### Security

- **Incomplete string escaping** — `escapePipes()` in `vault-sync.js` now escapes backslashes before pipes and collapses newlines, preventing Markdown table injection (CodeQL alert #9)
- **Workflow permissions** — added least-privilege `permissions` blocks to `bootstrap.yml`, `eval.yml`, and `lint-context.yml`; `eval-offline` gets scoped `pull-requests: write` for PR comments, `eval-live` gets `id-token: write` for Azure OIDC (CodeQL alerts #1–8)

## [0.3.0] — 2026-04-06

### Features

- **Bootstrap scripts** — cross-platform onboarding via `bootstrap.sh` (macOS/Linux) and `bootstrap.ps1` (Windows/PowerShell 7) with CI checks, VS Code/Obsidian detection, and winget fallback (#73)
- **ATU role cards** — added AE, ATS, IA, and ATU Sales Director role cards with outcomes, habits, and measures; enhanced role chooser (#60)
- **Vault sync engine** — bulk CRM→vault sync script (`scripts/helpers/vault-sync.js`) for batch opportunity, milestone, and people note rendering; enhanced vault routing and sync skill
- **M365 data helpers** — normalizer/scorer pipeline for calendar and mail MCP responses (`normalize-calendar.js`, `normalize-mail.js`, `score-meetings.js`, `build-workiq-query.js`)
- **Pattern library skill** — capture, catalog, and reuse proven implementation patterns (code, dashboards, queries, workflows)
- **Squads integration** — 13-agent squad framework with setup scripts, role mapping to existing skills, and installation docs
- **Vault note templates** — added customer, milestone, opportunity, and people note templates for CRM→vault sync
- **SE activity tracking** — create-and-close task rule for hands-on-keyboard activity logging
- **ESLint configuration** — added linting config and scripts for code quality gates
- **Shared patterns & person prompts** — cross-role shared definitions, create-person prompt, partner motion patterns

### Documentation

- **Getting started overhaul** — streamlined 3-step onboarding flow, visual bootstrap guides, Copilot troubleshooting prompts, private-repo clone-first flow
- **MkDocs restructure** — reorganized navigation, removed `navigation.expand`, promoted bootstrap as primary install path
- **Skill & agent descriptions** — updated tool descriptions for clarity, enhanced VS Code prompt support

### Bug Fixes

- **Per-process MCP registries** — scoped npm registries per server process to prevent cross-contamination (#58)
- **Dataview outlinks** — corrected outlinks flattening in project note queries
- **path-to-regexp** — updated to v8.4.1 for security and functionality
- **Bootstrap fixes** — PS variable declaration order, shellcheck scoping, Python `lib/` gitignore pattern
- **Missing skill stubs** — created 3 missing stubs to resolve lint errors

### Chores & Cleanup

- **Legacy skill removal** — removed monolithic skills; transitioned to atomic skill architecture
- **`msx-crm` → `msx` rename** — unified CRM tool namespace across docs and config
- **Removed local MCP server definitions** — simplified to npx-only startup with `@microsoft/msx-mcp-server`
- **GitHub Packages auth** — new auth script and `gh` CLI instructions for private package access

## [0.2.0] — 2026-03-24

### Architecture & Infrastructure

- **Switch to npx server packages** — removed embedded `mcp/msx` and `mcp/oil` subtree directories; MCP servers now launch via `npx` for cleaner dependency management (`662e3a4`)
- **Add `mcp-launcher.js`** — unified MCP server startup script for consistent launch behavior (`3ea9d98`)
- **Remove Excalidraw MCP server** — removed Excalidraw MCP server implementation and related tests (`798d9e7`)
- **Update MCP configuration** — enhanced `.gitignore` for sensitive files, updated MCP config (`71e2c06`)

### Features

- **Comprehensive account review workflows** — added delegation frameworks, CSU commitment validation, and 343-file structural overhaul (`0756d17`, #27)
- **SE productivity, HoK readiness, authority matrix** — new SE productivity review prompt, HoK readiness check skill, wins channel post workflow, and account review enhancements (`12b6953`, #30)
- **HoK engagement processes** — introduced Hands-on-Keyboard engagement workflows and HTTP proxy for authentication (`2d43a88`, `91f671c`, #29)
- **OIL MCP tool optimization** — consolidated OIL tools, added domain routing to reduce tool surface area (`ff1572b`, #28)
- **New retrieval tools** — added related-entity retrieval and semantic search tools with word count utility (`e041e55`, `142e435`)
- **Copilot CLI plugin support** — added `plugin.json` for VS Code Copilot CLI integration (`447b721`, `566a8b0`, #51)
- **Global `mcaps` command** — added global CLI command for easier access from any directory, with checks for existing alias (`a19bdb3`, `54b0e0e`)
- **CRM and GitHub API integrations** — added CRM and GitHub API integrations for the MCAPS-IQ agent (`f0de472`)
- **Team membership fallback** — enhanced deal-team membership handling with fallback mechanisms for CRM operations (`fa797be`)
- **Artifact output directory** — updated generated artifact output to `.copilot/docs/` and improved Teams query scoping descriptions (`3212b16`)

### Bug Fixes

- **TPID auto-resolution** — fixed TPID auto-resolution for vault customer lookups and Windows path normalization (`ce0a3fd`, #32)
- **CRM field correction** — corrected `msp_commitmentrecommendation` value and added `userqueries` entity set (`76da286`, #26)
- **Package metadata** — updated package name and repository URL to reflect correct ownership (`554fb52`)

### Chores & Cleanup

- **Deprecated agent files removed** — removed deprecated CRM, GitHub, and main agent files; streamlined agent configuration and prompts (`85d8043`)
- **`.gitignore` updates** — added `.npmrc` to ignore list, removed deprecated `.npmrc` file (`56b34be`)
- **Repo URLs updated** — bumped sub-package versions for npx publish (`749ddd6`)
- **Upstream sync** — merged `mcp/oil` and `mcp/msx` subtrees from upstream before removal (`325ed3d`, `52529b4`)
- **Added `userqueries` to allowed entities** — upstream merge from microsoft/add-queries (`a93cbf1`, `aef2de4`, #49)

## [0.1.0] — Initial Release

- Initial MCAPS-IQ agent with MCP server integrations (MSX CRM, OIL vault, Power BI)
- MCEM lifecycle skills (Stages 1–5) with role-based routing (Specialist, SE, CSA, CSAM)
- Eval harness with anti-pattern, routing, output-format, and tool-correctness judges
- MkDocs documentation site with architecture, customization, and scenario guides
- One-command setup via `node scripts/init.js`
