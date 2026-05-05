/**
 * Tool Sequence Judge — validates that expected tool calls are present,
 * correctly parameterized, and properly ordered.
 */

import type { ToolCallTrace } from "../harness.js";

export interface ToolSequenceResult {
  pass: boolean;
  missing: string[];
  extra: string[];
  orderViolations: string[];
  paramMismatches: Array<{ tool: string; field: string; expected: unknown; actual: unknown }>;
  score: number;
}

interface ExpectedCall {
  tool: string;
  params?: Record<string, unknown>;
  paramsContains?: Record<string, unknown>;
  order?: number;
  phase?: number;
  before?: string;
}

interface ForbiddenCall {
  tool: string;
  params?: Record<string, unknown>;
}

/**
 * Match tool names with wildcard support.
 * "msx:*" matches any tool starting with "msx:".
 */
function toolMatches(pattern: string, actual: string): boolean {
  if (pattern.endsWith(":*")) {
    return actual.startsWith(pattern.slice(0, -1));
  }
  return pattern === actual;
}

function paramsMatch(
  actualParams: Record<string, unknown>,
  expectedParams?: Record<string, unknown>,
  expectedContains?: Record<string, unknown>,
): { exactMismatches: number; containsMismatches: number } {
  let exactMismatches = 0;
  let containsMismatches = 0;

  if (expectedParams) {
    for (const [key, val] of Object.entries(expectedParams)) {
      if (actualParams[key] !== val) exactMismatches++;
    }
  }

  if (expectedContains) {
    for (const [key, val] of Object.entries(expectedContains)) {
      if (actualParams[key] !== val) containsMismatches++;
    }
  }

  return { exactMismatches, containsMismatches };
}

export function judgeToolSequence(
  actual: ToolCallTrace[],
  expected: ExpectedCall[],
  forbidden?: ForbiddenCall[],
): ToolSequenceResult {
  const missing: string[] = [];
  const paramMismatches: ToolSequenceResult["paramMismatches"] = [];
  const orderViolations: string[] = [];

  // Check expected calls are present
  for (const exp of expected) {
    const candidates = actual.filter((a) => toolMatches(exp.tool, a.tool));
    const found = candidates.length <= 1
      ? candidates[0]
      : candidates
          .map((candidate) => ({
            candidate,
            mismatch: paramsMatch(candidate.params, exp.params, exp.paramsContains),
          }))
          .sort((a, b) => {
            if (a.mismatch.containsMismatches !== b.mismatch.containsMismatches) {
              return a.mismatch.containsMismatches - b.mismatch.containsMismatches;
            }
            if (a.mismatch.exactMismatches !== b.mismatch.exactMismatches) {
              return a.mismatch.exactMismatches - b.mismatch.exactMismatches;
            }
            return actual.indexOf(a.candidate) - actual.indexOf(b.candidate);
          })[0]?.candidate;

    if (!found) {
      missing.push(exp.tool);
      continue;
    }

    // Check exact params
    if (exp.params) {
      for (const [key, val] of Object.entries(exp.params)) {
        if (found.params[key] !== val) {
          paramMismatches.push({
            tool: exp.tool,
            field: key,
            expected: val,
            actual: found.params[key],
          });
        }
      }
    }

    // Check param subset (contains)
    if (exp.paramsContains) {
      for (const [key, val] of Object.entries(exp.paramsContains)) {
        if (found.params[key] !== val) {
          paramMismatches.push({
            tool: exp.tool,
            field: key,
            expected: val,
            actual: found.params[key],
          });
        }
      }
    }

    // Check ordering constraints
    if (exp.before) {
      const expIdx = actual.indexOf(found);
      const beforeTarget = actual.find((a) => toolMatches(exp.before!, a.tool));
      if (beforeTarget) {
        const beforeIdx = actual.indexOf(beforeTarget);
        if (expIdx > beforeIdx) {
          orderViolations.push(`${exp.tool} should come before ${exp.before}`);
        }
      }
    }
  }

  // Check order numbers (sequential ordering)
  const orderedExpected = expected.filter((e) => e.order != null).sort((a, b) => a.order! - b.order!);
  for (let i = 0; i < orderedExpected.length - 1; i++) {
    const curr = orderedExpected[i];
    const next = orderedExpected[i + 1];
    const currIdx = actual.findIndex((a) => toolMatches(curr.tool, a.tool));
    const nextIdx = actual.findIndex((a) => toolMatches(next.tool, a.tool));
    if (currIdx !== -1 && nextIdx !== -1 && currIdx > nextIdx) {
      orderViolations.push(
        `${curr.tool} (order ${curr.order}) appeared after ${next.tool} (order ${next.order})`,
      );
    }
  }

  // Check extra calls (tools called but not expected)
  const expectedTools = new Set(expected.map((e) => e.tool));
  const extra = actual
    .filter((a) => ![...expectedTools].some((exp) => toolMatches(exp, a.tool)))
    .map((a) => a.tool);

  // Check forbidden calls
  if (forbidden) {
    for (const f of forbidden) {
      const found = actual.find((a) => {
        if (!toolMatches(f.tool, a.tool)) return false;
        if (!f.params) return true;
        return Object.entries(f.params).every(([k, v]) => a.params[k] === v);
      });
      if (found) {
        missing.push(`FORBIDDEN: ${f.tool} was called`);
      }
    }
  }

  // Score: proportion of checks passed
  const totalChecks = expected.length + (forbidden?.length ?? 0);
  const failedChecks = missing.length + paramMismatches.length + orderViolations.length;
  const score = totalChecks > 0 ? Math.max(0, 1 - failedChecks / totalChecks) : 1;
  const pass = missing.length === 0 && paramMismatches.length === 0 && orderViolations.length === 0;

  return { pass, missing, extra, orderViolations, paramMismatches, score };
}
