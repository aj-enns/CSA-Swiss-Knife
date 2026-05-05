/**
 * Live Eval Harness — Phase 2
 *
 * Runs the full agent against mock MCP servers via Azure OpenAI.
 * Uses Azure RBAC (DefaultAzureCredential) — no API keys.
 * Captures tool calls + final output, then feeds them through
 * Phase 1 judges + LLM-as-judge.
 *
 * Write operations are intercepted by the mock servers and staged as no-ops.
 */

import OpenAI from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  MockMcpRecorder,
  MockCrmServer,
  MockOilServer,
  MockM365Server,
  type ToolCallTrace,
  type EvalScenario,
  type EvalResult,
  computeOverallScore,
  passLevel,
} from "../harness.js";
import { judgeToolSequence } from "../judges/tool-sequence.js";
import { judgeAntiPatterns, ALL_ANTI_PATTERNS } from "../judges/anti-pattern.js";
import { judgeOutputFormat } from "../judges/output-format.js";
import { createTraceFromLiveResult } from "../traces/trace-harness.js";
import type { AgentTrace } from "../traces/types.js";
import { writeFileSync, mkdirSync } from "node:fs";

// ── Paths ───────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../..");
const INSTRUCTIONS_DIR = join(WORKSPACE_ROOT, ".github/instructions");
const SKILLS_DIR = join(WORKSPACE_ROOT, ".github/skills");
const COPILOT_INSTRUCTIONS = join(WORKSPACE_ROOT, ".github/copilot-instructions.md");

// ── Config ──────────────────────────────────────────────────────────────────

export interface LiveEvalConfig {
  /** Azure OpenAI deployment name — e.g. "gpt-4o", "gpt-4.1" */
  model: string;
  /** Azure OpenAI endpoint — e.g. https://<resource>.openai.azure.com */
  endpoint?: string;
  /** Azure OpenAI API version */
  apiVersion?: string;
  /** Max tokens for agent response */
  maxTokens?: number;
  /** Temperature — lower = more deterministic eval runs */
  temperature?: number;
  /** Number of iterations per scenario for consistency measurement */
  iterations?: number;
  /** Capture agent traces to evals/traces/captured/ */
  captureTrace?: boolean;
}

export const DEFAULT_CONFIG: LiveEvalConfig = {
  model: process.env.EVAL_MODEL ?? "gpt-4o-mini",
  apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2025-03-01-preview",
  maxTokens: 4096,
  temperature: 0,
  iterations: 1,
};

// ── Azure RBAC client factory ───────────────────────────────────────────────

const AZURE_COGNITIVE_SCOPE = "https://cognitiveservices.azure.com/.default";

let _tokenProvider: (() => Promise<string>) | null = null;

function getTokenProvider(): () => Promise<string> {
  if (!_tokenProvider) {
    const credential = new DefaultAzureCredential({
      tenantId: process.env.AZURE_TENANT_ID,
    });
    _tokenProvider = getBearerTokenProvider(credential, AZURE_COGNITIVE_SCOPE);
  }
  return _tokenProvider;
}

/**
 * Create an OpenAI client targeting Azure AI Foundry via RBAC.
 * Constructs deployment-scoped URL: {endpoint}/openai/deployments/{model}
 */
export async function createAzureClient(config: LiveEvalConfig): Promise<OpenAI> {
  const endpoint = process.env.AZURE_INFERENCE_URL ?? process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) {
    throw new Error("AZURE_INFERENCE_URL or AZURE_OPENAI_ENDPOINT must be set");
  }
  const token = await getTokenProvider()();
  return new OpenAI({
    apiKey: token,
    baseURL: `${endpoint}/openai/deployments/${config.model}`,
    defaultQuery: {
      "api-version": config.apiVersion ?? process.env.AZURE_OPENAI_API_VERSION ?? "2025-03-01-preview",
    },
  });
}

// ── Tool definitions for function calling ───────────────────────────────────

