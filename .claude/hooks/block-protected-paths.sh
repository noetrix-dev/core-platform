#!/usr/bin/env bash
# PreToolUse guardrail (Write|Edit): refuse edits to Supabase migrations + env files.
# Exit 2 => Claude Code blocks the tool call and shows stderr to the agent.
set -uo pipefail

file=$(node -e 'let s=require("fs").readFileSync(0,"utf8");try{let t=JSON.parse(s).tool_input||{};process.stdout.write(t.file_path||t.notebook_path||"")}catch(e){}' 2>/dev/null) || exit 0
[ -z "$file" ] && exit 0

case "$file" in
  *infra/supabase/migrations/*)
    echo "BLOCKED: '$file' is under infra/supabase/migrations/. Migrations are hand-authored and reviewed — run 'pnpm supabase migration new <name>' yourself, outside Claude Code." >&2
    exit 2 ;;
  *.env|*.env.*)
    echo "BLOCKED: '$file' is an environment file. Edit secrets by hand; never through Claude Code." >&2
    exit 2 ;;
esac
exit 0
