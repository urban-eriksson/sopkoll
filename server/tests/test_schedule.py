from datetime import date, datetime
from zoneinfo import ZoneInfo

from sopkoll.schedule import parse_frequency, reminder_at, upcoming

TZ = ZoneInfo("Europe/Stockholm")


def test_parse_frequency():
    assert parse_frequency("Varannan vecka") == (14, None)
    assert parse_frequency("Var 4:e vecka") == (28, None)
    assert parse_frequency("Varje vecka") == (7, None)
    assert parse_frequency("Varannan vecka (april-nov)") == (14, [4, 5, 6, 7, 8, 9, 10, 11])
    assert parse_frequency("okänt") == (14, None)


def test_upcoming_steps_and_rolls_forward():
    assert upcoming(date(2026, 9, 21), 14, None, date(2026, 9, 9), 3) == [
        date(2026, 9, 21), date(2026, 10, 5), date(2026, 10, 19),
    ]
    assert upcoming(date(2026, 9, 21), 14, None, date(2026, 10, 6), 2) == [
        date(2026, 10, 19), date(2026, 11, 2),
    ]
    assert upcoming(date(2026, 9, 21), 14, None, date(2026, 9, 21), 1) == [date(2026, 9, 21)]


def test_upcoming_skips_season():
    season = [4, 5, 6, 7, 8, 9, 10, 11]
    assert upcoming(date(2026, 11, 23), 14, season, date(2026, 11, 20), 2) == [
        date(2026, 11, 23), date(2027, 4, 12),
    ]


def test_reminder_at():
    at = reminder_at(date(2026, 9, 21), 1, "19:00", TZ)
    assert at == datetime(2026, 9, 20, 19, 0, tzinfo=TZ)
