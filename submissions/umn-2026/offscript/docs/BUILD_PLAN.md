# SideQuest — Product and Implementation Plan

Prepared October 3, 2026. This is a proposed architecture and build specification, not a claim that the software or integrations have already been implemented. It is not tied to a one-hour deadline. Implementation order expresses dependencies, not feature cuts.

## 1. Product promise

SideQuest turns available time, preferences, and practical constraints into an itinerary that users can inspect, change, and follow. It supports individual outings and shared trips, from a short local activity to a multi-day vacation. It researches candidates, validates logistics, and proposes revisions when requirements change.

The user-facing promise is a researched, checked plan with visible uncertainties. Do not describe estimated costs as quotes, forecast rain as certainty, venue opening as ticket availability, or a saved itinerary as a booking.

Solo and group mode share the same engine. Solo is a trip with one participant. Group mode adds participant-specific constraints, shared suggestions, and a decision process.

## 2. User journeys

### Create a trip

The user describes the trip in natural language. Extract origin, destination or search area, dates/time window, budget, transport, interests, pace, and party details. Ask targeted questions where missing information changes feasibility: starting location, return location, budget basis, and fixed commitments are particularly important.

Show editable constraint chips and a detail panel. Each extracted field records its origin: user statement, saved preference, or provisional assumption. Ask before replacing explicit trip constraints with inferred preferences. Selecting a different transport mode or date updates the structured object, not just the chat text.

For longer travel, distinguish destination discovery, intercity transport, lodging, and daily activities. Clarify whether the budget includes getting to the destination, accommodation, meals, or only activities. Store included and excluded categories explicitly.

### Generate a plan

Research candidates, retrieve required details, estimate routes, construct candidate schedules, and validate. Return a timeline, map, budget breakdown, source details, and unresolved information. Offer meaningful alternatives when the user's priorities conflict. A single-stop plan is valid for a short time window; do not force several activities into every outing. A quick single-stop outing is chosen with the scoring and confidence threshold in section 8; if nothing clears the threshold, offer a labeled fallback quest rather than a weak match.

### Refine and follow

Users can swap stops, move activities, mark must-dos, lock reservations, change attendance, and update constraints through chat or direct controls. These actions produce proposed changes and trigger validation. Accepted plans remain accessible in version history.

Start Quest shows the current stop, next departure, directions link, and completion controls. A user-reported delay can trigger replanning. Device location and notifications require opt-in; the product must also work with manual check-ins. Do not imply automatic late detection when location or background execution is unavailable.

### Collaborate

The organizer creates an invite link. A participant joins, enters their own constraints, adds places or comments, and responds to proposals. A participant's own budget and accessibility requirements should not be editable by other ordinary members. Provide a privacy setting for displaying exact personal budgets; the planner can use a private cap while the group sees only affordability status.

Suggestions appear to the group immediately. Suggestions do not silently replace accepted itinerary blocks. The agent analyzes their effects and proposes a revision with alternatives and a change summary.

## 3. Screens and interactions

| Screen | Contents | Main action |
| --- | --- | --- |
| Create | Natural-language request; Solo/Group; editable constraints | Create trip |
| Trip workspace | Day selector, timeline, map, budget summary, members | Generate or refine |
| Activity detail | Source, hours, cost estimate/range, duration, accessibility evidence, attendees | Swap, suggest, lock |
| Group board | Member status, suggestions, votes, comments | Add idea or review proposal |
| Revision review | Added, removed, moved, unchanged blocks; tradeoffs; validation results | Accept or reject |
| Active quest | Current/next stop, leave-by time, check-in, delay input | Continue or replan |
| History/profile | Accepted versions and user-controlled preferences | Restore or edit |

Desktop: timeline central, map alongside it, chat and group activity in a collapsible panel. Mobile: Plan, Map, and Group tabs with a persistent next action. Avoid placing a full agent debug transcript in the main travel experience; provide an expandable activity view.

## 4. Constraint semantics

Every constraint has an owner, type, value, hardness, source, update time, and visibility. Distinguish:

- Hard: available time, explicit budget cap, accessible route requirement, transport availability.
- Soft: food interests, preferred pace, scenery, activity variety.
- Locked commitment: a specific reservation or fixed meeting that cannot move without explicit agreement.

Unknown is a first-class state. Missing opening hours are not proof that a venue is open; missing prices are not zero; missing accessibility information is not confirmation of accessibility.

For each hard requirement, output pass, fail, or unknown. A plan with an unknown hard requirement is provisional. Never label it fully checked.

