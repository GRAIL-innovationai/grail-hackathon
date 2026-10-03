"""MVP web API: one page, one background planning run at a time.

    uv run uvicorn server.api.app:app --port 8000

The Gemini key stays server-side. Device location is sent by the browser with the plan request
(location is REQUIRED); live tracking during the quest happens in the browser and is not sent
to the server.
"""
from __future__ import annotations

import threading
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from server.agent.config import load_dotenv, provider_from_env
from server.agent.model import ModelError, ModelProvider
from server.agent.runner import RunLimits, RunResult, run_agent
from server.models import Location, Member, TimeWindow, Trip, local
from server.providers.live import LiveWorld
from server.providers.synthetic import SyntheticWorld
from server.tools.context import ToolContext

WEB_DIR = Path(__file__).resolve().parents[2] / "web"
LIMITS = RunLimits(max_turns=24, max_tool_calls=40, max_validations=6, max_seconds=300.0)


class PlanRequest(BaseModel):
    request: str = Field(min_length=3, max_length=500)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    tz: str = "UTC"
    minutes: int = Field(default=120, ge=30, le=600)
    budget_dollars: float | None = Field(default=None, ge=0, le=100000)
    no_budget_limit: bool = False
    mode: Literal["walk", "bike", "car"] = "walk"
    data: Literal["live", "demo"] = "live"


def build_trip(req: PlanRequest, now: datetime) -> Trip:
    try:
        ZoneInfo(req.tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, f"unknown time zone {req.tz!r}") from None
    start = now.replace(second=0, microsecond=0)
    end = start + timedelta(minutes=req.minutes)
    here = Location(id="here", name="Your location", lat=req.lat, lon=req.lon, timezone=req.tz)
    cap = None if req.budget_dollars is None else int(round(req.budget_dollars * 100))
    me = Member(id="m1", display_name="You", availability=(TimeWindow(start=start, end=end),),
                budget_cap_minor=cap, budget_uncapped=req.no_budget_limit, transport_modes=(req.mode,),
                has_car=True if req.mode == "car" else None, car_capacity=4 if req.mode == "car" else None)
    return Trip(id=f"trip-{uuid.uuid4().hex[:8]}", owner_id="m1", mode="solo", title="Quick outing", timezone=req.tz,
                currency="USD", origin=here, endpoint=here, window_start=start, window_end=end, members=(me,))


def _cost_text(costs) -> str:
    if not costs or costs[0].unknown:
        return "price unknown"
    c = costs[0]
    if c.max_minor == 0:
        return "free"
    lo, hi = c.min_minor / 100, c.max_minor / 100
    return f"${lo:.0f}" if lo == hi else f"${lo:.0f}-${hi:.0f}"


def result_json(res: RunResult, ctx: ToolContext) -> dict[str, Any]:
    tz = ctx.trip.timezone
    out: dict[str, Any] = {
        "status": res.status, "message": res.message, "clarification": res.clarification,
        "conflict": res.conflict, "tool_calls": res.tool_calls, "tokens": res.usage.get("total_tokens"),
        "data": {"places": ctx.places.name, "synthetic": bool(ctx.places.synthetic)},
        "origin": {"lat": ctx.trip.origin.lat, "lon": ctx.trip.origin.lon}, "proposal": None}
    if res.proposal:
        plan, rep = res.proposal.plan, res.proposal.plan.validation
        assert rep is not None
        blocks = []
        for b in plan.blocks:
            p = ctx.details.get(b.place_id)
            blocks.append({"id": b.id, "place_id": b.place_id, "name": b.name, "start": f"{local(b.start, tz):%H:%M}",
                           "end": f"{local(b.end, tz):%H:%M}", "lat": p.lat if p else None,
                           "lon": p.lon if p else None, "cost": _cost_text(b.costs), "shortened": b.shortened})
        legs = [{"from": l.from_id, "to": l.to_id, "mode": l.mode, "depart": f"{local(l.depart, tz):%H:%M}",
                 "latest_arrival": f"{local(l.arrive_latest, tz):%H:%M}"} for l in plan.legs]
        issues = [{"status": c.status, "code": c.code, "message": c.message} for c in rep.checks if c.status != "pass"]
        out["proposal"] = {
            "id": res.proposal.id, "state": plan.state, "overall": rep.overall,
            "explanation": res.proposal.explanation, "blocks": blocks, "legs": legs, "issues": issues,
            "checks_passed": sum(1 for c in rep.checks if c.status == "pass"),
            "notes": ["Route times are straight-line estimates, not a routing engine.",
                      "Hours and prices come from community map data and may be missing or out of date.",
                      "A saved plan is a suggestion, not a booking."] if not ctx.places.synthetic else
                     ["DEMO DATA: venues, prices and forecasts are invented."]}
    return out


class Run:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.done = False
        self.result: dict[str, Any] | None = None
        self.error: str | None = None


def create_app(provider_factory: Callable[[], ModelProvider] = provider_from_env,
               now_fn: Callable[[], datetime] = lambda: datetime.now(UTC)) -> FastAPI:
    load_dotenv()
    app = FastAPI(title="SideQuest MVP")
    runs: dict[str, Run] = {}
    busy = threading.Lock()

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        try:
            provider_factory()
            model_ok = True
        except ModelError:
            model_ok = False
        return {"ok": True, "model_configured": model_ok}

    @app.post("/api/plans")
    def create_plan(req: PlanRequest):
        try:
            provider = provider_factory()
        except ModelError as exc:
            return JSONResponse({"detail": f"Model not configured: {exc}"}, status_code=503)
        now = now_fn()
        trip = build_trip(req, now)
        if not busy.acquire(blocking=False):
            return JSONResponse({"detail": "A plan is already running; wait for it to finish."}, status_code=429)
        run_id = uuid.uuid4().hex[:12]
        run = Run()
        runs[run_id] = run
        for old in list(runs)[:-30]:
            runs.pop(old, None)

        def work() -> None:
            try:
                if req.data == "demo":
                    world: Any = SyntheticWorld(trip, now=now)
                else:
                    world = LiveWorld(lat=req.lat, lon=req.lon, tz=req.tz, origin_id="here", now=now)
                ctx = ToolContext(trip=trip, places=world, routes=world, weather=world, now=now)
                res = run_agent(provider=provider, ctx=ctx, request=req.request, limits=LIMITS,
                                on_event=lambda e: run.events.append(
                                    {"seq": e.seq, "kind": e.kind, "summary": e.summary}))
                run.result = result_json(res, ctx)
            except Exception as exc:  # surfaced to the user; never includes credentials
                run.error = f"{type(exc).__name__}: {str(exc)[:200]}"
            finally:
                run.done = True
                busy.release()

        threading.Thread(target=work, daemon=True).start()
        return {"run_id": run_id}

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str) -> dict[str, Any]:
        run = runs.get(run_id)
        if run is None:
            raise HTTPException(404, "unknown run")
        return {"done": run.done, "events": run.events, "result": run.result, "error": run.error}

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    app.mount("/fixtures", StaticFiles(directory=Path(__file__).resolve().parents[2] / "fixtures"),
              name="fixtures")

    return app


app = create_app()
