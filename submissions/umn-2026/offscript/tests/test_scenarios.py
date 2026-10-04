"""Acceptance scenarios from the brief (section K) that need no model or provider.

Each states an expected outcome up front. All data is synthetic (see helpers.py)."""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from server.models import ActivityBlock, Cost, Plan, TimeWindow, TravelLeg
from server.models.weather import ForecastPeriod
from server.planning.assemble import assemble_plan
from server.planning.money import allocate, split_minor
from server.planning.validators import validate_plan

from .helpers import CHI, at, free, matrix, member, money, place, trip


def codes(report, code):
    return [c.status for c in report.by_code(code)]


# --- 1. 90-minute outing includes outbound and return ------------------------------

def test_outing_includes_outbound_and_return_and_is_fully_checked():
    t = trip()
    park = place("park", price=free(), typical=30)
    res = assemble_plan(t, [park], matrix({("home", "park"): 15}))
    assert res.plan is not None
    assert [l.id for l in res.plan.legs] == ["leg-home-park", "leg-park-home"]
    rep = validate_plan(t, res.plan, {"park": park})
    assert rep.overall == "checked", [c.message for c in rep.checks if c.status != "pass"]
    assert codes(rep, "RETURN_BY") == ["pass"]


def test_window_too_short_gives_concrete_conflict_not_a_silent_violation():
    t = trip()  # 90 minute window
    park = place("park", price=free(), typical=80, min_=80)  # 80 visit + 2x15 travel = 110
    res = assemble_plan(t, [park], matrix({("home", "park"): 15}))
    assert res.plan is None
    c = res.conflict
    assert c["code"] == "WINDOW_TOO_SHORT"
    assert (c["required_minutes"], c["available_minutes"]) == (110, 90)
    assert {"type": "extend_window", "minutes": 20} in c["relaxations"]
    assert {"type": "drop_stop", "place_id": "park"} in c["relaxations"]


def test_missing_return_leg_fails_return_by():
    t = trip()
    park = place("park", price=free())
    out = TravelLeg(id="l1", from_id="home", to_id="park", mode="walk", depart=at(10),
                    duration_min_s=900, duration_max_s=900, attendees=("m1",))
    blk = ActivityBlock(id="b1", place_id="park", name="Park", start=at(10, 15), end=at(10, 45),
                        timezone="America/Chicago", attendees=("m1",), costs=(free(),))
    plan = Plan(id="p", trip_id="t1", blocks=(blk,), legs=(out,))
    rep = validate_plan(t, plan, {"park": park})
    assert codes(rep, "RETURN_BY") == ["fail"]
    assert rep.overall == "failed"


def test_travel_that_does_not_fit_between_stops_fails_with_excess():
    t = trip()
    park = place("park", price=free())
    out = TravelLeg(id="l1", from_id="home", to_id="park", mode="walk", depart=at(10),
                    duration_min_s=1800, duration_max_s=1800, attendees=("m1",))
    blk = ActivityBlock(id="b1", place_id="park", name="Park", start=at(10, 20), end=at(10, 50),
                        timezone="America/Chicago", attendees=("m1",), costs=(free(),))
    plan = Plan(id="p", trip_id="t1", blocks=(blk,), legs=(out,))
    rep = validate_plan(t, plan, {"park": park})
    fail = [c for c in rep.by_code("TRAVEL_TIME") if c.status == "fail"][0]
    assert fail.data["excess_minutes"] == 10


# --- 2. missing price is unknown, never zero ---------------------------------------

def test_missing_price_is_unknown_budget_not_zero():
    t = trip()
    cafe = place("cafe", price=None)  # price unknown
    res = assemble_plan(t, [cafe], matrix({("home", "cafe"): 10}))
    rep = validate_plan(t, res.plan, {"cafe": cafe})
    assert codes(rep, "BUDGET_PER_PERSON") == ["unknown"]
    assert rep.overall == "provisional"
    assert rep.per_person_totals["m1"].has_unknown is True


def test_block_with_no_cost_info_at_all_is_unknown():
    t = trip()
    park = place("park")
    res = assemble_plan(t, [park], matrix({("home", "park"): 10}))
    plan = res.plan.model_copy(update={"blocks": tuple(
        b.model_copy(update={"costs": ()}) for b in res.plan.blocks)})
    rep = validate_plan(t, plan, {"park": park})
    assert codes(rep, "BUDGET_PER_PERSON") == ["unknown"]


def test_cost_range_crossing_cap_is_unknown_and_known_excess_fails():
    t = trip([member("m1", cap=1000)])
    p1 = place("a", price=money(800, 1200))
    res = assemble_plan(t, [p1], matrix({("home", "a"): 5}))
    assert codes(validate_plan(t, res.plan, {"a": p1}), "BUDGET_PER_PERSON") == ["unknown"]
    p2 = place("a", price=money(1100, 1200))
    res = assemble_plan(t, [p2], matrix({("home", "a"): 5}))
    assert codes(validate_plan(t, res.plan, {"a": p2}), "BUDGET_PER_PERSON") == ["fail"]


