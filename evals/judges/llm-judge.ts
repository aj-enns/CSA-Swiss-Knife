/**
 * LLM-as-Judge — subjective quality evaluation for dimensions
 * that can't be rule-checked (synthesis quality, risk surfacing,
 * role appropriateness, conciseness).
 *
 * Uses a separate LLM call with a structured rubric prompt.
 * Write operations: none — this is read-only evaluation.
 */

import OpenAI from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

// ── Types ───────────────────────────────────────────────────────────────────

export interface LlmJudgeDimension {
  id: string;
  name: string;
  description: string;
  rubric: string;
  passThreshold: number; // 1-5 scale, typically 3
}

export interface LlmJudgeResult {
  dimension: string;
  score: number; // 1-5
  reasoning: string;
  pass: boolean;
}

export interface LlmJudgeReport {
  results: LlmJudgeResult[];
  overallScore: number;
  pass: boolean;
  model: string;
  durationMs: number;
}

// ── Dimension definitions ───────────────────────────────────────────────────

export const JUDGE_DIMENSIONS: LlmJudgeDimension[] = [
  {
    id: "synthesis",
    name: "Cross-Medium Synthesis",
    description: "Did the agent connect signals from multiple mediums (CRM, vault, M365) into a coherent picture?",
    rubric: `1: Used only one medium, ignored available context from other sources.
2: Mentioned multiple mediums but didn't connect them meaningfully.
3: Connected data from 2+ mediums, but missed obvious cross-references.
4: Strong cross-medium synthesis — correlated CRM state with vault/M365 signals.
5: Exceptional — surfaced non-obvious connections, flagged gaps between mediums.`,
    passThreshold: 3,
  },
  {
    id: "risk_surfacing",
    name: "Proactive Risk Surfacing",
    description: "Did the agent proactively flag risks with evidence, name the role to act, and suggest minimum intervention?",
    rubric: `1: No risk mentioned despite clear risk signals in the data.
2: Risk mentioned vaguely without evidence or actionable next steps.
3: Risk flagged with evidence and general suggestion.
4: Risk flagged with specific evidence, named responsible role, and concrete action.
5: Exceptional — multiple risk layers surfaced with prioritization and evidence chain.`,
    passThreshold: 3,
  },
  {
    id: "role_appropriateness",
    name: "Role Boundary Respect",
    description: "Did the agent respect the user's MSX role boundaries and not overstep?",
    rubric: `1: Gave guidance for a different role entirely (e.g., CSAM advice to an SE).
2: Mostly correct role, but included out-of-scope actions.
3: Respected role boundaries, appropriate guidance for the role.
4: Strong role awareness — tailored language, actions, and priorities to the role.
5: Exceptional — proactively noted role boundaries and cross-role handoff points.`,
    passThreshold: 3,
  },
  {
    id: "conciseness",
    name: "Action-Oriented Conciseness",
    description: "Is the output concise, structured, and action-oriented rather than verbose?",
    rubric: `1: Wall of text, unstructured prose, no clear actions.
2: Some structure but overly verbose, buried action items.
3: Reasonably structured with clear actions, some unnecessary prose.
4: Well-structured tables/bullets, clear action items, minimal filler.
5: Exceptional — maximally concise, every sentence adds value, perfect structure.`,
    passThreshold: 3,
  },
  {
    id: "table_compliance",
    name: "Table Format Compliance",
    description: "When milestones or opportunities are shown, are they in proper table format with required columns?",
    rubric: `1: No tables — everything in prose when tables were required.
2: Tables present but missing >2 required columns.
3: Tables present with most required columns, minor gaps.
4: Proper tables with all required columns and formatting.
5: Exceptional — tables with all columns, deep-links, and supplementary context.`,
    passThreshold: 3,
  },
];

// ── Judge execution ─────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator for an AI sales operations assistant. Your job is to score the quality of the assistant's response across specific dimensions.

You will receive:
1. The user's original request
2. The assistant's response
3. The evaluation dimension with a rubric

Score the response on a 1-5 scale using the rubric provided. Be precise and objective.

