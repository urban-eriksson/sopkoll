# Sopkoll — plan (September 2026)

A phone-first PWA at `https://sopkoll.korist.se`: pick your address, see which bins
(kärl) are emptied when, and get a push notification N hours before each pickup so the
right bin is out on the street in time. Same look and feel as bike-my-day, brown palette.

## Verified facts (2026-09-09) about Stockholm Vatten och Avfall

The public "När kommer sopbilen?" page is a Vue widget talking to two unauthenticated
JSON endpoints under the page URL. No API key, no cookie needed, no rate limiting seen.

```
BASE = https://www.stockholmvattenochavfall.se/villa-och-radhus/avfallstjanster/nar-kommer-sopbilen

GET BASE/AutoCompleteMe?query=Nockebyv%C3%A4gen%201
→ [{"value":"Nockebyvägen 15, Bromma, 167 71","data":"167 71"}, ...]   (max 5 hits)

GET BASE/Search?address=Nockebyv%C3%A4gen%2015,%20Bromma,%20167%2071
→ [
    {"group":"Kärl 1 - restavfall och matavfall","fetchFrequency":"Varannan vecka",
     "executionDate":"2026-09-09","weekday":"Onsdag"},
    {"group":"Kärl 3 - glas och metall","fetchFrequency":"Var 4:e vecka",
     "executionDate":"2026-09-14","weekday":"Måndag"},
    {"group":"Kärl 2 - papper och plast","fetchFrequency":"Varannan vecka",
     "executionDate":"2026-09-21","weekday":"Måndag"},
    {"group":"Trädgårdsavfall, villa","fetchFrequency":"Varannan vecka (april-nov)",
     "executionDate":"2026-09-21","weekday":"Måndag"}
  ]
```

- The `address` must be the exact `value` string from AutoCompleteMe (street + number,
  district, postcode). Anything else → `{"error":"Internal Server Error","message":"Invalid address format"}`.
- Apartment buildings / addresses without villa collection return `[]`, not an error.
- Only the **next** pickup date per group is returned, plus a frequency in free text. Future
  dates must be extrapolated (7 / 14 / 28 days; garden waste only April–November) and
  corrected by re-polling, since holidays shift pickups.
- CORS is not open (`access-control-allow-origin: fonts.gstatic.com`), so the browser cannot
  call it directly. Our backend proxies both calls and caches results.
- Group names seen so far: `Kärl 1 - restavfall och matavfall`, `Kärl 2 - papper och plast`,
  `Kärl 3 - glas och metall`, `Trädgårdsavfall, villa`. Treat the string as an opaque key and
  map known prefixes to icons/colours, with a neutral fallback for unknown groups.
- The brochure QR code just points to `svoa.se/sopbilen` (this page). Not needed.

## Verified facts about the shared EC2 box (the snicksnack t3.micro, eu-north-1c)

Measured over SSM on 2026-09-09:

| Resource | Total | In use | Free |
|---|---|---|---|
| RAM | 911 MB | 427 MB (uvicorn ×2 ≈ 20 MB each, Caddy 22 MB, rest is OS/snap/SSM) | 483 MB + 400 MB swap |
| Disk | 8.7 GB | 4.3 GB | 4.5 GB |

- Running tenants: `snicksnack` (uvicorn :8000), `isabelle` (uvicorn :8001), Caddy, coturn.
- `/opt/bike-my-day` exists and its nightly `bike-my-day-notify.timer` runs, but the Next.js
  app itself is **not** deployed yet: no Node on the box, no `bike-my-day.service`, no Caddy
  block, and DNS still points at Vercel (76.76.21.21). When it lands it will take ~200 MB.
- A FastAPI + SQLite tenant for sopkoll costs ~25–40 MB RAM and ~80 MB disk. Fits comfortably,
  even after bike-my-day moves in. No need to resize the instance.
- Deploy path everywhere is S3 + SSM RunShellScript (port 22 is closed), Caddy fronts all
  tenants, each has `/etc/<app>/env` (secrets, written once) + `/etc/<app>/settings`, a
  systemd unit, a SQLite file in `/var/lib/<app>/`, and a nightly `.backup` to S3.
