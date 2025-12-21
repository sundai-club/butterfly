#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

VERSION=$(python3 - <<'PY'
import json
with open('manifest.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('version', 'unknown'))
PY
)

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
OUT_FILE="${TIMESTAMP}-butterfly-${VERSION}.zip"

FILES=(
  manifest.json
  background.js
  popup.html
  popup.js
  styles.css
  icon128.png
  content_linkedin.js
  content_twitter.js
  content_producthunt.js
  content_reddit_old.js
  slop_list.json
  slop_list_bigrams.json
  slop_list_trigrams.json
)

zip -r "$OUT_FILE" "${FILES[@]}"

echo "Created ${OUT_FILE}"
