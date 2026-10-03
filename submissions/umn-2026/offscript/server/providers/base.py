"""Provider interfaces. Real adapters implement these; tools never import a concrete provider.

Adapters must distinguish "no results" (empty list) from failure (ProviderError), report
what they cannot do (unsupported mode, beyond forecast horizon) and never invent data.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol

from server.models import Evidence, Place
from server.models.weather import ForecastPeriod
from server.planning.assemble import LegEstimate


class ProviderError(RuntimeError):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind  # "unavailable" | "timeout" | "unsupported" | "rate_limited"


@dataclass(frozen=True)
class PlaceSummary:
    id: str
    name: str
    categories: tuple[str, ...]
    lat: float
    lon: float
    source: str
    synthetic: bool = False


@dataclass(frozen=True)
class PlaceDetails:
    place: Place
    evidence: tuple[Evidence, ...]
    untrusted_text: str = ""  # free text from the source: DATA only, never instructions


class PlacesProvider(Protocol):
    name: str
    synthetic: bool

    def search(self, *, category: str, query: str, limit: int) -> list[PlaceSummary]: ...

    def details(self, place_id: str, visit_day: date) -> PlaceDetails | None: ...


class RoutesProvider(Protocol):
    name: str
    synthetic: bool
    modes: tuple[str, ...]

    def estimate(self, origin_id: str, dest_id: str, mode: str, depart: datetime) -> LegEstimate | None:
        """None = this provider has no estimate for the pair. Raises ProviderError on failure."""


class WeatherProvider(Protocol):
    name: str
    synthetic: bool
    horizon_days: int

    def forecast(self, lat: float, lon: float, start: datetime, end: datetime) -> list[ForecastPeriod]:
        """Empty list = no forecast available for that period (e.g. beyond the horizon)."""