IMPORTANT: Return your evaluation as valid JSON with this exact structure:
{"score": <1-5>, "reasoning": "<1-2 sentences explaining the score>"}

Do not include any text outside the JSON object.`;

/**
 * Run the LLM judge on a single dimension.
 */
async function judgeDimension(
  client: OpenAI,
  model: string,
  userUtterance: string,
  agentOutput: string,
  dimension: LlmJudgeDimension,
): Promise<LlmJudgeResult> {
  const userPrompt = `## User Request
${userUtterance}

## Assistant Response
${agentOutput}

## Evaluation Dimension: ${dimension.name}
${dimension.description}

## Rubric
${dimension.rubric}

Score this response on the ${dimension.name} dimension (1-5). Return JSON: {"score": <1-5>, "reasoning": "<explanation>"}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 256,
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? '{"score": 1, "reasoning": "No response"}';
  let parsed: { score: number; reasoning: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { score: 1, reasoning: `Failed to parse judge response: ${content.slice(0, 100)}` };
  }

  const score = Math.max(1, Math.min(5, Math.round(parsed.score)));

  return {
    dimension: dimension.id,
    score,
    reasoning: parsed.reasoning,
    pass: score >= dimension.passThreshold,
  };
}

// ── Retry with exponential backoff (spec §5.4) ─────────────────────────────

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isRetryable = status === 429 || status === 503 || (err instanceof Error && err.message.includes("timeout"));
      if (!isRetryable || attempt === maxRetries) throw err;
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 10_000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}

/**
 * Run the LLM judge across all dimensions for one scenario.
 */
export async function runLlmJudge(
  userUtterance: string,
  agentOutput: string,
  config: {
    model?: string;
    dimensions?: LlmJudgeDimension[];
  } = {},
): Promise<LlmJudgeReport> {
  const startTime = Date.now();
  const model = config.model ?? process.env.EVAL_JUDGE_MODEL ?? "gpt-4o-mini";
  const dimensions = config.dimensions ?? JUDGE_DIMENSIONS;

  const credential = new DefaultAzureCredential({
    tenantId: process.env.AZURE_TENANT_ID,
  });
  const tokenProvider = getBearerTokenProvider(
    credential,
    "https://cognitiveservices.azure.com/.default",
  );
  const token = await tokenProvider();
  const endpoint = process.env.AZURE_INFERENCE_URL ?? process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) throw new Error("AZURE_INFERENCE_URL or AZURE_OPENAI_ENDPOINT must be set for LLM judge");
  const client = new OpenAI({
    apiKey: token,
    baseURL: `${endpoint}/openai/deployments/${model}`,
    defaultQuery: {
      "api-version": process.env.AZURE_OPENAI_API_VERSION ?? "2025-03-01-preview",
    },
  });

  const results: LlmJudgeResult[] = [];

  // Run dimensions sequentially with retry to respect rate limits
  for (const dim of dimensions) {
    const result = await callWithRetry(() =>
      judgeDimension(client, model, userUtterance, agentOutput, dim),
    );
    results.push(result);
  }

  const overallScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / (results.length * 5)
    : 0;

  return {
    results,
    overallScore,
    pass: results.every((r) => r.pass),
    model,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Format a judge report as a human-readable string.
 */
export function formatJudgeReport(report: LlmJudgeReport): string {
  const lines = [
    `## LLM Judge Report (${report.model})`,
    `Overall: ${(report.overallScore * 100).toFixed(0)}% | ${report.pass ? "✅ PASS" : "❌ FAIL"}`,
    `Duration: ${report.durationMs}ms`,
    "",
    "| Dimension | Score | Pass | Reasoning |",
    "|-----------|-------|------|-----------|",
  ];

  for (const r of report.results) {
    const dim = JUDGE_DIMENSIONS.find((d) => d.id === r.dimension);
    const name = dim?.name ?? r.dimension;
    const passIcon = r.pass ? "✅" : "❌";
    lines.push(`| ${name} | ${r.score}/5 | ${passIcon} | ${r.reasoning} |`);
  }

  return lines.join("\n");
}
