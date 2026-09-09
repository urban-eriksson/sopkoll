#!/bin/bash
# Sets up the Sopkoll reminder service on the shared snicksnack box. Runs as
# root through deploy-server.sh on every deploy and is idempotent: it never
# touches the snicksnack units, and only appends its own Caddy site block.
# Arguments: API_DOMAIN WEB_DOMAIN BACKUP_BUCKET
set -euo pipefail
API_DOMAIN=$1
WEB_DOMAIN=$2
BACKUP_BUCKET=$3

# Swap: the box runs several small services in 1 GiB; a spike must page, not OOM-kill.
if [ ! -f /swapfile ]; then
  fallocate -l 512M /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

useradd -r -m -d /opt/sopkoll sopkoll || true
mkdir -p /opt/sopkoll/app /var/lib/sopkoll /etc/sopkoll
chown -R sopkoll:sopkoll /opt/sopkoll /var/lib/sopkoll

# VAPID keys: generated once. Rotating them silently kills every subscription.
if [ ! -f /etc/sopkoll/env ]; then
  VAPID_PEM=$(mktemp)
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$VAPID_PEM" 2>/dev/null
  b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }
  cat > /etc/sopkoll/env <<EOF
SOPKOLL_VAPID_PRIVATE=$(openssl pkey -in "$VAPID_PEM" -outform DER | b64url)
SOPKOLL_VAPID_PUBLIC=$(openssl pkey -in "$VAPID_PEM" -pubout -outform DER | tail -c 65 | b64url)
EOF
  rm -f "$VAPID_PEM"
  chgrp sopkoll /etc/sopkoll/env
  chmod 640 /etc/sopkoll/env
fi

cat > /etc/sopkoll/settings <<EOF
SOPKOLL_DB=/var/lib/sopkoll/sopkoll.db
SOPKOLL_WEB_URL=https://$WEB_DOMAIN
SOPKOLL_VAPID_SUBJECT=mailto:noreply@$WEB_DOMAIN
SOPKOLL_TIMEZONE=Europe/Stockholm
EOF
chgrp sopkoll /etc/sopkoll/settings
chmod 640 /etc/sopkoll/settings

# Caddy: our own site block, appended once. Caddy's automatic HTTPS handles the cert.
if ! grep -q "^$API_DOMAIN" /etc/caddy/Caddyfile; then
  cat >> /etc/caddy/Caddyfile <<EOF

$API_DOMAIN {
    reverse_proxy 127.0.0.1:8002
}
EOF
  caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
fi

cat > /etc/systemd/system/sopkoll.service <<'EOF'
[Unit]
Description=sopkoll API and reminder scheduler
After=network.target

[Service]
User=sopkoll
WorkingDirectory=/opt/sopkoll/app
EnvironmentFile=/etc/sopkoll/env
EnvironmentFile=/etc/sopkoll/settings
ExecStart=/usr/local/bin/uv run --frozen --no-dev uvicorn sopkoll.main:app --host 127.0.0.1 --port 8002 --proxy-headers
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/sopkoll-refresh.service <<'EOF'
[Unit]
Description=Re-fetch SVOA pickup dates for every known address
After=network-online.target

[Service]
Type=oneshot
User=sopkoll
WorkingDirectory=/opt/sopkoll/app
EnvironmentFile=/etc/sopkoll/env
EnvironmentFile=/etc/sopkoll/settings
ExecStart=/usr/local/bin/uv run --frozen --no-dev python -m sopkoll.refresh
EOF

cat > /etc/systemd/system/sopkoll-refresh.timer <<'EOF'
[Unit]
Description=Nightly SVOA schedule refresh

[Timer]
OnCalendar=*-*-* 04:30:00 Europe/Stockholm
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /usr/local/bin/sopkoll-backup <<SCRIPT
#!/bin/bash
set -euo pipefail
DB=/var/lib/sopkoll/sopkoll.db
[ -f "\$DB" ] || exit 0
STAMP=\$(date -u +%Y%m%dT%H%M%SZ)
TMP=\$(mktemp -d)
trap 'rm -rf "\$TMP"' EXIT
sqlite3 "\$DB" ".backup '\$TMP/sopkoll.db'"
gzip -9 "\$TMP/sopkoll.db"
aws s3 cp "\$TMP/sopkoll.db.gz" "s3://$BACKUP_BUCKET/db/sopkoll-\$STAMP.db.gz" --only-show-errors
aws s3 cp "s3://$BACKUP_BUCKET/db/sopkoll-\$STAMP.db.gz" "s3://$BACKUP_BUCKET/db/latest.db.gz" --only-show-errors
SCRIPT
chmod +x /usr/local/bin/sopkoll-backup

cat > /etc/systemd/system/sopkoll-backup.service <<'EOF'
[Unit]
Description=Back up the Sopkoll database to S3
After=network-online.target

[Service]
Type=oneshot
User=sopkoll
ExecStart=/usr/local/bin/sopkoll-backup
EOF

cat > /etc/systemd/system/sopkoll-backup.timer <<'EOF'
[Unit]
Description=Nightly Sopkoll database backup

[Timer]
OnCalendar=*-*-* 04:17:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable sopkoll
systemctl enable --now sopkoll-refresh.timer sopkoll-backup.timer
