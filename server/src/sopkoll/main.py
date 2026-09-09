"""Sopkoll API.

The browser is the only client. Two jobs: proxy Stockholm Vatten och Avfall
(their endpoints have no CORS) and hold the anonymous push devices the reminder
scheduler works from. There are no accounts — a device *is* its push
subscription, and its state is whatever the phone last mirrored here.
"""

from __future__ import annotations

import asyncio
import logging
import re
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from sopkoll import config, notify, store, svoa

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("sopkoll")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient()
    app.state.db = store.connect()
    task = asyncio.create_task(notify.scheduler(config.DB_PATH))
    try:
        yield
    finally:
        task.cancel()
        await app.state.http.aclose()
        app.state.db.close()


app = FastAPI(title="sopkoll", lifespan=lifespan)
if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
    )

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class Subscription(BaseModel):
    endpoint: str = Field(max_length=2000, pattern=r"^https://")
    keys: Keys


class Settings(BaseModel):
    daysBefore: int = Field(ge=0, le=7)
    timeOfDay: str = Field(pattern=HHMM.pattern)
    address: str | None = Field(default=None, max_length=200)


class Item(BaseModel):
    id: str = Field(max_length=64)
    name: str = Field(min_length=1, max_length=80)
    type: str = Field(max_length=20)
    source: str = Field(pattern=r"^(svoa|manual)$")
    address: str | None = Field(default=None, max_length=200)
    group: str | None = Field(default=None, max_length=120)
    frequencyText: str | None = Field(default=None, max_length=80)
    intervalDays: int = Field(ge=1, le=366)
    seasonMonths: list[int] | None = None
    nextDate: str = Field(pattern=ISO_DATE.pattern)
    enabled: bool = True

    @field_validator("seasonMonths")
    @classmethod
    def months(cls, v):
        if v is not None and (len(v) > 12 or any(m < 1 or m > 12 for m in v)):
            raise ValueError("seasonMonths must be 1–12")
        return v


class DeviceIn(BaseModel):
    subscription: Subscription
    userAgent: str = Field(default="", max_length=300)
    timezone: str = Field(default=config.TIMEZONE, max_length=64)
    settings: Settings
    items: list[Item] = Field(default_factory=list, max_length=config.MAX_ITEMS_PER_DEVICE)


class EndpointIn(BaseModel):
    endpoint: str = Field(max_length=2000)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/push/vapid")
def vapid() -> dict[str, str | None]:
    return {"publicKey": config.VAPID_PUBLIC or None}


@app.get("/api/address/suggest")
async def suggest(q: str = Query(min_length=3, max_length=100)) -> list[dict]:
    try:
        return await svoa.suggest(app.state.http, q)
    except (httpx.HTTPError, svoa.SvoaError) as err:
        log.warning("svoa suggest failed: %s", err)
        raise HTTPException(502, "Stockholm Vatten och Avfall svarar inte just nu") from err


@app.get("/api/address/schedule")
async def schedule(address: str = Query(min_length=5, max_length=200)) -> list[dict]:
    try:
        return await svoa.schedule_cached(app.state.http, app.state.db, address)
    except svoa.SvoaError as err:
        raise HTTPException(400, str(err)) from err
    except httpx.HTTPError as err:
        log.warning("svoa search failed: %s", err)
        raise HTTPException(502, "Stockholm Vatten och Avfall svarar inte just nu") from err


@app.put("/api/devices")
def put_device(body: DeviceIn) -> dict[str, int]:
    conn = app.state.db
    if not config.VAPID_PRIVATE:
        raise HTTPException(503, "push is not configured")
    if store.get_device(conn, body.subscription.endpoint) is None:
        if store.count_devices(conn) >= config.MAX_DEVICES:
            raise HTTPException(503, "sopkoll är fullt just nu")
    store.upsert_device(
        conn,
        body.subscription.model_dump(),
        body.settings.model_dump(),
        {"userAgent": body.userAgent, "timezone": body.timezone},
        [i.model_dump() for i in body.items],
    )
    return {"items": len(body.items)}


@app.delete("/api/devices")
def delete_device(body: EndpointIn) -> dict[str, str]:
    store.delete_device(app.state.db, body.endpoint)
    return {"status": "ok"}


@app.post("/api/devices/test")
def test_push(body: EndpointIn) -> dict[str, str]:
    row = store.get_device(app.state.db, body.endpoint)
    if row is None:
        raise HTTPException(404, "okänd enhet")
    ok = notify.send(
        {"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}},
        {"title": "sopkoll", "body": "Så här ser påminnelsen ut.", "url": "/app", "tag": "test"},
        ttl=60,
    )
    if not ok:
        store.delete_device(app.state.db, body.endpoint)
        raise HTTPException(410, "prenumerationen är borta")
    return {"status": "sent"}
