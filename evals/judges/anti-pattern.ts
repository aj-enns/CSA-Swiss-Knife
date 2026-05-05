/**
 * Anti-Pattern Judge — detects known bad patterns from the spec (AP-001 through AP-010).
 * Pure rule-based, no LLM dependency.
 */

import type { ToolCallTrace } from "../harness.js";

export interface AntiPatternRule {
  id: string;
  description: string;
  check: (calls: ToolCallTrace[], context?: AntiPatternContext) => AntiPatternMatch | null;
}

export interface AntiPatternContext {
  role?: string;
  customer?: string;
  mediums?: string[];
}

export interface AntiPatternMatch {
  id: string;
  tool: string;
  reason: string;
}

export interface AntiPatternResult {
  pass: boolean;
  violations: AntiPatternMatch[];
  checkedPatterns: string[];
  score: number;
}

// ── Pattern definitions ─────────────────────────────────────────────────────

const AP_001: AntiPatternRule = {
  id: "AP-001",
  description: "get_milestones() called with no scoping parameter",
  check(calls) {
    const milestoneCall = calls.find(
      (c) => c.tool === "msx:get_milestones" || c.tool === "get_milestones",
    );
    if (!milestoneCall) return null;
    const params = milestoneCall.params;
    // Must have at least one scoping param
    const hasScope =
      params.customerKeyword ||
      params.opportunityId ||
      params.statusFilter ||
      params.tpid;
    if (!hasScope) {
      return {
        id: "AP-001",
        tool: milestoneCall.tool,
        reason: "get_milestones called without any scoping parameter (customerKeyword, opportunityId, statusFilter, tpid)",
      };
    }
    return null;
  },
};

const AP_002: AntiPatternRule = {
  id: "AP-002",
  description: "crm_query using wrong entity set (msp_milestones instead of msp_engagementmilestones)",
  check(calls) {
    const queryCall = calls.find(
      (c) =>
        (c.tool === "msx:crm_query" || c.tool === "crm_query") &&
        typeof c.params.entitySet === "string" &&
        c.params.entitySet.includes("msp_milestones") &&
        !c.params.entitySet.includes("msp_engagementmilestones"),
    );
    if (!queryCall) return null;
    return {
      id: "AP-002",
      tool: queryCall.tool,
      reason: `Used entity set "${queryCall.params.entitySet}" — correct set is "msp_engagementmilestones"`,
    };
  },
};

const AP_003: AntiPatternRule = {
  id: "AP-003",
  description: "Loop: sequential per-opportunity milestone calls instead of batched query",
  check(calls) {
    const milestoneCalls = calls.filter(
      (c) => c.tool === "msx:get_milestones" || c.tool === "get_milestones",
    );

    if (milestoneCalls.length <= 2) return null;

    const SCOPING_KEYS = ["customerKeyword", "opportunityId", "tpid", "statusFilter"];
    const groups = new Map<string, number>();

    for (const call of milestoneCalls) {
      const scope = SCOPING_KEYS
        .filter((k) => {
          const value = call.params[k];
          if (value == null) return false;
          if (typeof value === "string") return value.trim().length > 0;
          return true;
        })
        .sort()
        .join("+") || "UNSCOPED";

      groups.set(scope, (groups.get(scope) ?? 0) + 1);
    }

    for (const [scope, count] of groups) {
      if (count > 2) {
        return {
          id: "AP-003",
          tool: "get_milestones",
          reason: `${count} milestone calls with scope "${scope}" — likely N+1 loop.`,
        };
      }
    }

    return null;
  },
};

const AP_004: AntiPatternRule = {
  id: "AP-004",
  description: "Skipping vault when OIL is available",
  check(calls, context) {
    if (context?.mediums && !context.mediums.includes("vault")) {
      return null;
    }

    const hasCrmCall = calls.some((c) => c.tool.startsWith("msx:"));
    const hasVaultCall = calls.some((c) => c.tool.startsWith("oil:"));
    // If CRM was used but vault was not, and this is a customer lookup scenario,
    // vault should have been checked first
    if (hasCrmCall && !hasVaultCall) {
      return {
        id: "AP-004",
        tool: "oil:get_vault_context",
        reason: "CRM tools were called but vault was not consulted — vault-first pattern violated",
      };
    }
    return null;
  },
};

