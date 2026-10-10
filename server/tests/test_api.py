"""The API through FastAPI's TestClient, which (like uvicorn) runs sync endpoints
on worker threads — the case that broke the shared SQLite connection in production."""

import pytest
from fastapi.testclient import TestClient

from sopkoll import config, main, notify, store

SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "p", "auth": "a"}}
ITEM = {
    "id": "i1", "name": "Papper och plast", "type": "papperplast", "source": "manual",
    "intervalDays": 14, "nextDate": "2026-09-21", "enabled": True,
}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "VAPID_PRIVATE", "x")
    monkeypatch.setattr(notify, "send", lambda *a, **kw: True)
    with TestClient(main.app) as c:
        yield c


def test_device_roundtrip(client):
    body = {"subscription": SUB, "settings": {"daysBefore": 1, "timeOfDay": "19:00"}, "items": [ITEM]}
    assert client.put("/api/devices", json=body).json() == {"items": 1}
    assert client.put("/api/devices", json=body).json() == {"items": 1}  # idempotent upsert
    assert store.count_devices(main.app.state.db) == 1
    assert client.request("DELETE", "/api/devices", json={"endpoint": SUB["endpoint"]}).status_code == 200
    assert store.count_devices(main.app.state.db) == 0


def test_validation(client):
    bad = {"subscription": SUB, "settings": {"daysBefore": 9, "timeOfDay": "19:00"}, "items": []}
    assert client.put("/api/devices", json=bad).status_code == 422
    assert client.get("/api/address/suggest?q=ab").status_code == 422


def test_delete_removes_everything_about_the_device(client):
    """What the Facebook post promises: 'Stäng av notiser' leaves nothing behind."""
    body = {
        "subscription": SUB,
        "settings": {"daysBefore": 1, "timeOfDay": "19:00", "address": "Gatan 1, Bromma, 167 71"},
        "items": [ITEM],
    }
    client.put("/api/devices", json=body)
    db = main.app.state.db
    device_id = db.execute("SELECT id FROM devices").fetchone()[0]
    store.mark_sent(db, device_id, "i1", "2026-09-21")
    client.request("DELETE", "/api/devices", json={"endpoint": SUB["endpoint"]})
    for table in ("devices", "items", "notifications"):
        assert db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0, table


def test_lookup_cache_is_pruned():
    from datetime import UTC, datetime, timedelta

    conn = store.connect(":memory:")
    store.cache_put(conn, "Gatan 1, Bromma, 167 71", [])
    conn.execute("UPDATE svoa_cache SET fetched_at = ?", ((datetime.now(UTC) - timedelta(hours=25)).isoformat(timespec="seconds"),))
    store.cache_put(conn, "Gatan 2, Bromma, 167 71", [])
    store.prune_cache(conn, datetime.now(UTC) - timedelta(hours=24))
    assert [r[0] for r in conn.execute("SELECT address FROM svoa_cache")] == ["Gatan 2, Bromma, 167 71"]


def body_for(endpoint):
    sub = {"endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"}}
    return {"subscription": sub, "settings": {"daysBefore": 1, "timeOfDay": "19:00"}, "items": []}


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/x",
        "https://web.push.apple.com/x",
        "https://updates.push.services.mozilla.com/wpush/v2/x",
        "https://wns2-db5p.notify.windows.com/w/?token=x",
    ],
)
def test_real_push_services_are_accepted(client, endpoint):
    assert client.put("/api/devices", json=body_for(endpoint)).status_code == 200


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://example.com/x",
        "https://fcm.googleapis.com.evil.example/x",
        "https://evilpush.apple.com.example/x",
        "https://127.0.0.1/x",
    ],
)
def test_other_hosts_are_refused(client, endpoint):
    assert client.put("/api/devices", json=body_for(endpoint)).status_code == 422
    assert store.count_devices(main.app.state.db) == 0


def test_subscription_the_push_service_rejects_is_not_stored(client, monkeypatch):
    monkeypatch.setattr(notify, "send", lambda *a, **kw: False)
    assert client.put("/api/devices", json=body_for(SUB["endpoint"])).status_code == 400
    assert store.count_devices(main.app.state.db) == 0


def test_known_device_is_not_re_verified(client, monkeypatch):
    client.put("/api/devices", json=body_for(SUB["endpoint"]))
    calls = []
    monkeypatch.setattr(notify, "send", lambda *a, **kw: calls.append(a) or True)
    client.put("/api/devices", json=body_for(SUB["endpoint"]))
    assert calls == []


def test_no_api_docs(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, path


def test_user_agent_column_is_dropped(tmp_path):
    import sqlite3

    path = str(tmp_path / "old.db")
    old = sqlite3.connect(path)
    old.execute("CREATE TABLE devices (id INTEGER PRIMARY KEY, endpoint TEXT, user_agent TEXT)")
    old.execute("INSERT INTO devices (endpoint, user_agent) VALUES ('e', 'Mozilla/5.0 (iPhone)')")
    old.commit()
    old.close()
    conn = store.connect(path)
    assert "user_agent" not in [r[1] for r in conn.execute("PRAGMA table_info(devices)")]
    assert conn.execute("SELECT endpoint FROM devices").fetchone()[0] == "e"


def test_silent_devices_without_bins_are_pruned():
    from datetime import UTC, datetime, timedelta

    conn = store.connect(":memory:")
    settings = {"daysBefore": 1, "timeOfDay": "19:00"}
    for name, items in (("empty", []), ("full", [ITEM])):
        sub = {"endpoint": f"https://fcm.googleapis.com/fcm/send/{name}", "keys": {"p256dh": "p", "auth": "a"}}
        store.upsert_device(conn, sub, settings, {}, items)
    old = (datetime.now(UTC) - timedelta(days=40)).isoformat(timespec="seconds")
    conn.execute("UPDATE devices SET last_seen_at = ?", (old,))
    store.prune_empty_devices(conn, datetime.now(UTC) - timedelta(days=30))
    assert [r[0] for r in conn.execute("SELECT endpoint FROM devices")] == [
        "https://fcm.googleapis.com/fcm/send/full"
    ]
