"""
refresh_guard.py

Encapsulates ALL timing rules for Force Refresh restrictions.
Nothing else in the codebase needs to know HOW the rules work —
they just call check_refresh_allowed() and get a yes/no + message.

RULES (confirmed with product owner):
  - College hours: Mon-Sat, 09:30-16:30 -> rolling 60-minute cooldown
  - Night window: everything else (4:30 PM -> next college-hours start)
    -> exactly ONE refresh allowed per night window
  - Sunday has no special rule: it has no college-hours window of its
    own, so it's automatically absorbed into the Sat-evening -> Mon-morning
    night window. No separate "Sunday" logic needed.

This module is pure logic — no DB, no FastAPI imports. It receives
plain values (now, last_refresh_at, night_window_used_key) and returns
a plain result. This makes it trivial to unit test and to extend later
(e.g. different rules per department) without touching routes.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, time
from typing import Optional

COLLEGE_START = time(9, 30)
COLLEGE_END = time(16, 30)
COOLDOWN_MINUTES = 60

# Monday=0 ... Sunday=6 (Python's weekday() convention)
COLLEGE_DAYS = {0, 1, 2, 3, 4, 5}  # Mon-Sat


@dataclass
class RefreshDecision:
    allowed: bool
    reason: str                      # human-readable message for the user
    window_type: str                 # "college_hours" or "night"
    night_window_key: Optional[str] = None  # set when window_type == "night"


def _is_college_hours(dt: datetime) -> bool:
    return dt.weekday() in COLLEGE_DAYS and COLLEGE_START <= dt.time() < COLLEGE_END


def _night_window_start(dt: datetime) -> datetime:
    """
    Given any timestamp that falls OUTSIDE college hours, return the
    datetime at which the current night window began.

    Night windows always start at 16:30 on some day and run until
    09:30 on the next "open" day. Because Sunday has no college hours,
    a night window that starts Saturday 16:30 simply keeps running
    through all of Sunday and ends Monday 09:30 — no special casing
    needed, this just falls out of the date arithmetic below.
    """
    d = dt.date()

    if dt.time() >= COLLEGE_END:
        # We're in the evening portion (16:30 onward) -> window started today at 16:30
        start_date = d
    elif dt.time() < COLLEGE_START:
        # We're in the early-morning portion (00:00-09:30) -> window
        # started "yesterday" at 16:30. But if yesterday was a day with
        # no college hours of its own that ALSO falls in a night window
        # (i.e. yesterday was Sunday), we need to walk back further to
        # find the actual day the window opened on.
        start_date = d - timedelta(days=1)
    else:
        # Should never be called when in college hours, but guard anyway.
        start_date = d - timedelta(days=1) if dt.time() < COLLEGE_START else d

    # Walk backwards while start_date itself has no college hours
    # (i.e. it's a Sunday) — the window actually opened the evening
    # before that.
    while start_date.weekday() not in COLLEGE_DAYS:
        start_date -= timedelta(days=1)

    window_start = datetime.combine(start_date, COLLEGE_END)
    return window_start


def check_refresh_allowed(
    now: datetime,
    college_last_refresh_at: Optional[datetime],
    night_window_used_key: Optional[str],
) -> RefreshDecision:
    """
    Pure decision function — no side effects, no DB access.

    Args:
        now: current timestamp (server time, naive datetime is fine as
             long as it's consistent with what's stored in the DB)
        college_last_refresh_at: the user's last successful refresh
             timestamp THAT OCCURRED DURING COLLEGE HOURS, or None if
             they've never refreshed during college hours. This is
             intentionally separate from night-window refreshes so the
             two rule types never interfere with each other.
        night_window_used_key: string identifying which night window
             the user last used their one refresh in, or None

    Returns:
        RefreshDecision telling the caller whether to proceed.
    """
    if _is_college_hours(now):
        if college_last_refresh_at is None:
            return RefreshDecision(True, "OK", "college_hours")

        elapsed = now - college_last_refresh_at
        if elapsed >= timedelta(minutes=COOLDOWN_MINUTES):
            return RefreshDecision(True, "OK", "college_hours")

        remaining = timedelta(minutes=COOLDOWN_MINUTES) - elapsed
        mins = int(remaining.total_seconds() // 60)
        secs = int(remaining.total_seconds() % 60)
        return RefreshDecision(
            False,
            f"Please wait {mins}m {secs}s before refreshing again.",
            "college_hours",
        )

    # Night window
    window_start = _night_window_start(now)
    window_key = window_start.isoformat()

    if night_window_used_key == window_key:
        # Already used this exact night window — tell them when the
        # next college-hours window opens.
        next_day = window_start.date() + timedelta(days=1)
        while next_day.weekday() not in COLLEGE_DAYS:
            next_day += timedelta(days=1)
        next_open_dt = datetime.combine(next_day, COLLEGE_START)

        return RefreshDecision(
            False,
            f"You've already used tonight's refresh. "
            f"Next refresh available at {next_open_dt.strftime('%I:%M %p on %A')}.",
            "night",
            window_key,
        )

    return RefreshDecision(True, "OK", "night", window_key)