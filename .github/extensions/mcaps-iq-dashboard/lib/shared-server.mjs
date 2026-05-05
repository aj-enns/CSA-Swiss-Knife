/**
 * Shared Server — Express + WebSocket server for the MCAPS IQ Dashboard.
 * Serves the SPA, relays session events between extensions and browsers,
 * provides API endpoints for skills, settings, and CRM data.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { resolve, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';

import { createMultiSessionState } from './multi-session-state.mjs';
import { readAllCapabilities } from './skills-reader.mjs';
import { createCrmClient } from './crm-client.mjs';
import { createCronScheduler, validateCron, describeCron } from './cron-scheduler.mjs';
import { createOilClient } from './oil-client.mjs';
import {
  listSessionHistory,
  getSessionDetail,
  getSessionTurns,
  searchSessions,
  getSessionStats
} from './session-history.mjs';

const PORT = Number(process.env.MCAPS_IQ_PORT || 3850);
const PUBLIC_DIR = process.env.MCAPS_IQ_PUBLIC_DIR || join(import.meta.dirname, '..', 'public');
const REPO_ROOT = process.env.MCAPS_IQ_REPO_ROOT || process.cwd();
const SHUTDOWN_GRACE_MS = 5 * 60 * 1000;
const VIEWER_HEARTBEAT_MS = 30_000;
const SESSION_HEARTBEAT_MS = 10_000;
const DISCONNECT_TIMEOUT_MS = 30_000;

// ── Rate limiters (express-rate-limit — recognized by CodeQL) ──

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,  // local server — generous limit to avoid false 429s on multi-view navigation
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' }
});

const execLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,  // exec/write ops — still throttled but less aggressive
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' }
});

const stateManager = createMultiSessionState();
const viewerClients = new Set();
const sessionClients = new Map();
const sessionTimers = new Map();
let shutdownTimer = null;
let cachedCapabilities = null;

// ── Settings persistence ───────────────────────────────────────

const SETTINGS_PATH = join(REPO_ROOT, '.mcaps-iq-settings.json');

function readSettings() {
  try {
    if (existsSync(SETTINGS_PATH)) {
      return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch { /* corrupt file */ }
  return { role: null, priorityAccounts: [], displayPrefs: { showCode: false, verbosity: 'normal' } };
}

function writeSettings(settings) {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// ── Cron Scheduler ─────────────────────────────────────────────

const SCHEDULES_PATH = join(REPO_ROOT, '.mcaps-iq-schedules.json');

const scheduler = createCronScheduler({
  filePath: SCHEDULES_PATH,
  onTrigger: (schedule) => {
    console.log(`[mcaps-iq] Cron fired: "${schedule.name}" → ${schedule.prompt}`);
    // Send prompt to the most recent active session (if any)
    const targetWs = findActiveSessionWs();
    if (targetWs) {
      targetWs.send(JSON.stringify({
        type: 'chat:forward',
        message: schedule.prompt
      }));
    }
    // Broadcast to viewers so UI updates
    broadcast('schedule:fired', {
      scheduleId: schedule.id,
      name: schedule.name,
      prompt: schedule.prompt,
      firedAt: new Date().toISOString(),
      hadSession: !!targetWs
    });
  },
  onError: (err, schedule) => {
    console.error(`[mcaps-iq] Cron error for "${schedule?.name}":`, err.message);
  }
});

/** Find the WebSocket for the most recently registered session. */
function findActiveSessionWs() {
  // Pick last-registered session that is still open
  let lastWs = null;
  for (const [, ws] of sessionClients) {
    if (ws.readyState === 1 /* WebSocket.OPEN */) lastWs = ws;
  }
  return lastWs;
}

// ── Express app ────────────────────────────────────────────────

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
wss.on('error', () => {});

app.use(express.json({ limit: '1mb' }));

// Static files (not rate-limited — local assets served directly)
const resolvedPublic = resolve(PUBLIC_DIR);
app.use(express.static(resolvedPublic, { setHeaders: (res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
}}));
app.get('/', (_req, res) => res.sendFile(resolve(resolvedPublic, 'index.html')));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Rate limiter applies to API routes only (static file requests don't count against the budget)
app.use('/api', generalLimiter);

// ── API: Health ────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    sessions: sessionClients.size,
    viewers: viewerClients.size,
    uptime: process.uptime()
  });
});

// ── API: Models (populated by extension via WS event) ──────────

let cachedModels = [];

app.get('/api/models', (_req, res) => {
  res.json({ models: cachedModels });
});

// ── API: State ─────────────────────────────────────────────────

app.get('/api/state', (_req, res) => {
  res.json(stateManager.getState());
});

// ── API: Skills ────────────────────────────────────────────────

async function getCapabilities() {
  if (!cachedCapabilities) {
    cachedCapabilities = await readAllCapabilities(REPO_ROOT);
  }
  return cachedCapabilities;
}

app.get('/api/skills', async (_req, res) => {
  try {
    const caps = await getCapabilities();
    res.json({ core: caps.skills });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read skills' });
  }
});

app.get('/api/skills/roles', async (_req, res) => {
  try {
    const caps = await getCapabilities();
    res.json(caps.roleMapping);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read role mapping' });
  }
});

