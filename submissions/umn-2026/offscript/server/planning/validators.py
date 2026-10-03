"""Deterministic plan validation. The model never marks its own schedule as valid.

Every check returns pass / fail / unknown. Aggregation (ValidationReport.overall) never
lets a fail or unknown hide behind a good score. Travel uses the *latest* duration estimate
and cost ranges use conservative bounds, so arithmetic passing is not a real-world guarantee.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence

from server.models import Check, CostTotal, Place, Plan, Trip, ValidationReport
from server.models.plan import ActivityBlock, TravelLeg
from server.models.trip import Member
from server.models.weather import ForecastPeriod

from .money import allocate


def _mins(seconds: float) -> int:
    return int(round(seconds / 60))


def validate_plan(
    trip: Trip,
    plan: Plan,
    places: Mapping[str, Place],
    *,
    forecast: Sequence[ForecastPeriod] = (),
    base_plan: Plan | None = None,
) -> ValidationReport:
    checks: list[Check] = []
    members = {m.id: m for m in trip.members}

    ref_checks, bad_blocks = _references(trip, plan, places, members)
    checks += ref_checks
    checks += _within_window(trip, plan)
    checks += _opening_hours(plan, places, bad_blocks)
    if base_plan is not None:
        checks += _locked_preserved(plan, base_plan)
    checks += _weather(plan, places, members, forecast, bad_blocks)

    totals: dict[str, CostTotal] = {}
    for m in trip.travellers():
        checks += _member_timeline(trip, plan, m)
        checks += _availability(plan, m)
        checks += _accessibility(plan, places, m, bad_blocks)
        budget_check, total = _budget(trip, plan, m)
        checks.append(budget_check)
        totals[m.id] = total
    checks += _transport(plan, members)
    return ValidationReport(checks=tuple(checks), per_person_totals=totals)


# --- references and coarse bounds -------------------------------------------------


def _references(trip, plan, places, members):
    out: list[Check] = []
    bad: set[str] = set()
    for b in plan.blocks:
        problems = []
        if b.place_id not in places:
            problems.append(f"unknown place {b.place_id}")
        for a in b.attendees:
            if a not in members or members[a].role == "viewer":
                problems.append(f"invalid attendee {a}")
        if problems:
            bad.add(b.id)
            out.append(Check(code="REFERENCES", status="fail", block_ids=(b.id,),
                             message=f"Block {b.id}: " + "; ".join(problems)))
    for leg in plan.legs:
        for a in leg.attendees:
            if a not in members or members[a].role == "viewer":
                out.append(Check(code="REFERENCES", status="fail",
                                 message=f"Leg {leg.id}: invalid attendee {a}"))
    if not out:
        out.append(Check(code="REFERENCES", status="pass", message="All references resolve."))
    return out, bad


def _within_window(trip: Trip, plan: Plan) -> list[Check]:
    out = []
    for b in plan.blocks:
        if b.start < trip.window_start or b.end > trip.window_end:
            out.append(Check(code="WITHIN_TRIP_WINDOW", status="fail", block_ids=(b.id,),
                             message=f"{b.name} falls outside the trip time window."))
    for leg in plan.legs:
        if leg.depart < trip.window_start or leg.arrive_latest > trip.window_end:
            out.append(Check(code="WITHIN_TRIP_WINDOW", status="fail",
                             message=f"Leg {leg.id} falls outside the trip time window."))
    return out or [Check(code="WITHIN_TRIP_WINDOW", status="pass",
                         message="All blocks and legs are inside the trip window.")]


# --- opening hours and reservations -----------------------------------------------


def _opening_hours(plan: Plan, places, bad_blocks) -> list[Check]:
    out: list[Check] = []
    for b in plan.blocks:
        if b.id in bad_blocks:
            continue
        p = places[b.place_id]
        ev = p.evidence_ids
        if p.opening_windows is None:
            out.append(Check(code="OPEN_HOURS", status="unknown", block_ids=(b.id,), evidence_ids=ev,
                             message=f"No confirmed opening hours for {p.name}; not assumed open."))
            continue
        if not any(w.contains(b.start, b.end) for w in p.opening_windows):
            out.append(Check(code="OPEN_HOURS", status="fail", block_ids=(b.id,), evidence_ids=ev,
                             message=f"{p.name} is not open for the whole planned visit.",
                             data={"windows": [[w.start.isoformat(), w.end.isoformat()]
                                               for w in p.opening_windows]}))
            continue
        if p.last_admission is not None and b.start > p.last_admission:
            out.append(Check(code="OPEN_HOURS", status="fail", block_ids=(b.id,), evidence_ids=ev,
                             message=f"{p.name} stops admitting before the visit starts."))
            continue
        out.append(Check(code="OPEN_HOURS", status="pass", block_ids=(b.id,), evidence_ids=ev,
                         message=f"{p.name} is open for the whole visit."))
    return out


def _locked_preserved(plan: Plan, base: Plan) -> list[Check]:
    new = {b.id: b for b in plan.blocks}
    out = []
    for lb in (b for b in base.blocks if b.locked):
        nb = new.get(lb.id)
        same = (nb is not None and nb.place_id == lb.place_id and nb.start == lb.start
                and nb.end == lb.end and set(nb.attendees) >= set(lb.attendees))
        if not same:
            out.append(Check(code="LOCKED_PRESERVED", status="fail", block_ids=(lb.id,),
                             message=f"Locked commitment {lb.name} was moved or removed."))
    return out or [Check(code="LOCKED_PRESERVED", status="pass",
                         message="All locked commitments are unchanged.")]


# --- per-person timeline ----------------------------------------------------------


def _member_timeline(trip: Trip, plan: Plan, m: Member) -> list[Check]:
    items: list[tuple] = [(b.start, b.end, "block", b) for b in plan.blocks if m.id in b.attendees]
    items += [(l.depart, l.arrive_latest, "leg", l) for l in plan.legs if m.id in l.attendees]
    if not items:
        return []
    items.sort(key=lambda t: (t[0], t[1]))

    loc = m.start_location_id or trip.origin.id
    free_at = trip.window_start
    if m.availability:
        free_at = max(free_at, min(w.start for w in m.availability))
    last = "start"
    fails: list[Check] = []

    for start, end, kind, obj in items:
        if kind == "block":
            b: ActivityBlock = obj
            if b.place_id != loc:
                fails.append(Check(code="CONTINUITY", status="fail", participant_ids=(m.id,),
                                   block_ids=(b.id,),
                                   message=f"{m.display_name} is at {loc} but {b.name} is at "
                                           f"{b.place_id} with no travel leg between."))
            if b.start < free_at:
                excess = _mins((free_at - b.start).total_seconds())
                if last == "leg":
                    fails.append(Check(code="TRAVEL_TIME", status="fail", participant_ids=(m.id,),
                                       block_ids=(b.id,), data={"excess_minutes": excess},
                                       message=f"{m.display_name} cannot reach {b.name} in time: "
                                               f"travel needs {excess} more minutes (latest estimate)."))
                else:
                    fails.append(Check(code="DOUBLE_BOOKING", status="fail", participant_ids=(m.id,),
                                       block_ids=(b.id,), data={"overlap_minutes": excess},
                                       message=f"{m.display_name} has overlapping activities at {b.name}."))
            free_at = max(free_at, b.end)
            loc = b.place_id
            last = "block"
        else:
            leg: TravelLeg = obj
            if leg.from_id != loc:
                fails.append(Check(code="CONTINUITY", status="fail", participant_ids=(m.id,),
                                   message=f"Leg {leg.id} leaves from {leg.from_id} but "
                                           f"{m.display_name} is at {loc}."))
            if leg.depart < free_at:
                excess = _mins((free_at - leg.depart).total_seconds())
                fails.append(Check(code="TRAVEL_TIME", status="fail", participant_ids=(m.id,),
                                   data={"excess_minutes": excess},
                                   message=f"Leg {leg.id} departs {excess} minutes before "
                                           f"{m.display_name} is free."))
            free_at = max(free_at, leg.arrive_latest)
            loc = leg.to_id
            last = "leg"

    target = m.end_location_id or trip.endpoint.id
    deadline = trip.window_end
    if m.availability:
        deadline = min(deadline, max(w.end for w in m.availability))
    if loc != target:
        fails.append(Check(code="RETURN_BY", status="fail", participant_ids=(m.id,),
                           message=f"{m.display_name} has no journey to the endpoint ({target}); "
                                   f"plan ends at {loc}."))
        return_ok = False
    elif free_at > deadline:
        excess = _mins((free_at - deadline).total_seconds())
        fails.append(Check(code="RETURN_BY", status="fail", participant_ids=(m.id,),
                           data={"excess_minutes": excess},
                           message=f"{m.display_name} arrives at the endpoint {excess} minutes after "
                                   f"the deadline (latest travel estimate)."))
        return_ok = False
    else:
        return_ok = True

    out = list(fails)
    present = {c.code for c in fails}
    for code, msg in (("CONTINUITY", "Every move has a connecting leg."),
                      ("TRAVEL_TIME", "Travel fits between activities."),
                      ("DOUBLE_BOOKING", "No overlapping activities.")):
        if code not in present:
            out.append(Check(code=code, status="pass", participant_ids=(m.id,), message=msg))
    if return_ok:
        margin = _mins((deadline - free_at).total_seconds())
        out.append(Check(code="RETURN_BY", status="pass", participant_ids=(m.id,),
                         data={"margin_minutes": margin},
                         message=f"{m.display_name} reaches the endpoint with {margin} min spare."))
    return out


def _availability(plan: Plan, m: Member) -> list[Check]:
    blocks = [b for b in plan.blocks if m.id in b.attendees]
    legs = [l for l in plan.legs if m.id in l.attendees]
    if not blocks and not legs:
        return []
    if m.availability is None:
        return [Check(code="AVAILABILITY", status="unknown", participant_ids=(m.id,),
                      message=f"{m.display_name}'s availability is not known.")]
    out = []
    for b in blocks:
        if not any(w.contains(b.start, b.end) for w in m.availability):
            out.append(Check(code="AVAILABILITY", status="fail", participant_ids=(m.id,),
                             block_ids=(b.id,),
                             message=f"{b.name} is outside {m.display_name}'s availability."))
    for l in legs:
        if not any(w.contains(l.depart, l.arrive_latest) for w in m.availability):
            out.append(Check(code="AVAILABILITY", status="fail", participant_ids=(m.id,),
                             message=f"Leg {l.id} is outside {m.display_name}'s availability."))
    return out or [Check(code="AVAILABILITY", status="pass", participant_ids=(m.id,),
                         message=f"All of {m.display_name}'s items are within their availability.")]


# --- budget -----------------------------------------------------------------------


def _budget(trip: Trip, plan: Plan, m: Member) -> tuple[Check, CostTotal]:
    low = high = 0
    unknown_blocks: list[str] = []
    currency_blocks: list[str] = []

    def add(cost, group, ref):
        nonlocal low, high
        if cost.currency != m.budget_currency:
            currency_blocks.append(ref)  # no conversion without a timestamped rate
            return
        lo, hi = allocate(cost, group)[m.id]
        if lo is None:
            unknown_blocks.append(ref)
        else:
            low += lo
            high += hi

    for b in plan.blocks:
        if m.id not in b.attendees:
            continue
        if not b.costs:  # missing price info is unknown, never zero
            unknown_blocks.append(b.id)
        for c in b.costs:
            add(c, b.attendees, b.id)
    group = [x.id for x in trip.travellers()]
    for i, c in enumerate(plan.trip_costs):
        add(c, group, f"trip_cost_{i}")

    has_unknown = bool(unknown_blocks or currency_blocks)
    total = CostTotal(currency=m.budget_currency, low_minor=low, high_minor=high,
                      has_unknown=has_unknown, cap_minor=m.budget_cap_minor)
    base = {"low_minor": low, "high_minor": high, "cap_minor": m.budget_cap_minor,
            "unknown_items": unknown_blocks, "currency_mismatch_items": currency_blocks}

    if m.budget_uncapped:
        status, msg = "pass", f"{m.display_name} stated no budget cap."
    elif m.budget_cap_minor is None:
        status, msg = "unknown", f"{m.display_name}'s budget cap is not known."
    elif low > m.budget_cap_minor:
        status, msg = "fail", (f"{m.display_name}'s minimum cost {low} exceeds their cap "
                               f"{m.budget_cap_minor} (minor units).")
    elif has_unknown:
        status, msg = "unknown", (f"{m.display_name}'s affordability is unknown: some prices are "
                                  f"missing or in another currency.")
    elif high <= m.budget_cap_minor:
        status, msg = "pass", f"{m.display_name}'s worst-case cost {high} fits their cap."
    else:
        status, msg = "unknown", (f"{m.display_name}'s cost range {low}-{high} crosses their cap "
                                  f"{m.budget_cap_minor}.")
    return Check(code="BUDGET_PER_PERSON", status=status, participant_ids=(m.id,),
                 message=msg, data=base), total


# --- accessibility, transport, weather --------------------------------------------


def _accessibility(plan: Plan, places, m: Member, bad_blocks) -> list[Check]:
    if not m.requires_step_free:
        return []
    out = []
    for b in plan.blocks:
        if m.id not in b.attendees or b.id in bad_blocks:
            continue
        p = places[b.place_id]
        if p.step_free is True:
            out.append(Check(code="ACCESSIBILITY", status="pass", participant_ids=(m.id,),
                             block_ids=(b.id,), evidence_ids=p.evidence_ids,
                             message=f"{p.name} is documented step-free."))
        elif p.step_free is False:
            out.append(Check(code="ACCESSIBILITY", status="fail", participant_ids=(m.id,),
                             block_ids=(b.id,), evidence_ids=p.evidence_ids,
                             message=f"{p.name} is documented as not step-free."))
        else:
            out.append(Check(code="ACCESSIBILITY", status="unknown", participant_ids=(m.id,),
                             block_ids=(b.id,), evidence_ids=p.evidence_ids,
                             message=f"No accessibility evidence for {p.name}; not assumed accessible."))
    return out


def _transport(plan: Plan, members: Mapping[str, Member]) -> list[Check]:
    out = []
    for leg in plan.legs:
        valid = [members[a] for a in leg.attendees if a in members]
        for m in valid:
            if m.transport_modes is None:
                out.append(Check(code="TRANSPORT_MODE", status="unknown", participant_ids=(m.id,),
                                 message=f"{m.display_name}'s available transport is not known."))
            elif leg.mode not in m.transport_modes:
                out.append(Check(code="TRANSPORT_MODE", status="fail", participant_ids=(m.id,),
                                 message=f"{m.display_name} cannot use {leg.mode} on leg {leg.id}."))
        if leg.mode == "car":
            drivers = [m for m in valid if m.has_car]
            if drivers:
                cap = min(d.car_capacity for d in drivers if d.car_capacity)
                if len(leg.attendees) > cap:
                    out.append(Check(code="CAR_CAPACITY", status="fail",
                                     participant_ids=tuple(leg.attendees),
                                     data={"capacity": cap, "riders": len(leg.attendees)},
                                     message=f"{len(leg.attendees)} people on leg {leg.id} but the "
                                             f"car seats {cap}."))
                else:
                    out.append(Check(code="CAR_CAPACITY", status="pass",
                                     participant_ids=tuple(leg.attendees),
                                     message=f"Car on leg {leg.id} has room for everyone."))
            elif all(m.has_car is False for m in valid):
                out.append(Check(code="CAR_CAPACITY", status="fail",
                                 participant_ids=tuple(leg.attendees),
                                 message=f"No one on leg {leg.id} has a car."))
            else:
                out.append(Check(code="CAR_CAPACITY", status="unknown",
                                 participant_ids=tuple(leg.attendees),
                                 message=f"Car availability on leg {leg.id} is not confirmed."))
    return out


def _weather(plan, places, members, forecast, bad_blocks) -> list[Check]:
    out = []
    for b in plan.blocks:
        if b.id in bad_blocks:
            continue
        p = places[b.place_id]
        if not p.outdoor:
            continue
        for aid in b.attendees:
            m = members[aid]
            if m.avoid_rain_above is None:
                continue
            periods = [f for f in forecast if f.start < b.end and f.end > b.start]
            if not periods:
                out.append(Check(code="WEATHER", status="unknown", participant_ids=(aid,),
                                 block_ids=(b.id,),
                                 message=f"No forecast covers {b.name}; weather is unknown "
                                         f"(beyond the forecast horizon or not retrieved)."))
                continue
            worst = max(periods, key=lambda f: f.precip_probability)
            ev = tuple(f.evidence_id for f in periods if f.evidence_id)
            pct = round(worst.precip_probability * 100)
            if worst.precip_probability > m.avoid_rain_above:
                out.append(Check(code="WEATHER", status="fail", participant_ids=(aid,),
                                 block_ids=(b.id,), evidence_ids=ev,
                                 data={"precip_probability": worst.precip_probability},
                                 message=f"Forecast shows about a {pct}% chance of rain during "
                                         f"{b.name}, above {m.display_name}'s limit."))
            else:
                out.append(Check(code="WEATHER", status="pass", participant_ids=(aid,),
                                 block_ids=(b.id,), evidence_ids=ev,
                                 data={"precip_probability": worst.precip_probability},
                                 message=f"Forecast shows about a {pct}% chance of rain during "
                                         f"{b.name}, within {m.display_name}'s limit."))
    return out
