"""Live, keyless data for the MVP: OpenStreetMap (Overpass) places, Open-Meteo forecast, and
straight-line route ESTIMATES. Limitations are surfaced to the model and the user:

* OSM hours/prices come from community tags and may be missing or stale. Unparseable hours stay
  UNKNOWN; a missing price stays UNKNOWN (only an explicit fee=no counts as free).
* Routes are straight-line distance x a detour factor at a fixed speed, not a routing engine.
* Open-Meteo's free service is for non-commercial use; check its terms before commercial use.
"""
from __future__ import annotations

import math
import re
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx

from server.http import make_client
from server.models import Cost, Evidence, Place, TimeWindow
from server.models.weather import ForecastPeriod
from server.planning.assemble import LegEstimate

from .base import PlaceDetails, PlaceSummary, ProviderError
from .synthetic import SPEED_KMH, _haversine_m

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
USER_AGENT = "SideQuest-MVP/0.1 (hackathon prototype)"
DETOUR = 1.3

# category -> (OSM key, accepted values)
CATEGORIES = {
    "food": ("amenity", {"cafe", "restaurant", "ice_cream", "fast_food"}),
    "outdoor": ("leisure", {"park", "garden"}),
    "scenic": ("tourism", {"viewpoint"}),
    "culture": ("tourism", {"museum", "gallery", "attraction"}),
}
# (typical, minimum) visit minutes by OSM value
DURATIONS = {"cafe": (45, 20), "restaurant": (60, 30), "ice_cream": (20, 10), "fast_food": (30, 15),
             "park": (45, 20), "garden": (40, 15), "viewpoint": (20, 10), "museum": (90, 45),
             "gallery": (60, 30), "attraction": (45, 20)}
DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
_RULE = re.compile(r"(?:(?P<days>[A-Za-z, \-]+?)\s+)?(?P<times>\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}"
                   r"(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)")


def _days_in(spec: str | None) -> set[int] | None:
    if spec is None:
        return set(range(7))
    out: set[int] = set()
    for part in spec.replace(" ", "").split(","):
        if "-" in part:
            a, _, b = part.partition("-")
            if a not in DAYS or b not in DAYS:
                return None
            i, j = DAYS.index(a), DAYS.index(b)
            out |= set(range(i, j + 1)) if i <= j else set(range(i, 7)) | set(range(0, j + 1))
        elif part in DAYS:
            out.add(DAYS.index(part))
        else:
            return None
    return out


def parse_hours(raw: str | None, day: date, tz: ZoneInfo) -> tuple[TimeWindow, ...] | None:
    """Parse simple OSM opening_hours for `day`. None = unknown (unparseable or absent);
    () = parsed and closed that day. Anything exotic (PH, sunrise, off, week ranges) -> None."""
    if not raw:
        return None
    raw = raw.strip()

    def at(d: date, h: int, m: int) -> datetime:
        base = d + timedelta(days=1) if h == 24 else d
        return datetime.combine(base, time(0 if h == 24 else h, m), tzinfo=tz).astimezone(UTC)

    if raw == "24/7":
        return (TimeWindow(start=at(day, 0, 0), end=at(day, 24, 0)),)
    windows: list[TimeWindow] = []
    for rule in (r.strip() for r in raw.split(";") if r.strip()):
        m = _RULE.fullmatch(rule)
        if not m:
            return None
        days = _days_in(m.group("days"))
        if days is None:
            return None
        if day.weekday() not in days:
            continue
        for span in re.findall(r"\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}", m.group("times")):
            a, b = (x.strip() for x in span.split("-"))
            (h1, m1), (h2, m2) = (map(int, a.split(":")), map(int, b.split(":")))
            start = at(day, h1, m1)
            end = at(day, h2, m2)
            if end <= start:  # closes after midnight
                end = at(day + timedelta(days=1), h2, m2)
            windows.append(TimeWindow(start=start, end=end))
    return tuple(windows)


