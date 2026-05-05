/**
 * MCAPS IQ Dashboard — Copilot CLI Extension Entry Point
 *
 * Uses the @github/copilot-sdk/extension joinSession() API for proper SDK
 * integration with all 6 hooks. Connects to a shared dashboard server via
 * WebSocket and relays session events. Provides Mission Control tools for
 * session history browsing and prompt delegation.
 */

import { joinSession } from '@github/copilot-sdk/extension';
import { CopilotClient } from '@github/copilot-sdk';
import { join } from 'path';
import { exec, execSync } from 'child_process';
import { randomUUID } from 'crypto';

import { createSessionClient } from './lib/session-client.mjs';
import { filterResponse } from './lib/response-filter.mjs';
import { deriveToolDetail } from './lib/tool-event-detail.mjs';
import { ensureServer } from './lib/server-launcher.mjs';
import {
  listSessionHistory,
  getSessionDetail,
  searchSessions,
  getSessionStats
} from './lib/session-history.mjs';

const DEFAULT_PORT = 3850;
const PUBLIC_DIR = join(import.meta.dirname, 'public');

let sessionClient = null;
let serverPort = DEFAULT_PORT;
let filterOptions = { showCode: false, verbosity: 'normal' };

// ── Tool approval state ────────────────────────────────────────

let autoApprove = true;
const pendingApprovals = new Map();
const pendingUserInputs = new Map();

// ── Copilot SDK client (for model discovery + session listing) ─

let copilotClient = null;

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
  } catch { return null; }
}

function parseAgentDescription(description) {
  if (!description || typeof description !== 'string') {
    return { emoji: '🔧', agentName: 'agent', task: description || '' };
  }
  const match = description.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s+([^:]+):\s*(.*)/su);
  if (match) {
    return { emoji: match[1], agentName: match[2].trim(), task: match[3].trim() };
  }
  return { emoji: '🔧', agentName: 'agent', task: description };
}

// ── Model discovery ────────────────────────────────────────────

async function fetchAndPushModels() {
  if (!sessionClient || !sessionClient.isConnected() || !copilotClient) return;
  try {
    const models = await copilotClient.listModels();
    const compact = models.map(m => ({
      id: m.id,
      name: m.name,
      capabilities: m.capabilities || {},
      supportedReasoningEfforts: m.supportedReasoningEfforts || null
    }));
    sessionClient.pushEvent('models:update', { models: compact });
  } catch {
    // Model listing not available — dashboard falls back to empty list
  }
}

// ── Dashboard init ─────────────────────────────────────────────

// Forward reference — session assigned after joinSession()
let session = null;

