"""The reminder scheduler and the push sender.

Every tick: for each device, for each enabled item, find the next pickup on or
after today, compute when its reminder fires (pickup − days_before at
time_of_day in the device's timezone), and if that moment has passed and the
reminder has not been sent for that (item, pickup), send it. Items due in the
same tick for one device are folded into one notification. Sends are recorded
before anything else can go wrong, so a crash never double-sends.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush

from sopkoll import config, store
from sopkoll.schedule import reminder_at, upcoming

log = logging.getLogger("sopkoll.notify")

WEEKDAYS = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"]
MONTHS = [
    "januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti",
    "september", "oktober", "november", "december",
]


def describe(pickup, today) -> str:
    if pickup == today:
        return "idag"
    if pickup == today + timedelta(days=1):
        return "imorgon"
    return f"{WEEKDAYS[pickup.weekday()]} {pickup.day} {MONTHS[pickup.month - 1]}"


def due_now(conn, now: datetime) -> dict[int, dict]:
    """device_id -> {device row fields, 'items': [(item_id, name, pickup_iso)]}"""
    grace = timedelta(hours=config.REMINDER_GRACE_HOURS)
    due: dict[int, dict] = {}
    for r in store.devices_with_items(conn):
        try:
            tz = ZoneInfo(r["timezone"] or config.TIMEZONE)
        except Exception:
            tz = ZoneInfo(config.TIMEZONE)
        today = now.astimezone(tz).date()
        season = json.loads(r["season_months"]) if r["season_months"] else None
        try:
            anchor = datetime.strptime(r["next_date"], "%Y-%m-%d").date()
        except ValueError:
            continue
        # Check the next two pickups: with a long "days before" the second one's
        # reminder can fall due while the first pickup is still ahead.
        for pickup in upcoming(anchor, r["interval_days"], season, today, count=2):
            fire = reminder_at(pickup, r["days_before"], r["time_of_day"], tz)
            if fire <= now < fire + grace and not store.already_sent(
                conn, r["device_id"], r["item_id"], pickup.isoformat()
            ):
                d = due.setdefault(
                    r["device_id"],
                    {
                        "endpoint": r["endpoint"],
                        "p256dh": r["p256dh"],
                        "auth": r["auth"],
                        "today": today,
                        "items": [],
                    },
                )
                d["items"].append((r["item_id"], r["name"], pickup))
    return due


def payload_for(items: list[tuple], today) -> dict:
    names = [name for _, name, _ in items]
    pickup = min(p for _, _, p in items)
    when = describe(pickup, today)
    if len(names) == 1:
        title = f"Ställ ut {names[0]}"
    elif len(names) == 2:
        title = f"Ställ ut {names[0]} och {names[1]}"
    else:
        title = f"Ställ ut {len(names)} kärl"
    body = f"Hämtas {when}." if len(names) <= 2 else ", ".join(names) + f". Hämtas {when}."
    return {"title": title, "body": body, "url": "/app", "tag": f"pickup-{pickup.isoformat()}"}


def send(sub: dict, payload: dict, ttl: int = 6 * 3600) -> bool:
    """True if delivered or transiently failed; False if the subscription is dead."""
    try:
        webpush(
            subscription_info=sub,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=config.VAPID_PRIVATE,
            vapid_claims={"sub": config.VAPID_SUBJECT},
            ttl=ttl,
        )
        return True
    except WebPushException as err:
        code = err.response.status_code if err.response is not None else None
        if code in (404, 410):
            return False
        log.warning("push failed (%s): %s", code, err)
        return True
    except Exception:  # noqa: BLE001 - DNS/TLS/connection errors from the push service
        log.exception("push raised")
        return True


def run_once(conn, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    due = due_now(conn, now)
    sent = 0
    dead: list[str] = []
    for device_id, d in due.items():
        # Record first: a duplicate reminder is worse than a missed one.
        with store.tx(conn):
            for item_id, _, pickup in d["items"]:
                store.mark_sent(conn, device_id, item_id, pickup.isoformat())
        sub = {"endpoint": d["endpoint"], "keys": {"p256dh": d["p256dh"], "auth": d["auth"]}}
        if send(sub, payload_for(d["items"], d["today"])):
            sent += 1
        else:
            dead.append(d["endpoint"])
    if dead:
        store.delete_devices(conn, dead)
        log.info("dropped %d dead device(s)", len(dead))
    store.prune_notifications(conn, (now - timedelta(days=60)).date().isoformat())
    if sent:
        log.info("sent %d reminder(s)", sent)
    return sent


async def scheduler(db_path: str) -> None:
    """Background task inside the API process. Tolerates every error and keeps ticking."""
    conn = store.connect(db_path)
    while True:
        try:
            if config.VAPID_PRIVATE:
                await asyncio.to_thread(run_once, conn)
        except Exception:
            log.exception("scheduler tick failed")
        await asyncio.sleep(config.SCHEDULER_INTERVAL_S)
