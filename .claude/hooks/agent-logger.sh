#!/bin/bash
# サブエージェント起動ログ（表示のみ・ブロックなし）

HOOK_INPUT=$(cat)
EVENT=$(echo "$HOOK_INPUT" | jq -r '.hook_event_name // ""')
TOOL=$(echo "$HOOK_INPUT" | jq -r '.tool_name // ""')
DESCRIPTION=$(echo "$HOOK_INPUT" | jq -r '.tool_input.description // ""')
PROMPT=$(echo "$HOOK_INPUT" | jq -r '.tool_input.prompt // ""' | head -c 120)
SUBAGENT_TYPE=$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // "general-purpose"')
TIMESTAMP=$(date +"%H:%M:%S")

# Agent ツール（サブエージェント）のみ表示
if [[ "$TOOL" != "Agent" ]]; then
  exit 0
fi

# 区切り線のスタイル
SEP="─────────────────────────────────────────────"

if [[ "$EVENT" == "PreToolUse" ]]; then
  echo "" >&2
  echo "┌${SEP}" >&2
  echo "│ 🤖 [${TIMESTAMP}] サブエージェント起動" >&2
  echo "│ 種別: ${SUBAGENT_TYPE}" >&2
  echo "│ 役割: ${DESCRIPTION}" >&2
  if [[ -n "$PROMPT" ]]; then
    echo "│ 指示: ${PROMPT}..." >&2
  fi
  echo "└${SEP}" >&2
fi

if [[ "$EVENT" == "PostToolUse" ]]; then
  RESULT_PREVIEW=$(echo "$HOOK_INPUT" | jq -r '.tool_result // ""' | head -c 200)
  echo "" >&2
  echo "┌${SEP}" >&2
  echo "│ ✅ [${TIMESTAMP}] サブエージェント完了" >&2
  echo "│ 種別: ${SUBAGENT_TYPE}" >&2
  echo "│ 役割: ${DESCRIPTION}" >&2
  if [[ -n "$RESULT_PREVIEW" ]]; then
    echo "│ 結果: ${RESULT_PREVIEW}..." >&2
  fi
  echo "└${SEP}" >&2
fi

exit 0