async function initDashboard(source) {
  if (sessionClient) return;

  try {
    const { port, isNew } = await ensureServer({
      port: DEFAULT_PORT,
      publicDir: PUBLIC_DIR,
      repoRoot: process.cwd()
    });
    serverPort = port;

    const metadata = {
      startTime: Date.now(),
      cwd: process.cwd(),
      branch: getBranch(),
      label: null,
      nodeVersion: process.version
    };
    sessionClient = createSessionClient({ port, sessionId: session?.sessionId || randomUUID(), metadata });
    await sessionClient.connect();

    sessionClient.onChat((message) => {
      if (session) {
        setTimeout(() => {
          session.send({ prompt: message }).catch(() => {});
        }, 0);
      }
    });

    sessionClient.onFilterChange((data) => {
      if (data.showCode !== undefined) filterOptions.showCode = data.showCode;
      if (data.verbosity) filterOptions.verbosity = data.verbosity;
    });

    sessionClient.onToolApproval((data) => {
      const { toolCallId, decision } = data;
      const pending = pendingApprovals.get(toolCallId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingApprovals.delete(toolCallId);
      pending.resolve(decision === 'approve'
        ? { kind: 'approved' }
        : { kind: 'denied-interactively-by-user' });
    });

    sessionClient.onAutoApproveChange((value) => {
      autoApprove = !!value;
    });

    sessionClient.onStop(async () => {
      try {
        if (session) await session.abort();
        sessionClient?.pushEvent('session:stopped', { timestamp: Date.now() });
      } catch {
        // Session may already be idle
      }
    });

    sessionClient.onUserInputResponse((data) => {
      const { requestId, answer, wasFreeform } = data;
      const pending = pendingUserInputs.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingUserInputs.delete(requestId);
      pending.resolve({ answer: answer || '', wasFreeform: wasFreeform !== false });
    });

    if (source === 'startup' && isNew) {
      openBrowser(`http://127.0.0.1:${serverPort}`);
    }

    fetchAndPushModels().catch(() => {});

    if (session) {
      await session.log(`📊 MCAPS IQ Dashboard available at http://127.0.0.1:${serverPort}`);
    }
  } catch (err) {
    try { if (session) await session.log(`⚠️ MCAPS IQ Dashboard failed: ${err.message}`); } catch { /* noop */ }
    sessionClient = null;
  }
}

// ── Extension entry point — joinSession ────────────────────────

// Create a standalone CopilotClient for model listing and session discovery.
// joinSession() only gives us the session — we need the client for listSessions().
try {
  copilotClient = new CopilotClient({ isChildProcess: true });
} catch {
  // Some environments may not support standalone client creation.
  // Session listing will fall back to SQLite reader.
  copilotClient = null;
}

session = await joinSession({

  // ── Permission handling ──────────────────────────────────────

  onPermissionRequest: (request) => {
    if (autoApprove || !sessionClient || !sessionClient.isConnected()) {
      return { kind: 'approved' };
    }

    const toolCallId = request.toolCallId || randomUUID();
    sessionClient.pushEvent('tool:approval-request', {
      toolCallId,
      toolName: request.toolName || null,
      kind: request.kind,
      fileName: request.fileName || null,
      commandText: request.fullCommandText || null,
      timestamp: Date.now()
    });

    return new Promise((resolve) => {
      const APPROVAL_TIMEOUT_MS = 120_000;
      const timer = setTimeout(() => {
        pendingApprovals.delete(toolCallId);
        resolve({ kind: 'denied-interactively-by-user' });
      }, APPROVAL_TIMEOUT_MS);
      pendingApprovals.set(toolCallId, { resolve, timer });
    });
  },

  // ── User input handling ──────────────────────────────────────

  onUserInputRequest: async (request) => {
    if (sessionClient && sessionClient.isConnected()) {
      const requestId = randomUUID();
      sessionClient.pushEvent('user-input:request', {
        requestId,
        question: request.question || '',
        choices: request.choices || null,
        allowFreeform: request.allowFreeform !== false,
        timestamp: Date.now()
      });

      return new Promise((resolve) => {
        const USER_INPUT_TIMEOUT_MS = 300_000;
        const timer = setTimeout(() => {
          pendingUserInputs.delete(requestId);
          resolve({ answer: '', wasFreeform: true });
        }, USER_INPUT_TIMEOUT_MS);
        pendingUserInputs.set(requestId, { resolve, timer });
      });
    }
    return { answer: '', wasFreeform: true };
  },

  // ── All 6 Hooks ──────────────────────────────────────────────

  hooks: {
    // 1. Session Start — init dashboard, inject context
    async onSessionStart(input) {
      await initDashboard(input?.source || 'startup');

      return {
        additionalContext:
          'MCAPS IQ Mission Control extension is active. ' +
          'Available tools: dashboard_status, list_sessions, search_sessions, ' +
          'get_session_detail, delegate_prompt. Use list_sessions to browse ' +
          'past Copilot CLI conversations and delegate_prompt to send work ' +
          'to a previous session context.'
      };
    },

    // 2. User Prompt Submitted — relay to dashboard
    async onUserPromptSubmitted(input) {
      sessionClient?.pushEvent('user:prompt', {
        prompt: input.prompt,
        timestamp: Date.now()
      });
      // No modification — pass through unchanged
      return {};
    },

    // 3. Pre-Tool-Use — relay to dashboard, enforce policies
    async onPreToolUse(input) {
      sessionClient?.pushEvent('tool:pre-use', {
        toolName: input.toolName,
        timestamp: Date.now()
      });
      // No blocking/modification by default — dashboard shows tool execution
      return {};
    },

    // 4. Post-Tool-Use — relay results to dashboard
    async onPostToolUse(input) {
      sessionClient?.pushEvent('tool:post-use', {
        toolName: input.toolName,
        success: input.toolResult?.resultType !== 'failure',
        timestamp: Date.now()
      });
      return {};
    },

    // 5. Error Occurred — auto-retry recoverable tool errors
    async onErrorOccurred(input) {
      sessionClient?.pushEvent('session:error-hook', {
        error: input.error,
        context: input.errorContext,
        recoverable: input.recoverable,
        timestamp: Date.now()
      });

      if (input.recoverable && input.errorContext === 'tool_execution') {
        return { errorHandling: 'retry', retryCount: 2 };
      }
      return {
        errorHandling: 'abort',
        userNotification: `Error in ${input.errorContext}: ${input.error}`
      };
    },

    // 6. Session End — cleanup dashboard, generate summary
    async onSessionEnd(input) {
      if (sessionClient) {
        try {
          sessionClient.pushEvent('session:idle', { backgroundTasks: [] });
        } catch { /* noop */ }
        try { sessionClient.close(); } catch { /* noop */ }
        sessionClient = null;
      }

      return {
        sessionSummary: `Session ended (${input?.reason || 'unknown'}).`,
        cleanupActions: ['Dashboard connection closed']
      };
    }
  },

  // ── Custom Tools — Mission Control ───────────────────────────

  tools: [
    // Dashboard status
    {
      name: 'dashboard_status',
      description: 'Returns the MCAPS IQ Dashboard URL and connection status',
      parameters: { type: 'object', properties: {} },
      skipPermission: true,
      handler: async () => {
        let connCount = 0;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 200);
          const res = await fetch(`http://127.0.0.1:${serverPort}/api/health`, { signal: controller.signal });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            connCount = data.sessions ?? 0;
          }
        } catch { /* noop */ }
        return {
          textResultForLlm: `MCAPS IQ Dashboard: http://127.0.0.1:${serverPort} — ${connCount} active session(s)`,
          resultType: 'success'
        };
      }
    },

    // List all historical sessions (Mission Control)
    {
      name: 'list_sessions',
      description:
        'List past Copilot CLI sessions from session history. ' +
        'Returns session IDs, summaries, timestamps, repos, and turn counts. ' +
        'Use to browse conversation history and find sessions to resume or delegate to.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max sessions to return (default 20)' },
          offset: { type: 'number', description: 'Pagination offset' },
          repository: { type: 'string', description: 'Filter by repository (owner/repo)' },
          cwd: { type: 'string', description: 'Filter by working directory' },
          search: { type: 'string', description: 'Search in session summaries' }
        }
      },
      skipPermission: true,
      handler: async (args) => {
        // Try SDK client first (live query), fall back to SQLite reader
        let sessions = [];
        let total = 0;

        if (copilotClient) {
          try {
            const filter = {};
            if (args.repository) filter.repository = args.repository;
            if (args.cwd) filter.cwd = args.cwd;
            const allSessions = await copilotClient.listSessions(
              Object.keys(filter).length > 0 ? filter : undefined
            );

            // Apply search filter client-side if needed
            let filtered = allSessions;
            if (args.search) {
              const q = args.search.toLowerCase();
              filtered = allSessions.filter(s =>
                (s.summary || '').toLowerCase().includes(q)
              );
            }

            total = filtered.length;
            const offset = args.offset || 0;
            const limit = args.limit || 20;
            sessions = filtered.slice(offset, offset + limit).map(s => ({
              sessionId: s.sessionId,
              summary: s.summary || '(no summary)',
              startTime: s.startTime?.toISOString?.() || s.startTime,
              modifiedTime: s.modifiedTime?.toISOString?.() || s.modifiedTime,
              cwd: s.context?.cwd || null,
              repository: s.context?.repository || null,
              branch: s.context?.branch || null,
              isRemote: s.isRemote
            }));
          } catch {
            // SDK listing failed, fall back to SQLite
            sessions = [];
          }
        }

        // Fallback: SQLite reader
        if (sessions.length === 0) {
          const result = listSessionHistory({
            limit: args.limit || 20,
            offset: args.offset || 0,
            cwd: args.cwd,
            repository: args.repository,
            search: args.search
          });
          sessions = result.sessions;
          total = result.total;
        }

        const statsLine = `Showing ${sessions.length} of ${total} sessions.`;
        const table = sessions.map(s =>
          `• [${s.sessionId?.slice(0, 8)}] ${s.summary || '(no summary)'} — ` +
          `${s.repository || s.cwd || 'unknown'} ` +
          `(${s.modifiedTime || s.updatedAt || '?'})`
        ).join('\n');

        return {
          textResultForLlm: `${statsLine}\n\n${table}`,
          resultType: 'success'
        };
      }
    },

    // Search sessions
    {
      name: 'search_sessions',
      description:
        'Search past Copilot CLI sessions by content — finds matches in ' +
        'summaries and conversation turns. Use to locate specific past work.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      },
      skipPermission: true,
      handler: async (args) => {
        const results = searchSessions(args.query, { limit: 15 });
        if (results.length === 0) {
          return { textResultForLlm: 'No sessions found matching that query.', resultType: 'success' };
        }

        const lines = results.map(r =>
          `• [${r.sessionId?.slice(0, 8)}] ${r.summary || '(no summary)'} ` +
          `(${r.matchType}${r.matchedContent ? ': "' + r.matchedContent.slice(0, 80) + '…"' : ''}) — ` +
          `${r.repository || r.cwd || ''} ${r.updatedAt || ''}`
        ).join('\n');

        return {
          textResultForLlm: `Found ${results.length} matching sessions:\n\n${lines}`,
          resultType: 'success'
        };
      }
    },

    // Get session detail
    {
      name: 'get_session_detail',
      description:
        'Get detailed info about a specific past session including turn history, ' +
        'workspace context, and resumability. Use the sessionId from list_sessions.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID to inspect' }
        },
        required: ['sessionId']
      },
      skipPermission: true,
      handler: async (args) => {
        // Try SDK first
        if (copilotClient) {
          try {
            const meta = await copilotClient.getSessionMetadata(args.sessionId);
            if (meta) {
              const detail = getSessionDetail(args.sessionId); // Enrich with SQLite data
              const turns = detail?.turns || [];
              const turnSummary = turns.slice(0, 10).map(t =>
                `  Turn ${t.turnIndex}: ${(t.userMessage || '').slice(0, 120)}…`
              ).join('\n');

              return {
                textResultForLlm:
                  `Session: ${meta.sessionId}\n` +
                  `Summary: ${meta.summary || '(none)'}\n` +
                  `Started: ${meta.startTime}\n` +
                  `Modified: ${meta.modifiedTime}\n` +
                  `CWD: ${meta.context?.cwd || 'unknown'}\n` +
                  `Repo: ${meta.context?.repository || 'unknown'}\n` +
                  `Branch: ${meta.context?.branch || 'unknown'}\n` +
                  `Can Resume: ${detail?.canResume ?? 'unknown'}\n` +
                  `Turns (${turns.length}):\n${turnSummary || '  (no turns in DB)'}`,
                resultType: 'success'
              };
            }
          } catch { /* fall through */ }
        }

        // Fallback: SQLite
        const detail = getSessionDetail(args.sessionId);
        if (!detail) {
          return { textResultForLlm: 'Session not found.', resultType: 'failure' };
        }

        const turnSummary = (detail.turns || []).slice(0, 10).map(t =>
          `  Turn ${t.turnIndex}: ${(t.userMessage || '').slice(0, 120)}…`
        ).join('\n');

        return {
          textResultForLlm:
            `Session: ${detail.sessionId}\n` +
            `Summary: ${detail.summary || '(none)'}\n` +
            `Created: ${detail.createdAt}\n` +
            `Updated: ${detail.updatedAt}\n` +
            `CWD: ${detail.cwd || 'unknown'}\n` +
            `Repo: ${detail.repository || 'unknown'}\n` +
            `Can Resume: ${detail.canResume}\n` +
            `State files: ${(detail.stateFiles || []).join(', ')}\n` +
            `Turns (${detail.turns?.length || 0}):\n${turnSummary || '  (no turns)'}`,
          resultType: 'success'
        };
      }
    },

    // Delegate prompt to a past session
    {
      name: 'delegate_prompt',
      description:
        'Send a prompt to a past Copilot CLI session, resuming it with new work. ' +
        'The session runs asynchronously — use this for delegating tasks to a ' +
        'session that has prior context (e.g., an earlier customer conversation). ' +
        'The prompt is dispatched via the CLI --resume mechanism.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Target session ID to resume and delegate to' },
          prompt: { type: 'string', description: 'The prompt/instruction to send to that session' }
        },
        required: ['sessionId', 'prompt']
      },
      handler: async (args) => {
        const { sessionId: targetId, prompt } = args;

        // Verify session exists
        let exists = false;
        if (copilotClient) {
          try {
            const meta = await copilotClient.getSessionMetadata(targetId);
            exists = !!meta;
          } catch { /* fall through */ }
        }
        if (!exists) {
          const detail = getSessionDetail(targetId);
          exists = !!detail?.canResume;
        }

        if (!exists) {
          return {
            textResultForLlm: `Session ${targetId} not found or cannot be resumed.`,
            resultType: 'failure'
          };
        }

        // Dispatch via CLI subprocess: copilot --resume=<id> -p "<prompt>" --allow-all-tools
        try {
          const { execFile } = await import('child_process');
          const copilotBin = process.env.COPILOT_PATH || 'copilot';

          const child = execFile(copilotBin, [
            `--resume=${targetId}`,
            '--allow-all-tools',
            '-p', prompt
          ], {
            cwd: process.cwd(),
            timeout: 300_000, // 5 min max
            maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env }
          }, (err, stdout, stderr) => {
            // Fire and forget — results go to that session's log
            if (err) {
              sessionClient?.pushEvent('delegation:error', {
                targetSessionId: targetId,
                error: err.message,
                timestamp: Date.now()
              });
            } else {
              sessionClient?.pushEvent('delegation:complete', {
                targetSessionId: targetId,
                resultPreview: (stdout || '').slice(0, 500),
                timestamp: Date.now()
              });
            }
          });

          // Don't block — the delegation runs asynchronously
          sessionClient?.pushEvent('delegation:dispatched', {
            targetSessionId: targetId,
            prompt: prompt.slice(0, 200),
            timestamp: Date.now()
          });

          return {
            textResultForLlm:
              `Delegated prompt to session ${targetId.slice(0, 8)}… ` +
              `The session will resume with the prior context and execute: "${prompt.slice(0, 100)}…"`,
            resultType: 'success'
          };
        } catch (err) {
          return {
            textResultForLlm: `Failed to delegate: ${err.message}`,
            resultType: 'failure'
          };
        }
      }
    },

    // Session stats for Mission Control overview
    {
      name: 'session_stats',
      description: 'Get aggregate statistics about Copilot CLI session history — total sessions, turns, repos, recent activity.',
      parameters: { type: 'object', properties: {} },
      skipPermission: true,
      handler: async () => {
        const stats = getSessionStats();
        const repoLines = stats.repositories.slice(0, 5).map(r =>
          `  ${r.repository}: ${r.sessionCount} sessions`
        ).join('\n');
        const activityLines = stats.recentActivity.slice(0, 7).map(d =>
          `  ${d.day}: ${d.sessionCount} sessions`
        ).join('\n');

        return {
          textResultForLlm:
            `Session History Stats:\n` +
            `  Total sessions: ${stats.totalSessions}\n` +
            `  Total turns: ${stats.totalTurns}\n\n` +
            `Top repositories:\n${repoLines || '  (none)'}\n\n` +
            `Recent activity (last 7 days):\n${activityLines || '  (none)'}`,
          resultType: 'success'
        };
      }
    }
  ]
});