def test_unknown_cap_is_unknown_and_explicit_no_cap_passes():
    p = place("a", price=money(500))
    m = matrix({("home", "a"): 5})
    t = trip([member("m1", cap=None)])
    assert codes(validate_plan(t, assemble_plan(t, [p], m).plan, {"a": p}), "BUDGET_PER_PERSON") == ["unknown"]
    t = trip([member("m1", cap=None, budget_uncapped=True)])
    assert codes(validate_plan(t, assemble_plan(t, [p], m).plan, {"a": p}), "BUDGET_PER_PERSON") == ["pass"]


# --- 3. opening hours / last admission / shortened optional visits ------------------

def _late_trip():
    return trip(start=at(14), end=at(16, 30))


def test_stop_open_until_15_cannot_host_14_45_to_15_30():
    t = _late_trip()
    cafe = place("cafe", hours=(9, 15), price=free(), typical=45, min_=45)
    res = assemble_plan(t, [cafe], matrix({("home", "cafe"): 45}))  # arrive 14:45
    assert res.plan is None and res.conflict["code"] == "NO_FEASIBLE_ORDER"
    # hand-built 14:45-15:30 visit also fails the validator
    out = TravelLeg(id="l1", from_id="home", to_id="cafe", mode="walk", depart=at(14),
                    duration_min_s=2700, duration_max_s=2700, attendees=("m1",))
    back = TravelLeg(id="l2", from_id="cafe", to_id="home", mode="walk", depart=at(15, 30),
                     duration_min_s=2700, duration_max_s=2700, attendees=("m1",))
    blk = ActivityBlock(id="b1", place_id="cafe", name="Cafe", start=at(14, 45), end=at(15, 30),
                        timezone="America/Chicago", attendees=("m1",), costs=(free(),))
    rep = validate_plan(t, Plan(id="p", trip_id="t1", blocks=(blk,), legs=(out, back)), {"cafe": cafe})
    assert codes(rep, "OPEN_HOURS") == ["fail"]


def test_optional_visit_is_shortened_only_if_still_meaningful():
    t = _late_trip()
    shrinkable = place("cafe", hours=(9, 15), price=free(), typical=45, min_=15, shrink=True)
    res = assemble_plan(t, [shrinkable], matrix({("home", "cafe"): 45}))
    blk = res.plan.blocks[0]
    assert blk.shortened and blk.end == at(15).astimezone(blk.end.tzinfo)
    assert validate_plan(t, res.plan, {"cafe": shrinkable}).by_code("OPEN_HOURS")[0].status == "pass"
    too_short = place("cafe", hours=(9, 15), price=free(), typical=45, min_=30, shrink=True)
    assert assemble_plan(t, [too_short], matrix({("home", "cafe"): 45})).plan is None  # only 15 min left


def test_unknown_hours_are_unknown_not_open_and_closed_day_fails():
    t = trip()
    m = matrix({("home", "a"): 5})
    unknown = place("a", price=free(), windows=None)
    rep = validate_plan(t, assemble_plan(t, [unknown], m).plan, {"a": unknown})
    assert codes(rep, "OPEN_HOURS") == ["unknown"] and rep.overall == "provisional"
    closed = place("a", price=free(), windows=())  # known closed
    assert assemble_plan(t, [closed], m).plan is None


# --- 4. locked reservations --------------------------------------------------------

def _locked_block():
    return ActivityBlock(id="b-dinner", place_id="dinner", name="Dinner", start=at(12), end=at(13),
                         timezone="America/Chicago", attendees=("m1",), locked=True,
                         commitment="reservation", costs=(free(),))


def test_locked_reservation_stays_fixed_when_a_cafe_is_added():
    t = trip(start=at(10), end=at(15))
    dinner, cafe = place("dinner", price=free()), place("cafe", price=free(), typical=30)
    m = matrix({("home", "dinner"): 10, ("home", "cafe"): 10, ("cafe", "dinner"): 5})
    anchor = _locked_block()
    base = Plan(id="base", trip_id="t1", blocks=(anchor,))
    res = assemble_plan(t, [cafe], m, anchors=[anchor])
    assert res.plan is not None
    kept = next(b for b in res.plan.blocks if b.id == "b-dinner")
    assert (kept.start, kept.end) == (anchor.start, anchor.end)
    rep = validate_plan(t, res.plan, {"dinner": dinner, "cafe": cafe}, base_plan=base)
    assert codes(rep, "LOCKED_PRESERVED") == ["pass"]


