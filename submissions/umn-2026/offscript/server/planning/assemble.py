"""Schedule construction: a bounded search over visit orders.

This is a heuristic, not an optimiser: among feasible orders it picks the least total
(latest-estimate) travel, then the earliest finish. It makes no global-optimality claim.
For more than MAX_ITEMS stops it refuses rather than silently degrading; a constraint
solver is the planned replacement. The result is an unvalidated draft: callers must run
`validate_plan`.
"""
from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from itertools import permutations

from server.models import ActivityBlock, Cost, Place, Plan, TravelLeg, Trip

MAX_ITEMS = 8  # 8! = 40,320 simulations worst case


@dataclass(frozen=True)
class LegEstimate:
    mode: str
    min_s: int
    max_s: int
    distance_m: int | None = None
    evidence_id: str | None = None


TravelMatrix = Mapping[tuple[str, str], LegEstimate]


@dataclass
class AssembleResult:
    plan: Plan | None
    conflict: dict | None = None
    reasons: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class _Item:
    loc_id: str
    place: Place | None = None
    anchor: ActivityBlock | None = None


def _common_window(trip: Trip) -> tuple[datetime, datetime]:
    start, end = trip.window_start, trip.window_end
    for m in trip.travellers():
        if m.availability:
            start = max(start, min(w.start for w in m.availability))
            end = min(end, max(w.end for w in m.availability))
    return start, end


def _simulate(order: Sequence[_Item], trip: Trip, travel: TravelMatrix, start: datetime,
              end: datetime, attendees: tuple[str, ...]):
    t, cur = start, trip.origin.id
    legs: list[TravelLeg] = []
    blocks: list[ActivityBlock] = []
    travel_s = 0

    def go(to_id: str) -> datetime | str:
        nonlocal t, cur, travel_s
        if cur == to_id:
            return t
        est = travel.get((cur, to_id))
        if est is None:
            return f"missing route {cur}->{to_id}"
        legs.append(TravelLeg(id=f"leg-{cur}-{to_id}", from_id=cur, to_id=to_id, mode=est.mode,
                              depart=t, duration_min_s=est.min_s, duration_max_s=est.max_s,
                              distance_m=est.distance_m, attendees=attendees,
                              evidence_ids=(est.evidence_id,) if est.evidence_id else ()))
        travel_s += est.max_s
        arrive = t + timedelta(seconds=est.max_s)
        cur = to_id
        return arrive

    for it in order:
        arrive = go(it.loc_id)
        if isinstance(arrive, str):
            return None, arrive
        if it.anchor is not None:
            if arrive > it.anchor.start:
                return None, "late for a locked commitment"
            blocks.append(it.anchor)
            t = it.anchor.end
            continue
        p = it.place
        assert p is not None
        typical = timedelta(minutes=p.typical_visit_minutes)
        shortened = False
        s, dur = arrive, typical
        if p.opening_windows is not None:
            chosen = None
            for w in sorted(p.opening_windows, key=lambda w: w.start):
                cs = max(arrive, w.start)
                if p.last_admission is not None and cs > p.last_admission:
                    continue
                if cs + typical <= w.end:
                    chosen = (cs, typical, False)
                    break
                room = w.end - cs
                if p.optional_shrink and room >= timedelta(minutes=p.min_visit_minutes):
                    chosen = (cs, room, True)
                    break
            if chosen is None:
                return None, f"{p.id} not open long enough"
            s, dur, shortened = chosen
        cost = p.price if p.price is not None else Cost(currency=trip.currency, basis="per_person")
        blocks.append(ActivityBlock(
            id=f"b-{p.id}", place_id=p.id, name=p.name, start=s, end=s + dur, timezone=p.timezone,
            attendees=attendees, shortened=shortened, costs=(cost,), evidence_ids=p.evidence_ids,
            rationale="Shortened to fit opening hours." if shortened else ""))
        t = s + dur

    final = go(trip.endpoint.id)
    if isinstance(final, str):
        return None, final
    if final > end:
        return None, "returns after the deadline"
    return (blocks, legs, travel_s, final), None


