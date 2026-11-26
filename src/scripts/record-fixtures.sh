#!/usr/bin/env bash
# Record the SPARQL JSON fixtures of the unit tests from a CMEM instance (current cmemc connection),
# using the queries of lib/stats.js and lib/shapes.js. Scoping: FROM <graph>, which the CMEM
# endpoint expands to the owl:imports closure like default-graph-uri.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
GRAPH=http://ld.company.org/prod-inst/
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
run() { # name graph queryfile
  cmemc query execute --accept application/sparql-results+json "$3" > "test/fixtures/$1.json"
  echo "recorded test/fixtures/$1.json"
}
node scripts/fixture-queries.js "$GRAPH" "$TMP"
for f in "$TMP"/*.rq; do run "$(basename "$f" .rq)" "$GRAPH" "$f"; done
