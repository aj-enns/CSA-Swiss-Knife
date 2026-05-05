/**
 * CRM Client Bridge — connects to the MSX MCP server via stdio transport
 * using @modelcontextprotocol/sdk. Provides typed methods for CRM operations
 * with in-memory TTL caching to avoid hammering CRM on tab switches.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CONNECT_TIMEOUT_MS = 15_000;

export function createCrmClient(options = {}) {
  const ttlMs = options.ttl ?? DEFAULT_TTL_MS;
  let client = null;
  let transport = null;
  let connectPromise = null;
  let connected = false;
  const cache = new Map();

  // ── Cache helpers ─────────────────────────────────────────────

  function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > ttlMs) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
  }

  const METADATA_TTL_MS = 60 * 60 * 1000; // 1 hour for picklist metadata

  function getCachedMeta(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > METADATA_TTL_MS) { cache.delete(key); return null; }
    return entry.data;
  }

  function invalidateWriteCache() {
    for (const key of cache.keys()) {
      if (key.startsWith('milestones_') || key.startsWith('my_opps_')) cache.delete(key);
    }
  }

  function invalidateCache(prefix) {
    if (!prefix) { cache.clear(); return; }
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }

  // ── Connection ────────────────────────────────────────────────

  async function ensureConnected() {
    if (connected && client) return client;
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
      try {
        transport = new StdioClientTransport({
          command: 'npx',
          args: ['-y', '@microsoft/msx-mcp-server@latest'],
          env: {
            ...process.env,
            'npm_config_@microsoft:registry': 'https://npm.pkg.github.com',
            MSX_CRM_URL: options.crmUrl || 'https://microsoftsales.crm.dynamics.com',
            MSX_TENANT_ID: options.tenantId || '72f988bf-86f1-41af-91ab-2d7cd011db47'
          }
        });

        client = new Client(
          { name: 'mcaps-iq-dashboard', version: '1.0.0' },
          { capabilities: {} }
        );

        // Connect with timeout
        const connectResult = await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('MCP connection timeout')), CONNECT_TIMEOUT_MS)
          )
        ]);

        connected = true;
        console.log('[crm-client] Connected to MSX MCP server');
        return client;
      } catch (err) {
        connected = false;
        client = null;
        transport = null;
        connectPromise = null;
        throw err;
      }
    })();

    return connectPromise;
  }

  // ── Tool call wrapper ─────────────────────────────────────────

  async function callTool(name, args = {}) {
    const c = await ensureConnected();
    const result = await c.callTool({ name, arguments: args });

    // MCP tools return { content: [{ type: 'text', text: '...' }] }
    if (result?.content?.[0]?.text) {
      try {
        return JSON.parse(result.content[0].text);
      } catch {
        return result.content[0].text;
      }
    }
    return result;
  }

  // ── Public API ────────────────────────────────────────────────

  async function whoami() {
    const cached = getCached('whoami');
    if (cached) return cached;
    const data = await callTool('crm_whoami');
    setCache('whoami', data);
    return data;
  }

  async function getAuthStatus() {
    const cached = getCached('auth_status');
    if (cached) return cached;
    const data = await callTool('crm_auth_status');
    setCache('auth_status', data);
    return data;
  }

  async function getMyOpportunities(opts = {}) {
    const key = `my_opps_${opts.customerKeyword || 'all'}_${opts.includeDealTeam ?? true}`;
    const cached = getCached(key);
    if (cached) return cached;

    const args = {};
    if (opts.customerKeyword) args.customerKeyword = opts.customerKeyword;
    if (opts.includeDealTeam !== undefined) args.includeDealTeam = opts.includeDealTeam;
    if (opts.maxResults) args.maxResults = opts.maxResults;

    const data = await callTool('get_my_active_opportunities', args);

    // If get_my_active_opportunities returns empty, fall back to synthesizing
    // from milestones the user owns — users without formal deal team entries
    // still have milestones and therefore opportunities.
    const opps = data?.opportunities || (Array.isArray(data) ? data : []);
    if (opps.length === 0 && !opts.customerKeyword) {
      const fallback = await getOpportunitiesFromMilestones();
      setCache(key, fallback);
      return fallback;
    }

    setCache(key, data);
    return data;
  }

  async function getOpportunitiesFromMilestones() {
    const key = 'my_opps_from_milestones';
    const cached = getCached(key);
    if (cached) return cached;

    // Get active milestones owned by this user
    const msData = await callTool('get_milestones', { mine: true, statusFilter: 'active' });
    const milestones = msData?.milestones || (Array.isArray(msData) ? msData : []);

    if (!milestones.length) {
      const empty = { opportunities: [], count: 0, totalCount: 0 };
      setCache(key, empty);
      return empty;
    }

    // Deduplicate by opportunity ID
    const oppMap = new Map();
    for (const ms of milestones) {
      const oppId = ms._msp_opportunityid_value;
      const oppName = ms['_msp_opportunityid_value@OData.Community.Display.V1.FormattedValue'] || ms._msp_opportunityid_value_name || '';
      if (!oppId) continue;

      if (!oppMap.has(oppId)) {
        oppMap.set(oppId, {
          id: oppId,
          name: oppName,
          milestones: [],
          totalMonthlyUse: 0,
          worstStatus: null
        });
      }
      const entry = oppMap.get(oppId);
      entry.milestones.push(ms);
      entry.totalMonthlyUse += (typeof ms.msp_monthlyuse === 'number' ? ms.msp_monthlyuse : 0);
      // Track worst milestone status for health derivation
      const st = ms.msp_milestonestatus;
      if (st === 861980002) entry.worstStatus = 'blocked';
      else if (st === 861980001 && entry.worstStatus !== 'blocked') entry.worstStatus = 'at-risk';
    }

    // Query CRM for opportunity details (stage, close date, account, value)
    const oppIds = [...oppMap.keys()].slice(0, 15);
    let oppDetails = {};
    try {
      const filter = oppIds.map(id => `opportunityid eq '${id}'`).join(' or ');
      const raw = await callTool('crm_query', {
        entitySet: 'opportunities',
        filter,
        select: [
          'opportunityid', 'name', 'msp_opportunitynumber', 'msp_activesalesstage',
          'msp_estcompletiondate', 'estimatedclosedate', 'estimatedvalue',
          'msp_consumptionconsumedrecurring', '_parentaccountid_value'
        ].join(',')
      });
      const rows = raw?.value || (Array.isArray(raw) ? raw : []);
      for (const r of rows) oppDetails[r.opportunityid] = r;
    } catch (err) {
      console.warn('[crm-client] Opportunity detail query failed, using milestone-only data:', err.message);
    }

    const opportunities = [...oppMap.values()].map(entry => {
      const detail = oppDetails[entry.id] || {};
      const accName = detail['_parentaccountid_value@OData.Community.Display.V1.FormattedValue'] || '';
      const stageRaw = detail.msp_activesalesstage || detail['msp_activesalesstage@OData.Community.Display.V1.FormattedValue'] || '';
      const health = entry.worstStatus === 'blocked' ? 'Red' : entry.worstStatus === 'at-risk' ? 'Yellow' : 'Green';
      return {
        id: entry.id,
        opportunityId: entry.id,
        name: detail.name || entry.name,
        opportunityNumber: detail.msp_opportunitynumber || '',
        customer: accName,
        accountName: accName,
        stageName: stageRaw,
        stage: stageRaw,
        estimatedCloseDate: detail.msp_estcompletiondate || detail.estimatedclosedate || '',
        estimatedValue: detail.estimatedvalue || 0,
        totalMonthlyUse: entry.totalMonthlyUse,
        monthlyUse: entry.totalMonthlyUse,
        health,
        relationship: 'milestone-owner',
        milestoneCount: entry.milestones.length
      };
    });

    const result = { opportunities, count: opportunities.length, totalCount: opportunities.length };
    setCache(key, result);
    return result;
  }

  async function getMilestones(opts = {}) {
    const key = `milestones_${opts.mine ? 'mine' : ''}${opts.opportunityId || opts.customerKeyword || 'none'}`;
    const cached = getCached(key);
    if (cached) return cached;

    const args = {};
    if (opts.mine) args.mine = true;
    if (opts.opportunityId) args.opportunityId = opts.opportunityId;
    if (opts.customerKeyword) args.customerKeyword = opts.customerKeyword;
    if (opts.statusFilter) args.statusFilter = opts.statusFilter;
    if (opts.includeTasks) args.includeTasks = opts.includeTasks;

    const data = await callTool('get_milestones', args);
    setCache(key, data);
    return data;
  }

  async function listAccountsByTpid(tpids) {
    const key = `accounts_${tpids.sort().join(',')}`;
    const cached = getCached(key);
    if (cached) return cached;

    const data = await callTool('list_accounts_by_tpid', { tpids });
    setCache(key, data);
    return data;
  }

  async function getConnectionStatus() {
    try {
      await ensureConnected();
      return { connected: true, error: null };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  function disconnect() {
    if (transport) {
      try { transport.close(); } catch { /* noop */ }
    }
    client = null;
    transport = null;
    connected = false;
    connectPromise = null;
    cache.clear();
  }

  // ── Read methods (new) ────────────────────────────────────────

  async function getMilestoneActivities(milestoneId) {
    const key = `ms_activities_${milestoneId}`;
    const cached = getCached(key);
    if (cached) return cached;
    const data = await callTool('get_milestone_activities', { milestoneIds: [milestoneId] });
    setCache(key, data);
    return data;
  }

  async function getMilestoneFieldOptions(field) {
    const key = `meta_ms_field_${field}`;
    const cached = getCachedMeta(key);
    if (cached) return cached;
    const data = await callTool('get_milestone_field_options', { field });
    setCache(key, data);
    return data;
  }

  async function getTaskStatusOptions() {
    const key = 'meta_task_statuses';
    const cached = getCachedMeta(key);
    if (cached) return cached;
    const data = await callTool('get_task_status_options', {});
    setCache(key, data);
    return data;
  }

  async function searchOpportunities(filter, top) {
    const args = {};
    if (filter) args.filter = filter;
    if (top) args.top = top;
    return callTool('list_opportunities', args);
  }

  async function getRecord(entitySet, id, select) {
    const args = { entitySet, id };
    if (select) args.select = select;
    return callTool('crm_get_record', args);
  }

  async function query(entitySet, filter, select, top) {
    const args = { entitySet };
    if (filter) args.filter = filter;
    if (select) args.select = select;
    if (top) args.top = top;
    return callTool('crm_query', args);
  }

  async function findMilestonesNeedingTasks(customerKeyword) {
    const args = {};
    if (customerKeyword) args.customerKeyword = customerKeyword;
    return callTool('find_milestones_needing_tasks', args);
  }

  // ── Write-intent methods (staged) ─────────────────────────────

  async function updateMilestone(milestoneId, payload) {
    const data = await callTool('update_milestone', { milestoneId, payload });
    invalidateWriteCache();
    return data;
  }

  async function createMilestone(params) {
    const data = await callTool('create_milestone', params);
    invalidateWriteCache();
    return data;
  }

  async function createTask(params) {
    const data = await callTool('create_task', params);
    invalidateWriteCache();
    return data;
  }

  async function updateTask(taskId, payload) {
    const data = await callTool('update_task', { taskId, payload });
    invalidateWriteCache();
    return data;
  }

  async function closeTask(taskId) {
    const data = await callTool('close_task', { taskId });
    invalidateWriteCache();
    return data;
  }

  async function manageDealTeam(opportunityId, action, userId, role) {
    const args = { opportunityId, action, userId };
    if (role) args.role = role;
    const data = await callTool('manage_deal_team', args);
    invalidateWriteCache();
    return data;
  }

  async function manageMilestoneTeam(milestoneId, action, userId, role) {
    const args = { milestoneId, action, userId };
    if (role) args.role = role;
    const data = await callTool('manage_milestone_team', args);
    invalidateWriteCache();
    return data;
  }

  // ── Approval/execution methods ────────────────────────────────

  async function listPendingOperations() {
    return callTool('list_pending_operations', {});
  }

  async function viewStagedDiff(operationId) {
    return callTool('view_staged_changes_diff', { operationId });
  }

  async function executeOperation(operationId) {
    const data = await callTool('execute_operation', { operationId });
    cache.clear(); // full invalidation after a real CRM write
    return data;
  }

  async function executeAll() {
    const data = await callTool('execute_all', {});
    cache.clear();
    return data;
  }

  async function cancelOperation(operationId) {
    return callTool('cancel_operation', { operationId });
  }

  async function cancelAll() {
    return callTool('cancel_all', {});
  }

  return {
    whoami,
    getAuthStatus,
    getMyOpportunities,
    getMilestones,
    listAccountsByTpid,
    getConnectionStatus,
    invalidateCache,
    disconnect,
    callTool,
    // Read
    getMilestoneActivities,
    getMilestoneFieldOptions,
    getTaskStatusOptions,
    searchOpportunities,
    getRecord,
    query,
    findMilestonesNeedingTasks,
    // Write-intent (staged)
    updateMilestone,
    createMilestone,
    createTask,
    updateTask,
    closeTask,
    manageDealTeam,
    manageMilestoneTeam,
    // Approval
    listPendingOperations,
    viewStagedDiff,
    executeOperation,
    executeAll,
    cancelOperation,
    cancelAll
  };
}