Budget amounts use integer minor units, explicit currency, and basis (per person, shared item, or whole trip). Record estimate ranges and included categories. Validate each attendee's own allocation, including shared expenses, against that attendee's cap. Do not average participant budgets. Foreign-currency conversions require a timestamped rate and remain estimates.

Use timezone-aware timestamps. Store UTC instants and the relevant IANA timezone for each location/day. Account for daylight-saving transitions, overnight hours, local date changes, and transit departure times. Include outbound travel, connections, waiting time, and the journey to the requested endpoint.

## 5. Proposed architecture

Recommended implementation: React with TypeScript for the interface; Python FastAPI and Pydantic for the backend and structured contracts; PostgreSQL with Supabase authentication and realtime collaboration; a background worker for agent runs. Use one tool-calling agent with bounded loops. A separate agent per person is unnecessary.

Backend responsibilities: authorization, constraint normalization, model calls, provider adapters, schedule construction, validation, revision computation, and durable state. Frontend responsibilities: input, rendering, proposal review, and receiving progress/state updates.

Use server-sent events for a run's progress and a realtime database channel for accepted trip/group state. The durable database is authoritative; realtime messages are notifications rather than the only copy of an edit. Every event has an ID, trip ID, sequence, and version so reconnecting clients can resynchronize.

Store model/provider credentials server-side. Invite links use revocable tokens exchanged for membership. Enforce membership and roles on every trip operation, including realtime access. Expose personal constraints only according to their visibility setting.

## 6. Agent workflow

1. Parse request into validated structured fields; identify important ambiguities.
2. Snapshot trip version, constraints version, participants, and commitments.
3. Plan research: determine which categories, geographical areas, and provider calls are needed.
4. Retrieve candidates with source IDs and provenance.
5. Fetch detail for promising candidates; deduplicate the same venue across sources.
6. Prune clear violations, compute appropriate route estimates for remaining candidates, then score the survivors and keep a bounded shortlist (see Candidate scoring and selection in section 8).
7. Construct candidate schedules in code using selected activities, time windows, route durations, and locked stops.
8. Validate each candidate and return machine-readable failures or unknowns.
9. The agent chooses a repair: search another venue, shorten an optional stop, reorder, change a route, or ask about relaxing a constraint.
10. Repeat within configurable iteration, time, and cost limits.
11. Return a proposed plan, alternatives where useful, evidence, and a validation summary.

The model interprets preferences, chooses searches, interprets ambiguous source text, and explains tradeoffs. Code calculates costs, scores candidates and applies selection thresholds, tracks attendance, constructs and validates schedules, and controls versions. The model may pick among shortlisted candidates and write the quest copy, but it cannot add a candidate; its pick is checked against the shortlist IDs. Explanations cite actual tool outputs and validation results. Do not invent an internal monologue for the activity feed.

On failure, return a concrete conflict such as: required travel and activities need 110 minutes but the available window is 90 minutes. Offer explicit relaxations; never silently violate the user's hard constraint.

## 7. Tool contracts

All read tools return data, provider/source, retrieved_at, relevant date, and known limitations. Tools must return explicit errors and partial results. Mutation tools require backend authorization and must not grant the model authority to overwrite accepted group plans.

| Tool | Inputs | Outputs |
| --- | --- | --- |
| read_trip | trip ID and expected version | Trip snapshot and permitted participant fields |
| resolve_location | place text or coordinates | Candidate locations with ambiguity |
| search_places | area, category, preferences, time | Candidate IDs and basic evidence |
| get_place_details | place ID and visit date | Hours, costs, source links, relevant attributes |
| get_weather | coordinates and dates | Forecast periods, probabilities, provider horizon |
| estimate_routes | origins/destinations, mode, departure | Duration, distance, transfers and uncertainty |
| search_events | area and time window | Event schedule, location, price/availability status |
| search_stays | dates, party, area, needs | Candidate lodging and timestamped total-price information |
| search_intercity_options | origin/destination, dates, travelers | Transport candidates and fare uncertainty |
| assemble_plan | candidates, constraints, locks | Candidate itinerary |
| validate_plan | itinerary and snapshot | Pass/fail/unknown checks and totals |
| save_proposal | candidate, base versions, evidence | Proposal ID and structured diff |

Example failure: `{check: 'return_by', status: 'fail', participant_id: 'p2', excess_minutes: 18, related_blocks: ['b3', 'leg4']}`. The UI renders a clear sentence from this result.

## 8. Planning and validation

