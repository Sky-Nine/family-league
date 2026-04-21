#!/bin/bash
# Push code and update the live web app deployment in one step.
# Deployment ID = the one currently serving the web app URL.
DEPLOYMENT_ID="AKfycbx4PIPC8Yi_WykWy6yh00PNC9NvUmzGW01mqoiRMlAbYazUqJId8r83Kk9OTXtuHaTh-w"

echo "→ Pushing code..."
clasp push --force

echo "→ Updating deployment..."
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "deploy $(date '+%Y-%m-%d %H:%M')"

echo "✓ Done. Refresh the web app URL to see changes."
