"""The API through FastAPI's TestClient, which (like uvicorn) runs sync endpoints
on worker threads — the case that broke the shared SQLite connection in production."""

import pytest
from fastapi.testclient import TestClient

from sopkoll import config, main, store

SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "p", "auth": "a"}}
ITEM = {
    "id": "i1", "name": "Papper och plast", "type": "papperplast", "source": "manual",
    "intervalDays": 14, "nextDate": "2026-09-21", "enabled": True,
}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "VAPID_PRIVATE", "x")
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
