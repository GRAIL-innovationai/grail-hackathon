"""Trip, member and constraint contracts."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, model_validator

from .common import Frozen, IanaZone, TimeWindow, UtcDatetime

Role = Literal["organizer", "participant", "viewer"]
Hardness = Literal["hard", "soft", "locked"]
ConstraintOrigin = Literal["explicit", "inferred", "assumed"]
Visibility = Literal["private", "group", "status_only"]
TripMode = Literal["solo", "group"]


class Location(Frozen):
    id: str
    name: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    timezone: IanaZone


class Constraint(Frozen):
    """A user-facing constraint with provenance. Nullable/absent means unknown."""

    id: str
    owner_id: str | None = None  # None = trip-level
    key: str
    value: Any = None
    hardness: Hardness
    origin: ConstraintOrigin
    visibility: Visibility = "group"
    version: int = 1
    updated_at: UtcDatetime | None = None


class Member(Frozen):
    """Typed profile used by the deterministic validators.

    None conventions (important):
      * availability / budget / transport_modes: None = UNKNOWN -> checks return "unknown".
      * requires_step_free / avoid_rain_above: None = no requirement stated.
      * has_car: None = unknown; a car belongs to its owner and has a capacity.
    """

    id: str
    display_name: str
    role: Role = "participant"
    availability: tuple[TimeWindow, ...] | None = None
    start_location_id: str | None = None  # defaults to trip origin
    end_location_id: str | None = None  # defaults to trip endpoint
    budget_cap_minor: int | None = Field(default=None, ge=0)
    budget_uncapped: bool = False  # explicit "no cap", distinct from unknown
    budget_currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    transport_modes: tuple[str, ...] | None = None
    has_car: bool | None = None
    car_capacity: int | None = Field(default=None, ge=1)
    requires_step_free: bool | None = None
    avoid_rain_above: float | None = Field(default=None, ge=0, le=1)  # precip probability

    @model_validator(mode="after")
    def _car(self) -> Member:
        if self.has_car and self.car_capacity is None:
            raise ValueError("a member with a car must declare car_capacity")
        return self


class Trip(Frozen):
    id: str
    owner_id: str
    mode: TripMode
    title: str
    timezone: IanaZone
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    origin: Location
    endpoint: Location
    window_start: UtcDatetime
    window_end: UtcDatetime
    members: tuple[Member, ...]
    constraints: tuple[Constraint, ...] = ()
    budget_includes: tuple[str, ...] = ("activity",)
    decision_policy: str = "organizer_accepts"
    constraints_version: int = 1
    plan_version: int = 0
    accepted_plan_id: str | None = None

    @model_validator(mode="after")
    def _check(self) -> Trip:
        if self.window_end <= self.window_start:
            raise ValueError("window_end must be after window_start")
        ids = [m.id for m in self.members]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate member ids")
        if self.owner_id not in ids:
            raise ValueError("owner must be a member")
        if self.mode == "solo" and len(ids) != 1:
            raise ValueError("solo trips have exactly one member")
        return self

    def travellers(self) -> tuple[Member, ...]:
        return tuple(m for m in self.members if m.role != "viewer")
