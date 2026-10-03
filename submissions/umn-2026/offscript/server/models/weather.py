"""Forecast contract. Periods beyond a provider's horizon are simply absent (unknown)."""
from __future__ import annotations

from pydantic import Field

from .common import Frozen, UtcDatetime


class ForecastPeriod(Frozen):
    start: UtcDatetime
    end: UtcDatetime
    precip_probability: float = Field(ge=0, le=1)
    evidence_id: str | None = None
