#!/usr/bin/env node

/**
 * normalize-calendar.js — Calendar event normalizer
 *
 * Reads raw calendar:ListCalendarView MCP JSON from stdin or file arg.
 * Outputs compact, normalized event JSON to stdout.
 *
 * Usage:
 *   cat /tmp/cal-raw.json | node scripts/helpers/normalize-calendar.js
 *   node scripts/helpers/normalize-calendar.js /tmp/cal-raw.json
 *   node scripts/helpers/normalize-calendar.js /tmp/cal-raw.json --tz America/Chicago
 *   node scripts/helpers/normalize-calendar.js /tmp/cal-raw.json --user-email jin.lee@microsoft.com
 *
 * Options:
 *   --tz <timezone>         IANA timezone for local time display (default: America/Chicago)
 *   --user-email <email>    Your email to detect owner/organizer meetings
 *   --internal-domain <d>   Comma-separated internal domains (default: microsoft.com)
 *
 * Output: JSON array of normalized events sorted by start time.
 */

import { readFileSync } from "node:fs";

// ── Parse args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null;
let tz = "America/Chicago";
let userEmail = null;
let internalDomains = ["microsoft.com"];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--tz" && args[i + 1]) {
    tz = args[++i];
  } else if (args[i] === "--user-email" && args[i + 1]) {
    userEmail = args[++i].toLowerCase();
  } else if (args[i] === "--internal-domain" && args[i + 1]) {
    internalDomains = args[++i].toLowerCase().split(",");
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

// ── Parse JSON — handle both raw array and wrapped response ────────
let events;
try {
  const parsed = JSON.parse(rawText);
  events = Array.isArray(parsed) ? parsed : parsed.value ?? parsed.events ?? [parsed];
} catch {
  console.error("ERROR: Input is not valid JSON. Pass raw ListCalendarView MCP response.");
  process.exit(1);
}

// ── Response code mapping (Calendar MCP server) ─────────────────────
const RESPONSE_MAP = {
  0: "none",
  1: "organizer",
  2: "accepted",
  3: "tentative",
  4: "declined",
  5: "notResponded",
};

function resolveResponse(val) {
  if (typeof val === "string") return val.toLowerCase();
  return RESPONSE_MAP[val] ?? "none";
}

function isExternal(email) {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain && !internalDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function formatLocalTime(isoStr) {
  try {
    const d = new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z");
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    });
  } catch {
    return isoStr;
  }
}

function extractDateTime(field) {
  if (!field) return null;
  if (typeof field === "string") return field;
  return field.dateTime ?? field;
}

// ── Normalize events ────────────────────────────────────────────────
const normalized = events.map((evt) => {
  const startRaw = extractDateTime(evt.start);
  const endRaw = extractDateTime(evt.end);

  const attendees = (evt.attendees ?? []).map((a) => ({
    name: a.name ?? a.emailAddress?.name ?? "",
    email: (a.email ?? a.emailAddress?.address ?? "").toLowerCase(),
    response: resolveResponse(a.response ?? a.status?.response),
  }));

  const externalAttendees = attendees.filter((a) => isExternal(a.email));
  const acceptedCount = attendees.filter((a) => a.response === "accepted").length;
  const declinedCount = attendees.filter((a) => a.response === "declined").length;

  const orgEmail = (
    evt.organizer?.email ??
    evt.organizer?.emailAddress?.address ??
    ""
  ).toLowerCase();

  const subjectLower = (evt.subject ?? "").toLowerCase();
  const isDeclinedBySubject = subjectLower.startsWith("declined:") || subjectLower.startsWith("cancelled:");
  const isCancelled = evt.isCancelled === true || subjectLower.startsWith("cancelled:");
  const isOrganizer = userEmail ? orgEmail === userEmail : false;

  return {
    subject: evt.subject ?? "(no subject)",
    start: startRaw,
    end: endRaw,
    startLocal: formatLocalTime(startRaw),
    endLocal: formatLocalTime(endRaw),
    organizer: {
      name: evt.organizer?.name ?? evt.organizer?.emailAddress?.name ?? "",
      email: orgEmail,
    },
    attendeeCount: attendees.length,
    externalAttendees: externalAttendees.map((a) => ({
      name: a.name,
      email: a.email,
      domain: a.email.split("@")[1],
      response: a.response,
    })),
    externalCount: externalAttendees.length,
    acceptedCount,
    declinedCount,
    webLink: evt.webLink ?? "",
    isCustomerFacing: externalAttendees.length > 0,
    isDeclined: isDeclinedBySubject || evt.startsWithDeclinedOrCanceled === true,
    isCancelled,
    isAllDay: evt.isAllDay === true,
    isOnlineMeeting: evt.isOnlineMeeting === true,
    isOrganizer,
    joinUrl: evt.joinUrl ?? null,
    location: evt.location?.displayName ?? evt.location ?? null,
  };
});

// ── Sort by start time ──────────────────────────────────────────────
normalized.sort((a, b) => new Date(a.start) - new Date(b.start));

console.log(JSON.stringify(normalized, null, 2));
