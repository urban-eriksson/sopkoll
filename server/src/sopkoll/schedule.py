"""Date math shared with the client (apps/web/src/lib/schedule.ts). Keep the two in step.

SVOA only publishes the *next* pickup per bin and a free-text frequency, so every
later date is extrapolated from that anchor by the interval, skipping months
outside the season. The nightly refresh re-anchors on SVOA's real next date, which
is how holiday shifts get corrected.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

MONTHS_SV = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]


def parse_frequency(text: str) -> tuple[int, list[int] | None]:
    t = text.lower()
    interval = 14
    if re.search(r"varje vecka|en gång i veckan", t):
        interval = 7
    elif "varannan" in t:
        interval = 14
    else:
        m = re.search(r"var\s+(\d+):?[ae]?\s+vecka", t)
        if m:
            interval = int(m.group(1)) * 7
    season = re.search(r"\(([a-zåäö]+)\s*[-–]\s*([a-zåäö]+)\)", t)
    if season:
        a, b = _month(season.group(1)), _month(season.group(2))
        if a and b:
            months = []
            m = a
            while True:
                months.append(m)
                if m == b or len(months) > 12:
                    break
                m = m % 12 + 1
            return interval, months
    return interval, None


def _month(name: str) -> int | None:
    for i, m in enumerate(MONTHS_SV):
        if name.startswith(m):
            return i + 1
    return None


def upcoming(next_date: date, interval: int, season: list[int] | None, today: date, count=1):
    """ISO dates on/after `today`, stepping from `next_date` and keeping its phase."""
    step = max(1, interval)
    d = next_date
    if d < today:
        behind = -(-(today - d).days // step)  # ceil
        d = d + timedelta(days=behind * step)
    out: list[date] = []
    for _ in range(int(730 / step) * 2 + count):
        if len(out) >= count:
            break
        if not season or d.month in season:
            out.append(d)
        d += timedelta(days=step)
    return out


def reminder_at(pickup: date, days_before: int, time_of_day: str, tz: ZoneInfo) -> datetime:
    hh, mm = (int(x) for x in time_of_day.split(":")[:2])
    return datetime.combine(pickup - timedelta(days=days_before), time(hh, mm), tzinfo=tz)
