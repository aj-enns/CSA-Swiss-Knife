/**
 * Cron Scheduler — Device-local scheduled prompt execution engine.
 *
 * Persists schedules to a JSON file alongside settings. Evaluates standard
 * 5-field cron expressions (minute hour day-of-month month day-of-week).
 * No external dependencies.
 *
 * Usage:
 *   const scheduler = createCronScheduler({ filePath, onTrigger });
 *   scheduler.start();
 *   scheduler.add({ name: 'Morning Brief', cron: '0 7 * * 1-5', prompt: '/morning-brief' });
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

// ── Cron Expression Parser ─────────────────────────────────────

// Parse a single cron field into a Set of allowed integer values.
// Supports: *, N, N-M, N-M/S, */S, N/S, comma-separated lists.
function parseField(field, min, max) {
  const values = new Set();

  for (const part of field.split(',')) {
    const trimmed = part.trim();

    // */step or step alone
    const allStep = trimmed.match(/^\*\/(\d+)$/);
    if (allStep) {
      const step = parseInt(allStep[1], 10);
      for (let i = min; i <= max; i += step) values.add(i);
      continue;
    }

    // wildcard
    if (trimmed === '*') {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    // range with optional step: N-M or N-M/S
    const range = trimmed.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      const step = range[3] ? parseInt(range[3], 10) : 1;
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }

    // single number with step: N/S
    const numStep = trimmed.match(/^(\d+)\/(\d+)$/);
    if (numStep) {
      const start = parseInt(numStep[1], 10);
      const step = parseInt(numStep[2], 10);
      for (let i = start; i <= max; i += step) values.add(i);
      continue;
    }

    // plain number
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      values.add(num);
    }
  }

  return values;
}

/** Day-of-week names → numbers (0=Sun … 6=Sat) */
const DOW_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function normalizeDow(field) {
  return field.replace(/\b(sun|mon|tue|wed|thu|fri|sat)\b/gi, (m) => DOW_MAP[m.toLowerCase()]);
}

const MONTH_MAP = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function normalizeMonth(field) {
  return field.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi, (m) => MONTH_MAP[m.toLowerCase()]);
}

/**
 * Parse a 5-field cron expression into sets of allowed values.
 * Returns { minutes, hours, daysOfMonth, months, daysOfWeek }.
 */
