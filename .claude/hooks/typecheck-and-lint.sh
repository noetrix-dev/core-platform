#!/usr/bin/env bash
# PostToolUse guardrail (Write|Edit): typecheck + lint the monorepo after every edit.
# Exit 2 => stderr is fed back to the agent so it can fix the errors.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if ! out=$(pnpm -s typecheck 2>&1); then
  printf 'TYPECHECK FAILED. Fix the type errors below, then continue:\n%s\n' "$out" >&2
  exit 2
fi
if ! out=$(pnpm -s lint 2>&1); then
  printf 'LINT FAILED. Fix the lint errors below, then continue:\n%s\n' "$out" >&2
  exit 2
fi
echo "typecheck + lint clean"
