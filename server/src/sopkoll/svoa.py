"""Stockholm Vatten och Avfall's "När kommer sopbilen?" endpoints.

Two unauthenticated JSON calls under the public page URL (verified 2026-09-09):
  GET {BASE}/AutoCompleteMe?query=Nockebyvägen 1
    -> [{"value": "Nockebyvägen 15, Bromma, 167 71", "data": "167 71"}, ...]
  GET {BASE}/Search?address=Nockebyvägen 15, Bromma, 167 71
    -> [{"group": "Kärl 1 - restavfall och matavfall", "fetchFrequency": "Varannan vecka",
         "executionDate": "2026-09-09", "weekday": "Onsdag"}, ...]
The address must be the exact autocomplete value; anything else answers
{"error": "Internal Server Error", "message": "Invalid address format"} with HTTP 200.
Apartment buildings answer []. No CORS, hence this proxy.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta

import httpx

from sopkoll import config, store

log = logging.getLogger("sopkoll.svoa")

HEADERS = {
    "accept": "application/json",
    "user-agent": "sopkoll/0.1 (+https://sopkoll.korist.se)",
}


class SvoaError(Exception):
    pass


async def suggest(client: httpx.AsyncClient, query: str) -> list[dict]:
    r = await client.get(
        f"{config.SVOA_BASE}/AutoCompleteMe", params={"query": query}, headers=HEADERS, timeout=8
    )
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        raise SvoaError("unexpected autocomplete response")
    return [
        {"value": str(d.get("value", "")), "postcode": str(d.get("data", ""))}
        for d in data
        if isinstance(d, dict) and d.get("value")
    ]


async def search(client: httpx.AsyncClient, address: str) -> list[dict]:
    r = await client.get(
        f"{config.SVOA_BASE}/Search", params={"address": address}, headers=HEADERS, timeout=10
    )
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and "error" in data:
        raise SvoaError(data.get("message") or "invalid address")
    if not isinstance(data, list):
        raise SvoaError("unexpected search response")
    out = []
    for d in data:
        try:
            datetime.strptime(d["executionDate"], "%Y-%m-%d")
        except (KeyError, ValueError, TypeError):
            continue
        out.append(
            {
                "group": str(d.get("group", "")),
                "fetchFrequency": str(d.get("fetchFrequency", "")),
                "executionDate": d["executionDate"],
                "weekday": str(d.get("weekday", "")),
            }
        )
    return out


async def schedule_cached(client, conn, address: str, max_age_hours: float | None = None):
    """Search with a per-address cache so N phones at one address cost one SVOA call."""
    max_age = timedelta(hours=config.SVOA_CACHE_HOURS if max_age_hours is None else max_age_hours)
    row = store.cache_get(conn, address)
    if row and datetime.now(UTC) - datetime.fromisoformat(row["fetched_at"]) < max_age:
        return json.loads(row["payload"])
    pickups = await search(client, address)
    store.cache_put(conn, address, pickups)
    return pickups