export const MOCK_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  // CRM tools
  {
    type: "function",
    function: {
      name: "msx_crm__crm_whoami",
      description: "Returns the current CRM user identity and role.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__crm_auth_status",
      description: "Check CRM authentication status.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__get_my_active_opportunities",
      description: "Get active opportunities where the current user is owner or on deal team.",
      parameters: {
        type: "object",
        properties: {
          maxResults: { type: "number", description: "Max results to return" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__get_milestones",
      description: "Get engagement milestones. Must include at least one scoping parameter.",
      parameters: {
        type: "object",
        properties: {
          customerKeyword: { type: "string", description: "Customer name filter" },
          opportunityId: { type: "string", description: "Opportunity GUID" },
          statusFilter: { type: "string", description: "Status filter: active, committed, all" },
          includeTasks: { type: "boolean", description: "Include related tasks" },
          tpid: { type: "string", description: "Top Parent ID" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__crm_query",
      description: "Execute an OData query against Dynamics 365.",
      parameters: {
        type: "object",
        properties: {
          entitySet: { type: "string", description: "Entity set name" },
          filter: { type: "string", description: "OData $filter expression" },
          select: { type: "string", description: "OData $select fields" },
          top: { type: "number", description: "Max results" },
        },
        required: ["entitySet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__update_milestone",
      description: "Update a milestone (staged for approval).",
      parameters: {
        type: "object",
        properties: {
          milestoneId: { type: "string", description: "Milestone GUID" },
          payload: { type: "object", description: "Fields to update" },
        },
        required: ["milestoneId", "payload"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__create_task",
      description: "Create a CRM task (staged for approval).",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string" },
          milestoneId: { type: "string" },
          description: { type: "string" },
          scheduledEnd: { type: "string" },
        },
        required: ["subject", "milestoneId"],
      },
    },
  },
  // OIL/Vault tools
  {
    type: "function",
    function: {
      name: "oil__get_vault_context",
      description: "Get vault overview: shape, customer list, recent notes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__get_customer_context",
      description: "Get vault context for a specific customer.",
      parameters: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer name" },
        },
        required: ["customer"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__search_vault",
      description: "Search vault notes by keyword.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__read_note",
      description: "Read a specific note from the vault.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Note path relative to vault root" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__write_note",
      description: "Write or update a vault note (staged, not direct).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  // CRM — additional read tools
  {
    type: "function",
    function: {
      name: "msx_crm__get_milestone_activities",
      description: "Get tasks/activities linked to milestones.",
      parameters: {
        type: "object",
        properties: {
          milestoneIds: { type: "array", items: { type: "string" }, description: "Milestone GUIDs" },
        },
        required: ["milestoneIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__get_milestone_field_options",
      description: "Get picklist options for a milestone field.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", description: "Field name (e.g. workloadType, deliveredBy)" },
        },
        required: ["field"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__get_task_status_options",
      description: "Get task status code metadata.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__crm_get_record",
      description: "Get a single CRM record by entity set and ID.",
      parameters: {
        type: "object",
        properties: {
          entitySet: { type: "string", description: "Entity set name" },
          id: { type: "string", description: "Record GUID" },
          select: { type: "string", description: "OData $select fields" },
        },
        required: ["entitySet", "id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__list_opportunities",
      description: "List opportunities with optional filters.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", description: "OData $filter expression" },
          top: { type: "number", description: "Max results" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__find_milestones_needing_tasks",
      description: "Find committed milestones that have no tasks.",
      parameters: {
        type: "object",
        properties: {
          customerKeyword: { type: "string", description: "Customer name filter" },
        },
      },
    },
  },
  // CRM — additional write tools (staged)
  {
    type: "function",
    function: {
      name: "msx_crm__execute_operation",
      description: "Execute a single staged write operation by its operation ID.",
      parameters: {
        type: "object",
        properties: {
          operationId: { type: "string", description: "Operation ID from staging queue" },
        },
        required: ["operationId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__execute_all",
      description: "Execute all pending staged write operations.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__list_pending_operations",
      description: "List all pending staged write operations.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__create_milestone",
      description: "Create a new milestone (staged for approval).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          opportunityId: { type: "string" },
          workloadType: { type: "string" },
        },
        required: ["name", "opportunityId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__update_task",
      description: "Update a CRM task (staged for approval).",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          payload: { type: "object" },
        },
        required: ["taskId", "payload"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__close_task",
      description: "Close/complete a CRM task (staged for approval).",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__manage_deal_team",
      description: "Add or remove deal team members (staged for approval).",
      parameters: {
        type: "object",
        properties: {
          opportunityId: { type: "string" },
          action: { type: "string", description: "add or remove" },
          userId: { type: "string" },
          role: { type: "string" },
        },
        required: ["opportunityId", "action", "userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "msx_crm__manage_milestone_team",
      description: "Add or remove milestone team members (staged for approval).",
      parameters: {
        type: "object",
        properties: {
          milestoneId: { type: "string" },
          action: { type: "string", description: "add or remove" },
          userId: { type: "string" },
          role: { type: "string" },
        },
        required: ["milestoneId", "action", "userId"],
      },
    },
  },
  // OIL — additional tools
  {
    type: "function",
    function: {
      name: "oil__query_notes",
      description: "Query vault notes by customer, tags, or date range.",
      parameters: {
        type: "object",
        properties: {
          where: { type: "object", description: "Filter criteria" },
          limit: { type: "number", description: "Max results" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__query_graph",
      description: "Query the vault knowledge graph for entity relationships.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", description: "Entity name or type to query" },
          depth: { type: "number", description: "Traversal depth" },
        },
        required: ["entity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__patch_note",
      description: "Patch/update a section of an existing vault note (staged).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          section: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__promote_findings",
      description: "Promote findings from a note to a customer dossier (staged).",
      parameters: {
        type: "object",
        properties: {
          sourcePath: { type: "string" },
          customer: { type: "string" },
        },
        required: ["sourcePath", "customer"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__draft_meeting_note",
      description: "Draft a meeting note from calendar event context (staged).",
      parameters: {
        type: "object",
        properties: {
          eventSubject: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          date: { type: "string" },
        },
        required: ["eventSubject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oil__apply_tags",
      description: "Apply tags to a vault note (staged).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["path", "tags"],
      },
    },
  },
  // WorkIQ
  {
    type: "function",
    function: {
      name: "workiq__ask_work_iq",
      description: "Query Work IQ for meetings, emails, and Teams messages.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language query with top: scope" },
          top: { type: "number", description: "Max results" },
        },
        required: ["query"],
      },
    },
  },
];

// ── Tool name mapping (function-calling safe names ↔ MCP tool names) ────────

function toMcpToolName(fnName: string): string {
  // msx_crm__get_milestones → msx:get_milestones
  return fnName.replace("__", ":").replace("msx_crm", "msx");
}

function fromMcpToolName(mcpName: string): string {
  return mcpName.replace(":", "__").replace("msx", "msx_crm");
}

// ── System prompt assembly ──────────────────────────────────────────────────

export async function assembleSystemPrompt(
  skillName?: string,
  role?: string,
): Promise<string> {
  const parts: string[] = [];

  // Base instructions
  try {
    parts.push(await readFile(COPILOT_INSTRUCTIONS, "utf-8"));
  } catch {
    parts.push("You are an AI assistant for MCAPS account teams.");
  }

  // Relevant instruction files (kept instructions with valuable applyTo scoping)
  const PRIORITY_INSTRUCTIONS = [
    "crm-query-strategy.instructions.md",
    "msx-role-and-write-gate.instructions.md",
  ];

  for (const file of PRIORITY_INSTRUCTIONS) {
    try {
      const content = await readFile(join(INSTRUCTIONS_DIR, file), "utf-8");
      parts.push(`\n--- ${file} ---\n${content}`);
    } catch {
      // Instruction file not found — skip
    }
  }

  // Core skills always loaded (previously instruction files, now canonical in skills)
  const PRIORITY_SKILLS = ["shared-patterns"];
  for (const skill of PRIORITY_SKILLS) {
    try {
      const content = await readFile(join(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
      parts.push(`\n--- SKILL: ${skill} ---\n${content}`);
    } catch {
      // Skill not found
    }
  }

  // Skill-specific instructions
  if (skillName) {
    try {
      const skillPath = join(SKILLS_DIR, skillName, "SKILL.md");
      const content = await readFile(skillPath, "utf-8");
      parts.push(`\n--- SKILL: ${skillName} ---\n${content}`);
    } catch {
      // Skill not found
    }
  }

  // Role context
  if (role) {
    parts.push(`\nThe current user's MSX role is: ${role}.`);
  }

  // Today's date
  parts.push(`\nToday's date is ${new Date().toISOString().slice(0, 10)}.`);

  return parts.join("\n\n");
}

// ── Live agent runner ───────────────────────────────────────────────────────

export interface LiveEvalRunResult {
  scenario: EvalScenario;
  toolCalls: ToolCallTrace[];
  agentOutput: string;
  evalResult: EvalResult;
  stagedWriteCount: number;
  rawMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  durationMs: number;
  model: string;
}

/**
 * Run a single scenario through the live agent loop.
 * The agent runs against mock MCP servers — all writes are staged, never executed.
 */
export async function runLiveScenario(
  scenario: EvalScenario,
  config: LiveEvalConfig = DEFAULT_CONFIG,
): Promise<LiveEvalRunResult> {
  const startTime = Date.now();

  // Setup mocks
  const recorder = new MockMcpRecorder();
  const crm = new MockCrmServer(recorder);
  const oil = new MockOilServer(recorder);
  const m365 = new MockM365Server(recorder);
  await crm.loadFixtures();
  await oil.loadFixtures();

  // Build system prompt
  const systemPrompt = await assembleSystemPrompt(
    scenario.expectedSkill ?? scenario.expectedSkills?.[0] ?? undefined,
    scenario.context?.role,
  );

  // Create Azure OpenAI client (RBAC — no API key)
  const client = await createAzureClient(config);

  // Conversation messages
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: scenario.userUtterance },
  ];

  let agentOutput = "";
  const MAX_TURNS = 10; // Safety limit to prevent infinite loops

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.chat.completions.create({
      model: config.model,
      messages,
      tools: MOCK_TOOLS,
      tool_choice: "auto",
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    });

    const choice = response.choices[0];
    if (!choice) break;

    const message = choice.message;
    messages.push(message);

    // If no tool calls, the agent is done
    if (!message.tool_calls || message.tool_calls.length === 0) {
      agentOutput = message.content ?? "";
      break;
    }

    // Process tool calls — route to mock servers
    for (const toolCall of message.tool_calls) {
      const fnName = toolCall.function.name;
      const mcpName = toMcpToolName(fnName);
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        params = {};
      }

      // Route to mock server
      let result: unknown;
      if (mcpName.startsWith("msx:")) {
        result = crm.handle(mcpName, params);
      } else if (mcpName.startsWith("oil:")) {
        result = oil.handle(mcpName, params);
      } else if (mcpName.startsWith("workiq:")) {
        result = m365.handle(mcpName, params);
      } else {
        result = m365.handle(mcpName, params);
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // If the model also produced text alongside tool calls, capture it
    if (message.content) {
      agentOutput += message.content;
    }
  }

  // Run Phase 1 judges on the recorded trace
  const toolResult = scenario.expectedCalls
    ? judgeToolSequence(
        recorder.calls,
        scenario.expectedCalls,
        scenario.forbiddenCalls,
      )
    : undefined;

  const apResult = judgeAntiPatterns(
    recorder.calls,
    scenario.forbiddenPatterns
      ? ALL_ANTI_PATTERNS.filter((p) =>
          scenario.forbiddenPatterns!.includes(p.id),
        )
      : ALL_ANTI_PATTERNS,
    scenario.context
      ? {
          role: scenario.context.role,
          customer: scenario.context.customer,
          mediums: scenario.context.mediums,
        }
      : undefined,
  );

  const outputResult = scenario.outputValidation
    ? judgeOutputFormat(agentOutput, scenario.outputValidation)
    : undefined;

  const evalResult: EvalResult = {
    scenarioId: scenario.id,
    dimensions: {
      toolCorrectness: toolResult
        ? {
            pass: toolResult.pass,
            missing: toolResult.missing,
            extra: toolResult.extra,
            orderViolations: toolResult.orderViolations,
            score: toolResult.score,
          }
        : undefined,
      antiPatterns: {
        pass: apResult.pass,
        violations: apResult.violations,
        score: apResult.score,
      },
      outputFormat: outputResult
        ? {
            pass: outputResult.pass,
            missingSections: outputResult.missingSections,
            missingColumns: outputResult.missingColumns,
            score: outputResult.score,
          }
        : undefined,
    },
    overallScore: 0,
    pass: false,
  };

  evalResult.overallScore = computeOverallScore(evalResult);
  evalResult.pass = passLevel(evalResult.overallScore) === "pass";

  const liveResult: LiveEvalRunResult = {
    scenario,
    toolCalls: recorder.calls,
    agentOutput,
    evalResult,
    stagedWriteCount: crm.stagedWrites.length,
    rawMessages: messages,
    durationMs: Date.now() - startTime,
    model: config.model,
  };

  // Capture trace if requested
  if (config.captureTrace) {
    const capturedDir = resolve(import.meta.dirname, "../traces/captured");
    mkdirSync(capturedDir, { recursive: true });
    const trace: AgentTrace = createTraceFromLiveResult(liveResult);
    const tracePath = join(capturedDir, `${scenario.id}-${Date.now()}.trace.json`);
    writeFileSync(tracePath, JSON.stringify(trace, null, 2));
  }

  return liveResult;
}

/**
 * Run multiple scenarios and return aggregated results.
 */
export async function runLiveEvalSuite(
  scenarios: EvalScenario[],
  config: LiveEvalConfig = DEFAULT_CONFIG,
): Promise<LiveEvalRunResult[]> {
  const results: LiveEvalRunResult[] = [];

  for (const scenario of scenarios) {
    const iterations = config.iterations ?? 1;
    for (let i = 0; i < iterations; i++) {
      const result = await runLiveScenario(scenario, config);
      results.push(result);
    }
  }

  return results;
}
