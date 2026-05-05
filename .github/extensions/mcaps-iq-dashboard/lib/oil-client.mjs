/**
 * OIL Client Bridge — connects to the Obsidian Intelligence Layer MCP server
 * via stdio transport. Provides methods for vault reads with TTL caching.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes
const CONNECT_TIMEOUT_MS = 15_000;

/** Load key=value pairs from a .env file into an object (does not mutate process.env). */
function loadDotEnv(envPath) {
  const extra = {};
  if (!existsSync(envPath)) return extra;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    extra[key] = value;
  }
  return extra;
}

export function createOilClient(options = {}) {
  const ttlMs = options.ttl ?? DEFAULT_TTL_MS;
  const repoRoot = options.repoRoot || process.cwd();
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
        // Load .env from repo root so OBSIDIAN_VAULT_PATH is available
        const dotEnv = loadDotEnv(join(repoRoot, '.env'));
        transport = new StdioClientTransport({
          command: 'npx',
          args: ['-y', '@jinlee794/obsidian-intelligence-layer@latest', 'mcp'],
          env: {
            ...process.env,
            ...dotEnv,
            'npm_config_@jinlee794:registry': 'https://npm.pkg.github.com'
          }
        });

        client = new Client(
          { name: 'mcaps-iq-dashboard-oil', version: '1.0.0' },
          { capabilities: {} }
        );

        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OIL connection timeout')), CONNECT_TIMEOUT_MS)
          )
        ]);

        connected = true;
        console.log('[oil-client] Connected to OIL MCP server');
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

  async function checkVaultHealth() {
    const cached = getCached('vault_health');
    if (cached) return cached;
    const data = await callTool('check_vault_health');
    setCache('vault_health', data);
    return data;
  }

  async function searchVault(query, opts = {}) {
    const key = `search_${query}_${opts.filter_folder || ''}_${opts.filter_tags || ''}`;
    const cached = getCached(key);
    if (cached) return cached;

    const args = { query };
    if (opts.filter_folder) args.filter_folder = opts.filter_folder;
    if (opts.filter_tags) args.filter_tags = opts.filter_tags;
    if (opts.tier) args.tier = opts.tier;

    const data = await callTool('search_vault', args);
    setCache(key, data);
    return data;
  }

  async function queryFrontmatter(key, valueFragment) {
    const cacheKey = `query_fm_${key}_${valueFragment}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const data = await callTool('query_frontmatter', { key, value_fragment: valueFragment });
    setCache(cacheKey, data);
    return data;
  }

  async function getCustomerContext(customer) {
    const key = `customer_ctx_${customer}`;
    const cached = getCached(key);
    if (cached) return cached;
    const data = await callTool('get_customer_context', { customer });
    setCache(key, data);
    return data;
  }

  async function getNoteMetadata(path) {
    const key = `note_meta_${path}`;
    const cached = getCached(key);
    if (cached) return cached;
    const data = await callTool('get_note_metadata', { path });
    setCache(key, data);
    return data;
  }

  async function getAgentLog() {
    const cached = getCached('agent_log');
    if (cached) return cached;
    const data = await callTool('get_agent_log');
    setCache('agent_log', data);
    return data;
  }

  async function getRelatedEntities(entity, opts = {}) {
    const key = `related_${entity}_${opts.type || ''}`;
    const cached = getCached(key);
    if (cached) return cached;

    const args = { entity };
    if (opts.type) args.type = opts.type;

    const data = await callTool('get_related_entities', args);
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

  return {
    checkVaultHealth,
    searchVault,
    queryFrontmatter,
    getCustomerContext,
    getNoteMetadata,
    getAgentLog,
    getRelatedEntities,
    getConnectionStatus,
    invalidateCache,
    disconnect
  };
}
