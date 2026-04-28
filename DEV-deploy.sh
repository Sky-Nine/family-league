#!/bin/bash
set -e
# DEV deploy: push + update dev web app deployment.
DEV_SCRIPT_ID="1JYSmBmeJAvCSerNSb8uLyfIbqM5zJjrGqUHaIN3x4Seb83u6wXhVIpG4"
DEPLOYMENT_ID="AKfycbwghdJq0Qn1WnHplmg3cntxv5hXJZ27lwlHYACh-rLm2ZwM5_d2IKoY-J8pZ5pyF5mF"

cleanup() {
  cp /tmp/index_html_dev_backup.html app/index.html
  echo "↩ index.html restored."
}
trap cleanup EXIT

echo "→ Stripping PROD-ONLY blocks from index.html..."
cp app/index.html /tmp/index_html_dev_backup.html
python3 - <<'PYEOF'
import re
content = open('app/index.html').read()
stripped = re.sub(r'\s*<!-- PROD-ONLY -->.*?<!-- /PROD-ONLY -->', '', content, flags=re.DOTALL)
open('app/index.html', 'w').write(stripped)
PYEOF

echo "→ Switching to DEV scriptId..."
node -e "const fs=require('fs'),p='.clasp.json',c=JSON.parse(fs.readFileSync(p));c.scriptId='$DEV_SCRIPT_ID';fs.writeFileSync(p,JSON.stringify(c,null,2));"

echo "→ Pushing code to DEV..."
clasp push --force

echo "→ Updating DEV deployment..."
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "dev deploy $(date '+%Y-%m-%d %H:%M')"

echo "→ Purging changed assets from jsdelivr CDN..."
PURGED=0
git diff --name-only HEAD~1 HEAD -- assets/ | while read f; do
  curl -s "https://purge.jsdelivr.net/gh/Sky-Nine/family-league@dev/$f" > /dev/null
  echo "  purged: $f"
  PURGED=$((PURGED + 1))
done
echo "✓ Done. Refresh the DEV web app URL to see changes."
