"""SYNTHETIC test fixtures. Venues, prices and times here are invented for tests only and
must never be presented as real venues or verified data."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from server.models import Cost, Location, Member, Place, TimeWindow, Trip
from server.planning.assemble import LegEstimate

CHI = ZoneInfo("America/Chicago")


def at(h: int, m: int = 0, day: tuple[int, int, int] = (2026, 6, 6), tz=CHI) -> datetime:
    return datetime(*day, h, m, tzinfo=tz)


HOME = Location(id="home", name="Home (synthetic)", lat=44.97, lon=-93.26, timezone="America/Chicago")


def free() -> Cost:
    return Cost(currency="USD", min_minor=0, max_minor=0, basis="per_person")


def money(lo: int, hi: int | None = None, basis: str = "per_person") -> Cost:
    return Cost(currency="USD", min_minor=lo, max_minor=lo if hi is None else hi, basis=basis)


def member(mid: str = "m1", *, window=(at(10), at(11, 30)), cap: int | None = 1000, **kw) -> Member:
    avail = kw.pop("availability", (TimeWindow(start=window[0], end=window[1]),))
    kw.setdefault("transport_modes", ("walk",))
    return Member(id=mid, display_name=mid.upper(), budget_cap_minor=cap, availability=avail, **kw)


def trip(members=None, *, start=None, end=None, tz="America/Chicago") -> Trip:
    start = start or at(10)
    end = end or at(11, 30)
    members = members or [member("m1", window=(start, end))]
    return Trip(id="t1", owner_id=members[0].id, mode="solo" if len(members) == 1 else "group",
                title="Synthetic trip", timezone=tz, currency="USD", origin=HOME, endpoint=HOME,
                window_start=start, window_end=end, members=tuple(members))


def place(pid: str, *, hours=(8, 20), price: Cost | None = None, typical=30, min_=15,
          shrink=False, step_free: bool | None = True, outdoor=False, windows="auto") -> Place:
    if windows == "auto":
        windows = (TimeWindow(start=at(hours[0]), end=at(hours[1])),) if hours else None
    return Place(id=pid, name=pid.title(), lat=44.97, lon=-93.26, timezone="America/Chicago",
                 opening_windows=windows, price=price, typical_visit_minutes=typical,
                 min_visit_minutes=min_, optional_shrink=shrink, step_free=step_free,
                 outdoor=outdoor, evidence_ids=(f"ev-{pid}",))


def matrix(pairs: dict[tuple[str, str], int], mode: str = "walk") -> dict:
    """minutes -> LegEstimate in both directions; max == min + 0 for simplicity."""
    out = {}
    for (a, b), mins in pairs.items():
        est = LegEstimate(mode=mode, min_s=mins * 60, max_s=mins * 60)
        out[(a, b)] = est
        out[(b, a)] = est
    return out