// ── Session events ─────────────────────────────────────────────

session.on('assistant.message', (event) => {
  if (!event?.data?.content) return;
  const raw = event.data.content;
  const { filtered } = filterResponse(raw, filterOptions);
  sessionClient?.pushEvent('response', {
    id: randomUUID(),
    timestamp: Date.now(),
    content: filtered,
    agentName: event.data.agentName || 'assistant',
    raw
  });
});

session.on('tool.execution_start', (event) => {
  if (!event?.data) return;
  const { toolCallId, toolName, arguments: args } = event.data;
  const detail = deriveToolDetail(toolName, args);

  let argsSnapshot = null;
  try {
    const raw = typeof args === 'string' ? args : JSON.stringify(args);
    argsSnapshot = raw && raw.length > 2000 ? raw.slice(0, 2000) + '…' : raw;
  } catch { /* noop */ }

  sessionClient?.pushEvent('tool:start', {
    id: toolCallId, toolName, detail, startTime: Date.now(), arguments: argsSnapshot
  });

  if (toolName === 'task' && args) {
    const parsed = typeof args === 'string' ? args : args;
    const desc = typeof parsed === 'string' ? parsed : parsed.description || parsed.prompt || '';
    const { emoji, agentName, task } = parseAgentDescription(desc);
    const resolvedAgent = (typeof parsed === 'object' && parsed.agentName)
      ? parsed.agentName
      : agentName;
    sessionClient?.pushEvent('task:start', {
      id: toolCallId, agentName: resolvedAgent, description: task, emoji, startTime: Date.now()
    });
  }
});