def _best(items: list[_Item], trip, travel, start, end, attendees):
    best, reasons = None, {}
    for order in permutations(items):
        res, why = _simulate(order, trip, travel, start, end, attendees)
        if res is None:
            reasons[why] = reasons.get(why, 0) + 1
            continue
        key = (res[2], res[3])
        if best is None or key < best[0]:
            best = (key, res)
    return best, reasons


def _lower_bound_s(items: list[_Item], trip, travel) -> int | None:
    """Minimum travel + visit time ignoring opening hours; None if routes are missing."""
    visit = sum(
        int(it.anchor.end.timestamp() - it.anchor.start.timestamp()) if it.anchor
        else 60 * (it.place.min_visit_minutes if it.place.optional_shrink  # type: ignore[union-attr]
                   else it.place.typical_visit_minutes)  # type: ignore[union-attr]
        for it in items)
    best = None
    for order in permutations(items):
        pts = [trip.origin.id, *[i.loc_id for i in order], trip.endpoint.id]
        total, ok = 0, True
        for a, b in zip(pts, pts[1:]):
            if a == b:
                continue
            est = travel.get((a, b))
            if est is None:
                ok = False
                break
            total += est.max_s
        if ok and (best is None or total < best):
            best = total
    return None if best is None else best + visit


def assemble_plan(trip: Trip, selected: Sequence[Place], travel: TravelMatrix, *,
                  anchors: Sequence[ActivityBlock] = (), plan_id: str | None = None) -> AssembleResult:
    attendees = tuple(sorted(m.id for m in trip.travellers()))
    start, end = _common_window(trip)
    anchor_places = {a.place_id for a in anchors}
    items = [_Item(loc_id=a.place_id, anchor=a) for a in anchors]
    items += [_Item(loc_id=p.id, place=p) for p in selected if p.id not in anchor_places]

    if len(items) > MAX_ITEMS:
        return AssembleResult(None, {
            "code": "SEARCH_LIMIT", "message": f"{len(items)} stops exceeds the bounded-search "
            f"limit of {MAX_ITEMS}.", "relaxations": [{"type": "reduce_stops", "max": MAX_ITEMS}]})

    best, reasons = _best(items, trip, travel, start, end, attendees)
    if best is not None:
        blocks, legs, _, _ = best[1]
        plan = Plan(id=plan_id or f"plan-{trip.id}-draft", trip_id=trip.id, state="draft",
                    base_plan_version=trip.plan_version,
                    base_constraints_version=trip.constraints_version,
                    blocks=tuple(blocks), legs=tuple(legs))
        return AssembleResult(plan, None, reasons)

    available = int((end - start).total_seconds())
    required = _lower_bound_s(items, trip, travel)
    relaxations: list[dict] = []
    if required is not None and required > available:
        code = "WINDOW_TOO_SHORT"
        msg = (f"Required travel and visits need {math.ceil(required / 60)} minutes but the "
               f"available window is {available // 60} minutes.")
        relaxations.append({"type": "extend_window", "minutes": math.ceil((required - available) / 60)})
    elif required is None:
        code, msg = "MISSING_ROUTE", "Route estimates are missing for some stops."
    else:
        code = "NO_FEASIBLE_ORDER"
        msg = "No ordering satisfies opening hours, locked commitments and the deadline."
    if code != "MISSING_ROUTE":
        for it in items:
            if it.anchor is not None:
                continue
            rest = [x for x in items if x is not it]
            if _best(rest, trip, travel, start, end, attendees)[0] is not None:
                relaxations.append({"type": "drop_stop", "place_id": it.loc_id})
    conflict = {"code": code, "message": msg, "available_minutes": available // 60,
                "required_minutes": None if required is None else math.ceil(required / 60),
                "relaxations": relaxations}
    return AssembleResult(None, conflict, reasons)
