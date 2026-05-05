#!/usr/bin/env node
/**
 * capture-screenshots.mjs — Playwright-based screenshot capture for MCAPS IQ Dashboard
 *
 * Starts the shared server, navigates to each view, and saves full-page
 * screenshots into the screenshots/ directory. Used to generate docs assets.
 *
 * Usage:
 *   node .github/extensions/mcaps-iq-dashboard/scripts/capture-screenshots.mjs
 *
 * Options:
 *   --port <n>       Server port (default: 3851, avoids conflicting with live dashboard)
 *   --width <n>      Viewport width (default: 1440)
 *   --height <n>     Viewport height (default: 900)
 *   --dark           Capture in dark mode (prefers-color-scheme: dark)
 *   --out <dir>      Output directory (default: screenshots/)
 *   --views <list>   Comma-separated view names to capture (default: all)
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIR = join(__dirname, '..');
const SERVER_SCRIPT = join(EXTENSION_DIR, 'lib', 'shared-server.mjs');
const REPO_ROOT = join(EXTENSION_DIR, '..', '..', '..', '..');

// ── CLI args ───────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    port: 3851,
    width: 1440,
    height: 900,
    dark: false,
    out: join(EXTENSION_DIR, 'screenshots'),
    views: null
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') opts.port = Number(args[++i]);
    else if (args[i] === '--width') opts.width = Number(args[++i]);
    else if (args[i] === '--height') opts.height = Number(args[++i]);
    else if (args[i] === '--dark') opts.dark = true;
    else if (args[i] === '--out') opts.out = args[++i];
    else if (args[i] === '--views') opts.views = args[++i].split(',');
  }
  return opts;
}

// ── View definitions ───────────────────────────────────────────

const VIEWS = [
  {
    id: 'home',
    route: '#/home',
    filename: '01-home.png',
    title: 'Home — Role Dashboard',
    waitFor: '.home-view, .role-actions, #home-root'
  },
  {
    id: 'opportunities',
    route: '#/opportunities',
    filename: '02-opportunities.png',
    title: 'Opportunities — Pipeline Health',
    waitFor: '.opp-view, .opp-table, #opp-root'
  },
  {
    id: 'accounts',
    route: '#/accounts',
    filename: '03-accounts.png',
    title: 'Accounts — Account Aggregation',
    waitFor: '.accounts-view, .account-card, #accounts-root'
  },
  {
    id: 'skills',
    route: '#/skills',
    filename: '04-skills-roles.png',
    title: 'Skills Explorer — Roles Tab',
    waitFor: '.skills-view, .skills-tabs, #skills-root'
  },
  {
    id: 'skills-all',
    route: '#/skills',
    filename: '05-skills-all.png',
    title: 'Skills Explorer — All Skills Tab',
    waitFor: '.skills-view, .skills-tabs, #skills-root',
    setup: async (page) => {
      // Click the "All Skills" tab
      const tab = await page.$('.skills-tab[data-tab="all"]');
      if (tab) await tab.click();
      await page.waitForTimeout(500);
    }
  },
  {
    id: 'skills-agents',
    route: '#/skills',
    filename: '06-skills-agents.png',
    title: 'Skills Explorer — Agents & Architecture',
    waitFor: '.skills-view, .skills-tabs, #skills-root',
    setup: async (page) => {
      const tab = await page.$('.skills-tab[data-tab="agents"]');
      if (tab) await tab.click();
      await page.waitForTimeout(500);
    }
  },
  {
    id: 'mcp-servers',
    route: '#/mcp-servers',
    filename: '07-mcp-servers.png',
    title: 'MCP Servers — Toggle Servers',
    waitFor: '.mcp-servers-view, #mcp-servers-root'
  },
  {
    id: 'mission-control',
    route: '#/mission-control',
    filename: '08-mission-control.png',
    title: 'Mission Control — Live Sessions & History',
    waitFor: '.mc-view, .mc-container, #mc-root'
  },
  {
    id: 'schedules',
    route: '#/schedules',
    filename: '09-schedules.png',
    title: 'Schedules — Cron Job Management',
    waitFor: '.schedules-view, #schedules-root'
  },
  {
    id: 'settings',
    route: '#/settings',
    filename: '10-settings.png',
    title: 'Settings — Role & Preferences',
    waitFor: '.mcaps-settings, #settings-root'
  }
];

// ── Server lifecycle ───────────────────────────────────────────

async function startServer(port) {
  const nodeModulesDir = join(REPO_ROOT, 'node_modules');
  const child = spawn('node', [SERVER_SCRIPT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MCAPS_IQ_PORT: String(port),
      MCAPS_IQ_PUBLIC_DIR: join(EXTENSION_DIR, 'public'),
      MCAPS_IQ_REPO_ROOT: REPO_ROOT,
      NODE_PATH: process.env.NODE_PATH
        ? `${nodeModulesDir}:${process.env.NODE_PATH}`
        : nodeModulesDir
    }
  });

  // Wait for health endpoint
  const maxWait = 15_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        console.log(`  ✓ Server ready on port ${port}`);
        return child;
      }
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  child.kill();
  throw new Error(`Server failed to start on port ${port} within ${maxWait}ms`);
}

// ── Screenshot capture ─────────────────────────────────────────

async function captureScreenshots(opts) {
  const { port, width, height, dark, out } = opts;
  const url = `http://127.0.0.1:${port}`;
  const suffix = dark ? '-dark' : '';

  mkdirSync(out, { recursive: true });

  const views = opts.views
    ? VIEWS.filter(v => opts.views.includes(v.id))
    : VIEWS;

  console.log(`\n📸 Capturing ${views.length} views (${width}×${height}${dark ? ', dark mode' : ''})…\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: dark ? 'dark' : 'light',
    deviceScaleFactor: 2  // Retina-quality screenshots
  });
  const page = await context.newPage();

  for (const view of views) {
    const fname = suffix
      ? view.filename.replace('.png', `${suffix}.png`)
      : view.filename;

    process.stdout.write(`  ${view.title}… `);

    await page.goto(`${url}/${view.route}`, { waitUntil: 'networkidle' });

    // Wait for the view's container to appear
    try {
      const selectors = view.waitFor.split(',').map(s => s.trim());
      await Promise.race(
        selectors.map(s => page.waitForSelector(s, { timeout: 5000 }).catch(() => null))
      );
    } catch { /* timeout — capture whatever is rendered */ }

    // Allow any animations/transitions to settle
    await page.waitForTimeout(800);

    // Run view-specific setup (e.g. clicking tabs)
    if (typeof view.setup === 'function') {
      await view.setup(page);
    }

    const outPath = join(out, fname);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`✓ ${fname}`);
  }

  await browser.close();
  console.log(`\n✅ ${views.length} screenshots saved to ${out}/\n`);
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('🚀 Starting dashboard server…');
  let serverProcess;
  try {
    serverProcess = await startServer(opts.port);
    await captureScreenshots(opts);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
      console.log('🛑 Server stopped.');
    }
  }
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
