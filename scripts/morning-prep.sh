#!/bin/bash
# morning-prep.sh — Copilot CLI-driven daily note population
#
# Called by Obsidian Cron (Mon–Fri, 7:00 AM) or manually.
# Uses copilot CLI with WorkIQ, OIL, and msx MCP servers
# to build today's daily note and individual meeting prep notes.

set -euo pipefail

REPO_DIR="${MCAPS_REPO:-$HOME/Repos/_InternalTools/mcaps-iq}"
VAULT_DIR="${OBSIDIAN_VAULT_PATH:-$HOME/Documents/Obsidian/Jin @ Microsoft}"
TODAY=$(date +%Y-%m-%d)
DAY_OF_WEEK=$(date +%u) # 1=Mon … 7=Sun

# Only run Mon–Fri
if [ "$DAY_OF_WEEK" -gt 5 ]; then
  echo "[morning-prep] Weekend — skipping."
  exit 0
fi

LOG_DIR="$VAULT_DIR/_agent-log"
LOG_FILE="$LOG_DIR/$TODAY.md"

log() {
  local ts
  ts=$(date +"%H:%M:%S")
  echo "[$ts] $*"
}

log "Starting morning prep for $TODAY"
log "Repo: $REPO_DIR"
log "Vault: $VAULT_DIR"

cd "$REPO_DIR" || { log "ERROR: Cannot cd to $REPO_DIR"; exit 1; }

# Ensure Azure CLI token is fresh (required for msx + WorkIQ)
if ! az account get-access-token --resource https://graph.microsoft.com > /dev/null 2>&1; then
  log "WARNING: Azure CLI token expired — MSX and WorkIQ calls may fail."
  log "Run 'az login' to refresh."
fi

# Resolve copilot CLI path
COPILOT_BIN="${COPILOT_CLI_PATH:-copilot}"
if ! command -v "$COPILOT_BIN" &> /dev/null; then
  # Try VS Code Insiders bundled copilot
  COPILOT_BIN="$HOME/Library/Application Support/Code - Insiders/User/globalStorage/github.copilot-chat/copilotCli/copilot"
  if [ ! -f "$COPILOT_BIN" ]; then
    log "ERROR: copilot CLI not found. Install: brew install copilot-cli"
    exit 1
  fi
fi

# Build the prompt from the template
PROMPT_FILE="$REPO_DIR/.github/prompts/morning-prep.prompt.md"
if [ ! -f "$PROMPT_FILE" ]; then
  log "ERROR: Prompt template not found at $PROMPT_FILE"
  exit 1
fi

# Replace {{TODAY}} placeholder in prompt
PROMPT_TEXT=$(sed "s/{{TODAY}}/$TODAY/g" "$PROMPT_FILE")

export OBSIDIAN_VAULT_PATH="$VAULT_DIR"

log "Running copilot CLI (non-interactive)…"

"$COPILOT_BIN" \
  -p "$PROMPT_TEXT" \
  --allow-all-tools \
  --allow-all-paths \
  --add-dir "$VAULT_DIR" \
  --output-format text \
  2>&1 | tee -a "/tmp/morning-prep-$TODAY.log"

EXIT_CODE=${PIPESTATUS[0]}

if [ "$EXIT_CODE" -eq 0 ]; then
  log "Morning prep completed successfully."
else
  log "Morning prep exited with code $EXIT_CODE — check /tmp/morning-prep-$TODAY.log"
fi

# Append to agent log
if [ -f "$LOG_FILE" ]; then
  echo "" >> "$LOG_FILE"
  echo "## Morning Prep (automated)" >> "$LOG_FILE"
  echo "- **Time:** $(date +"%H:%M")" >> "$LOG_FILE"
  echo "- **Status:** $([ "$EXIT_CODE" -eq 0 ] && echo '✅ Success' || echo '❌ Failed')" >> "$LOG_FILE"
  echo "- **Log:** \`/tmp/morning-prep-$TODAY.log\`" >> "$LOG_FILE"
fi

exit "$EXIT_CODE"