const AP_005: AntiPatternRule = {
  id: "AP-005",
  description: "CRM write without human-in-the-loop confirmation",
  check(calls) {
    const WRITE_TOOLS = new Set([
      "msx:create_milestone",
      "msx:update_milestone",
      "msx:create_task",
      "msx:update_task",
      "msx:close_task",
      "msx:manage_deal_team",
      "msx:manage_milestone_team",
    ]);

    for (const call of calls) {
      if (!WRITE_TOOLS.has(call.tool)) continue;
      // Check if it went through staging (approval queue)
      const wasStaged =
        typeof call.response === "object" &&
        call.response !== null &&
        "staged" in call.response &&
        (call.response as Record<string, unknown>).staged === true;

      // Check if execute_operation was called (direct execution bypass)
      const directExecute = calls.some(
        (c) =>
          c.tool === "msx:execute_operation" ||
          c.tool === "msx:execute_all",
      );

      if (!wasStaged && directExecute) {
        return {
          id: "AP-005",
          tool: call.tool,
          reason: "CRM write executed without going through staging/approval queue",
        };
      }
    }
    return null;
  },
};

const AP_006: AntiPatternRule = {
  id: "AP-006",
  description: "Guessing CRM property names not in entity schema",
  check(calls) {
    // Known incorrect property names that agents sometimes hallucinate
    const BAD_PROPS = [
      "msp_stage",           // correct: msp_activesalesstage
      "closedate",           // correct: estimatedclosedate
      "msp_closedate",       // correct: msp_estcompletiondate
      "msp_milestone_name",  // correct: msp_name
      "milestone_status",    // correct: msp_milestonestatus
      "msp_milestones",      // correct entity: msp_engagementmilestones
    ];

    for (const call of calls) {
      if (!call.tool.includes("crm_query") && !call.tool.includes("crm_get_record")) continue;
      const filter = String(call.params.filter ?? "");
      const select = String(call.params.select ?? "");
      const combined = `${filter} ${select}`;
      for (const bad of BAD_PROPS) {
        if (combined.includes(bad)) {
          return {
            id: "AP-006",
            tool: call.tool,
            reason: `Used guessed property "${bad}" — check crm-entity-schema for correct names`,
          };
        }
      }
    }
    return null;
  },
};

const AP_007: AntiPatternRule = {
  id: "AP-007",
  description: "crm_query to entity set not in ALLOWED_ENTITY_SETS",
  check(calls) {
    const ALLOWED = new Set([
      "accounts", "contacts", "opportunities",
      "msp_engagementmilestones", "msp_dealteams", "msp_workloads",
      "tasks", "systemusers", "transactioncurrencies",
      "connections", "connectionroles", "processstages", "teams",
      "EntityDefinitions",
    ]);

    for (const call of calls) {
      if (!call.tool.includes("crm_query")) continue;
      const entitySet = String(call.params.entitySet ?? "");
      const base = entitySet.split("(")[0].split("/")[0];
      if (base && !ALLOWED.has(base)) {
        return {
          id: "AP-007",
          tool: call.tool,
          reason: `Entity set "${base}" is not in entity allowlist`,
        };
      }
    }
    return null;
  },
};

const AP_008: AntiPatternRule = {
  id: "AP-008",
  description: "Treating vault cached state as live CRM truth",
  check(_calls) {
    // This requires semantic analysis of agent reasoning — deferred to LLM judge (Phase 2)
    return null;
  },
};

const AP_009: AntiPatternRule = {
  id: "AP-009",
  description: "Unbounded M365/WorkIQ retrieval (missing top/limit param)",
  check(calls) {
    for (const call of calls) {
      if (!call.tool.includes("workiq") && !call.tool.includes("ask_work_iq")) continue;
      const query = String(call.params.query ?? "");
      // WorkIQ queries should have top or limit scoping
      if (!query.includes("top:") && !call.params.top && !call.params.limit) {
        return {
          id: "AP-009",
          tool: call.tool,
          reason: "WorkIQ query without top/limit scoping — may return excessive results",
        };
      }
    }
    return null;
  },
};

