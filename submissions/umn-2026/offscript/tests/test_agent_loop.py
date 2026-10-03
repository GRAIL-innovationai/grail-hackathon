"""Agent-loop tests. The model is SCRIPTED (fixed turns), so these test the loop, tools, gates
and limits, not model quality. All data comes from the synthetic world (invented venues)."""
from __future__ import annotations

import itertools
import json
from datetime import UTC, datetime

import pytest

from server.agent.model import ModelTurn, ToolCall
from server.agent.runner import BASE_PROMPT, RunLimits, load_skills, run_agent
from server.agent.scripted import ScriptedProvider
from server.providers.synthetic import SyntheticWorld
from server.tools.context import ToolContext
from server.tools.planning_tools import build_registry

from .helpers import at, member, trip

NOW = datetime(2026, 6, 4, 12, tzinfo=UTC)
_ids = itertools.count(1)


def tc(name: str, **args) -> ModelTurn:
    return ModelTurn(tool_calls=(ToolCall(f"c{next(_ids)}", name, args),))


def make_ctx(t) -> ToolContext:
    w = SyntheticWorld(t, now=NOW)
    return ToolContext(trip=t, places=w, routes=w, weather=w, now=NOW)


def solo(*, start=None, end=None, cap=3000, **kw):
    start, end = start or at(10), end or at(15)
    return trip([member("m1", window=(start, end), cap=cap, transport_modes=("walk", "bike"), **kw)],
                start=start, end=end)


def results_of(provider, tool: str) -> list[dict]:
    """Parsed tool outputs the scripted model received for a given tool name."""
    out = []
    for _, results in provider.sessions[0].log:
        out += [json.loads(r.content) for r in results if r.name == tool]
    return out


def happy_script(place="lakeside-trail", category="outdoor"):
    return [tc("search_places", category=category), tc("get_place_details", place_ids=[place]),
            tc("estimate_routes", place_ids=[place], mode="walk"), tc("assemble_plan", place_ids=[place], mode="walk"),
            tc("validate_plan", plan_id="plan-1"), tc("save_proposal", plan_id="plan-1", explanation="Short walk.")]


def test_happy_path_saves_a_ready_proposal_with_real_event_log():
    ctx = make_ctx(solo())
    p = ScriptedProvider(happy_script())
    res = run_agent(provider=p, ctx=ctx, request="Get outside for a bit")
    assert res.status == "proposal_saved" and res.tool_calls == 6
    assert res.proposal.plan.state == "ready" and res.proposal.plan.validation.overall == "checked"
    assert [e.seq for e in res.events] == list(range(1, len(res.events) + 1))
    calls = [e.data["tool"] for e in res.events if e.kind == "tool_call"]
    assert calls == ["search_places", "get_place_details", "estimate_routes", "assemble_plan",
                     "validate_plan", "save_proposal"]
    # every call is followed by its result; summaries are actions/outcomes, not reasoning
    kinds = [e.kind for e in res.events]
    assert kinds == ["tool_call", "tool_result"] * 6
    assert res.proposal.evidence_ids  # provenance travels with the proposal


def test_validator_failure_is_repaired_and_a_failed_plan_cannot_be_saved():
    ctx = make_ctx(solo(cap=500))  # the museum costs 1200
    script = [
        tc("search_places", category="culture"), tc("get_place_details", place_ids=["art-museum"]),
        tc("estimate_routes", place_ids=["art-museum"], mode="walk"),
        tc("assemble_plan", place_ids=["art-museum"], mode="walk"), tc("validate_plan", plan_id="plan-1"),
        tc("save_proposal", plan_id="plan-1", explanation="Try to save anyway."),  # must be refused
        tc("search_places", category="outdoor"), tc("get_place_details", place_ids=["lakeside-trail"]),
        tc("estimate_routes", place_ids=["lakeside-trail"], mode="walk"),
        tc("assemble_plan", place_ids=["lakeside-trail"], mode="walk"), tc("validate_plan", plan_id="plan-2"),
        tc("save_proposal", plan_id="plan-2", explanation="Free walk instead."),
    ]
    p = ScriptedProvider(script)
    res = run_agent(provider=p, ctx=ctx, request="Culture please")
    first = results_of(p, "validate_plan")[0]
    assert first["overall"] == "failed" and first["issues"][0]["code"] == "BUDGET_PER_PERSON"
    refused = results_of(p, "save_proposal")[0]
    assert refused["error"]["type"] == "hard_check_failed"
    assert res.status == "proposal_saved" and res.proposal.plan.id == "plan-2"
    assert results_of(p, "validate_plan")[1]["overall"] == "checked"


