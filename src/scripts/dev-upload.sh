#!/usr/bin/env bash
# Development helper: build dist/ and upload it into the installed sparnatural-service project
# (instead of reinstalling the package). Uses the current cmemc connection. Extra files can be given as args.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
bash scripts/embed-build-metadata.sh >/dev/null
CHANGED_ONLY="${CHANGED_ONLY:-}"
cd dist
find . -type f | sed 's#^\./##' | while read -r f; do
  case "$f" in vendor/*) [ -n "$CHANGED_ONLY" ] && continue ;; esac
  cmemc project file upload --project sparnatural-service --replace --path "$f" "$f" >/dev/null
done
cd "$ROOT"
for extra in "$@"; do
  cmemc project file upload --project sparnatural-service --replace --path "$(basename "$extra")" "$extra" >/dev/null
done
echo "uploaded"