class LiveWorld:
    """Implements PlacesProvider, RoutesProvider and WeatherProvider with live public data."""

    name = "OpenStreetMap + Open-Meteo (route times are estimates)"
    synthetic = False
    modes = ("walk", "bike", "car")
    horizon_days = 7

    def __init__(self, *, lat: float, lon: float, tz: str, origin_id: str, now: datetime,
                 radius_m: int = 2000, client: httpx.Client | None = None):
        self._lat, self._lon, self._tz, self._origin_id = lat, lon, ZoneInfo(tz), origin_id
        self._now = now.astimezone(UTC)
        self._radius = radius_m
        self._client = client or make_client(timeout=25.0, headers={"User-Agent": USER_AGENT})
        self._elements: dict[str, dict] | None = None
        self._points: dict[str, tuple[float, float]] = {origin_id: (lat, lon)}

    # --- places (Overpass) -------------------------------------------------------

    def _load(self) -> dict[str, dict]:
        if self._elements is not None:
            return self._elements
        parts = []
        for key, vals in CATEGORIES.values():
            rx = "|".join(sorted(vals))
            parts.append(f'nwr(around:{self._radius},{self._lat},{self._lon})["{key}"~"^({rx})$"]["name"];')
        query = f"[out:json][timeout:20];({''.join(parts)});out center 60;"
        try:
            resp = self._client.post(OVERPASS_URL, data={"data": query})
        except httpx.HTTPError as exc:
            raise ProviderError("unavailable", f"Overpass request failed: {type(exc).__name__}") from None
        if resp.status_code in (429, 504):
            raise ProviderError("rate_limited", f"Overpass busy ({resp.status_code}); try again shortly")
        if resp.status_code != 200:
            raise ProviderError("unavailable", f"Overpass returned {resp.status_code}")
        try:
            body = resp.json()
        except ValueError:
            raise ProviderError("unavailable", "Overpass returned an unreadable response") from None
        els: dict[str, dict] = {}
        for e in body.get("elements", []):
            lat = e.get("lat") or (e.get("center") or {}).get("lat")
            lon = e.get("lon") or (e.get("center") or {}).get("lon")
            if lat is None or lon is None:
                continue
            pid = f"osm-{e['type']}-{e['id']}"
            els[pid] = {"tags": e.get("tags", {}), "lat": lat, "lon": lon, "type": e["type"], "osm_id": e["id"]}
            self._points[pid] = (lat, lon)
        self._elements = els
        return els

    @staticmethod
    def _kind(tags: dict) -> tuple[str, str] | None:
        for cat, (key, vals) in CATEGORIES.items():
            if tags.get(key) in vals:
                return cat, tags[key]
        return None

    def search(self, *, category: str, query: str, limit: int) -> list[PlaceSummary]:
        cat, q = category.strip().lower(), query.strip().lower()
        out = []
        for pid, e in self._load().items():
            kind = self._kind(e["tags"])
            if kind is None or (cat and kind[0] != cat):
                continue
            name = e["tags"].get("name", "")
            if q and q not in name.lower() and q not in kind[1]:
                continue
            d = _haversine_m((self._lat, self._lon), (e["lat"], e["lon"]))
            out.append((d, PlaceSummary(pid, name, (kind[0], kind[1]), e["lat"], e["lon"], "OpenStreetMap")))
        out.sort(key=lambda t: t[0])
        return [p for _, p in out[:limit]]

    def details(self, place_id: str, visit_day: date) -> PlaceDetails | None:
        e = self._load().get(place_id)
        if e is None:
            return None
        tags = e["tags"]
        cat, value = self._kind(tags) or ("", "")
        typical, minimum = DURATIONS.get(value, (45, 20))
        raw_hours = tags.get("opening_hours")
        windows = parse_hours(raw_hours, visit_day, self._tz)
        fee = tags.get("fee")
        price = Cost(currency="USD", min_minor=0, max_minor=0, basis="per_person",
                     quoted_at=self._now, evidence_id=f"ev-{place_id}-price") if fee == "no" else None
        wc = tags.get("wheelchair")
        step_free = True if wc == "yes" else False if wc == "no" else None
        outdoor = True if cat in ("outdoor", "scenic") else False if cat in ("food", "culture") and value != "garden" else None
        url = f"https://www.openstreetmap.org/{e['type']}/{e['osm_id']}"
        noon = datetime.combine(visit_day, time(12), tzinfo=self._tz).astimezone(UTC)

        def ev(field, value, known, eid):
            return Evidence(id=eid, field=field, value=value, source="OpenStreetMap", url=url,
                            retrieved_at=self._now, applies_at=noon,
                            status="unverified" if known else "unknown")

        evidence = (ev("opening_hours", raw_hours, windows is not None, f"ev-{place_id}-hours"),
                    ev("price", fee, price is not None, f"ev-{place_id}-price"),
                    ev("step_free", wc, step_free is not None, f"ev-{place_id}-access"))
        place = Place(id=place_id, name=tags.get("name", place_id), lat=e["lat"], lon=e["lon"],
                      timezone=str(self._tz), categories=(cat, value), opening_windows=windows, price=price,
                      min_visit_minutes=minimum, typical_visit_minutes=typical, optional_shrink=(cat == "food"),
                      step_free=step_free, outdoor=outdoor, evidence_ids=tuple(x.id for x in evidence))
        return PlaceDetails(place, evidence, (tags.get("description") or "")[:200])

    # --- routes (straight-line estimates) ---------------------------------------

    def estimate(self, origin_id: str, dest_id: str, mode: str, depart: datetime) -> LegEstimate | None:
        if mode not in SPEED_KMH:
            raise ProviderError("unsupported", f"mode {mode!r} not supported; use one of {self.modes}")
        a, b = self._points.get(origin_id), self._points.get(dest_id)
        if a is None or b is None:
            return None
        dist = _haversine_m(a, b) * DETOUR
        base = dist / 1000 / SPEED_KMH[mode] * 3600
        extra = 300 if mode == "car" else 0
        return LegEstimate(mode=mode, min_s=int(round(base)) + extra, max_s=int(round(base * 1.3)) + extra + 60,
                           distance_m=int(round(dist)), evidence_id=f"ev-route-{origin_id}-{dest_id}-{mode}")

    # --- weather (Open-Meteo) ----------------------------------------------------

    def forecast(self, lat: float, lon: float, start: datetime, end: datetime) -> list[ForecastPeriod]:
        if start > self._now + timedelta(days=self.horizon_days):
            return []
        try:
            resp = self._client.get(OPEN_METEO_URL, params={
                "latitude": lat, "longitude": lon, "hourly": "precipitation_probability",
                "timezone": "GMT", "forecast_days": 7})
        except httpx.HTTPError as exc:
            raise ProviderError("unavailable", f"Open-Meteo request failed: {type(exc).__name__}") from None
        if resp.status_code != 200:
            raise ProviderError("unavailable", f"Open-Meteo returned {resp.status_code}")
        try:
            h = resp.json().get("hourly", {})
        except ValueError:
            raise ProviderError("unavailable", "Open-Meteo returned an unreadable response") from None
        out = []
        for t, p in zip(h.get("time", []), h.get("precipitation_probability", [])):
            if p is None:
                continue
            s = datetime.fromisoformat(t).replace(tzinfo=UTC)
            if s < end and s + timedelta(hours=1) > start:
                out.append(ForecastPeriod(start=s, end=s + timedelta(hours=1),
                                          precip_probability=p / 100, evidence_id="ev-open-meteo"))
        return out