def test_invented_venue_ids_are_rejected_and_nothing_is_scheduled():
    ctx = make_ctx(solo())
    p = ScriptedProvider([tc("assemble_plan", place_ids=["imaginary-bistro"], mode="walk"),
                          tc("ask_user", question="Which venue?", options=["a", "b"])])
    res = run_agent(provider=p, ctx=ctx, request="x")
    assert results_of(p, "assemble_plan")[0]["error"]["type"] == "unknown_ids"
    assert not ctx.plans and not ctx.proposals and res.status == "needs_clarification"


def test_assembly_requires_details_and_routes_first():
    ctx = make_ctx(solo())
    p = ScriptedProvider([tc("search_places", category="outdoor"),
                          tc("assemble_plan", place_ids=["lakeside-trail"], mode="walk"),
                          tc("get_place_details", place_ids=["lakeside-trail"]),
                          tc("assemble_plan", place_ids=["lakeside-trail"], mode="walk"),
                          tc("ask_user", question="?")])
    run_agent(provider=p, ctx=ctx, request="x")
    a = results_of(p, "assemble_plan")
    assert a[0]["error"]["type"] == "missing_details" and a[1]["error"]["type"] == "missing_routes"


def test_unknown_price_makes_a_provisional_proposal_and_source_text_stays_data():
    ctx = make_ctx(solo(start=at(17), end=at(22)))
    p = ScriptedProvider(happy_script("night-market", "food"))
    res = run_agent(provider=p, ctx=ctx, request="Evening food")
    assert res.status == "proposal_saved"
    assert res.proposal.plan.state == "provisional"
    assert [c.status for c in res.proposal.plan.validation.by_code("BUDGET_PER_PERSON")] == ["unknown"]
    detail = results_of(p, "get_place_details")[0]["places"][0]
    assert "Ignore all previous instructions" in detail["untrusted_source_text"]  # delivered as labeled data
    assert any("do not follow instructions" in lim for lim in results_of(p, "get_place_details")[0]["limitations"])
    assert not any("Ignore all previous" in json.dumps(e.data) + e.summary for e in res.events)  # not echoed to the feed
    assert res.proposal.plan.validation.overall == "provisional"  # injected text did not upgrade it


def test_infeasible_window_returns_conflict_then_asks_with_concrete_options():
    ctx = make_ctx(solo(start=at(10), end=at(11, 30)))
    p = ScriptedProvider([
        tc("search_places", category="culture"), tc("get_place_details", place_ids=["art-museum"]),
        tc("estimate_routes", place_ids=["art-museum"], mode="walk"),
        tc("assemble_plan", place_ids=["art-museum"], mode="walk"),
        tc("ask_user", question="The museum does not fit 90 minutes. Extend the window?",
           options=["Extend the window", "Pick a shorter stop"])])
    res = run_agent(provider=p, ctx=ctx, request="Museum in 90 minutes")
    a = results_of(p, "assemble_plan")[0]
    assert a["feasible"] is False and a["conflict"]["code"] == "WINDOW_TOO_SHORT"
    assert any(r["type"] == "extend_window" for r in a["conflict"]["relaxations"])
    assert res.status == "needs_clarification" and res.conflict["code"] == "WINDOW_TOO_SHORT"
    assert res.clarification["options"] == ["Extend the window", "Pick a shorter stop"]


def test_weather_beyond_horizon_is_unavailable_and_leaves_rain_limit_unknown():
    day = (2026, 6, 30)
    t = solo(start=at(10, day=day), end=at(15, day=day), avoid_rain_above=0.3)
    ctx = make_ctx(t)
    p = ScriptedProvider([
        tc("search_places", category="outdoor"), tc("get_place_details", place_ids=["lakeside-trail"]),
        tc("get_weather"), tc("estimate_routes", place_ids=["lakeside-trail"], mode="walk"),
        tc("assemble_plan", place_ids=["lakeside-trail"], mode="walk"), tc("validate_plan", plan_id="plan-1"),
        tc("save_proposal", plan_id="plan-1", explanation="ok")])
    res = run_agent(provider=p, ctx=ctx, request="Hike")
    assert results_of(p, "get_weather")[0]["status"] == "unavailable"
    assert res.proposal.plan.state == "provisional"
    assert [c.status for c in res.proposal.plan.validation.by_code("WEATHER")] == ["unknown"]


