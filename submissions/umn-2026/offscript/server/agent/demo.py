"""Run the agent once against the SYNTHETIC world with the configured model.

    uv run python -m server.agent.demo "your request"

All venues, prices and forecasts are invented (see server/providers/synthetic.py); output is a
demonstration of the tool-checked loop, not real trip advice.
"""
from __future__ import annotations

import sys
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from server.models import Location, Member, TimeWindow, Trip, local
from server.providers.synthetic import SyntheticWorld
from server.tools.context import ToolContext

from .config import load_dotenv, provider_from_env
from .model import ModelError
from .runner import run_agent

DEFAULT_REQUEST = "I have until 3pm and about $30. I'd like some food and a short walk outside, then back home."


def demo_trip() -> Trip:
    tz = ZoneInfo("America/Chicago")
    start = datetime(2026, 6, 6, 10, tzinfo=tz)
    end = datetime(2026, 6, 6, 15, tzinfo=tz)
    home = Location(id="home", name="Home (synthetic)", lat=44.97, lon=-93.26, timezone="America/Chicago")
    me = Member(id="m1", display_name="You", availability=(TimeWindow(start=start, end=end),),
                budget_cap_minor=3000, transport_modes=("walk", "bike"))
    return Trip(id="demo", owner_id="m1", mode="solo", title="Demo outing (synthetic)",
                timezone="America/Chicago", currency="USD", origin=home, endpoint=home,
                window_start=start, window_end=end, members=(me,))


def main() -> int:
    load_dotenv()
    request = " ".join(sys.argv[1:]) or DEFAULT_REQUEST
    try:
        provider = provider_from_env()
    except ModelError as exc:
        print(f"Not configured: {exc}")
        return 2
    now = datetime(2026, 6, 4, 12, tzinfo=UTC)
    trip = demo_trip()
    world = SyntheticWorld(trip, now=now)
    ctx = ToolContext(trip=trip, places=world, routes=world, weather=world, now=now)
    print(f"model={getattr(provider, 'model', provider.name)}  data=SYNTHETIC\nrequest: {request}\n")
    res = run_agent(provider=provider, ctx=ctx, request=request)
    for e in res.events:
        print(f"{e.seq:>2} {e.kind:<11} {e.summary}")
    print(f"\nstatus: {res.status}   tool calls: {res.tool_calls}   tokens: {res.usage.get('total_tokens')}")
    if res.proposal:
        plan = res.proposal.plan
        print(f"proposal {res.proposal.id}: state={plan.state} checks={plan.validation.overall}")
        for b in plan.blocks:
            print(f"  {local(b.start, trip.timezone):%H:%M}-{local(b.end, trip.timezone):%H:%M} {b.name}"
                  + ("  (shortened)" if b.shortened else ""))
        bad = [c for c in plan.validation.checks if c.status != "pass"]
        for c in bad:
            print(f"  [{c.status}] {c.code}: {c.message}")
        print("explanation:", res.proposal.explanation)
    if res.clarification:
        print("asked:", res.clarification)
    if res.message and not res.proposal:
        print("message:", res.message[:300])
    return 0 if res.status in {"proposal_saved", "needs_clarification"} else 1


if __name__ == "__main__":
    sys.exit(main())
