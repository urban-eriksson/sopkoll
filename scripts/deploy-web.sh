#!/usr/bin/env bash
# Build the static app and ship it (plus any infra change) via CDK:
# S3 upload + CloudFront invalidation. First run also needs `SopkollCert`:
#   cd infra && npx aws-cdk deploy SopkollCert Sopkoll --require-approval never
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
npm run check
npm run build
cd ../../infra
npx aws-cdk deploy Sopkoll --require-approval never
