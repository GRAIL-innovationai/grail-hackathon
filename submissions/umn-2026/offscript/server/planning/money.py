"""Integer-minor-unit cost allocation. No floats, no averaging of caps."""
from __future__ import annotations

from collections.abc import Sequence

from server.models.common import Cost


def split_minor(total: int, ids: Sequence[str]) -> dict[str, int]:
    """Split `total` into integer shares that sum exactly to `total`.

    Deterministic: ids are sorted and the remainder goes one unit each to the first ids.
    """
    ordered = sorted(set(ids))
    if not ordered:
        raise ValueError("cannot split among zero people")
    base, rem = divmod(total, len(ordered))
    return {pid: base + (1 if i < rem else 0) for i, pid in enumerate(ordered)}


def allocate(cost: Cost, attendees: Sequence[str]) -> dict[str, tuple[int | None, int | None]]:
    """Each attendee's (low, high) share of `cost`; (None, None) if the cost is unknown.

    per_person  -> every attendee pays the full amount.
    fixed_shared / whole_trip -> split equally among `attendees` (a stated product policy).
    """
    ids = sorted(set(attendees))
    if cost.unknown:
        return {a: (None, None) for a in ids}
    assert cost.min_minor is not None and cost.max_minor is not None
    if cost.basis == "per_person":
        return {a: (cost.min_minor, cost.max_minor) for a in ids}
    lows = split_minor(cost.min_minor, ids)
    highs = split_minor(cost.max_minor, ids)
    return {a: (lows[a], highs[a]) for a in ids}