app.get('/api/prompts', async (_req, res) => {
  try {
    const caps = await getCapabilities();
    res.json(caps.prompts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read prompts' });
  }
});

app.get('/api/agents', async (_req, res) => {
  try {
    const caps = await getCapabilities();
    res.json(caps.agents);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read agents' });
  }
});

app.get('/api/capabilities/summary', async (_req, res) => {
  try {
    const caps = await getCapabilities();
    res.json({
      skillCount: caps.skills.length,
      promptCount: caps.prompts.length,
      agentCount: caps.agents.length,
      roleCount: Object.keys(caps.roleMapping).length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

// ── API: Settings ──────────────────────────────────────────────

app.get('/api/settings', (_req, res) => {
  res.json(readSettings());
});

app.post('/api/settings', execLimiter, (req, res) => {
  try {
    const current = readSettings();
    const updated = { ...current, ...req.body };
    writeSettings(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.post('/api/settings/priority-accounts', execLimiter, (req, res) => {
  try {
    const settings = readSettings();
    const { accounts } = req.body;
    if (Array.isArray(accounts)) {
      settings.priorityAccounts = accounts;
      writeSettings(settings);
    }
    res.json({ priorityAccounts: settings.priorityAccounts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save priority accounts' });
  }
});

// ── API: Schedules ─────────────────────────────────────────────

// Static-path routes MUST come before parameterized /:id routes

app.get('/api/schedules', (_req, res) => {
  try {
    const list = scheduler.list();
    res.json({ schedules: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules', execLimiter, (req, res) => {
  try {
    const { name, cron, prompt, enabled } = req.body || {};
    if (!cron || !prompt) {
      return res.status(400).json({ error: 'cron and prompt are required' });
    }
    const schedule = scheduler.add({ name, cron, prompt, enabled });
    broadcast('schedule:created', { schedule });
    res.json(schedule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/schedules/validate', (req, res) => {
  const { cron } = req.body || {};
  if (!cron) return res.status(400).json({ error: 'cron is required' });
  const err = validateCron(cron);
  res.json({
    valid: !err,
    error: err || undefined,
    description: !err ? describeCron(cron) : undefined
  });
});

app.post('/api/schedules/once', execLimiter, (req, res) => {
  try {
    const { prompt, name, runAt, delayMinutes } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    let resolvedRunAt = runAt;
    if (!resolvedRunAt && delayMinutes) {
      const mins = parseInt(delayMinutes, 10);
      if (isNaN(mins) || mins < 1) return res.status(400).json({ error: 'delayMinutes must be >= 1' });
      resolvedRunAt = new Date(Date.now() + mins * 60_000).toISOString();
    }
    if (!resolvedRunAt) return res.status(400).json({ error: 'runAt or delayMinutes is required' });

    const entry = scheduler.scheduleOnce({ prompt, name, runAt: resolvedRunAt });
    broadcast('schedule:once:created', { entry });
    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/schedules/once', (_req, res) => {
  res.json({ pending: scheduler.listOnce() });
});

app.delete('/api/schedules/once/:id', execLimiter, (req, res) => {
  const cancelled = scheduler.cancelOnce(req.params.id);
  if (!cancelled) return res.status(404).json({ error: 'One-time trigger not found or already fired' });
  broadcast('schedule:once:cancelled', { id: req.params.id });
  res.json({ cancelled: true });
});

// Parameterized /:id routes after all static paths

app.get('/api/schedules/:id', (req, res) => {
  try {
    const schedule = scheduler.get(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/schedules/:id', execLimiter, (req, res) => {
  try {
    const schedule = scheduler.update(req.params.id, req.body);
    broadcast('schedule:updated', { schedule });
    res.json(schedule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/schedules/:id', execLimiter, (req, res) => {
  try {
    const removed = scheduler.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Schedule not found' });
    broadcast('schedule:deleted', { scheduleId: req.params.id });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules/:id/trigger', execLimiter, (req, res) => {
  try {
    const schedule = scheduler.triggerNow(req.params.id);
    broadcast('schedule:fired', {
      scheduleId: schedule.id,
      name: schedule.name,
      prompt: schedule.prompt,
      firedAt: schedule.lastRun,
      hadSession: !!findActiveSessionWs(),
      manual: true
    });
    res.json({ triggered: true, schedule });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: Sessions ──────────────────────────────────────────────

app.get('/api/sessions', (_req, res) => {
  const state = stateManager.getState();
  const sessions = Object.entries(state.sessions).map(([id, s]) => ({
    sessionId: id,
    metadata: s.metadata,
    session: s.session,
    taskCount: s.backgroundTasks?.length || 0,
    toolCallCount: s.toolCalls?.length || 0,
    responseCount: s.responses?.length || 0
  }));
  res.json(sessions);
});

app.get('/api/sessions/:id', (req, res) => {
  const state = stateManager.getState();
  const session = state.sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// ── API: Session History (Mission Control) ─────────────────────

app.get('/api/session-history', (req, res) => {
  try {
    const result = listSessionHistory({
      limit: Math.min(Number(req.query.limit) || 50, 200),
      offset: Number(req.query.offset) || 0,
      cwd: req.query.cwd || undefined,
      repository: req.query.repository || undefined,
      search: req.query.search || undefined
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/session-history/stats', (_req, res) => {
  try {
    res.json(getSessionStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/session-history/search', (req, res) => {
  const query = req.query.q || req.query.query;
  if (!query) return res.status(400).json({ error: 'q or query param required' });
  try {
    const results = searchSessions(query, {
      limit: Math.min(Number(req.query.limit) || 20, 50)
    });
    res.json({ results, query });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/session-history/:id', (req, res) => {
  try {
    const detail = getSessionDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Session not found in history' });
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/session-history/:id/turns', (req, res) => {
  try {
    const result = getSessionTurns(req.params.id, {
      limit: Math.min(Number(req.query.limit) || 100, 500),
      offset: Number(req.query.offset) || 0
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/session-history/:id/delegate', execLimiter, (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const detail = getSessionDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Session not found' });
  if (!detail.canResume) return res.status(400).json({ error: 'Session cannot be resumed (no state directory)' });

  // Dispatch to the most recent active session's extension via WS
  const targetWs = findActiveSessionWs();
  if (targetWs) {
    targetWs.send(JSON.stringify({
      type: 'delegation:request',
      targetSessionId: req.params.id,
      prompt
    }));
    res.json({ dispatched: true, targetSessionId: req.params.id });
  } else {
    // No active session — spawn CLI directly (using execFile to avoid shell injection)
    const copilotBin = process.env.COPILOT_PATH || 'copilot';
    // Validate session ID to prevent argument injection
    if (!/^[a-zA-Z0-9_-]+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }
    execFile(
      copilotBin,
      [`--resume=${req.params.id}`, '--allow-all-tools', '-p', prompt],
      { cwd: REPO_ROOT, timeout: 300_000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          broadcast('delegation:error', {
            targetSessionId: req.params.id,
            error: err.message
          });
        } else {
          broadcast('delegation:complete', {
            targetSessionId: req.params.id,
            resultPreview: (stdout || '').slice(0, 500)
          });
        }
      }
    );
    res.json({ dispatched: true, targetSessionId: req.params.id, method: 'cli-spawn' });
  }
});

// ── CRM Client (lazy singleton) ────────────────────────────────

let crmClient = null;

function getCrmClient() {
  if (!crmClient) {
    crmClient = createCrmClient();
  }
  return crmClient;
}

// ── API: CRM ───────────────────────────────────────────────────

app.get('/api/crm/status', async (_req, res) => {
  try {
    const status = await getCrmClient().getConnectionStatus();
    if (status.connected) {
      const auth = await getCrmClient().getAuthStatus();
      res.json({ ...status, auth });
    } else {
      res.json(status);
    }
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

app.get('/api/crm/whoami', async (_req, res) => {
  try {
    const data = await getCrmClient().whoami();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/profile', async (_req, res) => {
  try {
    const data = await getCrmClient().whoami();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/opportunities', async (req, res) => {
  try {
    const opts = {};
    if (req.query.customer) opts.customerKeyword = req.query.customer;
    if (req.query.maxResults) opts.maxResults = Number(req.query.maxResults);
    opts.includeDealTeam = req.query.dealTeam !== 'false';
    const data = await getCrmClient().getMyOpportunities(opts);

    // Normalize to consistent shape: { opportunities[], count, totalCount }
    if (data && typeof data === 'object' && !Array.isArray(data) && data.opportunities !== undefined) {
      res.json(data);
    } else if (Array.isArray(data)) {
      res.json({ opportunities: data, count: data.length, totalCount: data.length });
    } else if (typeof data === 'string') {
      // MCP returned formatted text — parse embedded JSON if present
      try {
        const parsed = JSON.parse(data);
        const opps = parsed.opportunities || (Array.isArray(parsed) ? parsed : []);
        res.json({ opportunities: opps, count: opps.length, totalCount: opps.length });
      } catch {
        res.json({ opportunities: [], count: 0, totalCount: 0, _raw: data.slice(0, 500) });
      }
    } else {
      res.json({ opportunities: [], count: 0, totalCount: 0 });
    }
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/milestones', async (req, res) => {
  try {
    const opts = {};
    if (req.query.mine === 'true') opts.mine = true;
    if (req.query.opportunityId) opts.opportunityId = req.query.opportunityId;
    if (req.query.customer) opts.customerKeyword = req.query.customer;
    opts.statusFilter = req.query.status || 'active';
    opts.includeTasks = req.query.tasks === 'true';
    const data = await getCrmClient().getMilestones(opts);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/refresh', execLimiter, (_req, res) => {
  try {
    getCrmClient().invalidateCache();
    res.json({ refreshed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: CRM Read (new) ───────────────────────────────────────

app.get('/api/crm/milestones/needing-tasks', async (req, res) => {
  try {
    const data = await getCrmClient().findMilestonesNeedingTasks(req.query.customer || undefined);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/milestones/:id/activities', async (req, res) => {
  try {
    const data = await getCrmClient().getMilestoneActivities(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/metadata/milestone-fields/:field', async (req, res) => {
  const allowed = ['workloadType', 'deliveredBy', 'preferredAzureRegion', 'azureCapacityType'];
  if (!allowed.includes(req.params.field)) {
    return res.status(400).json({ error: 'Invalid field. Allowed: ' + allowed.join(', ') });
  }
  try {
    const data = await getCrmClient().getMilestoneFieldOptions(req.params.field);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/metadata/task-statuses', async (_req, res) => {
  try {
    const data = await getCrmClient().getTaskStatusOptions();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

// ── API: Job2 Tracker ────────────────────────────────────────

app.get('/api/crm/job2-summary', async (req, res) => {
  try {
    const [oppsData, msData] = await Promise.all([
      getCrmClient().getMyOpportunities({ includeDealTeam: false }),
      getCrmClient().getMilestones({ mine: true, statusFilter: 'active' })
    ]);

    let opps = [];
    if (oppsData?.opportunities) opps = oppsData.opportunities;
    else if (Array.isArray(oppsData)) opps = oppsData;

    let milestones = [];
    if (msData?.milestones)          milestones = msData.milestones;
    else if (Array.isArray(msData))  milestones = msData;
    else if (msData?.value)          milestones = msData.value;

    const oppMap = {};
    for (const o of opps) {
      const id = o.opportunityid || o.id;
      if (id) oppMap[id] = {
        name: o.name || o.msp_name || '',
        account: o.accountName || o.parentaccountidname || o._parentaccountid_value_label || o.accountname || o.customer || ''
      };
    }

    const accountMap = {};
    const today = new Date();

    for (const m of milestones) {
      const oppId  = m._msp_opportunityid_value;
      const opp    = oppId ? oppMap[oppId] : null;
      const acctName = (opp?.account) || 'Unknown Account';

      if (!accountMap[acctName]) {
        accountMap[acctName] = {
          accountName: acctName,
          oppIds: new Set(),
          milestones: [],
          totalPlannedAcr: 0,
          committed: 0, uncommitted: 0, pipeline: 0,
          overdue: 0, atRisk: 0, blocked: 0, onTrack: 0, notStarted: 0
        };
      }

      const a = accountMap[acctName];
      if (oppId) a.oppIds.add(oppId);
      a.milestones.push(m);

      a.totalPlannedAcr += Number(m.msp_monthlyuse || 0);

      const commit = m.msp_commitmentrecommendation;
      if (commit === 861980003) a.committed++;
      else if (commit === 861980002) a.pipeline++;
      else a.uncommitted++;

      const rawDate = m.msp_milestonedate || m.msp_milestoneduedate;
      const dueDate = rawDate ? new Date(rawDate) : null;
      if (dueDate && !isNaN(dueDate) && dueDate < today) a.overdue++;

      const sc = m.msp_milestonestatus || m.statuscode;
      if (sc === 861980001) a.atRisk++;
      else if (sc === 861980002) a.blocked++;
      else if (sc === 861980000) a.onTrack++;
      else if (sc === 861980005) a.notStarted++;
    }

    const accounts = Object.values(accountMap).map(a => {
      const total = a.milestones.length || 1;
      const score = Math.max(0, Math.min(100,
        100 - (a.blocked * 25) - (a.overdue * 20) - (a.atRisk * 10) - (a.uncommitted * 3)
      ));
      const health = score >= 80 ? 'green' : score >= 55 ? 'yellow' : 'red';

      let nextAction = 'Portfolio healthy — maintain momentum';
      if (a.blocked > 0)     nextAction = `Unblock ${a.blocked} milestone(s) — add status reason`;
      else if (a.overdue > 0) nextAction = `${a.overdue} past-due milestone(s) — update dates or close`;
      else if (a.atRisk > 0) nextAction = `${a.atRisk} at-risk milestone(s) — review blockers`;
      else if (a.uncommitted > 0) nextAction = `${a.uncommitted} uncommitted — commit or mark pipeline`;

      return {
        accountName: a.accountName,
        oppCount: a.oppIds.size,
        milestoneCount: a.milestones.length,
        committed: a.committed,
        uncommitted: a.uncommitted,
        pipeline: a.pipeline,
        overdue: a.overdue,
        atRisk: a.atRisk,
        blocked: a.blocked,
        onTrack: a.onTrack,
        notStarted: a.notStarted,
        totalPlannedAcrMonthly: Math.round(a.totalPlannedAcr),
        commitRatio: Math.round((a.committed / (a.milestones.length || 1)) * 100),
        healthScore: score,
        health,
        nextAction
      };
    });

    accounts.sort((a, b) => a.healthScore - b.healthScore);
    res.json({ accounts, count: accounts.length });
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

// ── API: ACR by Quarter ──────────────────────────────────────

app.get('/api/crm/acr-quarterly', async (req, res) => {
  try {
    const [msData, oppsData] = await Promise.all([
      getCrmClient().getMilestones({ mine: true, statusFilter: 'all' }),
      getCrmClient().getMyOpportunities({ includeDealTeam: false })
    ]);

    let milestones = [];
    if (msData?.milestones)         milestones = msData.milestones;
    else if (Array.isArray(msData)) milestones = msData;
    else if (msData?.value)         milestones = msData.value;

    let opps = [];
    if (oppsData?.opportunities) opps = oppsData.opportunities;
    else if (Array.isArray(oppsData)) opps = oppsData;

    const oppMap = {};
    for (const o of opps) {
      const id = o.opportunityid || o.id;
      if (id) oppMap[id] = {
        name: o.name || o.msp_name || '',
        account: o.accountName || o.parentaccountidname || o._parentaccountid_value_label || o.accountname || o.customer || ''
      };
    }

    // Bucket milestones by account → year-quarter
    const accountMap = {};
    const allQuarterKeys = new Set();

    for (const m of milestones) {
      const oppId = m._msp_opportunityid_value;
      const opp   = oppId ? oppMap[oppId] : null;
      const acctName = opp?.account || 'Unknown Account';

      const raw = m.msp_milestonedate || m.msp_milestoneduedate;
      if (!raw) continue;
      const dueDate = new Date(raw);
      if (isNaN(dueDate)) continue;

      const year    = dueDate.getFullYear();
      const quarter = Math.floor(dueDate.getMonth() / 3) + 1;
      const qKey    = `${year}-Q${quarter}`;
      allQuarterKeys.add(qKey);

      if (!accountMap[acctName]) accountMap[acctName] = {};
      if (!accountMap[acctName][qKey]) accountMap[acctName][qKey] = { plannedAcr: 0, count: 0, committed: 0 };

      const monthly = Number(m.msp_monthlyuse || 0);
      accountMap[acctName][qKey].plannedAcr += monthly * 3; // monthly rate → quarterly estimate
      accountMap[acctName][qKey].count++;
      if (m.msp_commitmentrecommendation === 861980003) accountMap[acctName][qKey].committed++;
    }

    const quarters = Array.from(allQuarterKeys).sort();
    const accounts = Object.entries(accountMap).map(([name, qmap]) => ({
      accountName: name,
      quarters: quarters.map(q => ({
        quarter: q,
        plannedAcr: Math.round(qmap[q]?.plannedAcr || 0),
        milestoneCount: qmap[q]?.count || 0,
        committed: qmap[q]?.committed || 0
      })),
      totalPlannedAcr: Math.round(Object.values(qmap).reduce((s, v) => s + v.plannedAcr, 0))
    }));

    accounts.sort((a, b) => b.totalPlannedAcr - a.totalPlannedAcr);
    res.json({ accounts, quarters, count: accounts.length });
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/accounts', async (req, res) => {
  const raw = req.query.tpids;
  if (!raw) return res.status(400).json({ error: 'tpids query param required' });
  const tpids = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  if (tpids.length === 0) return res.status(400).json({ error: 'tpids must not be empty' });
  try {
    const data = await getCrmClient().listAccountsByTpid(tpids);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/opportunities/search', async (req, res) => {
  try {
    const data = await getCrmClient().searchOpportunities(
      req.query.filter || undefined,
      req.query.top ? Number(req.query.top) : undefined
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/records/:entitySet/:id', async (req, res) => {
  try {
    const data = await getCrmClient().getRecord(
      req.params.entitySet,
      req.params.id,
      req.query.select || undefined
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/query', async (req, res) => {
  if (!req.query.entitySet) return res.status(400).json({ error: 'entitySet is required' });
  try {
    const data = await getCrmClient().query(
      req.query.entitySet,
      req.query.filter || undefined,
      req.query.select || undefined,
      req.query.top ? Number(req.query.top) : undefined
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

// ── API: CRM Write-Intent (staged) ────────────────────────────

app.post('/api/crm/milestones', execLimiter, async (req, res) => {
  const { name, opportunityId } = req.body || {};
  if (!name || !opportunityId) {
    return res.status(400).json({ error: 'name and opportunityId are required' });
  }
  try {
    const data = await getCrmClient().createMilestone(req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/milestones/:id', execLimiter, async (req, res) => {
  const { payload } = req.body || {};
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'payload object is required' });
  }
  try {
    const data = await getCrmClient().updateMilestone(req.params.id, payload);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/milestones/:id/team', execLimiter, async (req, res) => {
  const { action, userId } = req.body || {};
  if (!action || !userId) {
    return res.status(400).json({ error: 'action and userId are required' });
  }
  try {
    const data = await getCrmClient().manageMilestoneTeam(
      req.params.id, action, userId, req.body.role || undefined
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/tasks', execLimiter, async (req, res) => {
  const { subject, milestoneId } = req.body || {};
  if (!subject || !milestoneId) {
    return res.status(400).json({ error: 'subject and milestoneId are required' });
  }
  try {
    const data = await getCrmClient().createTask(req.body);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/tasks/:id', execLimiter, async (req, res) => {
  const { payload } = req.body || {};
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'payload object is required' });
  }
  try {
    const data = await getCrmClient().updateTask(req.params.id, payload);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/tasks/:id/close', execLimiter, async (req, res) => {
  try {
    const data = await getCrmClient().closeTask(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/opportunities/:id/deal-team', execLimiter, async (req, res) => {
  const { action, userId } = req.body || {};
  if (!action || !userId) {
    return res.status(400).json({ error: 'action and userId are required' });
  }
  try {
    const data = await getCrmClient().manageDealTeam(
      req.params.id, action, userId, req.body.role || undefined
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

// ── API: CRM Operations (approval queue) ──────────────────────

app.get('/api/crm/operations', async (_req, res) => {
  try {
    const data = await getCrmClient().listPendingOperations();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.get('/api/crm/operations/:id/diff', async (req, res) => {
  try {
    const data = await getCrmClient().viewStagedDiff(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/operations/:id/execute', execLimiter, async (req, res) => {
  try {
    const data = await getCrmClient().executeOperation(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/operations/execute-all', execLimiter, async (_req, res) => {
  try {
    const data = await getCrmClient().executeAll();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/operations/:id/cancel', execLimiter, async (req, res) => {
  try {
    const data = await getCrmClient().cancelOperation(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

app.post('/api/crm/operations/cancel-all', execLimiter, async (_req, res) => {
  try {
    const data = await getCrmClient().cancelAll();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CRM unavailable: ' + err.message });
  }
});

// ── OIL Client (lazy singleton) ───────────────────────────────────

let oilClient = null;

function getOilClient() {
  if (!oilClient) {
    oilClient = createOilClient({ repoRoot: REPO_ROOT });
  }
  return oilClient;
}

// ── API: Vault (OIL) ──────────────────────────────────────────────

app.get('/api/vault/status', async (_req, res) => {
  try {
    const status = await getOilClient().getConnectionStatus();
    res.json(status);
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

app.get('/api/vault/health', async (_req, res) => {
  try {
    const data = await getOilClient().checkVaultHealth();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Vault unavailable: ' + err.message });
  }
});

app.get('/api/vault/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'q query param required' });
  try {
    const opts = {};
    if (req.query.folder) opts.filter_folder = req.query.folder;
    if (req.query.tags) opts.filter_tags = req.query.tags;
    if (req.query.tier) opts.tier = req.query.tier;
    const data = await getOilClient().searchVault(query, opts);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Vault unavailable: ' + err.message });
  }
});

app.get('/api/vault/query', async (req, res) => {
  const key = req.query.key;
  const value = req.query.value;
  if (!key || !value) return res.status(400).json({ error: 'key and value query params required' });
  try {
    const data = await getOilClient().queryFrontmatter(key, value);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Vault unavailable: ' + err.message });
  }
});

app.get('/api/vault/recent-activity', async (req, res) => {
  const typeFilter = req.query.type || 'all'; // all | customer | project | people | meeting | weekly
  const oil = getOilClient();

  try {
    const CATEGORY_FOLDERS = {
      customer: 'Customers',
      project:  'Projects',
      people:   'People',
      meeting:  'Meetings',
      weekly:   'Weekly'
    };

    // Always fetch ALL categories so counts are complete for the filter UI
    const allCategories = Object.keys(CATEGORY_FOLDERS);
    const allNotes = [];

    // Customers — use vault health (has dates built-in)
    try {
      const health = await oil.checkVaultHealth();
      const report = health.report || health;
      const customers = (report.customers || [])
        .filter(c => c.lastModified)
        .map(c => ({
          title: c.customer,
          path: c.path,
          modified: c.lastModified,
          type: 'customer',
          opportunityCount: c.opportunityCompleteness?.total || 0,
          milestoneCount: c.milestoneCompleteness?.total || 0,
          hasTeam: c.hasTeam || false
        }));
      allNotes.push(...customers);
    } catch { /* vault health failed, skip customers */ }

    // Other categories — search + enrich with metadata
    const otherCategories = allCategories.filter(c => c !== 'customer');
    const searchPromises = otherCategories.map(async (cat) => {
      const folder = CATEGORY_FOLDERS[cat];
      if (!folder) return [];
      try {
        const results = await oil.searchVault('*', { filter_folder: folder, tier: 'lexical' });
        const items = Array.isArray(results) ? results : [];
        // Enrich top results with metadata (parallel, capped at 6 per category)
        const enriched = await Promise.all(
          items.slice(0, 6).map(async (item) => {
            try {
              const meta = await oil.getNoteMetadata(item.path);
              return {
                title: meta.title || item.title,
                path: item.path,
                modified: meta.modified_at || null,
                type: cat,
                wordCount: meta.word_count || 0,
                headings: (meta.headings || []).length,
                tags: meta.frontmatter?.tags || []
              };
            } catch {
              return {
                title: item.title,
                path: item.path,
                modified: null,
                type: cat
              };
            }
          })
        );
        return enriched;
      } catch { return []; }
    });
    const categoryResults = await Promise.all(searchPromises);
    categoryResults.forEach(notes => allNotes.push(...notes));

    // Sort all by modified date desc (nulls last)
    allNotes.sort((a, b) => {
      if (!a.modified && !b.modified) return 0;
      if (!a.modified) return 1;
      if (!b.modified) return -1;
      return new Date(b.modified) - new Date(a.modified);
    });

    // Global counts (always full)
    const counts = {};
    for (const note of allNotes) {
      counts[note.type] = (counts[note.type] || 0) + 1;
    }

    // Apply type filter to the notes list only
    const filtered = typeFilter === 'all'
      ? allNotes
      : allNotes.filter(n => n.type === typeFilter);

    res.json({
      notes: filtered.slice(0, 12),
      counts,
      total: filtered.length,
      filter: typeFilter
    });
  } catch (err) {
    res.status(502).json({ error: 'Vault unavailable: ' + err.message });
  }
});

app.get('/api/vault/customer/:name', async (req, res) => {
  try {
    const data = await getOilClient().getCustomerContext(req.params.name);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Vault unavailable: ' + err.message });
  }
});

app.get('/api/vault/customers', async (_req, res) => {
  try {
    const oil = getOilClient();
    const health = await oil.checkVaultHealth();
    const report = health.report || health;
    const rawCustomers = (report.customers || []).filter(c => c.customer !== 'opportunities');

    // Enrich each customer with aliases from frontmatter (parallel, fast)
    const customers = await Promise.all(rawCustomers.map(async (c) => {
      const base = {
        name: c.customer,
        path: c.path,
        lastModified: c.lastModified || null,
        opportunityCount: c.opportunityCompleteness?.total || 0,
        milestoneCount: c.milestoneCompleteness?.total || 0,
        hasTeam: c.hasTeam || false,
        aliases: []
      };
      try {
        const ctx = await oil.getCustomerContext(c.customer);
        const fm = ctx?.frontmatter || {};
        const names = new Set();
        if (Array.isArray(fm.aliases)) fm.aliases.forEach(a => names.add(a));
        if (fm.MSX?.account) names.add(fm.MSX.account);
        names.delete(c.customer); // don't duplicate the primary name
        base.aliases = [...names];
      } catch { /* context fetch failed — aliases stay empty */ }
      return base;
    }));

    res.json({ customers, count: customers.length });
  } catch (err) {
    res.json({ customers: [], count: 0, error: err.message });
  }
});

app.get('/api/vault/note-metadata', async (req, res) => {
  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'path query param required' });
  try {
    const data = await getOilClient().getNoteMetadata(path);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Vault unavailable: ' + err.message });
  }
});

app.get('/api/vault/agent-log', async (_req, res) => {
  try {
    const data = await getOilClient().getAgentLog();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Vault unavailable: ' + err.message });
  }
});

app.get('/api/vault/name', (_req, res) => {
  // Derive vault name from OBSIDIAN_VAULT_PATH env var (folder basename)
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) return res.json({ name: null });
  const name = vaultPath.replace(/[\/\\]+$/, '').split(/[\/\\]/).pop();
  res.json({ name });
});

app.post('/api/vault/refresh', execLimiter, (_req, res) => {
  try {
    getOilClient().invalidateCache();
    res.json({ refreshed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: MCP Servers ───────────────────────────────────────────

const MCP_CONFIG_PATH = join(REPO_ROOT, '.vscode', 'mcp.json');

function readMcpConfig() {
  try {
    if (existsSync(MCP_CONFIG_PATH)) {
      // Strip JSON comments (// style) before parsing
      const raw = readFileSync(MCP_CONFIG_PATH, 'utf8');
      const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
      return JSON.parse(stripped);
    }
  } catch { /* corrupt or missing */ }
  return { servers: {} };
}

function getMcpDisabledSet() {
  const settings = readSettings();
  return new Set(settings.mcpDisabledServers || []);
}

function setMcpDisabled(disabledArray) {
  const settings = readSettings();
  settings.mcpDisabledServers = disabledArray;
  writeSettings(settings);
}

function classifyServer(name, cfg) {
  const typeMap = {
    msx: { label: 'MSX CRM', icon: '🔗', category: 'crm' },
    oil: { label: 'Obsidian Vault', icon: '📂', category: 'vault' },
    workiq: { label: 'WorkIQ', icon: '🧠', category: 'm365' },
    'powerbi-remote': { label: 'Power BI', icon: '📊', category: 'analytics' },
    calendar: { label: 'Calendar', icon: '📅', category: 'm365' },
    teams: { label: 'Teams', icon: '💬', category: 'm365' },
    mail: { label: 'Mail', icon: '📧', category: 'm365' },
    sharepoint: { label: 'SharePoint', icon: '📁', category: 'm365' },
    word: { label: 'Word', icon: '📝', category: 'm365' },
    github: { label: 'GitHub', icon: '🐙', category: 'dev' },
    ado: { label: 'Azure DevOps', icon: '🔷', category: 'dev' },
  };
  const match = typeMap[name];
  return {
    label: match?.label || name,
    icon: match?.icon || '🔌',
    category: match?.category || 'other',
    transport: cfg.type || 'unknown'
  };
}

app.get('/api/mcp/servers', (_req, res) => {
  try {
    const config = readMcpConfig();
    const disabled = getMcpDisabledSet();
    const servers = Object.entries(config.servers || {}).map(([name, cfg]) => {
      const meta = classifyServer(name, cfg);
      return {
        name,
        enabled: !disabled.has(name),
        type: cfg.type,
        label: meta.label,
        icon: meta.icon,
        category: meta.category,
        transport: meta.transport,
        url: cfg.url || null,
        command: cfg.command || null
      };
    });
    res.json({ servers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read MCP config: ' + err.message });
  }
});

app.post('/api/mcp/servers/:name/toggle', execLimiter, (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required' });
    }
    const config = readMcpConfig();
    if (!config.servers || !config.servers[name]) {
      return res.status(404).json({ error: 'Server not found: ' + name });
    }
    const disabled = getMcpDisabledSet();
    if (enabled) {
      disabled.delete(name);
    } else {
      disabled.add(name);
    }
    setMcpDisabled([...disabled]);
    broadcast('mcp:server-toggled', { server: name, enabled });
    res.json({ name, enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Open External — launches URL in the device default browser ──
// (Already rate-limited by execLimiter parent middleware)
app.post('/api/open-external', execLimiter, (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  // Validate URL — only allow http/https and obsidian:// to prevent command injection
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'obsidian:') {
    return res.status(400).json({ error: 'Only http, https, and obsidian URLs allowed' });
  }
  const safeUrl = parsed.href;
  // Use platform-specific open command (execFile avoids shell injection)
  const platform = process.platform;
  let cmd;
  let args;
  if (platform === 'darwin') {
    cmd = 'open';
    args = [safeUrl];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', safeUrl];
  } else {
    cmd = 'xdg-open';
    args = [safeUrl];
  }
  execFile(cmd, args, (err) => {
    if (err) {
      console.error('[open-external]', err.message);
      return res.status(500).json({ error: 'Failed to open URL' });
    }
    res.json({ opened: true });
  });
});

// ── WebSocket ──────────────────────────────────────────────────

function broadcast(type, data, excludeWs = null) {
  const msg = JSON.stringify({ type, ...data });
  for (const client of viewerClients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function resetShutdownTimer() {
  if (shutdownTimer) { clearTimeout(shutdownTimer); shutdownTimer = null; }
}

function scheduleShutdown() {
  if (viewerClients.size > 0 || sessionClients.size > 0) return;
  shutdownTimer = setTimeout(() => {
    console.log('[mcaps-iq] No clients connected, shutting down.');
    server.close(() => process.exit(0));
  }, SHUTDOWN_GRACE_MS);
}

wss.on('connection', (ws, req) => {
  let clientType = null;
  let clientSessionId = null;
  let missedPings = 0;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; missedPings = 0; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      // Session client registration
      case 'session:register': {
        clientType = 'session';
        clientSessionId = msg.sessionId;
        sessionClients.set(msg.sessionId, ws);
        stateManager.registerSession(msg.sessionId, msg.metadata || {});
        resetShutdownTimer();
        ws.send(JSON.stringify({ type: 'session:registered', sessionId: msg.sessionId }));
        broadcast('session:new', { sessionId: msg.sessionId, metadata: msg.metadata });
        break;
      }

      // Session event relay
      case 'event': {
        if (msg.sessionId && msg.event) {
          // Intercept models:update to cache on the server
          if (msg.event.type === 'models:update' && Array.isArray(msg.event.data?.models)) {
            cachedModels = msg.event.data.models;
          }
          stateManager.addEvent(msg.sessionId, msg.event);
          broadcast(msg.event.type, { sessionId: msg.sessionId, ...msg.event.data });
        }
        break;
      }

      // Session ended
      case 'session:end': {
        if (msg.sessionId) {
          stateManager.removeSession(msg.sessionId);
          sessionClients.delete(msg.sessionId);
          broadcast('session:end', { sessionId: msg.sessionId });
        }
        break;
      }

      // Browser requests full state
      case 'request:state': {
        if (!clientType) {
          clientType = 'viewer';
          viewerClients.add(ws);
          resetShutdownTimer();
        }
        ws.send(JSON.stringify({ type: 'state:snapshot', ...stateManager.getState() }));
        break;
      }

      // Browser sends chat message to a session
      case 'chat:send': {
        const targetWs = sessionClients.get(msg.sessionId);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
          targetWs.send(JSON.stringify({
            type: 'chat:forward',
            message: msg.data?.message
          }));
        }
        break;
      }

      // Browser updates filter preferences
      case 'filter:update': {
        const targetWs2 = msg.sessionId ? sessionClients.get(msg.sessionId) : null;
        if (targetWs2 && targetWs2.readyState === WebSocket.OPEN) {
          targetWs2.send(JSON.stringify({ type: 'filter:update', data: msg.data }));
        }
        break;
      }

      // Browser sends tool approval/denial decision back to extension
      case 'tool:approval-response': {
        const targetWs3 = msg.sessionId ? sessionClients.get(msg.sessionId) : null;
        if (targetWs3 && targetWs3.readyState === WebSocket.OPEN) {
          targetWs3.send(JSON.stringify({ type: 'tool:approval-response', data: msg.data }));
        }
        break;
      }

      // Browser toggles auto-approve for a session
      case 'auto-approve:update': {
        const targetWs4 = msg.sessionId ? sessionClients.get(msg.sessionId) : null;
        if (targetWs4 && targetWs4.readyState === WebSocket.OPEN) {
          targetWs4.send(JSON.stringify({ type: 'auto-approve:update', data: msg.data }));
        }
        // Also broadcast to other viewers so UI stays in sync
        broadcast('auto-approve:update', { sessionId: msg.sessionId, ...msg.data });
        break;
      }

      // Browser requests session abort (stop current turn)
      case 'session:stop': {
        const targetWs5 = msg.sessionId ? sessionClients.get(msg.sessionId) : null;
        if (targetWs5 && targetWs5.readyState === WebSocket.OPEN) {
          targetWs5.send(JSON.stringify({ type: 'session:stop', data: msg.data || {} }));
        }
        break;
      }

      // Browser sends user input response back to extension
      case 'user-input:response': {
        const targetWs6 = msg.sessionId ? sessionClients.get(msg.sessionId) : null;
        if (targetWs6 && targetWs6.readyState === WebSocket.OPEN) {
          targetWs6.send(JSON.stringify({ type: 'user-input:response', data: msg.data }));
        }
        break;
      }

      // Delegation events — relay to all viewers
      case 'delegation:dispatched':
      case 'delegation:complete':
      case 'delegation:error': {
        broadcast(msg.type, msg.data || msg);
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }
    }
  });

  ws.on('close', () => {
    if (clientType === 'viewer') {
      viewerClients.delete(ws);
    } else if (clientType === 'session' && clientSessionId) {
      // Grace period before marking ended
      const timer = setTimeout(() => {
        if (!sessionClients.has(clientSessionId) || sessionClients.get(clientSessionId) !== ws) return;
        stateManager.removeSession(clientSessionId);
        sessionClients.delete(clientSessionId);
        broadcast('session:end', { sessionId: clientSessionId });
      }, DISCONNECT_TIMEOUT_MS);
      sessionTimers.set(clientSessionId, timer);
    }
    scheduleShutdown();
  });
});

// Heartbeats
const viewerHeartbeat = setInterval(() => {
  for (const ws of viewerClients) {
    if (!ws.isAlive) { ws.terminate(); viewerClients.delete(ws); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, VIEWER_HEARTBEAT_MS);

const sessionHeartbeat = setInterval(() => {
  for (const [id, ws] of sessionClients) {
    if (!ws.isAlive) {
      ws.terminate();
      sessionClients.delete(id);
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, SESSION_HEARTBEAT_MS);

// ── Start ──────────────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mcaps-iq] Dashboard server listening on http://127.0.0.1:${PORT}`);
});

// Pre-warm capabilities cache
getCapabilities().catch(() => {});

// Start cron scheduler
scheduler.start();
console.log(`[mcaps-iq] Cron scheduler started (${scheduler.list().filter(s => s.enabled).length} active jobs)`);

// Graceful shutdown
process.on('SIGTERM', () => {
  scheduler.stop();
  clearInterval(viewerHeartbeat);
  clearInterval(sessionHeartbeat);
  server.close(() => process.exit(0));
});
