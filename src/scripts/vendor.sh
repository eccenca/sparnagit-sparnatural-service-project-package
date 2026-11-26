#!/usr/bin/env bash
# Download the pinned third-party files into src/vendor/ (committed).
# Re-run only to change a version; every download is checked against a pinned checksum.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SPARNATURAL_VERSION=14.1.0
HELLO_URL="https://github.com/sparna-git/Sparnatural/releases/download/${SPARNATURAL_VERSION}/hello-sparnatural.zip"
HELLO_SHA256=8a001a91543148790938eb24826c050bc1235a19f8d658dccbce78c4405c9592

YASGUI_VERSION=4.2.28
YASGUI_URL="https://registry.npmjs.org/@triply/yasgui/-/yasgui-${YASGUI_VERSION}.tgz"
YASGUI_SHA512=HN1neZqERSGoDyk/Fg40nI+F0tHnaBxjqizhN0mur2Kj0oJsklBsFMRk/M+wW+ohy8dSEn7AgX3H0pPrV/wmVg==

LGPL_URL=https://raw.githubusercontent.com/spdx/license-list-data/main/text/LGPL-3.0-only.txt
GPL_URL=https://raw.githubusercontent.com/spdx/license-list-data/main/text/GPL-3.0-only.txt

echo "Downloading hello-sparnatural ${SPARNATURAL_VERSION}"
curl -fsSL -o "$TMP/hello.zip" "$HELLO_URL"
echo "${HELLO_SHA256}  $TMP/hello.zip" | shasum -a 256 -c -
unzip -q "$TMP/hello.zip" -d "$TMP/hello"

echo "Downloading @triply/yasgui ${YASGUI_VERSION}"
curl -fsSL -o "$TMP/yasgui.tgz" "$YASGUI_URL"
actual=$(openssl dgst -sha512 -binary "$TMP/yasgui.tgz" | openssl base64 -A)
[ "$actual" = "$YASGUI_SHA512" ] || { echo "Error: checksum mismatch for yasgui" >&2; exit 1; }
tar -xzf "$TMP/yasgui.tgz" -C "$TMP"

rm -rf "$VENDOR"
mkdir -p "$VENDOR/sparnatural" "$VENDOR/sparnatural-yasgui-plugins" "$VENDOR/yasgui" "$VENDOR/fontawesome"

# Sparnatural (LGPL-3.0): unmodified, in its own directory, replaceable by the user.
cp "$TMP/hello/sparnatural.js" "$TMP/hello/sparnatural.css" "$VENDOR/sparnatural/"
curl -fsSL -o "$VENDOR/sparnatural/LICENSE-LGPL-3.0" "$LGPL_URL"
curl -fsSL -o "$VENDOR/sparnatural/LICENSE-GPL-3.0" "$GPL_URL"

# Sparnatural yasgui plugins (ISC), as shipped with hello-sparnatural.
cp "$TMP/hello/sparnatural-yasgui-plugins.js" "$VENDOR/sparnatural-yasgui-plugins/"

# Yasgui (MIT): Yasqe + Yasr bundle.
cp "$TMP/package/build/yasgui.min.js" "$TMP/package/build/yasgui.min.css" "$VENDOR/yasgui/"
cp "$TMP/package/LICENSE"* "$VENDOR/yasgui/" 2>/dev/null || true

# Font Awesome Free 6.4.0 (icons CC BY 4.0, fonts SIL OFL 1.1, code MIT), as shipped with hello-sparnatural.
cp -R "$TMP/hello/fa/css" "$TMP/hello/fa/webfonts" "$VENDOR/fontawesome/"

echo "Vendored into $VENDOR"