- Route 53 zone `korist.se`. Existing pattern: `<app>.korist.se`
  → CloudFront (S3 site + `/api/*` behaviour), `api.<app>.korist.se` → the box's EIP.

## Architecture (recommended)

```
phone (PWA, static React)           CloudFront  sopkoll.korist.se
  │  /api/* ──────────────────────▶  behaviour → api.sopkoll.korist.se (Caddy :443 → uvicorn :8002)
  │                                                      │
  │◀── Web Push (VAPID) ────────────────────────────────┘  scheduler loop, SQLite
                                                        └─▶ stockholmvattenochavfall.se (proxy + nightly refresh)
```

**Frontend** — Vite + React 19 + TypeScript + Tailwind v4 + shadcn (radix-nova), exactly the
stack snicksnack's `apps/web` already deploys as static files. Port bike-my-day's design
system verbatim: `globals.css` `@theme inline` block and radius scale, Geist / Geist Mono /
Bricolage Grotesque (self-hosted via `@fontsource-variable/*`), the "physical press" button
with `--primary-edge`, the sticky translucent `app-header` with the horizon hairline, the
ambient radial accent glow, `home-actions` install instructions (iOS/Android detection via
`useSyncExternalStore`), `push-toggle`, and the `address-field` autocomplete (debounce 300 ms,
min 3 chars, AbortController, click-outside) pointed at our `/api/address/suggest`.

Why not Next.js like bike-my-day: bike-my-day *needs* a Node server (Supabase cookies, server
actions, Anthropic). Sopkoll's backend is Python, so a Node process on the box would be
~200 MB of RAM for nothing. Static export keeps the frontend on S3/CloudFront like the other
two tenants and the same deploy scripts apply. The components are plain React + Tailwind and
port 1:1.

**Backend** — FastAPI + uvicorn on `127.0.0.1:8002`, raw `sqlite3` (isabelle style, no ORM),
`pywebpush`, run with `uv`. One process; the notification scheduler is an `asyncio` task inside
it (ticks every 5 min). Two timers only: nightly SVOA refresh at 04:30 Europe/Stockholm and the
backup at 04:17 UTC (staggered from the others). No login, no email, no SES: like isabelle, the
identity is the push subscription itself. Items live in localStorage and are synced to the server
only when push is enabled.

**Brown palette** — same two-hue rule as bike-my-day (one hue for controls, one accent
reserved for a job). Primary: warm mid-brown `oklch(0.47 0.07 55)` with a darker
`--primary-edge`; background: kraft-paper off-white `oklch(0.975 0.01 75)`; accent: moss
green `oklch(0.9 0.06 140)` used only for "bin is out / done" and the matavfall bin lid.
Per-bin lid colours follow SVOA's brochure: rest black, mat green, papper brown, plast purple,
glas white/green, metall grey, trädgård olive.

**Icons** — `public/icon.svg` hand-written like bike-my-day's: solid dark-brown square
(maskable + iOS safe), a white line-art wheelie bin with two wheels and an open lid, a small
amber bell dot top-right echoing bike-my-day's sun. `scripts/generate-icons.mjs` (sharp) →
192 / 512 / 180 PNGs + favicon, committed. In-app bin glyphs are inline SVG components
(`BinIcon type="rest|mat|papper|plast|glas|metall|tradgard"`) with lid colour per type.

## Decisions (2026-09-09)

- Vite + React static frontend. No Next.js.
- **No login.** Identity = push subscription (isabelle pattern). Items are stored in
  localStorage first; when the user enables push, the device's `{subscription, settings, items}`
  is synced to the server, and re-synced on every change and every app open.
- **Items are independent** ("kärl"), like routes in bike-my-day. Two ways to create them:
  imported from SVOA by address (one address per device for now, but every item carries its
  address so a second address is trivial later), or **added manually** (name, bin type/icon,
  next date, interval: every week / every 2 weeks / every 4 weeks / custom N days, optional
  season months). Manual items also cover apartment addresses where SVOA returns `[]`.
- **Timing is one global preference**: `days_before` (0–7) + `time_of_day` (HH:MM), default
  1 day before at 19:00. Per-item override is a possible later addition, not now.
- Swedish UI only. The app is Stockholm-only because of the SVOA dependency.

## Data model

Client (localStorage, the source of truth for the device):

