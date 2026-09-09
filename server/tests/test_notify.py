from datetime import datetime
from zoneinfo import ZoneInfo

from sopkoll import notify, store

TZ = ZoneInfo("Europe/Stockholm")
SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "p", "auth": "a"}}
SETTINGS = {"daysBefore": 1, "timeOfDay": "19:00", "address": None}


def item(**kw):
    base = {
        "id": "i1", "name": "Papper och plast", "type": "papperplast", "source": "manual",
        "intervalDays": 14, "nextDate": "2026-09-21", "enabled": True,
    }
    return {**base, **kw}


def test_due_now_fires_once_and_folds(monkeypatch):
    conn = store.connect(":memory:")
    store.upsert_device(conn, SUB, SETTINGS, {}, [item(), item(id="i2", name="Glas och metall")])
    before = datetime(2026, 9, 20, 18, 59, tzinfo=TZ)
    at = datetime(2026, 9, 20, 19, 1, tzinfo=TZ)
    assert notify.due_now(conn, before) == {}
    due = notify.due_now(conn, at)
    assert len(due) == 1
    (d,) = due.values()
    assert sorted(n for _, n, _ in d["items"]) == ["Glas och metall", "Papper och plast"]
    p = notify.payload_for(d["items"], d["today"])
    assert p["title"] == "Ställ ut Papper och plast och Glas och metall"
    assert p["body"] == "Hämtas imorgon."

    sent = []
    monkeypatch.setattr(notify, "send", lambda sub, payload, ttl=0: sent.append(payload) or True)
    assert notify.run_once(conn, at) == 1
    assert notify.run_once(conn, at) == 0  # idempotent
    assert len(sent) == 1


def test_stale_reminder_is_skipped():
    conn = store.connect(":memory:")
    store.upsert_device(conn, SUB, SETTINGS, {}, [item()])
    late = datetime(2026, 9, 21, 8, 0, tzinfo=TZ)  # 13 h after 19:00 the day before
    assert notify.due_now(conn, late) == {}


def test_dead_subscription_is_dropped(monkeypatch):
    conn = store.connect(":memory:")
    store.upsert_device(conn, SUB, SETTINGS, {}, [item()])
    monkeypatch.setattr(notify, "send", lambda sub, payload, ttl=0: False)
    notify.run_once(conn, datetime(2026, 9, 20, 19, 5, tzinfo=TZ))
    assert store.count_devices(conn) == 0