Implement schedule construction with a bounded search over activity combinations and orderings. For bigger itineraries, use a constraint solver for time windows, attendance, and fixed stops. Do not claim global optimality for a heuristic solution.

Hard constraints are filters and validation gates, not small score penalties. Among feasible plans, compare preference coverage, pace, travel burden, price, data completeness, and change from the current plan. Maintain diversity between alternatives so users see actual tradeoffs.

Validate: travel continuity, sufficient travel time, full visit within confirmed opening windows, last admission, reservation window, no participant double-booking, participant availability, travel mode/car capacity, budget allocations, weather-related user restrictions, and final arrival at the correct endpoint. Account for meal/rest periods and lodging on longer plans.

Use conservative bounds when possible. If the estimated cost range crosses a strict cap, mark the budget check uncertain instead of choosing the lower bound to pass. Likewise, predicted travel times and weather are estimates even when schedule arithmetic passes.

### Candidate scoring and selection

Selection is deterministic, explainable, and easy to tune. Code decides which candidate wins; the model may only phrase it. All weights, bands, and thresholds below live in one versioned scoring config, and every run records the config version.

Lifecycle: fetch candidates within a mobility-aware radius; apply hard filters; score the survivors; select the top candidate if it clears the confidence threshold; otherwise serve a fallback quest.

**Search radius.** `travel_time_budget_min` is the total round-trip travel budget. Use the explicit value if supplied, otherwise `min(0.35 * time_available_min, 25)`. Then `radius_km = speed_kmh * (travel_time_budget_min / 2 / 60)`, clamped per mode.

| Mode | Planning speed | Max radius |
| --- | --- | --- |
| walk | 4.5 km/h | 2.0 km |
| bike | 15 km/h | 6.0 km |
| car | 30 km/h effective city speed | 15.0 km |

These speeds only bound the candidate fetch and give first estimates. Replace them with provider route estimates (section 12) before a final decision; never use a driving estimate for a walking leg.

**Hard filters.** Drop a candidate, and record a machine-readable reason, if any of these hold:

- estimated round-trip travel exceeds the travel budget;
- the place is confirmed closed at any point in the visit window (arrival to departure);
- the category conflicts with the weather (`park`, `trail`, `viewpoint` in heavy rain; use the forecast probability threshold from config and probabilistic wording in copy);
- the place was shown within the recent-history window (a config value);
- the place is marked unsafe for the current context (provider flag, time-of-day rule, or user report);
- minimum dwell time plus round-trip travel exceeds the time available.

Unknown opening hours are not proof of "open" and are not proof of "closed". Keep such a candidate, mark it provisional, and make sure no copy says the place is open (section 4).

**Score components.** The total is 0 to 100.

| Component | Range | Rule |
| --- | --- | --- |
| Interest match | 0-40 | Exact category/tag overlap with user interests up to 30; adjacent thematic match up to 10, from a maintained adjacency map. Example: `books` + `bookstore` scores 30-40; `art` + `historic building` scores 10-20. |
| Time fit | 0-25 | `usage_ratio = estimated_total_min / time_available_min`. 25 if 0.65-0.95; 18 if above 0.95 up to 1.0, or 0.45 up to 0.65; 10 if 0.30 up to 0.45; otherwise 0. Bands are half-open so none leave gaps. |
| Distance fit | 0-20 | Round-trip travel as a share of the travel budget: 20 if at most 40%; 15 if at most 70%; 8 if at most 100%. |
| Novelty | 0-10 | 10 if the place and category are new; 5 if the category was seen but the place is new; 0 if the place was seen before (outside the filter window). |
| Context fit | 0-5 | +2 weather aligns; +1 time of day; +1 budget (only when the price is known and within the cap; unknown price scores 0); +1 party type. |

If the user supplied no interests, use a neutral interest score of 20 and skip the interest threshold below, so that "no preferences" does not always force a fallback.

**Confidence and selection.** Use the top candidate only when the total is at least 60, the interest score is at least 15, and the time-fit score is at least 10. Otherwise take the fallback path. A provisional candidate can win, but the result stays flagged as provisional.

**Tie-breaking.** When totals are equal, prefer: higher interest score; confirmed over unknown hours (added to keep ties from favoring unverified data); lower round-trip travel time; higher novelty; then place ID in alphabetical order, so the result is identical on every run.

**Fallback quests.** Fallbacks are curated non-place or indoor generic quests, tagged and filtered by context: match at least one user interest where possible, fit the available time, prefer indoor quests in poor weather, and avoid recently shown templates. A fallback never names a real place and needs no model call. Tell the user plainly that nothing nearby scored well enough.

