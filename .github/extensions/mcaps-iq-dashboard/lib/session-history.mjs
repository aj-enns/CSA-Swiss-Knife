/**
 * Session History Reader — reads Copilot CLI session history from the
 * SQLite session-store.db and filesystem session-state/ directories.
 *
 * Provides a unified view of all historical sessions for Mission Control.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { homedir } from 'os';

const COPILOT_DIR = join(homedir(), '.copilot');
const SESSION_STORE_DB = join(COPILOT_DIR, 'session-store.db');
const SESSION_STATE_DIR = join(COPILOT_DIR, 'session-state');

// ── Path safety ────────────────────────────────────────────────

/** Validate that a session ID is safe for use in path construction.
 *  Copilot session IDs are UUIDs — reject anything else. */
const SAFE_SESSION_ID = /^[a-zA-Z0-9_-]+$/;

function safeSessionPath(...segments) {
  for (const seg of segments) {
    if (typeof seg !== 'string' || !SAFE_SESSION_ID.test(seg)) {
      throw new Error('Invalid session ID');
    }
  }
  return join(SESSION_STATE_DIR, ...segments);
}

// ── SQLite helper ──────────────────────────────────────────────

function querySqlite(db, sql) {
  try {
    const raw = execFileSync('sqlite3', ['-json', db, sql], {
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return JSON.parse(raw.toString());
  } catch {
    return [];
  }
}

// ── Session listing ────────────────────────────────────────────

/**
 * List sessions from the SQLite session store with optional filters.
 * Returns sessions sorted by most recently updated.
 *
 * @param {Object} opts
 * @param {number} [opts.limit=50]
 * @param {number} [opts.offset=0]
 * @param {string} [opts.cwd] - Filter by working directory (substring match)
 * @param {string} [opts.repository] - Filter by repository
 * @param {string} [opts.search] - Search in summary text
 * @returns {{ sessions: Array, total: number }}
 */
export function listSessionHistory(opts = {}) {
  const { limit = 50, offset = 0, cwd, repository, search } = opts;

  if (!existsSync(SESSION_STORE_DB)) {
    return { sessions: [], total: 0 };
  }

  const conditions = [];
  if (cwd) conditions.push(`cwd LIKE '%${escapeSql(cwd)}%'`);
  if (repository) conditions.push(`repository = '${escapeSql(repository)}'`);
  if (search) conditions.push(`summary LIKE '%${escapeSql(search)}%'`);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countRows = querySqlite(SESSION_STORE_DB,
    `SELECT count(*) as total FROM sessions ${where};`
  );
  const total = countRows[0]?.total || 0;

  // Get sessions with turn counts
  const sessions = querySqlite(SESSION_STORE_DB, `
    SELECT
      s.id as sessionId,
      s.summary,
      s.cwd,
      s.repository,
      s.branch,
      s.host_type as hostType,
      s.created_at as createdAt,
      s.updated_at as updatedAt,
      COALESCE(tc.turn_count, 0) as turnCount
    FROM sessions s
    LEFT JOIN (
      SELECT session_id, count(*) as turn_count
      FROM turns
      GROUP BY session_id
    ) tc ON tc.session_id = s.id
    ${where}
    ORDER BY s.updated_at DESC
    LIMIT ${limit} OFFSET ${offset};
  `);

  return {
    sessions: sessions.map(s => {
      try {
        const stateDir = safeSessionPath(s.sessionId);
        return { ...s, hasStateDir: existsSync(stateDir), canResume: existsSync(stateDir) };
      } catch {
        return { ...s, hasStateDir: false, canResume: false };
      }
    }),
    total
  };
}

/**
 * Get detailed session info including turns and workspace metadata.
 */
export function getSessionDetail(sessionId) {
  if (!existsSync(SESSION_STORE_DB)) return null;

  const sessions = querySqlite(SESSION_STORE_DB, `
    SELECT id as sessionId, summary, cwd, repository, branch,
           host_type as hostType, created_at as createdAt, updated_at as updatedAt
    FROM sessions WHERE id = '${escapeSql(sessionId)}';
  `);

  if (!sessions.length) return null;
  const session = sessions[0];

  // Get turns
  const turns = querySqlite(SESSION_STORE_DB, `
    SELECT turn_index as turnIndex,
           substr(user_message, 1, 500) as userMessage,
           substr(assistant_response, 1, 500) as assistantResponse,
           timestamp
    FROM turns
    WHERE session_id = '${escapeSql(sessionId)}'
    ORDER BY turn_index ASC;
  `);

  // Read workspace.yaml if available
  let workspace = null;
  let hasEvents = false;
  let stateFiles = [];
  let canResume = false;
  try {
    const stateDir = safeSessionPath(sessionId);
    const wsPath = join(stateDir, 'workspace.yaml');
    if (existsSync(wsPath)) {
      try { workspace = readFileSync(wsPath, 'utf8'); } catch { /* noop */ }
    }
    const eventsPath = join(stateDir, 'events.jsonl');
    hasEvents = existsSync(eventsPath);
    if (existsSync(stateDir)) {
      try { stateFiles = readdirSync(stateDir); } catch { /* noop */ }
    }
    canResume = existsSync(stateDir);
  } catch { /* invalid session ID — skip state dir access */ }

  return {
    ...session,
    turns,
    workspace,
    hasEvents,
    stateFiles,
    canResume
  };
}

/**
 * Get full turn history for a session.
 */
export function getSessionTurns(sessionId, { limit = 100, offset = 0 } = {}) {
  if (!existsSync(SESSION_STORE_DB)) return { turns: [], total: 0 };

  const countRows = querySqlite(SESSION_STORE_DB,
    `SELECT count(*) as total FROM turns WHERE session_id = '${escapeSql(sessionId)}';`
  );
  const total = countRows[0]?.total || 0;

  const turns = querySqlite(SESSION_STORE_DB, `
    SELECT turn_index as turnIndex,
           user_message as userMessage,
           assistant_response as assistantResponse,
           timestamp
    FROM turns
    WHERE session_id = '${escapeSql(sessionId)}'
    ORDER BY turn_index ASC
    LIMIT ${limit} OFFSET ${offset};
  `);

  return { turns, total };
}

/**
 * Search across all session summaries and turn messages.
 */
export function searchSessions(query, { limit = 20 } = {}) {
  if (!existsSync(SESSION_STORE_DB) || !query) return [];

  const escaped = escapeSql(query);

  // Search in summaries
  const summaryHits = querySqlite(SESSION_STORE_DB, `
    SELECT id as sessionId, summary, cwd, repository, branch,
           created_at as createdAt, updated_at as updatedAt,
           'summary' as matchType
    FROM sessions
    WHERE summary LIKE '%${escaped}%'
    ORDER BY updated_at DESC
    LIMIT ${limit};
  `);

  // Search in turn messages
  const turnHits = querySqlite(SESSION_STORE_DB, `
    SELECT DISTINCT s.id as sessionId, s.summary, s.cwd, s.repository, s.branch,
           s.created_at as createdAt, s.updated_at as updatedAt,
           'turn' as matchType,
           substr(t.user_message, 1, 200) as matchedContent
    FROM turns t
    JOIN sessions s ON s.id = t.session_id
    WHERE t.user_message LIKE '%${escaped}%'
    ORDER BY s.updated_at DESC
    LIMIT ${limit};
  `);

  // Deduplicate by sessionId, prefer summary hits
  const seen = new Set();
  const results = [];
  for (const hit of [...summaryHits, ...turnHits]) {
    if (!seen.has(hit.sessionId)) {
      seen.add(hit.sessionId);
      results.push(hit);
    }
  }
  return results.slice(0, limit);
}

/**
 * Get aggregate stats about all sessions.
 */
export function getSessionStats() {
  if (!existsSync(SESSION_STORE_DB)) {
    return { totalSessions: 0, totalTurns: 0, repositories: [], recentActivity: [] };
  }

  const totals = querySqlite(SESSION_STORE_DB, `
    SELECT
      (SELECT count(*) FROM sessions) as totalSessions,
      (SELECT count(*) FROM turns) as totalTurns;
  `);

  const repos = querySqlite(SESSION_STORE_DB, `
    SELECT repository, count(*) as sessionCount
    FROM sessions
    WHERE repository IS NOT NULL AND repository != ''
    GROUP BY repository
    ORDER BY sessionCount DESC
    LIMIT 20;
  `);

  const recent = querySqlite(SESSION_STORE_DB, `
    SELECT date(updated_at) as day, count(*) as sessionCount
    FROM sessions
    WHERE updated_at >= datetime('now', '-30 days')
    GROUP BY date(updated_at)
    ORDER BY day DESC;
  `);

  return {
    ...(totals[0] || { totalSessions: 0, totalTurns: 0 }),
    repositories: repos,
    recentActivity: recent
  };
}

// ── SQL injection prevention ───────────────────────────────────

function escapeSql(val) {
  return String(val).replace(/'/g, "''");
}
