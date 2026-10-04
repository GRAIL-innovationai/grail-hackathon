# SideQuest

Turns available time, preferences, and practical constraints into an itinerary users can inspect, change, and follow. Solo and group trips share one engine.

**Status: MVP with a replayable demo.** Implemented and tested (63 tests): shared contracts, the deterministic planner/validator, the tool-calling agent loop (Gemini, with a scripted model for tests), live place and weather data (OpenStreetMap, Open-Meteo), and a single-page web app that requires the device location and tracks it during the quest. **New:** `fixtures/demo/replay-run.json` is a labeled recording of one full agent run — open `?replay=1` for a bulletproof offline demo that needs no API keys (see [docs/DEMO.md](docs/DEMO.md)). **Not yet verified:** a complete live run (real Gemini + live data) ending in a saved plan in the browser. Free-tier Gemini limits (for example `gemini-3.8-flash` allows only 20 requests/day) can stop live runs; the default model is `gemini-3.5-flash-lite`. See [docs/CHECKLIST.md](docs/CHECKLIST.md) and [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## Demo (no keys needed)

```bash
uv sync
uv run uvicorn server.api.app:app --port 8000   # open http://localhost:8000/?replay=1
```

`?replay=1` plays back `fixtures/demo/replay-run.json`: a recorded Saturday-afternoon
run in downtown Minneapolis (Mill Ruins Park → Stone Arch Bridge → Father Hennepin
Bluff Park → Aster Cafe), with the 12 real agent events, a validated provisional plan
(13/14 checks pass; the café's unknown price is marked unknown, not assumed free), and
a visible REPLAY badge. It proves the shape of the system — agent proposes, code
validates, unknowns stay unknown — without depending on any live model. It is a
recording, labeled as such; it does not prove a live run. Full script and fallbacks:
[docs/DEMO.md](docs/DEMO.md).

## Team

**Team name:** Offscript

| Name | GitHub |
|---|---|
| Ezra Shukurov | @Ehtiram-Shukurov |
| Chloe McCormick | @ChloeMcCormickTR |
| Dana Mahmoud | @DanaMMh |
| Vera | @Equinox-pdf |
| Fatou Jeng | - |

## Summary
Offscript's SideQuest turns the time, budget, transport and location a person has into a checked outing plan. A Gemini-powered agent calls real tools, including OpenStreetMap places near the user's device location, Open-Meteo forecasts and route estimates, while deterministic code, not the model, builds schedules and validates them as pass, fail or unknown against hard constraints: time window, the return trip, opening hours, per-person budget and accessibility. Missing facts stay "unknown" instead of being assumed, so every plan is labeled checked or provisional. The web app requires location and tracks progress during the quest in the browser, and a clearly labeled replay mode runs without any API keys. Group planning, multi-day trips and live replanning are designed but not built yet.

## How to run
Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run pytest
cp .env.example .env   # then set GEMINI_API_KEY (never commit .env)
uv run uvicorn server.api.app:app --port 8000   # open http://localhost:8000
```

Tests need no keys. The app needs `GEMINI_API_KEY`; "Demo" data mode uses invented venues, "Live" uses OpenStreetMap near your location.

## Layout
- `server/models/` Pydantic contracts (trip, member, place, plan, evidence, validation)
- `server/planning/` money allocation, schedule assembly, validators
- `server/agent/` model adapter (Gemini), scripted test model, agent loop, demo and smoke scripts
- `server/tools/` the agent's typed tools; `server/providers/` live (OpenStreetMap, Open-Meteo) and synthetic data
- `server/api/` FastAPI app; `web/` single-page UI (location required)
- `skills/` instructions loaded into the agent's system prompt
- `tests/` 63 tests (scripted model, synthetic data; no keys needed)
- `docs/` build plan and checklist (the checklist predates the MVP and is partly out of date)
- `fixtures/demo/` the labeled replay recording; `db/migrations/` is an empty placeholder