```
settings   { daysBefore: 1, timeOfDay: "19:00", address?: {value, district, postcode} }
items[]    { id, name, type: rest|mat|papper|plast|glas|metall|tradgard|other,
             source: "svoa"|"manual", address?, group?, frequencyText?,
             intervalDays, seasonMonths?: [4..11], nextDate: "YYYY-MM-DD", enabled }
```

Server (SQLite, only devices that enabled push):

```
devices        id, endpoint (unique), p256dh, auth, user_agent, days_before, time_of_day,
               address_value, created_at, last_seen_at, last_ok_at
items          id, device_id, name, type, source, address_value, group_name, frequency_text,
               interval_days, season_months, next_date, enabled
notifications  device_id, item_id, pickup_date, sent_at              -- unique = idempotency
svoa_cache     address_value, payload_json, fetched_at               -- nightly refresh source
```

Notification rule: `fire_at = (next_date − days_before) at time_of_day Europe/Stockholm`.
Every 5 min the scheduler selects due `(device, item, next_date)` triples with no
`notifications` row, sends one push per item ("Ställ ut Kärl 2 – papper och plast. Hämtas
måndag 21 sep."), records it, advances `next_date` by `interval_days` for manual items, and
prunes endpoints that return 404/410. SVOA items get `next_date` from the nightly refresh
(fallback: advance by `interval_days` if SVOA is unreachable).

## Screens

1. `/` landing + install instructions (copy of bike-my-day's `home-actions`), "continue in browser".
2. `/welcome` 3-step wizard: address (SVOA autocomplete) → pick the bins to keep → enable push.
   Every step skippable; "lägg till manuellt" is the escape hatch when SVOA has nothing.
3. `/app` dashboard: next pickup hero card ("Kärl 2 — måndag 21 sep, om 12 dagar"),
   then one card per item with lid-coloured icon, frequency, next 3 dates, on/off toggle.
4. `/items/new` and `/items/:id` add/edit an item (manual or re-import from address).
5. `/settings` days-before + time-of-day, push toggle + "skicka testnotis", address, wipe data.
6. Swedish UI with the same dictionary pattern as bike-my-day (`src/lib/i18n`), English later.

## Infra (CDK Python, copied from isabelle)

- `SopkollCert` (us-east-1 ACM, DNS-validated) + `Sopkoll` (eu-north-1): private S3 site bucket +
  CloudFront (OAC, `/api/*` → `api.sopkoll.korist.se`, caching disabled), deploy bucket, backup
  bucket (30-day expiry, RETAIN), Route 53 `sopkoll` A-alias and `api.sopkoll` A → EIP, grants
  on the existing instance role. Instance id/EIP/role resolved from the `Snicksnack` stack outputs.
- `scripts/provision.sh` (idempotent, root, run on every server deploy): `sopkoll` user, dirs,
  VAPID keys + JWT secret once into `/etc/sopkoll/env`, `/etc/sopkoll/settings`, Caddy block
  `api.sopkoll.korist.se { reverse_proxy 127.0.0.1:8002 }` appended only if absent + validated
  before reload, `sopkoll.service`, `sopkoll-refresh.timer`, `sopkoll-backup.timer`.
- `scripts/deploy-server.sh` (tar → S3 → SSM → atomic swap → `uv sync --frozen` → restart →
  health check `/api/health`), `scripts/deploy-web.sh` (`npm run build && cdk deploy`).

## Milestones

1. **Skeleton + design system** — repo layout (`apps/web`, `server`, `infra`, `scripts`), brown
   tokens, header, button, icons, landing + install page. Deployable static site.
2. **SVOA proxy** — `/api/address/suggest`, `/api/address/schedule`, caching, date extrapolation
   with unit tests on the frequency parser. Dashboard works fully client-side from localStorage.
3. **Items** — manual add/edit, welcome wizard, settings, localStorage persistence.
4. **Push** — service worker, push toggle, VAPID, scheduler loop, nightly refresh, test button.
5. **Ops** — CDK stacks, provision/deploy scripts, backup timer, README runbook, CI (lint,
   typecheck, vitest, pytest).
6. *Future:* camera classification ("which bin does this go in?") — client-side image → Claude
   vision via the backend, mapping to the brochure's sorting examples.

