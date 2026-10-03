"""Shared primitives: UTC instants, strict base model, costs in integer minor units."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, model_validator


def _to_utc(v: datetime) -> datetime:
    return v.astimezone(UTC)


# All instants are stored in UTC. Arithmetic on datetimes that share a ZoneInfo is
# wall-clock arithmetic in Python and is wrong across DST changes, so we never
# compute with local datetimes. The IANA zone is stored separately for rendering.
UtcDatetime = Annotated[AwareDatetime, AfterValidator(_to_utc)]


def validate_iana(name: str) -> str:
    ZoneInfo(name)  # raises if the zone is unknown
    return name


IanaZone = Annotated[str, AfterValidator(validate_iana)]


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


def local(dt: datetime, tz: str) -> datetime:
    """Render a UTC instant in an IANA zone (display only)."""
    return dt.astimezone(ZoneInfo(tz))


CostBasis = Literal["per_person", "fixed_shared", "whole_trip"]


class Cost(Frozen):
    """A cost in integer minor units (e.g. cents). min/max both None means UNKNOWN.

    Unknown is not zero: a missing price must never be treated as free.
    """

    currency: str = Field(pattern=r"^[A-Z]{3}$")
    min_minor: int | None = None
    max_minor: int | None = None
    basis: CostBasis
    category: str = "activity"
    quoted_at: UtcDatetime | None = None
    evidence_id: str | None = None

    @model_validator(mode="after")
    def _range(self) -> Cost:
        if (self.min_minor is None) != (self.max_minor is None):
            raise ValueError("min_minor and max_minor must both be set or both be None")
        if self.min_minor is not None:
            if self.min_minor < 0 or self.max_minor < self.min_minor:  # type: ignore[operator]
                raise ValueError("require 0 <= min_minor <= max_minor")
        return self

    @property
    def unknown(self) -> bool:
        return self.min_minor is None


class TimeWindow(Frozen):
    start: UtcDatetime
    end: UtcDatetime

    @model_validator(mode="after")
    def _order(self) -> TimeWindow:
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self

    def contains(self, start: datetime, end: datetime) -> bool:
        return self.start <= start and end <= self.end


EvidenceStatus = Literal["verified", "unverified", "unknown"]


class Evidence(Frozen):
    """Provenance for one field of one entity. Each field carries its own record."""

    id: str
    field: str
    value: Any = None
    source: str
    url: str | None = None
    retrieved_at: UtcDatetime
    applies_at: UtcDatetime | None = None
    status: EvidenceStatus = "verified"
    synthetic: bool = False  # True for labeled test fixtures; never shown as real in live mode
