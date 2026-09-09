# sopkoll

Håll koll på när sopbilen kommer. A phone-first PWA for Stockholm households: pick
your address, see which bins are emptied when, and get a push notification the
evening before so the right bin is out in time. Live at https://sopkoll.korist.se.

No accounts. A device is its push subscription; everything else lives in the
phone's localStorage and is mirrored to the server only once notifications are on.

Pickup dates come from Stockholm Vatten och Avfall's public "När kommer sopbilen?"
lookup (see `PLAN.md` for the verified endpoints). Bins can also be added by hand
for addresses SVOA does not cover.

## Layout

| Path | What |
|---|---|
| `apps/web/` | Vite + React 19 + Tailwind v4 + shadcn. Static build, deployed to S3 + CloudFront. |
| `server/` | FastAPI + SQLite (`uv`). SVOA proxy, push devices, the 5-minute reminder scheduler, nightly refresh. |
| `infra/` | CDK (Python): certificate, S3/CloudFront, DNS, deploy + backup buckets. |
| `scripts/` | `provision.sh` (runs on the box), `deploy-server.sh`, `deploy-web.sh`. |
| `docs/` | The SVOA sorting brochure the lid colours come from. |

## Develop

```bash
# API on :8002 (SQLite file ./sopkoll.db is created on first start)
cd server && uv sync && uv run uvicorn sopkoll.main:app --port 8002 --reload

# Web on :5173, proxying /api to :8002
cd apps/web && npm install && npm run dev

# Checks
cd apps/web && npm run check && npm test
cd server && uv run pytest
```

Push in dev needs VAPID keys in the environment (`SOPKOLL_VAPID_PRIVATE`,
`SOPKOLL_VAPID_PUBLIC`, base64url DER, same format `provision.sh` generates).
Without them the API still serves the SVOA proxy; the push toggle reports
"not configured".

## Deploy

The backend is a tenant on the shared korist.se EC2 box (with snicksnack, isabelle
and bike-my-day): uvicorn on `127.0.0.1:8002` behind the shared Caddy, DB at
`/var/lib/sopkoll/sopkoll.db`, config in `/etc/sopkoll/{env,settings}`.

```bash
# 1. Once: certificate (us-east-1) + S3/CloudFront/DNS/buckets (eu-north-1). Builds and uploads the web app.
cd apps/web && npm run build && cd ../../infra && npx aws-cdk@2 deploy SopkollCert Sopkoll --require-approval never

# 2. Server: package server/ + scripts/provision.sh, ship via S3 + SSM (no SSH), restart, health-check.
scripts/deploy-server.sh

# Later web releases:
scripts/deploy-web.sh
```

Ops on the box (`aws ssm start-session --target <instance>`):
`systemctl status sopkoll sopkoll-refresh.timer sopkoll-backup.timer`,
`journalctl -u sopkoll -f`, `journalctl -u sopkoll-refresh`. Nightly `.backup`
of the DB goes to the Sopkoll BackupBucket (30-day expiry).

## Timers on the box

| When | What |
|---|---|
| every 5 min (in-process) | scheduler: send due reminders, drop dead subscriptions |
| 04:30 Europe/Stockholm | `sopkoll-refresh`: re-fetch SVOA for every known address |
| 04:17 UTC | `sopkoll-backup` |
