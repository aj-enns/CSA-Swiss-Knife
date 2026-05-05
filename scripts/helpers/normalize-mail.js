#!/usr/bin/env node

/**
 * normalize-mail.js — Mail search result normalizer
 *
 * Reads raw mail:SearchMessages MCP JSON from stdin or file arg.
 * Outputs compact, normalized mail items to stdout.
 *
 * Usage:
 *   cat /tmp/mail-raw.json | node scripts/helpers/normalize-mail.js
 *   node scripts/helpers/normalize-mail.js /tmp/mail-raw.json
 *   node scripts/helpers/normalize-mail.js /tmp/mail-raw.json --vip-list /path/to/vip-list.md
 *
 * Options:
 *   --vip-list <path>         Path to vault VIP list for sender classification
 *   --internal-domain <d>     Comma-separated internal domains (default: microsoft.com)
 *   --suppress-patterns <p>   File path with regex patterns for noise suppression (one per line)
 *
 * Output: JSON array of normalized mail items sorted by received time (newest first).
 */

import { readFileSync, existsSync } from "node:fs";

// ── Parse args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null;
let vipListPath = null;
let internalDomains = ["microsoft.com"];
let suppressFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--vip-list" && args[i + 1]) {
    vipListPath = args[++i];
  } else if (args[i] === "--internal-domain" && args[i + 1]) {
    internalDomains = args[++i].toLowerCase().split(",");
  } else if (args[i] === "--suppress-patterns" && args[i + 1]) {
    suppressFile = args[++i];
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

let messages;
try {
  const parsed = JSON.parse(rawText);
  messages = Array.isArray(parsed) ? parsed : parsed.value ?? parsed.messages ?? [parsed];
} catch {
  console.error("ERROR: Input is not valid JSON.");
  process.exit(1);
}

// ── Load VIP list ───────────────────────────────────────────────────
const vipEmails = new Set();

if (vipListPath && existsSync(vipListPath)) {
  const vipText = readFileSync(vipListPath, "utf8");
  for (const match of vipText.matchAll(/[\w.+-]+@[\w.-]+\.\w+/gi)) {
    vipEmails.add(match[0].toLowerCase());
  }
}

// ── Load suppression patterns ───────────────────────────────────────
const suppressPatterns = [];

if (suppressFile && existsSync(suppressFile)) {
  const lines = readFileSync(suppressFile, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      suppressPatterns.push(new RegExp(line.trim(), "i"));
    } catch { /* skip invalid regex */ }
  }
}

// Built-in noise suppression patterns
const NOISE_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /automated|notification/i,
  /do.not.reply/i,
];

// ── Helpers ─────────────────────────────────────────────────────────
function extractEmail(from) {
  if (!from) return { name: "", email: "" };
  if (from.emailAddress) {
    return {
      name: from.emailAddress.name ?? "",
      email: (from.emailAddress.address ?? "").toLowerCase(),
    };
  }
  return {
    name: from.name ?? "",
    email: (from.email ?? from.address ?? "").toLowerCase(),
  };
}

function isExternal(email) {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain && !internalDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function isSuppressed(subject, fromEmail) {
  const allPatterns = [...NOISE_PATTERNS, ...suppressPatterns];
  if (allPatterns.some((p) => p.test(subject) || p.test(fromEmail))) return true;
  return false;
}

function classifyPriority(msg) {
  const { from, importance, isExternalSender, isVipSender, subject } = msg;
  // VIP + external = URGENT candidate
  if (isVipSender) return isExternalSender ? "URGENT" : "HIGH";
  // High importance flag from Outlook
  if (importance === "high") return "HIGH";
  // External sender = at least NORMAL
  if (isExternalSender) return "NORMAL";
  return "NORMAL";
}

// ── Normalize messages ──────────────────────────────────────────────
const normalized = messages.map((msg) => {
  const from = extractEmail(msg.from);
  const subject = msg.subject ?? "(no subject)";
  const received = msg.receivedDateTime ?? msg.received ?? "";
  const snippet = msg.bodyPreview ?? msg.preview ?? msg.snippet ?? "";
  const webLink = msg.webLink ?? "";
  const isRead = msg.isRead ?? true;
  const importance = (msg.importance ?? "normal").toLowerCase();
  const hasAttachments = msg.hasAttachments ?? false;
  const isExternalSender = isExternal(from.email);
  const isVipSender = vipEmails.has(from.email);
  const suppressed = isSuppressed(subject, from.email);

  const item = {
    subject,
    from,
    received,
    snippet: snippet.slice(0, 200),
    webLink,
    isRead,
    importance,
    hasAttachments,
    isExternalSender,
    isVipSender,
    suppressed,
    priority: null, // will be set below
  };

  item.priority = suppressed ? "LOW" : classifyPriority(item);

  return item;
});

// ── Sort by received time (newest first) ────────────────────────────
normalized.sort((a, b) => new Date(b.received) - new Date(a.received));

// ── Summary ─────────────────────────────────────────────────────────
const summary = {
  total: normalized.length,
  unread: normalized.filter((m) => !m.isRead).length,
  vip: normalized.filter((m) => m.isVipSender).length,
  external: normalized.filter((m) => m.isExternalSender).length,
  suppressed: normalized.filter((m) => m.suppressed).length,
  byPriority: {
    URGENT: normalized.filter((m) => m.priority === "URGENT").length,
    HIGH: normalized.filter((m) => m.priority === "HIGH").length,
    NORMAL: normalized.filter((m) => m.priority === "NORMAL").length,
    LOW: normalized.filter((m) => m.priority === "LOW").length,
  },
};

console.log(JSON.stringify({ messages: normalized, summary }, null, 2));