session.on('tool.execution_complete', (event) => {
  if (!event?.data) return;
  const { toolCallId, toolName, success, result, error } = event.data;

  let resultSnapshot = null;
  try {
    const raw = error ? `Error: ${error}` : (typeof result === 'string' ? result : JSON.stringify(result));
    resultSnapshot = raw && raw.length > 1500 ? raw.slice(0, 1500) + '…' : raw;
  } catch { /* noop */ }

  sessionClient?.pushEvent('tool:complete', {
    id: toolCallId, toolName, success: success !== false, result: resultSnapshot
  });

  if (toolName === 'task') {
    const output = error ? `Error: ${error}` : (typeof result === 'string' ? result : 'done');
    sessionClient?.pushEvent('task:complete', {
      id: toolCallId, status: success !== false ? 'complete' : 'failed', output
    });
  }
});

session.on('session.idle', (event) => {
  sessionClient?.pushEvent('session:idle', { backgroundTasks: event?.data?.backgroundTasks });
});

session.on('session.error', (event) => {
  sessionClient?.pushEvent('session:error', {
    message: event?.data?.message || 'Unknown error', context: event?.data
  });
});

session.on('assistant.turn_start', () => {
  sessionClient?.pushEvent('session:turn', { timestamp: Date.now() });
});

session.on('assistant.reasoning', (event) => {
  if (!event?.data) return;
  const { reasoningId, content } = event.data;
  if (reasoningId && content) {
    sessionClient?.pushEvent('thinking', { id: reasoningId, content, timestamp: Date.now() });
  }
});

session.on('assistant.reasoning_delta', (event) => {
  if (!event?.data) return;
  const { reasoningId, deltaContent } = event.data;
  if (reasoningId && deltaContent) {
    sessionClient?.pushEvent('thinking:delta', { id: reasoningId, deltaContent });
  }
});

session.on('assistant.intent', (event) => {
  if (!event?.data) return;
  const { intent } = event.data;
  if (intent) {
    sessionClient?.pushEvent('intent', { intent });
  }
});

// Eager init for mid-session reloads
initDashboard('resume').catch(() => {});
