#!/usr/bin/env bash
# Stamp the Git revision into the page files (marker __BUILD_ID__) and copy everything served to dist/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if VERSION=$(git describe --tags --always --dirty 2>/dev/null); then :; else
  VERSION="${CI_COMMIT_SHORT_SHA:-${CI_COMMIT_SHA:-unknown}}"
fi
VERSION=${VERSION:-unknown}
VERSION_ESCAPED=$(printf '%s' "$VERSION" | sed 's/[&\\/]/\\\\&/g')

rm -rf dist && mkdir -p dist
for src in sparnatural.html; do
  grep -q '__BUILD_ID__' "$src" || { echo "Error: marker __BUILD_ID__ missing in $src" >&2; exit 1; }
  sed "s/__BUILD_ID__/$VERSION_ESCAPED/g" "$src" > "dist/$src"
  echo "Stamped dist/$src"
done
for extra in sparnatural-app.js sparnatural-theme-cmem.css lib vendor; do
  [ -e "$extra" ] && cp -R "$extra" dist/ && echo "Copied dist/$extra"
done
# the app script carries the build id too (cache key)
if [ -f dist/sparnatural-app.js ]; then
  sed -i.bak "s/__BUILD_ID__/$VERSION_ESCAPED/g" dist/sparnatural-app.js && rm dist/sparnatural-app.js.bak
fi
