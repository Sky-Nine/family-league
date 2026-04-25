#!/bin/bash
# Dev environment deploy script.
# First run: creates a new deployment. Subsequent runs: updates it.
DEPLOYMENT_ID="AKfycbwghdJq0Qn1WnHplmg3cntxv5hXJZ27lwlHYACh-rLm2ZwM5_d2IKoY-J8pZ5pyF5mF"

echo "→ Pushing code to dev GAS..."
clasp push --force

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "⚠ No DEPLOYMENT_ID set. Push complete."
  echo "  Go to GAS UI → Deploy → New deployment → Web App, then paste the deployment ID into this script."
else
  echo "→ Updating dev deployment..."
  clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "dev deploy $(date '+%Y-%m-%d %H:%M')"
  echo "✓ Done."
fi
