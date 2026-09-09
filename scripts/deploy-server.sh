#!/usr/bin/env bash
# Package server/ + scripts/provision.sh and deploy to the shared EC2 box via
# S3 + SSM (no SSH). Requires the Sopkoll stack to be deployed first.
set -euo pipefail
cd "$(dirname "$0")/.."

out() {
  aws cloudformation describe-stacks --region eu-north-1 --stack-name Sopkoll \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(out OutDeployBucket)
BACKUP_BUCKET=$(out OutBackupBucket)
INSTANCE=$(out OutInstanceId)
API_DOMAIN=api.sopkoll.korist.se
WEB_DOMAIN=sopkoll.korist.se

echo "packaging server -> s3://$BUCKET/server.tgz"
TMP=$(mktemp -d)
mkdir -p "$TMP/pkg"
cp -r server/. "$TMP/pkg/"
cp scripts/provision.sh "$TMP/pkg/provision.sh"
tar -czf "$TMP/server.tgz" -C "$TMP/pkg" \
  --exclude .venv --exclude '*.db' --exclude __pycache__ --exclude .pytest_cache .
aws s3 cp --only-show-errors "$TMP/server.tgz" "s3://$BUCKET/server.tgz"
rm -rf "$TMP"

echo "deploying on $INSTANCE"
CMD_ID=$(aws ssm send-command --region eu-north-1 \
  --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --comment "sopkoll server deploy" \
  --parameters 'commands=[
    "set -eux",
    "aws s3 cp s3://'"$BUCKET"'/server.tgz /tmp/sopkoll-server.tgz",
    "mkdir -p /opt/sopkoll/app",
    "rm -rf /opt/sopkoll/app.new && mkdir -p /opt/sopkoll/app.new",
    "tar -xzf /tmp/sopkoll-server.tgz -C /opt/sopkoll/app.new",
    "bash /opt/sopkoll/app.new/provision.sh '"$API_DOMAIN"' '"$WEB_DOMAIN"' '"$BACKUP_BUCKET"'",
    "rm -rf /opt/sopkoll/app && mv /opt/sopkoll/app.new /opt/sopkoll/app",
    "chown -R sopkoll:sopkoll /opt/sopkoll/app",
    "cd /opt/sopkoll/app && sudo -u sopkoll /usr/local/bin/uv sync --frozen --no-dev",
    "systemctl restart sopkoll",
    "for i in $(seq 1 20); do sleep 3; curl -sf http://127.0.0.1:8002/api/health && exit 0; done; echo health check failed; exit 1"
  ]' \
  --query 'Command.CommandId' --output text)

echo "waiting for SSM command $CMD_ID"
aws ssm wait command-executed --region eu-north-1 --command-id "$CMD_ID" --instance-id "$INSTANCE" || true
aws ssm get-command-invocation --region eu-north-1 --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json |
  python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d['status']); print(d['stdout'][-3000:]); print(d['stderr'][-3000:], file=sys.stderr); sys.exit(0 if d['status']=='Success' else 1)"
