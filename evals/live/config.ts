/**
 * Multi-model eval configuration.
 *
 * Configure via environment variables:
 *   AZURE_OPENAI_ENDPOINT   — required for live evals (Azure OpenAI resource URL)
 *   AZURE_OPENAI_API_VERSION — API version (default: 2025-03-01-preview)
 *   EVAL_MODEL              — primary deployment/model (default: gpt-4o-mini)
 *   EVAL_JUDGE_MODEL        — deployment for LLM-as-judge (default: gpt-4o-mini)
 *   EVAL_MODELS             — comma-separated list for multi-model comparison
 *   EVAL_ITERATIONS         — iterations per scenario for consistency (default: 1)
 *   EVAL_TEMPERATURE        — temperature for agent calls (default: 0)
 *
 * Auth: Azure RBAC via DefaultAzureCredential (az login / managed identity).
 * No API keys needed.
 */

import type { LiveEvalConfig } from "./live-harness.js";

export interface ModelProfile {
  name: string;
  model: string;
  baseURL?: string;
  description: string;
  costPerScenarioUsd: number; // estimated cost
}

// ── Pre-configured model profiles ───────────────────────────────────────────

export const MODEL_PROFILES: ModelProfile[] = [
  {
    name: "gpt-4o-mini",
    model: "gpt-4o-mini",
    description: "Fast, cheap — good for rapid iteration and CI",
    costPerScenarioUsd: 0.005,
  },
  {
    name: "gpt-4o",
    model: "gpt-4o",
    description: "Full-size model — best quality, higher cost",
    costPerScenarioUsd: 0.04,
  },
  {
    name: "gpt-4.1-mini",
    model: "gpt-4.1-mini",
    description: "Next-gen mini — balanced speed and quality",
    costPerScenarioUsd: 0.008,
  },
  {
    name: "gpt-4.1",
    model: "gpt-4.1",
    description: "Next-gen full-size — highest quality",
    costPerScenarioUsd: 0.05,
  },
];

// ── Config builders ─────────────────────────────────────────────────────────

export function buildConfig(overrides?: Partial<LiveEvalConfig>): LiveEvalConfig {
  return {
    model: process.env.EVAL_MODEL ?? "gpt-4o-mini",
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2025-03-01-preview",
    maxTokens: 4096,
    temperature: Number(process.env.EVAL_TEMPERATURE ?? 0),
    iterations: Number(process.env.EVAL_ITERATIONS ?? 1),
    ...overrides,
  };
}

/** Get list of models to compare from EVAL_MODELS env var. */
export function getComparisonModels(): string[] {
  const raw = process.env.EVAL_MODELS ?? "";
  return raw.split(",").map((m) => m.trim()).filter(Boolean);
}

/** Estimate cost for a full eval run. */
export function estimateCost(
  scenarioCount: number,
  models: string[],
  iterations: number,
): { perModel: Map<string, number>; total: number } {
  const perModel = new Map<string, number>();
  let total = 0;

  for (const modelName of models) {
    const profile = MODEL_PROFILES.find((p) => p.model === modelName || p.name === modelName);
    const costPerRun = (profile?.costPerScenarioUsd ?? 0.02) * scenarioCount * iterations;
    perModel.set(modelName, costPerRun);
    total += costPerRun;
  }

  return { perModel, total };
}
