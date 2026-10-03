# SideQuest — Pitch and Judge Q&A

## The pitch

**One line:** SideQuest turns your free time into a validated plan — tell it your time, budget, and vibe, and an agent researches real options, checks the logistics with deterministic validators, and hands you an itinerary it can defend.

**30 seconds:** Everyone has free hours they waste deciding what to do. Trip planners handle once-a-year vacations; nothing handles Saturday afternoon. SideQuest takes your constraints — 3 hours, $15, no car, want to be outside — and an agent searches real places, checks the weather, estimates routes, assembles a schedule in code, and validates it against 14 hard checks. Unknowns stay unknown: a missing price is never assumed free. You get a timeline you can inspect, evidence you can click, and a Start Quest mode that tracks you to each stop. If the facts don't support a plan, it tells you exactly which constraint conflicts and what to relax.

## Google Form drafts

### Novelty

Most planning tools are either search engines (find places) or vacation builders (multi-day trips). SideQuest targets the unowned middle: **constraint-first micro-planning for 30 minutes to a day** — the highest-frequency planning problem people actually have. The agent doesn't generate an itinerary from memory; it researches candidates through typed tools, constructs the schedule deterministically, and can only save a plan that passes machine-checked validation. The novelty is the contract: the model proposes, code disposes.

### Innovation

Three design decisions we haven't seen combined elsewhere:

1. **Unknown as a first-class state.** Every hard check returns pass / fail / unknown, and a plan with unknown hard requirements is labeled provisional — never "verified." Missing opening hours are not proof a venue is open; missing prices are not zero.
2. **Honest execution modes.** Live (real model + providers), recorded-data (real model, fixed provider responses), and replay (a saved run, explicitly labeled "not a live agent run") are kept visibly distinct. The demo discloses which mode it's in.
3. **Evidence per field, not per card.** Each fact carries its source, retrieval time, and status — so "validated" means something checkable, not a vibe.

### Technical ambition

A single tool-calling agent drives 8 typed tools (place search/detail, weather, routing, schedule assembly, validation, proposal saving, user clarification) inside bounded limits (20 turns, 40 tool calls, 6 validations). The repair loop is the ambitious part: when `validate_plan` returns machine-readable failures, the agent must choose a real repair — drop a stop, swap a candidate, reorder, or ask the user to relax a constraint — rather than rewording its way past the check. Around it: integer-minor-unit money handling with exact shared-cost splitting, timezone-aware scheduling with DST handling, per-person (never averaged) budget validation, and a 57-test suite whose planning core survived deliberate mutation testing.

## Likely judge questions

**1. Is the demo live?**
The demo runs in replay mode: a recorded agent run, labeled on screen as "REPLAY — recorded run, not a live agent run." We disclose this up front. Live mode exists and works against real providers, but needs a Gemini key and quota — free-tier limits can interrupt a run, which is exactly why the replay fallback exists. The recorded run is real output from the actual agent loop, not a mockup.

**2. What happens when the model is wrong?**
The model can't declare its own plan valid. Only `validate_plan` — deterministic code — decides, and failed hard checks block saving. If the model hallucinates a venue, it fails the "scheduled places must come from search results" rule. If it invents a price, the money module marks it unknown and the plan goes provisional. The skill file explicitly forbids assuming answers to feasibility-changing questions.

**3. How is this different from Wanderlog / Mindtrip?**
They plan trips — multi-day vacations, booked months ahead. SideQuest plans free time: 30 minutes to a day, decided now. The input isn't a destination, it's constraints (time, budget, transport, vibe), and the output is a checked itinerary for this afternoon. Different problem, different frequency, different data (live weather and opening hours matter; flight search doesn't).

**4. What's actually agentic here, vs. a pipeline?**
The repair loop. A pipeline runs steps once; our agent reads validator failures and chooses the next action — different candidate, different order, shortened stop, more research, or a clarification question — within bounded retries. The 5-minute demo shows the activity feed precisely so you can watch tool results change what the agent does next.

**5. What data does it use, and what are the limits?**
Places from OpenStreetMap (free, community data — hours and prices are often missing, which is why unknown-handling is core), weather from Open-Meteo (free tier), straight-line travel estimates (not a routing engine — stated in the UI). Events are the weakest source; the demo doesn't depend on them.

**6. What's not built?**
Group planning (multi-profile coordination, voting), multi-day trips, and a live replan UI. The architecture anticipates them (per-person constraints and versioned proposals are already in the contracts), but they're future work — the demo says so in its close.

**7. Can the AI judge re-run this?**
Yes: `uv sync && uv run pytest` runs 57 tests with no keys; `uvicorn server.api.app:app` serves the app; `?replay=1` reproduces the demo deterministically with zero API calls. Live mode needs `GEMINI_API_KEY` (documented in `.env.example`, never committed).

**8. How do you handle privacy?**
Device location is required to plan, but quest tracking runs entirely in the browser via `watchPosition` — positions are never sent to the server (stated in the UI). No accounts, no stored personal data in the MVP.

**9. Why should we believe the validation?**
Because it's code, not prose: 14 checks over the assembled schedule, each returning pass/fail/unknown with the evidence it used. The planning core's tests were mutation-tested — we deliberately broke the code three ways to confirm the tests catch regressions. And the aggregate status can never hide a failed or unknown hard check behind passes.

**10. What would you do with more time?**
Live replan UI (the diff view is designed, not built), real routing engine, group mode on the existing per-person constraint model, and a learned preference profile so plan #50 beats plan #1.
