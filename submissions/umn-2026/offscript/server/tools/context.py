"""Mutable state for one agent run. The model never touches this directly: it only sees tool
outputs, and only objects that came from providers (or from code) can enter these maps."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from server.models import Evidence, Place, Plan, Trip
from server.models.weather import ForecastPeriod
from server.planning.assemble import LegEstimate
from server.providers.base import PlacesProvider, PlaceSummary, RoutesProvider, WeatherProvider


@dataclass
class Proposal:
    id: str
    plan: Plan
    explanation: str
    evidence_ids: tuple[str, ...]


@dataclass
class ToolContext:
    trip: Trip
    places: PlacesProvider
    routes: RoutesProvider
    weather: WeatherProvider
    now: datetime
    base_plan: Plan | None = None  # accepted plan being revised: its locked blocks are anchors
    candidates: dict[str, PlaceSummary] = field(default_factory=dict)  # ids returned by search
    details: dict[str, Place] = field(default_factory=dict)  # ids with provider details
    evidence: dict[str, Evidence] = field(default_factory=dict)
    matrices: dict[str, dict[tuple[str, str], LegEstimate]] = field(default_factory=dict)  # by mode
    forecast: list[ForecastPeriod] = field(default_factory=list)
    forecast_retrieved: bool = False
    plans: dict[str, Plan] = field(default_factory=dict)
    proposals: list[Proposal] = field(default_factory=list)
    clarification: dict[str, Any] | None = None
    last_conflict: dict[str, Any] | None = None
    validations_run: int = 0