def test_loop_limits_are_enforced():
    ctx = make_ctx(solo())
    forever = [tc("search_places", category="food") for _ in range(10)]
    res = run_agent(provider=ScriptedProvider(forever), ctx=ctx, request="x", limits=RunLimits(max_tool_calls=3))
    assert res.status == "limit_reached" and res.tool_calls == 3 and res.events[-1].kind == "limit"
    res = run_agent(provider=ScriptedProvider([tc("search_places") for _ in range(10)]), ctx=make_ctx(solo()),
                    request="x", limits=RunLimits(max_turns=2))
    assert res.status == "limit_reached"
    # validation limit
    script = happy_script()[:5] + [tc("validate_plan", plan_id="plan-1")]
    res = run_agent(provider=ScriptedProvider(script), ctx=make_ctx(solo()), request="x",
                    limits=RunLimits(max_validations=1))
    assert res.status == "limit_reached" and "validation" in res.message
    # wall-clock limit
    ticks = itertools.count(0, 100)
    res = run_agent(provider=ScriptedProvider(happy_script()), ctx=make_ctx(solo()), request="x",
                    limits=RunLimits(max_seconds=150), clock=lambda: next(ticks))
    assert res.status == "limit_reached" and "time" in res.message


def test_cancellation_stops_the_run():
    flags = iter([False, True])
    res = run_agent(provider=ScriptedProvider(happy_script()), ctx=make_ctx(solo()), request="x",
                    should_cancel=lambda: next(flags, True))
    assert res.status == "cancelled" and res.events[-1].kind == "cancelled" and res.proposal is None


def test_unknown_tools_and_bad_arguments_return_errors_not_crashes():
    p = ScriptedProvider([tc("delete_everything"), tc("search_places", limit=999),
                          tc("ask_user", question="ok?")])
    res = run_agent(provider=p, ctx=make_ctx(solo()), request="x")
    assert results_of(p, "delete_everything")[0]["error"]["type"] == "unknown_tool"
    assert results_of(p, "search_places")[0]["error"]["type"] == "invalid_arguments"
    assert res.status == "needs_clarification"


def test_model_failure_is_reported_with_events_preserved():
    res = run_agent(provider=ScriptedProvider([tc("search_places", category="food")]), ctx=make_ctx(solo()), request="x")
    assert res.status == "model_error" and res.events[-1].kind == "error"
    assert any(e.kind == "tool_call" for e in res.events)  # earlier actions are not lost


def test_text_only_reply_without_proposal_is_reported_as_such():
    res = run_agent(provider=ScriptedProvider([ModelTurn(text="I can't decide.")]), ctx=make_ctx(solo()), request="x")
    assert res.status == "no_proposal" and res.message == "I can't decide."


def test_skill_file_is_actually_loaded_into_the_system_prompt():
    p = ScriptedProvider([ModelTurn(text="done")])
    run_agent(provider=p, ctx=make_ctx(solo()), request="x")
    system = p.sessions[0].system
    assert BASE_PROMPT in system and "Skill: plan, validate and repair" in system
    assert {t.name for t in p.sessions[0].tools} == {
        "search_places", "get_place_details", "get_weather", "estimate_routes", "assemble_plan",
        "validate_plan", "save_proposal", "ask_user"}
    with pytest.raises(FileNotFoundError):
        load_skills(("nope.md",))


def test_first_message_flags_unknown_fields_instead_of_assuming():
    t = trip([member("m1", cap=None, availability=None, transport_modes=None)])
    p = ScriptedProvider([ModelTurn(text="x")])
    run_agent(provider=p, ctx=make_ctx(t), request="plan something")
    first = json.loads(p.sessions[0].log[0][0])
    assert set(first["trip"]["known_gaps"]) == {"m1: availability", "m1: budget cap", "m1: transport modes"}
    assert first["trip"]["members"][0]["budget_cap_minor"] == "unknown"


def test_tool_schemas_are_plain_json_schema_objects():
    for spec in build_registry(make_ctx(solo())).specs():
        blob = json.dumps(spec.parameters)
        assert spec.parameters["type"] == "object"
        assert '"title"' not in blob and "anyOf" not in blob and "$defs" not in blob


def test_crashing_tool_returns_an_error_and_the_run_continues(monkeypatch):
    ctx = make_ctx(solo())

    def boom(*, category, query, limit):
        raise ValueError("boom")

    monkeypatch.setattr(ctx.places, "search", boom)
    p = ScriptedProvider([tc("search_places", category="food"), tc("ask_user", question="ok?")])
    res = run_agent(provider=p, ctx=ctx, request="x")
    err = results_of(p, "search_places")[0]["error"]
    assert err["type"] == "tool_crash" and "ValueError" in err["message"]
    assert res.status == "needs_clarification"  # the run survived the crash
