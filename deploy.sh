#!/bin/bash
set -e
# PROD deploy: push + update live web app deployment.
PROD_SCRIPT_ID="159Fj3QP7Ra2fvYu7DmK8f0CQ--ksXmSUNbQ9YwyMSJWnn54BWOVbPLfe"
DEV_SCRIPT_ID="1JYSmBmeJAvCSerNSb8uLyfIbqM5zJjrGqUHaIN3x4Seb83u6wXhVIpG4"
DEPLOYMENT_ID="AKfycbx4PIPC8Yi_WykWy6yh00PNC9NvUmzGW01mqoiRMlAbYazUqJId8r83Kk9OTXtuHaTh-w"

cleanup() {
  cp /tmp/index_html_dev_backup.html app/index.html
  node -e "const fs=require('fs'),p='.clasp.json',c=JSON.parse(fs.readFileSync(p));c.scriptId='$DEV_SCRIPT_ID';fs.writeFileSync(p,JSON.stringify(c,null,2));"
  echo "↩ index.html + .clasp.json restored."
}
trap cleanup EXIT

echo "→ Stripping DEV-ONLY blocks from index.html..."
cp app/index.html /tmp/index_html_dev_backup.html
python3 - <<'PYEOF'
import re
content = open('app/index.html').read()
stripped = re.sub(r'\s*<!-- DEV-ONLY -->.*?<!-- /DEV-ONLY -->', '', content, flags=re.DOTALL)
open('app/index.html', 'w').write(stripped)
PYEOF

echo "→ Switching to PROD scriptId..."
node -e "const fs=require('fs'),p='.clasp.json',c=JSON.parse(fs.readFileSync(p));c.scriptId='$PROD_SCRIPT_ID';fs.writeFileSync(p,JSON.stringify(c,null,2));"

echo "→ Pushing code to PROD..."
clasp push --force

echo "→ Updating PROD deployment..."
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "prod deploy $(date '+%Y-%m-%d %H:%M')"

echo "✓ Done. Refresh the PROD web app URL to see changes."
