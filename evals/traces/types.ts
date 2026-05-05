/**
 * Agent Trace Types — format for captured and golden traces.
 *
 * Used by the trace capture/replay system for regression testing.
 */

export interface TraceToolCall {
  tool: string;
  params: Record<string, unknown>;
  response: unknown;
  durationMs: number;
}

export interface TraceVerification {
  by: string;
  date: string;
  quality: "good" | "acceptable" | "poor";
  notes?: string;
}

export interface AgentTrace {
  /** Unique trace ID */
  id: string;
  /** ISO-8601 capture timestamp */
  capturedAt: string;
  /** Model that produced this trace */
  model: string;
  /** User utterance that triggered the session */
  userUtterance: string;
  /** Scenario context */
  context: {
    role?: string;
    customer?: string;
    mediums?: string[];
  };
  /** Scenario ID from eval suite (if applicable) */
  scenarioId?: string;
  /** Ordered list of tool calls the agent made */
  toolCalls: TraceToolCall[];
  /** Agent's final text output */
  agentOutput: string;
  /** Human verification (null for unverified captures) */
  verified: TraceVerification | null;
  /** Tool schema version — hash of MOCK_TOOLS definitions for staleness detection */
  schemaVersion: string;
  /** Eval scores at capture time */
  scores?: {
    overall: number;
    toolCorrectness?: number;
    antiPatterns?: number;
    outputFormat?: number;
  };
}
