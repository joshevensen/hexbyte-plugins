#!/usr/bin/env bash
# Condense a Claude Code session log (.jsonl) into a readable transcript for orc:walkthru.
# Keeps: user prompts, Claude's replies, tool calls (one line each), tool errors, files edited.
# Drops: tool output, attachments, system bookkeeping — they are most of the file and none of the "why".
#
# Usage: extract-session.sh [session-id]
#   With a session id → finds ~/.claude/projects/*/<id>.jsonl.
#   Without (or if not found) → newest .jsonl for the current directory's project (may be another
#   concurrent session — the caller should say so).
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "NO_JQ"
  exit 0
fi

id="${1:-}"
projects="$HOME/.claude/projects"
file=""

if [[ -n "$id" && "$id" != *'{'* ]]; then
  file=$(ls "$projects"/*/"$id".jsonl 2>/dev/null | head -1 || true)
fi

if [[ -z "$file" ]]; then
  # Claude Code encodes the project path by replacing / and . with -
  enc=$(pwd | sed 's#[/.]#-#g')
  file=$(ls -t "$projects/$enc"/*.jsonl 2>/dev/null | head -1 || true)
  [[ -n "$file" ]] && echo "NOTE: session id not available; using newest log for this directory: $(basename "$file")"
fi

if [[ -z "$file" ]]; then
  echo "NO_SESSION_LOG"
  exit 0
fi

echo "SESSION_LOG: $file"
echo

jq -r '
  if .type == "user" and (.message.content | type) == "string" then
    "\nUSER: " + .message.content
  elif .type == "assistant" then
    (.message.content[]? |
      if .type == "text" then "CLAUDE: " + .text
      elif .type == "tool_use" then
        "  TOOL " + .name + ": " +
        ((.input.file_path // .input.description // .input.command // .input.query // .input.pattern // "")
          | tostring | gsub("\n"; " ") | .[0:200])
      else empty end)
  elif .type == "user" then
    (.message.content[]? | select(.type == "tool_result" and .is_error == true) |
      "  TOOL ERROR: " + ((.content | tostring) | gsub("\n"; " ") | .[0:400]))
  else empty end
' "$file"

echo
echo "FILES EDITED IN SESSION:"
jq -r 'select(.type == "assistant") | .message.content[]? |
  select(.type == "tool_use" and (.name == "Edit" or .name == "Write" or .name == "NotebookEdit")) |
  .input.file_path // .input.notebook_path' "$file" | sort -u
