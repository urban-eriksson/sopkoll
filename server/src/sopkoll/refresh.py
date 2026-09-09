"""Nightly: re-fetch every SVOA address we know and re-anchor its items' next dates.

Run by the systemd timer `sopkoll-refresh.timer` as `python -m sopkoll.refresh`.
The phones do the same on app open, so this only matters for a phone that stays
closed across a holiday shift — but that is exactly when a wrong date hurts.
"""

from __future__ import annotations

import asyncio
import logging
import sys

import httpx

from sopkoll import store, svoa

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("sopkoll.refresh")


async def main() -> int:
    conn = store.connect()
    addresses = store.svoa_addresses(conn)
    updated = failed = 0
    async with httpx.AsyncClient() as client:
        for address in addresses:
            try:
                pickups = await svoa.schedule_cached(client, conn, address, max_age_hours=0)
                updated += store.update_svoa_next_dates(conn, address, pickups)
            except Exception as err:  # noqa: BLE001
                failed += 1
                log.warning("refresh failed for %r: %s", address, err)
            await asyncio.sleep(0.5)  # be a polite guest
    log.info("refreshed %d address(es): %d item(s) updated, %d failed", len(addresses), updated, failed)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
