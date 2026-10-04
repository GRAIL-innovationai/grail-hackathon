"""Plan, place and validation contracts."""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Literal

from pydantic import Field, model_validator

from .common import Cost, Frozen, IanaZone, TimeWindow, UtcDatetime

PlanState = Literal["draft", "provisional", "ready", "accepted", "stale", "rejected", "archived"]
CheckStatus = Literal["pass", "fail", "unknown"]
Commitment = Literal["recommended", "reservation", "fixed"]


class Place(Frozen):
    """A candidate venue as returned by a provider tool. Every field is optional evidence.

    opening_windows: None = hours UNKNOWN; () = known closed for the visit date.
    """

    id: str
    name: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    timezone: IanaZone
    categories: tuple[str, ...] = ()
    opening_windows: tuple[TimeWindow, ...] | None = None
    last_admission: UtcDatetime | None = None
    price: Cost | None = None  # None = unknown, never free
    min_visit_minutes: int = Field(default=30, ge=1)
    typical_visit_minutes: int = Field(default=60, ge=1)
    optional_shrink: bool = False  # may the visit be shortened (to >= min) to fit?
    step_free: bool | None = None
    outdoor: bool | None = None
    evidence_ids: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _durations(self) -> Place:
        if self.min_visit_minutes > self.typical_visit_minutes:
            raise ValueError("min_visit_minutes must be <= typical_visit_minutes")
        return self


class ActivityBlock(Frozen):
    id: str  # stable across revisions so diffs do not treat every stop as new
    place_id: str
    name: str
    start: UtcDatetime
    end: UtcDatetime
    timezone: IanaZone
    attendees: tuple[str, ...]
    locked: bool = False
    commitment: Commitment = "recommended"
    shortened: bool = False
    costs: tuple[Cost, ...] = ()
    evidence_ids: tuple[str, ...] = ()
    rationale: str = ""

    @model_validator(mode="after")
    def _order(self) -> ActivityBlock:
        if self.end <= self.start:
            raise ValueError("block end must be after start")
        if not self.attendees:
            raise ValueError("a block needs at least one attendee")
        return self


class TravelLeg(Frozen):
    id: str
    from_id: str
    to_id: str
    mode: str
    depart: UtcDatetime
    duration_min_s: int = Field(ge=0)
    duration_max_s: int = Field(ge=0)
    distance_m: int | None = None
    attendees: tuple[str, ...]
    evidence_ids: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _range(self) -> TravelLeg:
        if self.duration_max_s < self.duration_min_s:
            raise ValueError("duration_max_s must be >= duration_min_s")
        return self

    @property
    def arrive_latest(self):
        return self.depart + timedelta(seconds=self.duration_max_s)


class Check(Frozen):
    code: str
    status: CheckStatus
    message: str
    participant_ids: tuple[str, ...] = ()
    block_ids: tuple[str, ...] = ()
    evidence_ids: tuple[str, ...] = ()
    data: dict[str, Any] = Field(default_factory=dict)


class CostTotal(Frozen):
    currency: str
    low_minor: int
    high_minor: int
    has_unknown: bool
    cap_minor: int | None = None


class ValidationReport(Frozen):
    checks: tuple[Check, ...]
    per_person_totals: dict[str, CostTotal] = Field(default_factory=dict)

    @property
    def overall(self) -> Literal["failed", "provisional", "checked"]:
        """Aggregate never hides a failed or unknown hard check."""
        if any(c.status == "fail" for c in self.checks):
            return "failed"
        if any(c.status == "unknown" for c in self.checks):
            return "provisional"
        return "checked"

    def by_code(self, code: str) -> tuple[Check, ...]:
        return tuple(c for c in self.checks if c.code == code)


class Plan(Frozen):
    id: str
    trip_id: str
    state: PlanState = "draft"
    base_plan_version: int = 0
    base_constraints_version: int = 1
    blocks: tuple[ActivityBlock, ...] = ()
    legs: tuple[TravelLeg, ...] = ()
    trip_costs: tuple[Cost, ...] = ()
    validation: ValidationReport | None = None