def test_moving_a_locked_block_fails_validation():
    t = trip(start=at(10), end=at(15))
    dinner = place("dinner", price=free())
    moved = _locked_block().model_copy(update={"start": at(12, 30), "end": at(13, 30)})
    rep = validate_plan(t, Plan(id="p", trip_id="t1", blocks=(moved,)), {"dinner": dinner},
                        base_plan=Plan(id="b", trip_id="t1", blocks=(_locked_block(),)))
    assert codes(rep, "LOCKED_PRESERVED") == ["fail"]


# --- 5. per-person caps, never averaged --------------------------------------------

def test_different_caps_are_checked_individually_not_averaged():
    ms = [member("m1", cap=500, availability=None, transport_modes=("walk",)),
          member("m2", cap=3000, availability=None, transport_modes=("walk",))]
    ms = [m.model_copy(update={"availability": (TimeWindow(start=at(10), end=at(15)),)}) for m in ms]
    t = trip(ms, start=at(10), end=at(15))
    ticket = place("show", price=money(1000), typical=60)  # $10 each; average cap would be 1750
    res = assemble_plan(t, [ticket], matrix({("home", "show"): 10}))
    rep = validate_plan(t, res.plan, {"show": ticket})
    by_member = {c.participant_ids[0]: c.status for c in rep.by_code("BUDGET_PER_PERSON")}
    assert by_member == {"m1": "fail", "m2": "pass"}
    assert rep.overall == "failed"


def test_shared_cost_split_sums_exactly_and_follows_attendance():
    assert split_minor(1001, ["c", "a", "b"]) == {"a": 334, "b": 334, "c": 333}
    shared = Cost(currency="USD", min_minor=1001, max_minor=1001, basis="fixed_shared")
    alloc = allocate(shared, ["a", "b", "c"])
    assert sum(v[0] for v in alloc.values()) == 1001
    assert set(allocate(shared, ["a", "b"])) == {"a", "b"}  # only attendees pay


# --- 6. late arrival ---------------------------------------------------------------

def test_late_arrival_gets_nothing_before_arrival_and_early_block_fails_validation():
    early = (TimeWindow(start=at(10), end=at(15)),)
    late = (TimeWindow(start=at(13), end=at(15)),)
    t = trip([member("m1", availability=early), member("m2", availability=late)],
             start=at(10), end=at(15))
    park = place("park", price=free(), typical=30)
    res = assemble_plan(t, [park], matrix({("home", "park"): 10}))
    assert min(b.start for b in res.plan.blocks) >= at(13)
    # a hand-built early block that includes m2 is rejected
    out = TravelLeg(id="l1", from_id="home", to_id="park", mode="walk", depart=at(11),
                    duration_min_s=600, duration_max_s=600, attendees=("m1", "m2"))
    blk = ActivityBlock(id="b1", place_id="park", name="Park", start=at(11, 10), end=at(11, 40),
                        timezone="America/Chicago", attendees=("m1", "m2"), costs=(free(),))
    back = TravelLeg(id="l2", from_id="park", to_id="home", mode="walk", depart=at(11, 40),
                     duration_min_s=600, duration_max_s=600, attendees=("m1", "m2"))
    rep = validate_plan(t, Plan(id="p", trip_id="t1", blocks=(blk,), legs=(out, back)), {"park": park})
    fails = [c for c in rep.by_code("AVAILABILITY") if c.status == "fail"]
    assert fails and all(c.participant_ids == ("m2",) for c in fails)


# --- timezones / DST ---------------------------------------------------------------

def test_dst_spring_forward_uses_real_elapsed_time():
    # 01:00 CST -> 04:00 CDT on 2026-03-08 is 2 real hours, not 3.
    day = (2026, 3, 8)
    start, end = at(1, 0, day), at(4, 0, day)
    assert (end - start) == timedelta(hours=3)  # naive wall-clock subtraction (the trap)
    t = trip(start=start, end=end)
    assert (t.window_end - t.window_start) == timedelta(hours=2)  # normalised to UTC
    ok = place("a", windows=None, price=free(), typical=90, min_=90)
    m = matrix({("home", "a"): 15})  # 15 + 90 + 15 = 120 min: fits exactly
    assert assemble_plan(t, [ok], m).plan is not None
    too_long = place("a", windows=None, price=free(), typical=100, min_=100)
    res = assemble_plan(t, [too_long], m)  # 130 min > 120 real minutes
    assert res.plan is None and res.conflict["available_minutes"] == 120


def test_naive_datetimes_are_rejected():
    with pytest.raises(ValidationError):
        TimeWindow(start=datetime(2026, 6, 6, 10), end=datetime(2026, 6, 6, 11))


# --- transport / car / accessibility / weather -------------------------------------

