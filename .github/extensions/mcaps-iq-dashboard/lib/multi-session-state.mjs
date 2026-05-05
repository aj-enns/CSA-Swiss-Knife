/**
 * Multi-Session State — manages N concurrent Copilot CLI sessions in-memory.
 * Each session tracks responses, tool calls, thinking, tasks, and metadata.
 * Sessions are evicted 1 hour after ending.
 */

import { randomUUID } from 'crypto';

const MAX_RESPONSES = 200;
const MAX_TOOL_CALLS = 100;
const MAX_THINKING = 50;
const EVICT_AFTER_MS = 60 * 60 * 1000;

const GENERIC_TITLES = new Set([
  'hi', 'hello', 'hey', 'help', 'continue', 'thanks', 'thank you', 'ok', 'okay', 'start', 'go'
]);

function truncateTitle(value, maxLen) {
  if (!value || value.length <= maxLen) return value || '';
  const boundary = value.lastIndexOf(' ', maxLen - 1);
  return value.slice(0, boundary > 20 ? boundary : maxLen - 1).trimEnd() + '…';
}

function normalizeTitleCandidate(value, maxLen = 50) {
  if (value == null) return '';
  let clean = String(value)
    .replace(/\r/g, '')
    .replace(/^\s*\[[^\]]+\]\s*/, '')
    .replace(/[*_`#>]+/g, ' ')
    .replace(/\n.*/s, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = clean.match(/(?:working on|focused on|focus on)\s+(.+)/i);
  if (match?.[1]) clean = match[1].trim();

  clean = clean
    .replace(/^(?:please|can you|could you|would you|help me|i need you to|let's)\s+/i, '')
    .replace(/^["'""]+|["'""]+$/g, '')
    .trim();

  if (!clean || GENERIC_TITLES.has(clean.toLowerCase())) return '';
  return truncateTitle(clean, maxLen);
}

function createSessionState(metadata = {}) {
  const startTime = metadata.startTime ?? Date.now();
  return {
    metadata: {
      startTime,
      cwd: metadata.cwd ?? null,
      branch: metadata.branch ?? null,
      label: metadata.label ?? null,
      nodeVersion: metadata.nodeVersion ?? null,
      status: metadata.status ?? 'active',
      lastSeen: Date.now(),
      endedAt: null
    },
    responses: [],
    backgroundTasks: [],
    toolCalls: [],
    thinking: [],
    pendingApprovals: [],
    pendingUserInputs: [],
    session: {
      startTime,
      isIdle: true,
      errorCount: 0,
      turnCount: 0,
      responseCount: 0,
      taskCount: 0,
      currentIntent: null,
      title: null,
      derivedTitle: null,
      model: null,
      firstUserMessage: null,
      autoApprove: true
    }
  };
}

export function createMultiSessionState() {
  const listeners = new Set();
  const state = { sessions: {} };

  const evictionTimer = setInterval(() => {
    const cutoff = Date.now() - EVICT_AFTER_MS;
    for (const [id, session] of Object.entries(state.sessions)) {
      if (session?.metadata?.status === 'ended' && (session.metadata.endedAt || 0) < cutoff) {
        delete state.sessions[id];
      }
    }
  }, 5 * 60 * 1000);
  evictionTimer.unref?.();

  function emit(type, data) {
    for (const cb of listeners) {
      try { cb(type, data, state); } catch { /* swallow */ }
    }
  }

  function ensureSession(sessionId) {
    if (!state.sessions[sessionId]) {
      state.sessions[sessionId] = createSessionState();
    }
    return state.sessions[sessionId];
  }

  function freezeDerivedTitle(session, candidate, sessionId) {
    if (!session || session.session.derivedTitle || session.session.title) return;
    const normalized = normalizeTitleCandidate(candidate);
    if (!normalized) return;
    session.session.derivedTitle = normalized;
    emit('session:title-derived', { sessionId, title: normalized });
  }

  return {
    getState() { return state; },

    registerSession(sessionId, metadata = {}) {
      state.sessions[sessionId] = createSessionState(metadata);
      emit('session:new', { sessionId, metadata });
      return state.sessions[sessionId];
    },

    removeSession(sessionId) {
      const session = state.sessions[sessionId];
      if (session) {
        session.metadata.status = 'ended';
        session.metadata.endedAt = Date.now();
        session.session.isIdle = true;
        emit('session:end', { sessionId });
      }
    },

    addEvent(sessionId, event) {
      const session = ensureSession(sessionId);
      session.metadata.lastSeen = Date.now();
      session.metadata.status = 'active';
      const { type, data } = event;

      switch (type) {
        case 'response': {
          session.responses.push({
            id: data.id || randomUUID(),
            timestamp: data.timestamp || Date.now(),
            content: data.content,
            agentName: data.agentName || 'assistant',
            raw: data.raw
          });
          session.session.responseCount++;
          if (session.responses.length > MAX_RESPONSES) session.responses.shift();
          freezeDerivedTitle(session, data.content, sessionId);
          break;
        }
        case 'tool:start': {
          session.toolCalls.push({
            id: data.id,
            toolName: data.toolName,
            detail: data.detail,
            arguments: data.arguments || null,
            startTime: data.startTime || Date.now(),
            endTime: null,
            success: null,
            result: null
          });
          if (session.toolCalls.length > MAX_TOOL_CALLS) session.toolCalls.shift();
          break;
        }
        case 'tool:complete': {
          const tc = session.toolCalls.find(t => t.id === data.id);
          if (tc) {
            tc.endTime = Date.now();
            tc.success = data.success !== false;
            tc.result = data.result || null;
          }
          break;
        }
        case 'task:start': {
          session.backgroundTasks.push({
            id: data.id,
            agentName: data.agentName || 'agent',
            description: data.description || '',
            emoji: data.emoji || '⚙️',
            startTime: data.startTime || Date.now(),
            status: 'running',
            output: null
          });
          session.session.taskCount++;
          freezeDerivedTitle(session, data.description, sessionId);
          break;
        }
        case 'task:complete': {
          const task = session.backgroundTasks.find(t => t.id === data.id);
          if (task) {
            task.status = data.status || 'complete';
            task.output = data.output;
            task.endTime = Date.now();
          }
          break;
        }
        case 'thinking': {
          session.thinking.push({
            id: data.id,
            content: data.content,
            timestamp: data.timestamp || Date.now()
          });
          if (session.thinking.length > MAX_THINKING) session.thinking.shift();
          break;
        }
        case 'thinking:delta': {
          const t = session.thinking.find(th => th.id === data.id);
          if (t) t.content = (t.content || '') + (data.deltaContent || '');
          break;
        }
        case 'intent': {
          session.session.currentIntent = data.intent;
          freezeDerivedTitle(session, data.intent, sessionId);
          break;
        }
        case 'session:idle': {
          session.session.isIdle = true;
          break;
        }
        case 'session:error': {
          session.session.errorCount++;
          break;
        }
        case 'session:turn': {
          session.session.turnCount++;
          session.session.isIdle = false;
          break;
        }
        case 'tool:approval-request': {
          session.pendingApprovals.push({
            toolCallId: data.toolCallId,
            toolName: data.toolName || null,
            kind: data.kind || 'unknown',
            fileName: data.fileName || null,
            commandText: data.commandText || null,
            timestamp: data.timestamp || Date.now(),
            status: 'pending'
          });
          if (session.pendingApprovals.length > 50) session.pendingApprovals.shift();
          break;
        }
        case 'tool:approval-resolved': {
          const approval = session.pendingApprovals.find(a => a.toolCallId === data.toolCallId);
          if (approval) approval.status = data.decision || 'resolved';
          break;
        }
        case 'user-input:request': {
          session.pendingUserInputs.push({
            requestId: data.requestId,
            question: data.question || '',
            choices: data.choices || null,
            allowFreeform: data.allowFreeform !== false,
            timestamp: data.timestamp || Date.now(),
            status: 'pending'
          });
          if (session.pendingUserInputs.length > 20) session.pendingUserInputs.shift();
          break;
        }
        case 'user-input:resolved': {
          const uiReq = session.pendingUserInputs.find(u => u.requestId === data.requestId);
          if (uiReq) uiReq.status = 'answered';
          break;
        }
      }

      emit(type, { sessionId, ...data });
    },

    setStatus(sessionId, status) {
      const session = state.sessions[sessionId];
      if (session) session.metadata.status = status;
    },

    onStateChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}