**Debug and explanation output.** Every run returns the filter reason for each rejected candidate, the per-candidate score breakdown, the scoring config version, the threshold path (`place` or `fallback`), and the provisional flag. Store this on the AgentRun/ToolEvent record. User-facing explanations quote this breakdown ("matches your interest in books; uses about 70% of your hour") rather than model-written reasoning. Keep the full breakdown in an expandable view, not the main experience.

**Personalization (later).** Turn explicit feedback into bounded interest and distance weights: completing a `books` quest raises `books` by about 0.15; skipping for `too_far` penalizes the distance feature; skipping for `not_interesting` penalizes that category. Store weights as inferred Preference records with a last-confirmed time and an opt-in state. Feedback adjusts scores only; it never relaxes a hard constraint or overrides an explicit trip constraint.

**Open decisions.** Confirm before building: the recent-history window length; who maintains the adjacency map; whether the thresholds hold up in user testing; and whether to keep the round-trip definition of the travel budget.

## 9. Replanning and version control

A change arrives as a structured patch: deadline shortened, budget reduced, venue unavailable, person joins, new preference, or delay. Classify which blocks and route legs are affected. Preserve completed and locked blocks; protect unchanged valid blocks where possible. Recompute affected boundaries, per-person costs, and meeting points, then validate the entire proposal.

Minimize unnecessary changes after satisfying hard constraints. Show added/removed/moved/replaced blocks, changed attendees, budget deltas, and a reason tied to the triggering change. Preserve stable block IDs so diffs do not treat every stop as new.

Each proposal stores base_plan_version and base_constraints_version. Acceptance is transactional: if either changed, reject the stale acceptance and regenerate/revalidate. Votes are attached to a specific proposal version. Retries use idempotency keys to prevent duplicate acceptance.

Never make acceptance depend on a fresh unbounded model call. Check version and stored validation, then perform any required bounded freshness checks. If source data has become stale, require revalidation before presenting the proposal as ready.

## 10. Group decisions

Roles: organizer, participant, viewer. Members own their personal constraints, can suggest stops, and vote. The organizer accepts a proposal in the default policy, but cannot silently override another participant's hard constraint. Offer alternative attendees or ask the affected person to revise that constraint.

Each proposal shows per-person time, estimated cost, selected interests, and missed preferences. Begin with a transparent equal-member ranking policy: respect all hard constraints, avoid leaving one person with almost none of their preferences satisfied, then maximize overall fit. This is a product policy, not a claim of mathematically universal fairness. Explain compromises in plain language.

Votes affect preferences; they do not override accessibility needs or availability. Absence of a vote is not approval. Private reasons should not be revealed in shared explanations.

If the group permits separate activities, support parallel blocks with explicit attendees, independent travel legs, and a feasible reunion time/place. If no split is permitted, report the incompatibility and ask which preference or participation choice should change.

Live collaboration: broadcast a new suggestion immediately; compute a proposed plan when requested or after a short batch of edits. Show when inputs changed during a run, and mark its resulting proposal stale rather than pretending it reflects the latest inputs.

## 11. Multi-day and multi-week planning

Use hierarchical planning: first establish dates, destinations, travel legs, lodging bases, and fixed reservations; then allocate daily budgets and activities. Validate the whole-trip budget as well as daily schedules. Reserve time for arrival/departure, transfers, check-in, sleep, meals, and buffers.

Do not use today's weather forecast to claim exact conditions weeks ahead. Outside the provider forecast horizon, show weather as unknown or use separately sourced seasonal guidance clearly labeled as such. Refresh forecasts as dates approach. Future events, seasonal opening hours, and unpriced lodging remain unresolved until verified.

Changing a travel leg may affect several days; changing a café should normally affect one local segment. Track dependencies to make this distinction explicit. Store booked reservations separately from merely recommended options. A link to purchase is not a completed booking.

## 12. Data-provider strategy

Use adapters with capability flags for supported regions, transport modes, forecast horizon, price detail, opening hours, and availability. Provider selection must reflect licensing, allowed caching/display, attribution, quota, and terms. Verify actual access with test calls before treating any provider as connected.

