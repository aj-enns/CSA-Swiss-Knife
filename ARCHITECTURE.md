# Architecture — Repo Map

Quick orientation for new contributors. Full docs live in [`site/docs/`](site/docs/).

## Folder Layout

```
├── evals/                  Evaluation harness & test judges
│   ├── */*.eval.ts           Offline evals (routing, tool-calls, output-format, anti-patterns)
│   ├── live/                 Live evals (require Azure OpenAI + az login)
│   ├── fixtures/             Mock CRM/M365/OIL responses & factory generators
│   ├── judges/               Shared scoring logic (LLM judge, tool-sequence, format)
│   ├── reporters/            Result persistence (json-persist)
│   └── vitest.live.config.ts Live eval Vitest config
│
├── site/                   Documentation site (MkDocs Material)
│   ├── mkdocs.yml            MkDocs config
│   ├── docs/                 Markdown source (architecture, guides, prompts, FAQ)
│   ├── build/                Generated HTML (gitignored)
│   ├── overrides/            MkDocs theme overrides
│   └── requirements.txt      Python deps for MkDocs
│
├── .github/                Agent customizations (Copilot reads these automatically)
│   ├── instructions/         Domain rules (CRM schema, MCEM flow, role cards, query strategy)
│   ├── skills/               43 agent skills (MCEM, pipeline, delivery, M365, PBI, docs…)
│   ├── prompts/              Slash-command prompt files (/daily, /weekly, /morning-prep…)
│   ├── agents/               Agent configs (mcaps, m365-actions, pbi-analyst, doctor)
│   ├── documents/            Reference docs (MCEM stages, CRM schema extended, skill chains)
│   ├── eval/                 Instruction quality linting & scoring
│   └── workflows/            CI — docs deploy, eval runner, lint-context
│
├── scripts/                Setup, launch & CI helpers
│   ├── init.js               One-command setup wizard
│   ├── msx-start.js          Launch MSX MCP server package via npx
│   ├── oil-start.js          Launch OIL MCP server package via npx
│   ├── pbi-start.js          Launch Power BI MCP server
│   ├── capture-fixtures.js   Record live API responses for offline testing
│   └── eval-persist.js       Baseline / diff / history for eval results
│
├── bin/mcaps.js            CLI entry point
├── vitest.config.ts        Offline eval Vitest config
├── package.json            Root workspace — scripts, deps, workspaces
└── tsconfig.json           Root TypeScript config
```

## Key Entry Points

| What you want to do              | Start here                                                            |
| -------------------------------- | --------------------------------------------------------------------- |
| **Use the tool**           | `README.md` → Getting Started                                      |
| **Understand the system**  | `site/docs/architecture/overview.md`                                |
| **Add or edit a skill**    | `.github/skills/<name>/SKILL.md`                                    |
| **Run evals**              | `npm run eval` / `npm run eval:live`                              |
| **Build the doc site**     | `npm run docs:build`                                                |
| **Add an MCP server tool** | Upstream MCP package repo or `mcp/<server>/src/*` for local servers |
| **Write a new prompt**     | `.github/prompts/<name>.prompt.md`                                  |

## npm Scripts (quick reference)

```bash
npm run setup          # One-time install & build
npm run check          # Verify env without installing
npm run eval           # Run offline evals
npm run eval:live      # Run live evals (needs Azure creds)
npm run eval:all       # Both offline + live
npm run docs:serve     # Local MkDocs dev server
npm run docs:build     # Build static site
```
