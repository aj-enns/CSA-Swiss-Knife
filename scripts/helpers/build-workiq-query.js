#!/usr/bin/env node

/**
 * build-workiq-query.js — WorkIQ query builder
 *
 * Constructs properly scoped WorkIQ prompts from structured inputs.
 * Prevents malformed queries by enforcing time bounds, entity scoping,
 * and source-type constraints.
 *
 * Usage:
 *   node scripts/helpers/build-workiq-query.js \
 *     --goal "decision log" \
 *     --sources meetings,chats \
 *     --entities "Adam Ziesmer,Blue KC" \
 *     --time-window 14d \
 *     --topic "PriorAuth"
 *
 *   node scripts/helpers/build-workiq-query.js \
 *     --goal "action items from last week" \
 *     --sources meetings,email \
 *     --time-window 7d
 *
 * Options:
 *   --goal <text>          What you're looking for (required)
 *   --sources <list>       Comma-separated: meetings,chats,email,files (default: meetings,chats)
 *   --entities <list>      Comma-separated people/org names to scope the search
 *   --time-window <spec>   Time window: 7d, 14d, 30d, or ISO date range (default: 14d)
 *   --topic <text>         Topic keywords to narrow results
 *   --output-shape <type>  Desired output: summary, actions, decisions, risks (default: summary)
 *   --user-name <name>     Your name (for personal attribution filter)
 *
 * Output: Structured WorkIQ prompt text to stdout.
 */

// ── Parse args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
let goal = null;
let sources = ["meetings", "chats"];
let entities = [];
let timeWindow = "14d";
let topic = null;
let outputShape = "summary";
let userName = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--goal" && args[i + 1]) goal = args[++i];
  else if (args[i] === "--sources" && args[i + 1]) sources = args[++i].split(",").map((s) => s.trim());
  else if (args[i] === "--entities" && args[i + 1]) entities = args[++i].split(",").map((s) => s.trim());
  else if (args[i] === "--time-window" && args[i + 1]) timeWindow = args[++i];
  else if (args[i] === "--topic" && args[i + 1]) topic = args[++i];
  else if (args[i] === "--output-shape" && args[i + 1]) outputShape = args[++i];
  else if (args[i] === "--user-name" && args[i + 1]) userName = args[++i];
}

if (!goal) {
  console.error("ERROR: --goal is required");
  console.error("Example: node scripts/helpers/build-workiq-query.js --goal 'action items from sync' --sources meetings --time-window 7d");
  process.exit(1);
}

// ── Resolve time window to ISO dates ────────────────────────────────
function resolveTimeWindow(spec) {
  const now = new Date();
  const end = now.toISOString().split("T")[0];

  if (spec.includes("..")) {
    const [start, rangeEnd] = spec.split("..");
    return { start, end: rangeEnd || end };
  }

  const match = spec.match(/^(\d+)d$/);
  if (match) {
    const days = parseInt(match[1], 10);
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    return { start: start.toISOString().split("T")[0], end };
  }

  // Assume ISO date
  return { start: spec, end };
}

const { start, end } = resolveTimeWindow(timeWindow);

// ── Source type mapping ─────────────────────────────────────────────
const SOURCE_LABELS = {
  meetings: "meeting transcripts and notes",
  chats: "Teams chat messages",
  email: "email messages",
  files: "SharePoint and OneDrive files",
};

// ── Build the query ─────────────────────────────────────────────────
const parts = [];

// Goal statement
parts.push(`Find: ${goal}`);

// Time constraint (REQUIRED — always explicit)
parts.push(`Time range: ${start} to ${end}`);

// Source scoping
const sourceLabels = sources.map((s) => SOURCE_LABELS[s] || s).join(", ");
parts.push(`Search in: ${sourceLabels}`);

// Entity scoping
if (entities.length > 0) {
  parts.push(`People/organizations: ${entities.join(", ")}`);
}

// Topic keywords
if (topic) {
  parts.push(`Topic keywords: ${topic}`);
}

// Personal attribution
if (userName) {
  parts.push(`Include only items where ${userName} appears as sender, recipient, attendee, author, or named contributor.`);
}

// Output shape
const shapeInstructions = {
  summary: "Provide a concise summary organized by topic or customer.",
  actions: "Extract action items with owner, deadline, and source reference.",
  decisions: "Extract key decisions made, with context and participants.",
  risks: "Identify risks, blockers, and open questions with context.",
};
parts.push(`Output format: ${shapeInstructions[outputShape] || shapeInstructions.summary}`);

// Guardrails
parts.push("Group results by customer or topic. Do not return raw dumps.");

const query = parts.join("\n");

// ── Output ──────────────────────────────────────────────────────────
const output = {
  query,
  metadata: {
    goal,
    sources,
    entities,
    timeRange: { start, end },
    topic,
    outputShape,
    userName,
  },
};

console.log(JSON.stringify(output, null, 2));