- Weather: Open-Meteo is a possible source; its free hosted service is for noncommercial use under stated limits, with commercial terms separate.
- Places: evaluate a supported commercial places provider for detail coverage, and OSM data for suitable geographical points. Do not assume OSM includes complete pricing or hours.
- Routes: use a provider with the needed mode. For OSRM, select a properly configured endpoint/profile; do not treat driving estimates as walking estimates. Transit needs time-specific service information.
- Events: connect documented event sources and retain the actual event date and source. A venue listing is not evidence of an event.
- Lodging/intercity travel: use authorized provider access with dated quotes and explicit availability; if access is unavailable, accept user-entered reservations and mark unverified recommendations appropriately.

Planning speeds in section 8 only bound the first candidate fetch; replace them with provider route estimates for the mode before deciding. Cache only as permitted. Weather, route, price, and place data have different freshness needs. Associate each field with its own provenance instead of claiming an entire card was verified because one field was retrieved. Bound retries, provider requests, and candidate counts; prioritize detail calls for promising candidates.

## 13. Data model

| Entity | Key fields |
| --- | --- |
| Trip | id, owner, title, mode, origin, endpoint, dates, currency, decision policy, accepted plan ID |
| Member | trip/user IDs, role, joined status, visibility settings |
| Constraint | owner, key, value, hard/soft/locked, source, visibility, version |
| ParticipantAvailability | participant, start/end, timezone, start/end locations |
| Place/Event | provider IDs, geometry, categories, detail evidence |
| Evidence | field, value, source URL/provider, retrieved_at, applies_at, status |
| PlanVersion | trip, base version, constraint snapshot, status, totals, validation |
| ActivityBlock | stable ID, place, start/end, timezone, attendees, lock state, costs |
| TravelLeg | endpoints, mode, departure, duration range, attendees, provider evidence |
| CostItem | minor-unit range, currency, category, basis, allocation, quote timestamp |
| Suggestion | author, place/text, status, comments |
| Proposal/Vote | base versions, diff, policy, voter responses |
| AgentRun/ToolEvent | model, prompt/tool versions, inputs hash, status, latency, tool evidence |
| Preference | user, explicit/inferred source, weight (interest, distance), last confirmed, opt-in state |
| Impression | user, place or fallback template ID, shown_at, outcome (accepted, skipped, completed), skip reason, scoring config version |

Keep accepted snapshots immutable. A restoration creates a new version with current checks; it does not rewrite history. Store private constraints separately or restrict their access with appropriate database policies; field visibility cannot be secured solely by hiding it in the UI.

## 14. API boundaries

Proposed endpoints:

- `POST /trips` creates trip and owner membership.
- `GET /trips/{id}` returns role-appropriate state.
- `PATCH /trips/{id}/constraints` uses an expected constraints version.
- `POST /trips/{id}/invites` creates an expiring, revocable invite.
- `POST /invites/{token}/join` exchanges an invite for membership.
- `POST /trips/{id}/suggestions` stores a group contribution.
- `POST /trips/{id}/runs` starts plan/replan work and returns a run ID.
- `GET /runs/{id}/events` streams resumable progress events.
- `POST /proposals/{id}/votes` records a response to an exact proposal version.
- `POST /proposals/{id}/accept` checks permissions, input versions, policy, and validation atomically.
- `POST /trips/{id}/check-ins` records user-supplied progress.

Long-running work runs in a worker, not an HTTP handler waiting indefinitely. Support cancellation, retry, and duplicate-request protection. Provider errors remain distinguishable from no-results responses.

## 15. Repository and skills

Use `/web`, `/server`, `/server/agent`, `/server/tools`, `/server/planning`, `/server/providers`, `/server/models`, `/db/migrations`, `/skills`, `/fixtures`, `/tests`, and `/docs`. Include `.env.example`, dependency locks, provider setup instructions, and a README.

Skills document actual behavior: interpret constraints; research and preserve sources; construct and validate plans; repair a plan; reconcile group constraints. Each skill states inputs, permitted tools, output schema, uncertainty rules, stop conditions, and examples. Ensure the agent runtime actually loads the relevant instructions; merely including markdown files does not make them part of the system.

Avoid a separate framework or agent for each skill. Keep deterministic functions separately testable from the model loop.

## 16. Implementation sequence and ownership

1. Define shared contracts and example scenarios. Agree on constraint semantics, source states, accepted/proposed versions, and budget allocation.
2. Implement validators, candidate scoring with golden score-breakdown tests, and sample datasets. Establish expected outcomes before involving the model.
3. Build provider adapters with recorded response fixtures and real access checks.
4. Implement the planner agent against these tools with bounded repair loops.
5. Connect the solo creation-to-plan UI and progress stream.
6. Implement replan patches, stable block IDs, diffs, and transactional acceptance.
7. Add member profiles, invitations, suggestions, votes, realtime sync, and privacy rules using the same engine.
8. Add hierarchical multi-day planning, lodging/transport dependencies, and forecast-horizon behavior.
9. Connect check-ins, user-authorized updates, and preference controls, including feedback-driven weights.
10. Evaluate, rehearse the demonstration, document, and submit according to the current organizer instructions.

