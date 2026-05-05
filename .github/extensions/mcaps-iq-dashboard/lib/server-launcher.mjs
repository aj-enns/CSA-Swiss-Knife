/**
 * Server Launcher — spawns shared-server.mjs as a detached child process.
 * Uses a lockfile for singleton enforcement so multiple CLI sessions
 * share one dashboard server.
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = join(__dirname, 'shared-server.mjs');

function getLockBaseDir() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir();
  }
  return join(os.homedir(), '.local', 'share');
}

function getLockfilePath(repoRoot) {
  const hash = createHash('sha256')
    .update(String(repoRoot).toLowerCase())
    .digest('hex')
    .slice(0, 16);
  const dir = join(getLockBaseDir(), 'mcaps-iq', 'locks');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${hash}.json`);
}

async function isServerHealthy(port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureServer({ port, publicDir, repoRoot }) {
  const lockPath = getLockfilePath(repoRoot);

  // Check existing lockfile
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (lock.port && await isServerHealthy(lock.port)) {
        return { port: lock.port, isNew: false };
      }
    } catch { /* stale lock */ }
    try { unlinkSync(lockPath); } catch { /* noop */ }
  }

  // Spawn detached server — use explicit `node` so this works even when
  // process.execPath points to the Copilot CLI binary instead of Node.
  // Set NODE_PATH so the server can resolve deps from the repo's node_modules.
  const nodeBin = process.env.COPILOT_NODE_PATH || 'node';
  const nodeModulesDir = join(repoRoot, 'node_modules');
  const errLogPath = join(getLockBaseDir(), 'mcaps-iq', 'locks', 'server-stderr.log');
  const { openSync } = await import('fs');
  const errFd = openSync(errLogPath, 'w');

  const child = spawn(nodeBin, [SERVER_SCRIPT], {
    detached: true,
    stdio: ['ignore', 'ignore', errFd],
    env: {
      ...process.env,
      MCAPS_IQ_PORT: String(port),
      MCAPS_IQ_PUBLIC_DIR: publicDir,
      MCAPS_IQ_REPO_ROOT: repoRoot,
      NODE_PATH: process.env.NODE_PATH
        ? `${nodeModulesDir}:${process.env.NODE_PATH}`
        : nodeModulesDir
    }
  });
  child.unref();

  // Poll until healthy
  const startTime = Date.now();
  while (Date.now() - startTime < 8000) {
    await new Promise(r => setTimeout(r, 500));
    if (await isServerHealthy(port)) {
      writeFileSync(lockPath, JSON.stringify({
        pid: child.pid,
        port,
        repoRoot,
        startedAt: new Date().toISOString()
      }));
      return { port, isNew: true };
    }
  }

  // Read stderr for diagnostics
  let errDetail = '';
  try { errDetail = readFileSync(errLogPath, 'utf8').trim(); } catch { /* noop */ }
  const detail = errDetail ? `: ${errDetail.split('\n').pop()}` : '';
  throw new Error(`MCAPS IQ Dashboard server failed to start on port ${port}${detail}`);
}
