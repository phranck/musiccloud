#!/usr/bin/env bash
# Install the pinned CLI inside this repository's ignored tool cache, not as an application or service.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '\n' < "$ROOT/.swiftformat-version")"
EXPECTED="$(tr -d '\n' < "$ROOT/.swiftformat-sha256")"
DEST="$ROOT/.tmp/swiftformat/$VERSION"
if [[ -x "$DEST/swiftformat" ]] && [[ "$("$DEST/swiftformat" --version)" == "$VERSION" ]]; then
    exit 0
fi
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
curl --fail --silent --show-error --location "https://github.com/nicklockwood/SwiftFormat/releases/download/$VERSION/swiftformat.zip" -o "$TEMP/swiftformat.zip"
printf '%s  %s\n' "$EXPECTED" "$TEMP/swiftformat.zip" | shasum -a 256 --check
mkdir -p "$DEST"
unzip -oq "$TEMP/swiftformat.zip" -d "$DEST"
[[ "$("$DEST/swiftformat" --version)" == "$VERSION" ]]