function parseCron(expr) {
  // Handle common aliases
  const aliases = {
    '@yearly':   '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly':  '0 0 1 * *',
    '@weekly':   '0 0 * * 0',
    '@daily':    '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly':   '0 * * * *',
  };
  const resolved = aliases[expr.trim().toLowerCase()] || expr.trim();
  const parts = resolved.split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: "${expr}" — expected 5 fields`);

  return {
    minutes:     parseField(parts[0], 0, 59),
    hours:       parseField(parts[1], 0, 23),
    daysOfMonth: parseField(parts[2], 1, 31),
    months:      parseField(normalizeMonth(parts[3]), 1, 12),
    daysOfWeek:  parseField(normalizeDow(parts[4]), 0, 6),
  };
}

/**
 * Check if a Date matches a parsed cron schedule.
 */
function matchesCron(date, parsed) {
  return parsed.minutes.has(date.getMinutes())
    && parsed.hours.has(date.getHours())
    && parsed.daysOfMonth.has(date.getDate())
    && parsed.months.has(date.getMonth() + 1)
    && parsed.daysOfWeek.has(date.getDay());
}

/**
 * Compute the next fire time after `after` for a parsed cron schedule.
 * Brute-forces by minute — safe for schedules within a year horizon.
 */
function nextFireTime(parsed, after = new Date()) {
  const check = new Date(after);
  // Advance to next full minute
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1);

  // Search up to 366 days ahead
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matchesCron(check, parsed)) return check;
    check.setMinutes(check.getMinutes() + 1);
  }
  return null; // No match within a year
}

/**
 * Validate a cron expression. Returns null if valid, error string if invalid.
 */
export function validateCron(expr) {
  try {
    parseCron(expr);
    return null;
  } catch (err) {
    return err.message;
  }
}

/**
 * Get a human-readable description of a cron expression.
 */
export function describeCron(expr) {
  const aliases = {
    '@yearly':   'Once a year (Jan 1 midnight)',
    '@annually': 'Once a year (Jan 1 midnight)',
    '@monthly':  'Monthly (1st at midnight)',
    '@weekly':   'Weekly (Sunday midnight)',
    '@daily':    'Daily at midnight',
    '@midnight': 'Daily at midnight',
    '@hourly':   'Every hour',
  };
  if (aliases[expr.trim().toLowerCase()]) return aliases[expr.trim().toLowerCase()];

  try {
    const parsed = parseCron(expr);
    const parts = [];

    // Minutes
    if (parsed.minutes.size === 60) {
      parts.push('every minute');
    } else if (parsed.minutes.size === 1) {
      parts.push(`at minute ${[...parsed.minutes][0]}`);
    } else {
      parts.push(`at minutes ${[...parsed.minutes].sort((a, b) => a - b).join(', ')}`);
    }

    // Hours
    if (parsed.hours.size < 24) {
      const hrs = [...parsed.hours].sort((a, b) => a - b).map(h =>
        h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
      );
      parts.push(hrs.length === 1 ? `at ${hrs[0]}` : `at ${hrs.join(', ')}`);
    }

    // Days of week
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (parsed.daysOfWeek.size < 7) {
      const days = [...parsed.daysOfWeek].sort((a, b) => a - b).map(d => dowNames[d]);
      parts.push(`on ${days.join(', ')}`);
    }

    return parts.join(' ');
  } catch {
    return expr;
  }
}

// ── Scheduler ──────────────────────────────────────────────────

/**
 * Create a cron scheduler instance.
 *
 * @param {Object} opts
 * @param {string} opts.filePath - Path to the JSON persistence file
 * @param {Function} opts.onTrigger - Called with (schedule) when a job fires
 * @param {Function} [opts.onError] - Called with (error, schedule) on failures
 */
export function createCronScheduler({ filePath, onTrigger, onError }) {
  let schedules = [];
  let timer = null;
  let running = false;

  // ── Persistence ────────────────────────────────────────────

  function load() {
    try {
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, 'utf8'));
        schedules = Array.isArray(data.schedules) ? data.schedules : [];
      }
    } catch {
      schedules = [];
    }
  }

  function save() {
    writeFileSync(filePath, JSON.stringify({ schedules, version: 1 }, null, 2));
  }

  // ── CRUD ───────────────────────────────────────────────────

  function list() {
    return schedules.map(s => ({
      ...s,
      nextRun: computeNextRun(s)
    }));
  }

  function get(id) {
    const s = schedules.find(s => s.id === id);
    if (!s) return null;
    return { ...s, nextRun: computeNextRun(s) };
  }

  function add({ name, cron, prompt, enabled = true }) {
    const err = validateCron(cron);
    if (err) throw new Error(err);

    const schedule = {
      id: randomUUID(),
      name: name || prompt,
      cron,
      prompt,
      enabled,
      createdAt: new Date().toISOString(),
      lastRun: null,
      runCount: 0
    };
    schedules.push(schedule);
    save();
    return { ...schedule, nextRun: computeNextRun(schedule) };
  }

  function update(id, patch) {
    const idx = schedules.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Schedule not found');

    if (patch.cron !== undefined) {
      const err = validateCron(patch.cron);
      if (err) throw new Error(err);
    }

    const allowed = ['name', 'cron', 'prompt', 'enabled'];
    for (const key of allowed) {
      if (patch[key] !== undefined) schedules[idx][key] = patch[key];
    }
    save();
    return { ...schedules[idx], nextRun: computeNextRun(schedules[idx]) };
  }

  function remove(id) {
    const idx = schedules.findIndex(s => s.id === id);
    if (idx === -1) return false;
    schedules.splice(idx, 1);
    save();
    return true;
  }

  // ── Evaluation ─────────────────────────────────────────────

  function computeNextRun(schedule) {
    if (!schedule.enabled) return null;
    try {
      const parsed = parseCron(schedule.cron);
      const next = nextFireTime(parsed);
      return next ? next.toISOString() : null;
    } catch {
      return null;
    }
  }

  function tick() {
    const now = new Date();
    now.setSeconds(0, 0); // Normalize to minute boundary

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      try {
        const parsed = parseCron(schedule.cron);
        if (matchesCron(now, parsed)) {
          // Prevent double-fire within the same minute
          if (schedule.lastRun) {
            const last = new Date(schedule.lastRun);
            last.setSeconds(0, 0);
            if (last.getTime() === now.getTime()) continue;
          }

          schedule.lastRun = now.toISOString();
          schedule.runCount = (schedule.runCount || 0) + 1;
          save();

          try {
            onTrigger(schedule);
          } catch (err) {
            if (onError) onError(err, schedule);
          }
        }
      } catch (err) {
        if (onError) onError(err, schedule);
      }
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────

  function start() {
    if (running) return;
    running = true;
    load();

    // Align to the next minute boundary for clean tick timing
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    setTimeout(() => {
      tick(); // Fire at first aligned minute
      timer = setInterval(tick, 60_000);
    }, msToNextMinute);
  }

  // ── Ad-hoc trigger ──────────────────────────────────────────

  /**
   * Immediately fire an existing schedule (ad-hoc test).
   * Updates lastRun and runCount. Returns the schedule.
   */
  function triggerNow(id) {
    const idx = schedules.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Schedule not found');
    const schedule = schedules[idx];
    schedule.lastRun = new Date().toISOString();
    schedule.runCount = (schedule.runCount || 0) + 1;
    save();
    onTrigger(schedule);
    return { ...schedule, nextRun: computeNextRun(schedule) };
  }

  // ── One-time delayed triggers ─────────────────────────────

  const pendingOnce = new Map(); // id → { timeout, entry }

  /**
   * Schedule a one-time prompt execution at a future time.
   * @param {Object} opts
   * @param {string} opts.prompt — prompt text to fire
   * @param {string} opts.name — display name
   * @param {string} opts.runAt — ISO 8601 timestamp when to fire
   * @returns {{ id, name, prompt, runAt, createdAt }}
   */
  function scheduleOnce({ prompt, name, runAt }) {
    if (!prompt) throw new Error('prompt is required');
    if (!runAt) throw new Error('runAt is required');
    const target = new Date(runAt);
    const delayMs = target.getTime() - Date.now();
    if (delayMs < 0) throw new Error('runAt must be in the future');
    // Cap at 24 hours to avoid unreliable long setTimeout
    if (delayMs > 24 * 60 * 60 * 1000) throw new Error('runAt must be within 24 hours');

    const id = randomUUID();
    const entry = {
      id,
      name: name || prompt,
      prompt,
      runAt: target.toISOString(),
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    const timeout = setTimeout(() => {
      entry.status = 'fired';
      entry.firedAt = new Date().toISOString();
      pendingOnce.delete(id);
      // Fire through normal trigger path (with a synthetic schedule-like object)
      try {
        onTrigger({ id, name: entry.name, prompt, oneTime: true });
      } catch (err) {
        if (onError) onError(err, entry);
      }
    }, delayMs);

    pendingOnce.set(id, { timeout, entry });
    return entry;
  }

  /**
   * List all pending one-time triggers.
   */
  function listOnce() {
    return [...pendingOnce.values()].map(v => ({ ...v.entry }));
  }

  /**
   * Cancel a pending one-time trigger.
   */
  function cancelOnce(id) {
    const pending = pendingOnce.get(id);
    if (!pending) return false;
    clearTimeout(pending.timeout);
    pendingOnce.delete(id);
    return true;
  }

  function stop() {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    // Clean up one-time timers
    for (const [, { timeout }] of pendingOnce) clearTimeout(timeout);
    pendingOnce.clear();
  }

  return { list, get, add, update, remove, triggerNow, scheduleOnce, listOnce, cancelOnce, start, stop, reload: load };
}
