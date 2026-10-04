# Implementation checklist

Status key: done / partial / not started. Work packages follow the brief (section J).

| # | Work package | Status | Notes |
|---|---|---|---|
| 1 | Repository and contracts | **partial** | Pydantic contracts for trip, member, constraint, place, plan, evidence, validation, forecast (`server/models/`). Python deps pinned by `uv.lock`. FastAPI app (`server/api/app.py`) and one-page web UI (`web/index.html`) exist. **Not done:** DB migrations, generated frontend types. |
| 2 | Scheduling and validators | **done for the checks below** | `server/planning/`: money allocation, bounded-search assembly, validators. 63 tests (2026-10-03, independent verification track). |
| 3 | Provider tools | **partial** | `SyntheticWorld` (invented fixtures) and `LiveWorld` (Overpass places, Open-Meteo forecast, straight-line route estimates) implement the provider protocols with labeled errors. No recorded fixtures; stays/intercity/events not implemented. |
| 4 | Agent planning | **done for the MVP loop** | Tool-calling loop (`server/agent/runner.py`: bounded turns/tool-calls/validations/wall-clock, cancellable), 8 typed tools, skill file loaded into the system prompt (`skills/`), Gemini adapter (Interactions API), scripted test model, `.env` config. Gemini adapter is tested only against a mock of the documented API shape; it has not been run against the live service from this environment. |
| 5 | Solo user journey | **partial** | `POST /api/plans` (location required), background run with progress events, one-page UI with map, plan + checks, Start Quest browser tracking. No auth, no history. |
| 6 | Revision workflow | **partial** | `save_proposal` gates on validation state and constraints version (stale rejection); locked blocks are anchors for re-assembly. No diff view yet (UI track). |
| 7 | Group journey | not started | Parallel/split activities not supported by `assemble_plan` yet. |
| 8 | Longer travel, active use | not started | Whole-trip costs are modelled; hierarchical planning is not. |
| 9 | Evaluation and delivery | not started | |

## Validator checks implemented

`REFERENCES`, `WITHIN_TRIP_WINDOW`, `OPEN_HOURS` (incl. last admission), `LOCKED_PRESERVED`,
`CONTINUITY`, `TRAVEL_TIME`, `DOUBLE_BOOKING`, `RETURN_BY`, `AVAILABILITY`,
`BUDGET_PER_PERSON`, `ACCESSIBILITY`, `TRANSPORT_MODE`, `CAR_CAPACITY`, `WEATHER`.

Every check returns pass / fail / unknown. `ValidationReport.overall` is `failed` if any check
fails, `provisional` if any is unknown, and `checked` only when everything passed.

## Brief acceptance scenarios (section K)

Covered by deterministic tests with synthetic data (`tests/test_scenarios.py`): 1, 2, 3, 4, 5, 6,
and the DST case. **Not yet covered** (need later work packages): 7 split group, 8 concurrent
edits and stale proposals, 9 forecast horizon via a real provider, 10 provider timeout,
11 private-budget leakage in API payloads, 12 replay vs live distinction.
(Scenario 9 is covered at the validator level: no forecast period means weather is unknown.)

## Decisions and known limitations

- All instants are normalised to UTC on input; IANA zones are stored for display. Python
  datetime arithmetic on a shared `ZoneInfo` ignores DST, so no code computes in local time.
- Shared (`fixed_shared`) and `whole_trip` costs are split equally among attendees, with the
  remainder going to the first ids in sorted order. This is a stated policy, not a fairness claim.
- Travel and cost checks use the latest travel estimate and the cost range, so a pass is
  arithmetic on estimates, not a real-world guarantee.
- `assemble_plan` is a heuristic bounded search (max 8 stops). It reports `SEARCH_LIMIT`
  instead of degrading silently. Travellers always move together; splits are not implemented.
- `None` means unknown for availability, budget cap, transport modes and opening hours; it means
  "no requirement stated" for step-free and rain limits. This is encoded in `Member` and `Place`.
- Fixtures are synthetic and labeled as such. No provider data has been recorded.

## Integration status

| Integration | Status |
|---|---|
| Model adapter (Gemini) | implemented, **not verified live** (no key in this environment); run the smoke test with a key |
| Agent loop | implemented; verified with scripted model (tool calls → validation failure → refused save → repair → checked plan). Live-model run not completed (free-tier 429 during the session). |
| Places (Overpass), weather (Open-Meteo), routes (straight-line estimates) | implemented in `LiveWorld`; both returned real data in manual tests. Events, stays, intercity not implemented. |
| Supabase auth / realtime / Postgres | not implemented (no Postgres or Docker installed) |
