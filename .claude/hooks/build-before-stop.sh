#!/usr/bin/env bash
# Stop guardrail: the monorepo must build before the session ends.
# Exit 2 => Claude Code keeps the session open and feeds stderr back to the agent.
set -uo pipefail

active=$(node -e 'let s=require("fs").readFileSync(0,"utf8");try{process.stdout.write(String(JSON.parse(s).stop_hook_active===true))}catch(e){}' 2>/dev/null)
[ "$active" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! out=$(pnpm -s build 2>&1); then
  printf 'BUILD FAILED. Do not end the session yet — fix this:\n%s\n' "$(printf '%s' "$out" | tail -n 40)" >&2
  exit 2
fi
echo "build passed"