Ownership: product/interface owner handles screens and interactions; agent/backend owner handles orchestration and APIs; data/planning owner handles adapters and deterministic checks; collaboration owner handles membership and versions; quality/submission owner maintains examples, evaluation, setup, and demo. Combine roles according to team size. Integrate through agreed contracts rather than independent incompatible prototypes.

## 17. Evaluation and acceptance

| Scenario | Required behavior |
| --- | --- |
| Short outing with return requirement | Includes both outward and return travel |
| Strict small budget with unknown price | Marks affordability unknown; does not assume free |
| Venue closes before proposed departure | Rejects full visit or explicitly shortens an optional visit |
| Rain forecast changes | Proposes relevant changes with probabilistic wording |
| Existing booking | Preserves it unless authorized to move/remove |
| Member has lower budget | Preserves that member's cap; never averages it away |
| Member arrives later | No assigned activity before arrival |
| Simultaneous edits | Detects stale proposal and preserves both contributions |
| Split group | Validates both branches and feasible reunion |
| Overnight / DST / timezones | Keeps chronological travel and correct local rendering |
| Long trip beyond forecast horizon | Reports forecast unavailable |
| Provider outage | Uses labeled permitted cached data or reports missing evidence |
| No feasible plan | Explains actual conflicting constraints and asks for a choice |
| Best candidate misses the confidence threshold | Serves a labeled fallback quest, not a weak place match |
| Two candidates tie | Resolves by the documented tie-break order, identically on every run |
| Place shown recently | Excluded by a hard filter; the reason appears in debug output |
| Unknown opening hours | Stays eligible but provisional; no copy says the place is open |
| No interests supplied | Uses the neutral interest score; does not force a fallback |

Measure hard-constraint violations on checked cases, fallback rate, threshold-path rate, score distribution by component, skip reasons, unknown-data rate, source coverage, per-person preference coverage, unnecessary changed blocks during replan, latency, provider/model costs, and successful user acceptance. Evaluate hard checks in code; use human review for preference fit and explanation quality. Keep a fixed set of held-out scenarios instead of testing only the polished demo.

Validate authorization and state consistency as well as itinerary quality. Test private constraint leakage, stale acceptance, duplicate submissions, removed-member access, and reconnection behavior because they can affect real group data.

## 18. Demonstration and reproducibility

Demonstrate: request and constraints; actual tool-backed planning; visible validation; a changed requirement; a proposal diff; acceptance. A group variant adds another participant's suggestion and shows the resulting tradeoff. Show only implemented capabilities. Label simulated weather/events and saved replays.

Three execution modes:

- Live: actual model and providers; disclose credentials and costs required in setup.
- Recorded-data agent run: actual model with fixed provider responses; repeatable inputs, not guaranteed identical text.
- Replay: previously saved events and plan; deterministic offline presentation, explicitly not a new agent run.

Record dependency versions, prompt/tool versions, scoring config version, timestamps, timezone, fixture provenance, and model configuration. Include validator expected outcomes, clean setup instructions, and a sample environment file without secrets. Verify the clean setup and all advertised modes before claiming reproducibility.

For the hackathon, the supplied brief specifies team eligibility, registration, GitHub submission, and a five-minute finalist demonstration. Read the current organizer repository instructions before submitting; those additional instructions have not been retrieved in this conversation. Do not claim skills files or a polished demo guarantee finalist selection.

## 19. Sources and implementation references

These references support specific integration capabilities; the product architecture, group decision policy, and development sequence above are design recommendations.

- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Google Routes overview: https://developers.google.com/maps/documentation/routes/compute-route-over
- Open-Meteo forecast documentation: https://open-meteo.com/en/docs
- Open-Meteo pricing and service terms: https://open-meteo.com/en/pricing
- OSRM frontend mode/endpoint configuration: https://github.com/Project-OSRM/osrm-frontend
- Anthropic agent engineering: https://www.anthropic.com/engineering/building-effective-agents

Definition of product correctness: the itinerary respects the supplied hard constraints where the required facts are known, shows uncertainty where they are not, and lets users understand and approve consequential changes.
