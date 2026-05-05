# Context Routing Evaluation (CI/CD)

CI/CD evaluation framework that validates skill/instruction routing accuracy
against a baseline (main branch). Runs on every PR to catch regressions
before they merge.

## How it works

1. Loads skill & instruction frontmatter from two git refs (main vs HEAD)
2. Computes sentence embeddings for skill descriptions and test queries
3. Ranks skills by cosine similarity → Precision, Recall, F1, MRR
4. Compares metrics between refs; fails CI if F1 regresses

**Model**: `Xenova/all-MiniLM-L6-v2` (~23 MB, runs locally via `@xenova/transformers`)

## Quick start

```bash
cd .github/eval
npm install          # first time only
npm run ci           # run all lint + confusion gates
npm run ci:full      # lint + confusion + cross-branch regression
```

## CI Pipeline (2 tiers)

### Tier 1: Fast lint gates (no model download)

| Command | Description |
|---|---|
| `npm run lint` | Skill description quality (length, keywords, fields) |
| `npm run lint:all` | Lint all skills including legacy |
| `npm run lint:inst` | Instruction description quality |
| `npm run lint:cross` | Instructions + cross-check skill ↔ instruction overlap |
| `npm run lint:context` | Context health: discovery, routing, token budgets |
| `npm run lint:context:json` | Context health as JSON (CI artifact) |
| `npm run lint:context:budget` | Token budget analysis only |

### Tier 2: Embedding-based gates (downloads model ~23MB)

| Command | Description |
|---|---|
| `npm run confusion` | Pairwise skill similarity / confusion matrix |
| `npm run confusion:ci` | Confusion matrix with CI exit code |
| `npm run compare` | Cross-branch routing comparison (verbose) |
| `npm run compare:brief` | Cross-branch comparison (summary only) |
| `npm run compare:ci` | Cross-branch with CI exit code (fails on regression) |
| `npm run compare:skills` | Skills only |
| `npm run compare:tools` | Tools only |

### Composite CI commands

| Command | Steps |
|---|---|
| `npm run ci` | lint descriptions + lint instructions + context check + confusion |
| `npm run ci:full` | `ci` + cross-branch regression check |

## Configuration

| Env var | Default | Description |
|---|---|---|
| `THRESHOLD` | `0.35` | Minimum cosine similarity to count a skill as "selected" |
| `TOP_K` | `5` | Max skills shown per test case |
| `F1_REGRESSION_LIMIT` | `0.05` | Max allowed avg F1 drop before CI fails |
| `MAX_CONFUSION_PAIRS` | `5` | Max confusion pairs before CI fails |
| `MAX_SKILL_BODY_TOKENS` | `800` | Per-skill body ceiling |
| `MAX_INST_BODY_TOKENS` | `3500` | Per-instruction body ceiling |
| `MAX_CATALOG_TOKENS` | `6000` | Total catalog metadata ceiling |
| `MAX_TURN_TOKENS` | `25000` | Worst-case single turn ceiling |

Example: `THRESHOLD=0.40 F1_REGRESSION_LIMIT=0.10 npm run compare:ci`

## Metrics

| Metric | Meaning |
|---|---|
| **Precision** | Fraction of selected skills that are expected |
| **Recall** | Fraction of expected skills that were selected |
| **F1** | Harmonic mean of Precision and Recall |
| **MRR** | Mean Reciprocal Rank — how quickly the first expected skill appears |

## Test case format

Edit `test-cases.yaml`. Each case needs:

```yaml
- id: unique-slug
  query: "Natural language user query"
  role: CSAM | CSA | SE | Specialist | any
  stage: 1-5 | any
  category: confusion | semantic | negative  # optional
  expected:                      # flat array of skill files
    - skill-name/SKILL.md
  expected_tools:                # optional — tool routing
    - tool_name
  not_expected:                  # optional — flags false positives
    - unrelated-skill/SKILL.md
```

### Test case categories

| Category | IDs | What it tests |
|---|---|---|
| Role-specific | `csam-*`, `se-*`, `spec-*`, `csa-*` | Correct skill for a known role + stage |
| Cross-role | `cross-*` | Multiple roles involved |
| Multi-skill | `multi-*` | Query should trigger >1 skill |
| Negative | `neg-*` | Off-topic query → 0 skills selected |
| Ambiguous | `ambig-*` | Role-neutral query → best-match routing |
| Confusion | `confuse-*` | Adjacent-skill discrimination |
| Semantic | `semantic-*` | No keyword overlap → pure semantic match |

## GitHub Actions

Runs automatically via `.github/workflows/lint-context.yml` on PRs and pushes
that touch `.github/skills/`, `.github/instructions/`, or `.github/eval/`.

- **Tier 1** (lint gates): Every PR and push to main
- **Tier 2** (regression): PRs only — compares `origin/main` vs `HEAD`

## Limitations

- Embedding similarity is a **proxy** for VS Code's actual routing algorithm
- Does not test `applyTo` glob matching (description-based matching only)
- Token estimates are heuristic (~1.3 tokens/word); use for relative comparisons
- Threshold tuning required; 0.35 is a reasonable starting point for MiniLM

## Iteration workflow

1. Edit skill/instruction descriptions
2. `npm run loading` — check if token budget improved
3. `npm run lint:cross` — verify no new confusion introduced
4. `npm run confusion` — check pairwise similarity
5. `npm run sweep` — find optimal threshold for new descriptions
