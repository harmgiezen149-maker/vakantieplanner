#!/bin/bash
# SessionStart-hook: zorgt dat een verse websessie meteen `npx next build`
# kan draaien. De build is in dit project de enige poort vóór een merge naar
# main (zie CLAUDE.md), dus zonder node_modules staat elke sessie stil.
set -euo pipefail

# Alleen in Claude Code op het web / remote containers. Lokaal beheer je je
# eigen node_modules en wil je niet dat een sessie daar ongevraagd in graait.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# `npm install` en niet `npm ci`: idempotent, en de containerstaat wordt na
# de hook gecachet, dus een tweede sessie hoeft niets meer te doen.
npm install --no-audit --no-fund
