#!/usr/bin/env node

/**
 * score-meetings.js — Meeting priority scorer + conflict detector
 *
 * Reads normalized calendar JSON (from normalize-calendar.js) on stdin or file arg.
 * Computes priority scores, detects overlapping meetings, resolves conflicts.
 *
 * Usage:
 *   cat /tmp/cal-normalized.json | node scripts/helpers/score-meetings.js
 *   node scripts/helpers/score-meetings.js /tmp/cal-normalized.json --vip-list /path/to/vip-list.md
 *
 * Options:
 *   --vip-list <path>       Path to vault VIP list (markdown with names/emails)
 *   --user-email <email>    Your email (for organizer detection)
 *
 * Output: JSON with scored meetings and conflict groups.
 */

import { readFileSync, existsSync } from "node:fs";

// ── Parse args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null;
let vipListPath = null;
let userEmail = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--vip-list" && args[i + 1]) {
    vipListPath = args[++i];
  } else if (args[i] === "--user-email" && args[i + 1]) {
    userEmail = args[++i].toLowerCase();
  } else if (!args[i].startsWith("--")) {
    inputFile = args[i];
  }
}

// ── Read input ──────────────────────────────────────────────────────
let rawText;
if (inputFile) {
  rawText = readFileSync(inputFile, "utf8");
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  rawText = Buffer.concat(chunks).toString("utf8");
}

const events = JSON.parse(rawText);

// ── Load VIP list ───────────────────────────────────────────────────
const vipEmails = new Set();
const vipNames = new Set();

if (vipListPath && existsSync(vipListPath)) {
  const vipText = readFileSync(vipListPath, "utf8");
  // Extract emails from markdown (loose matching)
  for (const match of vipText.matchAll(/[\w.+-]+@[\w.-]+\.\w+/gi)) {
    vipEmails.add(match[0].toLowerCase());
  }
  // Extract names from markdown list items like "- **Name** — role"
  for (const match of vipText.matchAll(/^\s*-\s+\*\*([^*]+)\*\*/gm)) {
    vipNames.add(match[1].trim().toLowerCase());
  }
}

// ── Scoring rules (from morning-triage.prompt.md) ───────────────────
// +50 customer-facing (external attendees / customer keyword)
// +35 milestone-linked (not detectable without CRM — flag for later)
// +25 VIP/executive signal
// +15 prep-risk signal (not detectable here — downstream)
// +10 owner signal (organizer or direct owner)
// -40 declined signal
// -15 low-signal recurring (office hours / AMA / townhall patterns)

const LOW_SIGNAL_PATTERNS = [
  /office\s*hours/i,
  /\bAMA\b/,
  /\btownhall\b/i,
  /\btown\s*hall\b/i,
  /ask\s*me\s*anything/i,
  /community\s*call/i,
  /\bFoMO\b/,
  /\bopen\s+office/i,
  /\bnewsletter\b/i,
];

function hasVipSignal(evt) {
  // Check organizer
  if (vipEmails.has(evt.organizer.email)) return true;
  if (vipNames.has(evt.organizer.name.toLowerCase())) return true;
  // Check attendees (external only for efficiency)
  for (const a of evt.externalAttendees ?? []) {
    if (vipEmails.has(a.email)) return true;
    if (vipNames.has(a.name.toLowerCase())) return true;
  }
  return false;
}

function isLowSignalRecurring(evt) {
  return LOW_SIGNAL_PATTERNS.some((p) => p.test(evt.subject));
}

function scoreEvent(evt) {
  let score = 0;
  const signals = [];

  if (evt.isCustomerFacing) {
    score += 50;
    signals.push("+50 customer-facing");
  }

  if (hasVipSignal(evt)) {
    score += 25;
    signals.push("+25 VIP/executive");
  }

  if (evt.isOrganizer || (userEmail && evt.organizer.email === userEmail)) {
    score += 10;
    signals.push("+10 owner/organizer");
  }

  if (evt.isDeclined) {
    score -= 40;
    signals.push("-40 declined");
  }

  if (isLowSignalRecurring(evt) && !evt.isCustomerFacing) {
    score -= 15;
    signals.push("-15 low-signal recurring");
  }

  return { score, signals };
}

// ── Detect overlapping events → conflict groups ─────────────────────
function detectConflicts(events) {
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < events.length; i++) {
    if (assigned.has(i)) continue;
    const group = [i];
    assigned.add(i);

    for (let j = i + 1; j < events.length; j++) {
      if (assigned.has(j)) continue;
      // Check if j overlaps with any event in the group
      const overlaps = group.some((k) => {
        const a = events[k];
        const b = events[j];
        return new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);
      });
      if (overlaps) {
        group.push(j);
        assigned.add(j);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }
  return groups;
}

// ── Score all events ────────────────────────────────────────────────
const scored = events.map((evt, idx) => {
  const { score, signals } = scoreEvent(evt);
  return { ...evt, score, signals, index: idx };
});

// ── Detect conflicts and rank within groups ─────────────────────────
const conflictGroups = detectConflicts(scored);
const conflictMap = new Map(); // index → { groupId, rank, chosen }

conflictGroups.forEach((group, gIdx) => {
  // Sort by score descending, then by earliest external milestone (not available), then start time, then external count
  const ranked = [...group].sort((a, b) => {
    const sa = scored[a].score;
    const sb = scored[b].score;
    if (sb !== sa) return sb - sa;
    // Tie-break: earlier start time
    const ta = new Date(scored[a].start).getTime();
    const tb = new Date(scored[b].start).getTime();
    if (ta !== tb) return ta - tb;
    // Tie-break: more external attendees
    return (scored[b].externalCount ?? 0) - (scored[a].externalCount ?? 0);
  });

  ranked.forEach((evtIdx, rank) => {
    conflictMap.set(evtIdx, {
      groupId: gIdx + 1,
      rank: rank + 1,
      chosen: rank === 0,
      groupMembers: group.map((i) => scored[i].subject),
    });
  });
});

// ── Build output ────────────────────────────────────────────────────
const output = {
  meetings: scored.map((evt) => {
    const conflict = conflictMap.get(evt.index);
    return {
      subject: evt.subject,
      startLocal: evt.startLocal,
      endLocal: evt.endLocal,
      start: evt.start,
      end: evt.end,
      organizer: evt.organizer,
      externalAttendees: evt.externalAttendees,
      attendeeCount: evt.attendeeCount,
      webLink: evt.webLink,
      score: evt.score,
      signals: evt.signals,
      isCustomerFacing: evt.isCustomerFacing,
      isDeclined: evt.isDeclined,
      isCancelled: evt.isCancelled,
      isOrganizer: evt.isOrganizer,
      joinUrl: evt.joinUrl,
      location: evt.location,
      conflict: conflict
        ? {
            groupId: conflict.groupId,
            rank: conflict.rank,
            chosen: conflict.chosen,
            conflictsWith: conflict.groupMembers.filter((s) => s !== evt.subject),
          }
        : null,
    };
  }),
  summary: {
    totalEvents: scored.length,
    customerFacing: scored.filter((e) => e.isCustomerFacing).length,
    declined: scored.filter((e) => e.isDeclined).length,
    conflictGroups: conflictGroups.length,
    conflictDecisions: conflictGroups.length,
    unresolvedConflicts: 0,
  },
};

console.log(JSON.stringify(output, null, 2));
