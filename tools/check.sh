#!/usr/bin/env bash
# Syntax-check every ES module in the project.
# node --check infers CommonJS from .js, so each file is copied to .mjs first.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail=0
count=0
while IFS= read -r f; do
  count=$((count+1))
  rel="${f#$ROOT/}"
  cp "$f" "$TMP/x.mjs"
  if ! out=$(node --check "$TMP/x.mjs" 2>&1); then
    fail=$((fail+1))
    echo "FAIL  $rel"
    echo "$out" | sed -n '2,7p' | sed 's/^/        /'
  fi
done < <(find "$ROOT/src" -name '*.js' | sort)

echo "----"
echo "checked $count files, $fail failed"
exit $fail