const AP_010: AntiPatternRule = {
  id: "AP-010",
  description: "Role assumption without crm_whoami or explicit confirmation",
  check(calls) {
    const hasWhoami = calls.some(
      (c) => c.tool === "msx:crm_whoami" || c.tool === "crm_whoami",
    );
    const hasWrite = calls.some((c) => {
      const tool = c.tool.replace("msx:", "");
      return [
        "create_milestone", "update_milestone",
        "create_task", "update_task", "close_task",
      ].includes(tool);
    });

    // Write actions without prior whoami check
    if (hasWrite && !hasWhoami) {
      return {
        id: "AP-010",
        tool: "msx:crm_whoami",
        reason: "Write operations performed without prior crm_whoami role verification",
      };
    }
    return null;
  },
};

// ── All patterns ────────────────────────────────────────────────────────────

const AP_011: AntiPatternRule = {
  id: "AP-011",
  description: "get_milestones() called with entity/customer scope but no statusFilter — returns all milestones including completed/cancelled",
  check(calls) {
    for (const call of calls) {
      if (call.tool !== "msx:get_milestones" && call.tool !== "get_milestones") continue;
      const params = call.params;
      // Has entity scope (customerKeyword, opportunityId, etc.) but no statusFilter
      const hasEntityScope =
        params.customerKeyword ||
        params.opportunityKeyword ||
        params.opportunityId ||
        params.opportunityIds ||
        params.tpid ||
        params.mine;
      const hasStatusFilter = params.statusFilter;
      // Direct lookups by milestone ID/number don't need statusFilter
      const isDirectLookup = params.milestoneId || params.milestoneNumber;
      if (hasEntityScope && !hasStatusFilter && !isDirectLookup) {
        return {
          id: "AP-011",
          tool: call.tool,
          reason: `get_milestones called with scope (${Object.keys(params).filter(k => params[k]).join(", ")}) but no statusFilter — will return all milestones including completed/cancelled. Add statusFilter: 'active' unless all milestones are explicitly needed.`,
        };
      }
    }
    return null;
  },
};

export const ALL_ANTI_PATTERNS: AntiPatternRule[] = [
  AP_001, AP_002, AP_003, AP_004, AP_005,
  AP_006, AP_007, AP_008, AP_009, AP_010, AP_011,
];

/** Get a subset of patterns by ID. */
export function getPatterns(ids: string[]): AntiPatternRule[] {
  const idSet = new Set(ids);
  return ALL_ANTI_PATTERNS.filter((p) => idSet.has(p.id));
}

// ── Severity weights (spec §5.3) ────────────────────────────────────────────

const AP_SEVERITY: Record<string, number> = {
  "AP-001": 0.30, // unscoped query — high blast radius
  "AP-002": 0.25, // wrong entity set — data integrity
  "AP-003": 0.30, // N+1 loop — performance + token burn
  "AP-004": 0.20, // vault skip — context gap
  "AP-005": 0.35, // write without staging — safety critical
  "AP-006": 0.25, // guessed props — data integrity
  "AP-007": 0.20, // bad entity set — schema discipline
  "AP-008": 0.10, // stale cache — deferred to LLM judge
  "AP-009": 0.15, // unbounded WorkIQ — perf
  "AP-010": 0.25, // role assumption — safety
  "AP-011": 0.25, // missing statusFilter — payload bloat, context burn
};

const DEFAULT_SEVERITY = 0.20;

// ── Judge ───────────────────────────────────────────────────────────────────

/**
 * Run anti-pattern detection against a set of tool call traces.
 * @param calls - recorded tool calls
 * @param patterns - which patterns to check (defaults to all)
 */
export function judgeAntiPatterns(
  calls: ToolCallTrace[],
  patterns: AntiPatternRule[] = ALL_ANTI_PATTERNS,
  context?: AntiPatternContext,
): AntiPatternResult {
  const violations: AntiPatternMatch[] = [];
  const checkedPatterns: string[] = [];

  for (const pattern of patterns) {
    checkedPatterns.push(pattern.id);
    const match = pattern.check(calls, context);
    if (match) violations.push(match);
  }

  // Severity-weighted scoring (spec §5.3)
  const totalPenalty = violations.reduce(
    (sum, v) => sum + (AP_SEVERITY[v.id] ?? DEFAULT_SEVERITY),
    0,
  );
  const score = Math.max(0, 1 - totalPenalty);

  return {
    pass: violations.length === 0,
    violations,
    checkedPatterns,
    score,
  };
}
