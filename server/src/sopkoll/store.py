"""SQLite, raw sqlite3, one file. The schema is created on first open; there are
no migrations — a schema change means deleting the dev DB (production is backed
up nightly and, for this app, cheap to re-sync from the phones)."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime

from sopkoll import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
    id            INTEGER PRIMARY KEY,
    endpoint      TEXT NOT NULL UNIQUE,
    p256dh        TEXT NOT NULL,
    auth          TEXT NOT NULL,
    user_agent    TEXT NOT NULL DEFAULT '',
    timezone      TEXT NOT NULL DEFAULT 'Europe/Stockholm',
    days_before   INTEGER NOT NULL DEFAULT 1,
    time_of_day   TEXT NOT NULL DEFAULT '19:00',
    address       TEXT,
    created_at    TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    device_id      INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    id             TEXT NOT NULL,
    name           TEXT NOT NULL,
    type           TEXT NOT NULL,
    source         TEXT NOT NULL,
    address        TEXT,
    group_name     TEXT,
    frequency_text TEXT,
    interval_days  INTEGER NOT NULL,
    season_months  TEXT,
    next_date      TEXT NOT NULL,
    enabled        INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (device_id, id)
);
CREATE TABLE IF NOT EXISTS notifications (
    device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    item_id     TEXT NOT NULL,
    pickup_date TEXT NOT NULL,
    sent_at     TEXT NOT NULL,
    PRIMARY KEY (device_id, item_id, pickup_date)
);
CREATE TABLE IF NOT EXISTS svoa_cache (
    address    TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
"""


def connect(path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or config.DB_PATH, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


@contextmanager
def tx(conn: sqlite3.Connection):
    conn.execute("BEGIN")
    try:
        yield
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def count_devices(conn) -> int:
    return conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0]


def upsert_device(conn, sub: dict, settings: dict, meta: dict, items: list[dict]) -> int:
    now = now_iso()
    with tx(conn):
        conn.execute(
            """INSERT INTO devices (endpoint, p256dh, auth, user_agent, timezone, days_before,
                                    time_of_day, address, created_at, last_seen_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(endpoint) DO UPDATE SET
                 p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent,
                 timezone=excluded.timezone, days_before=excluded.days_before,
                 time_of_day=excluded.time_of_day, address=excluded.address,
                 last_seen_at=excluded.last_seen_at""",
            (
                sub["endpoint"], sub["keys"]["p256dh"], sub["keys"]["auth"],
                meta.get("userAgent", "")[:300], meta.get("timezone") or config.TIMEZONE,
                settings["daysBefore"], settings["timeOfDay"], settings.get("address"),
                now, now,
            ),
        )
        device_id = conn.execute(
            "SELECT id FROM devices WHERE endpoint = ?", (sub["endpoint"],)
        ).fetchone()[0]
        conn.execute("DELETE FROM items WHERE device_id = ?", (device_id,))
        conn.executemany(
            """INSERT INTO items (device_id, id, name, type, source, address, group_name,
                                  frequency_text, interval_days, season_months, next_date, enabled)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    device_id, it["id"], it["name"], it["type"], it["source"], it.get("address"),
                    it.get("group"), it.get("frequencyText"), it["intervalDays"],
                    json.dumps(it["seasonMonths"]) if it.get("seasonMonths") else None,
                    it["nextDate"], 1 if it["enabled"] else 0,
                )
                for it in items
            ],
        )
    return device_id


def delete_device(conn, endpoint: str) -> None:
    conn.execute("DELETE FROM devices WHERE endpoint = ?", (endpoint,))


def delete_devices(conn, endpoints: list[str]) -> None:
    conn.executemany("DELETE FROM devices WHERE endpoint = ?", [(e,) for e in endpoints])


def get_device(conn, endpoint: str):
    return conn.execute("SELECT * FROM devices WHERE endpoint = ?", (endpoint,)).fetchone()


def devices_with_items(conn):
    """Every device joined with its enabled items — the scheduler's working set."""
    return conn.execute(
        """SELECT d.id AS device_id, d.endpoint, d.p256dh, d.auth, d.timezone, d.days_before,
                  d.time_of_day, i.id AS item_id, i.name, i.interval_days, i.season_months,
                  i.next_date
           FROM devices d JOIN items i ON i.device_id = d.id
           WHERE i.enabled = 1"""
    ).fetchall()


def already_sent(conn, device_id: int, item_id: str, pickup: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM notifications WHERE device_id=? AND item_id=? AND pickup_date=?",
            (device_id, item_id, pickup),
        ).fetchone()
        is not None
    )


def mark_sent(conn, device_id: int, item_id: str, pickup: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO notifications VALUES (?, ?, ?, ?)",
        (device_id, item_id, pickup, now_iso()),
    )


def prune_notifications(conn, before_iso_date: str) -> None:
    conn.execute("DELETE FROM notifications WHERE pickup_date < ?", (before_iso_date,))


def svoa_addresses(conn) -> list[str]:
    return [
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT address FROM items WHERE source='svoa' AND address IS NOT NULL"
        )
    ]


def update_svoa_next_dates(conn, address: str, pickups: list[dict]) -> int:
    n = 0
    with tx(conn):
        for p in pickups:
            cur = conn.execute(
                """UPDATE items SET next_date=?, frequency_text=?
                   WHERE source='svoa' AND address=? AND group_name=?""",
                (p["executionDate"], p["fetchFrequency"], address, p["group"]),
            )
            n += cur.rowcount
    return n


def cache_get(conn, address: str):
    return conn.execute("SELECT * FROM svoa_cache WHERE address = ?", (address,)).fetchone()


def cache_put(conn, address: str, payload: list[dict]) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO svoa_cache VALUES (?, ?, ?)",
        (address, json.dumps(payload), now_iso()),
    )