def test_car_capacity_and_missing_car():
    base = [member("m1", transport_modes=("car",), has_car=True, car_capacity=2),
            member("m2", transport_modes=("car",)), member("m3", transport_modes=("car",))]
    t = trip(base)
    p = place("far", price=free())
    res = assemble_plan(t, [p], matrix({("home", "far"): 20}, mode="car"))
    rep = validate_plan(t, res.plan, {"far": p})
    assert set(codes(rep, "CAR_CAPACITY")) == {"fail"}  # 3 riders, seats 2
    nocar = trip([member("m1", transport_modes=("car",), has_car=False)])
    rep = validate_plan(nocar, assemble_plan(nocar, [p], matrix({("home", "far"): 20}, mode="car")).plan, {"far": p})
    assert set(codes(rep, "CAR_CAPACITY")) == {"fail"}


def test_transport_mode_unknown_vs_not_allowed():
    p = place("a", price=free())
    t = trip([member("m1", transport_modes=None)])
    rep = validate_plan(t, assemble_plan(t, [p], matrix({("home", "a"): 5})).plan, {"a": p})
    assert "unknown" in codes(rep, "TRANSPORT_MODE")
    t = trip([member("m1", transport_modes=("bike",))])
    rep = validate_plan(t, assemble_plan(t, [p], matrix({("home", "a"): 5})).plan, {"a": p})
    assert "fail" in codes(rep, "TRANSPORT_MODE")


def test_absence_of_accessibility_evidence_is_not_confirmation():
    t = trip([member("m1", requires_step_free=True)])
    m = matrix({("home", "a"): 5})
    for sf, expect in ((True, "pass"), (False, "fail"), (None, "unknown")):
        p = place("a", price=free(), step_free=sf)
        rep = validate_plan(t, assemble_plan(t, [p], m).plan, {"a": p})
        assert codes(rep, "ACCESSIBILITY") == [expect]


def test_weather_is_probabilistic_and_unknown_beyond_horizon():
    t = trip([member("m1", avoid_rain_above=0.3)])
    p = place("trail", price=free(), outdoor=True)
    plan = assemble_plan(t, [p], matrix({("home", "trail"): 5})).plan
    assert codes(validate_plan(t, plan, {"trail": p}), "WEATHER") == ["unknown"]  # no forecast
    wet = [ForecastPeriod(start=at(10), end=at(12), precip_probability=0.7, evidence_id="wx1")]
    dry = [ForecastPeriod(start=at(10), end=at(12), precip_probability=0.1, evidence_id="wx1")]
    assert codes(validate_plan(t, plan, {"trail": p}, forecast=wet), "WEATHER") == ["fail"]
    ok = validate_plan(t, plan, {"trail": p}, forecast=dry)
    assert codes(ok, "WEATHER") == ["pass"] and "70" not in ok.by_code("WEATHER")[0].message


# --- aggregate honesty / bounds ----------------------------------------------------

def test_overall_never_hides_a_failure_behind_passes():
    t = trip([member("m1", cap=100)])
    p = place("a", price=money(5000))
    rep = validate_plan(t, assemble_plan(t, [p], matrix({("home", "a"): 5})).plan, {"a": p})
    assert rep.overall == "failed"
    assert sum(1 for c in rep.checks if c.status == "pass") > 3


def test_search_limit_is_reported_not_silently_degraded():
    t = trip(start=at(8), end=at(23))
    ps = [place(f"p{i}", price=free(), typical=10, min_=10) for i in range(9)]
    pairs = {("home", p.id): 1 for p in ps}
    res = assemble_plan(t, ps, matrix(pairs))
    assert res.plan is None and res.conflict["code"] == "SEARCH_LIMIT"


# --- conservative travel bounds ----------------------------------------------------

def test_travel_uses_the_latest_estimate_not_the_optimistic_one():
    from server.planning.assemble import LegEstimate

    t = trip()  # 90-minute window
    park = place("park", price=free(), typical=50, min_=50)
    # 10-25 min each way: optimistic total 70 fits 90, conservative total 100 does not.
    rng = {("home", "park"): LegEstimate("walk", 600, 1500), ("park", "home"): LegEstimate("walk", 600, 1500)}
    res = assemble_plan(t, [park], rng)
    assert res.plan is None and res.conflict["code"] == "WINDOW_TOO_SHORT"
    assert res.conflict["required_minutes"] == 100
    # and the validator judges a hand-built optimistic schedule by the latest estimate
    out = TravelLeg(id="l1", from_id="home", to_id="park", mode="walk", depart=at(10),
                    duration_min_s=600, duration_max_s=1500, attendees=("m1",))
    blk = ActivityBlock(id="b1", place_id="park", name="Park", start=at(10, 10), end=at(11),
                        timezone="America/Chicago", attendees=("m1",), costs=(free(),))
    rep = validate_plan(t, Plan(id="p", trip_id="t1", blocks=(blk,), legs=(out,)), {"park": park})
    assert codes(rep, "TRAVEL_TIME") == ["fail"]
