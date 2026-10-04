# SideQuest — 5-minute demo script (replay mode)

This demo runs entirely in **replay mode**: a single recorded agent run, played back
offline. No model calls, no API keys, no network beyond serving the page. The Gemini
free-tier limit cannot touch it.

The recording lives at `fixtures/demo/replay-run.json`. It is labeled as a recording
in the file itself (`meta.label`, `mode: "replay"`), and the page must show a visible
"REPLAY" badge whenever it is playing. Never present it as a live run. If anyone asks
"is this live?", the answer is: "Recorded — here's the file, and here's the live mode
it was recorded from."

## Setup (do this before the event, rehearse twice)

```bash
uv sync
uv run uvicorn server.api.app:app --port 8000
# open http://localhost:8000/?replay=1
```

`?replay=1` loads `fixtures/demo/replay-run.json` and steps through it: the 12 recorded
events render in the activity feed, then the plan renders as a timeline, then the
validation panel. (The `?replay=1` player is implemented by the web track against the
fixture schema — confirm it works before you rehearse.)

Rehearsal checklist: server starts from a clean clone with no `.env` present; the
REPLAY badge is visible in every shot; browser geolocation permission is granted for
the Start Quest beat (or you have the fallback line ready, below).

## The script

**0:00–0:30 — The pitch.**
Say: "SideQuest turns your free time into a plan you can trust." Type the request:
"3 hours, $15, walking, outdoors" — location: downtown Minneapolis. Add, up front:
"This demo runs in replay mode — a recording of a real agent run, labeled on screen.
The live mode it was recorded from works the same way; replay just can't be broken by
wifi or rate limits."

**0:30–2:30 — The replayed run. Linger here — the activity feed is the agentic proof.**
Step through the 12 events slowly and narrate what the agent is doing, not just what
it outputs:

- "It pulls the hourly forecast first — dry through 6 PM, so outdoors stays on the table."
- "It searches real places near downtown Minneapolis — 40 candidates from OpenStreetMap —
  and pulls details on the shortlist. One café has no listed price; watch what happens
  to that later."
- "It compares walking routes — 38 minutes total across four legs — then assembles the
  plan in code and validates it: provisional, zero failed, one unknown."

The timeline builds: Mill Ruins Park → Stone Arch Bridge → Father Hennepin Bluff
Park → Aster Cafe patio, with travel legs, costs, and times. Key line: "The model
proposes; deterministic code disposes. Every check you see was computed, not generated."

**2:30–4:00 — The honesty beat, then location.**
Open the validation panel. "13 of 14 checks pass. The one unknown is the budget check —
the café's price isn't listed, so the agent marks it unknown instead of assuming it's
free, and the plan is saved as *provisional*, not verified. That's the product: it
shows you what it doesn't know."

Then Start Quest — give this real stage time, location is a headline feature. The page
asks for the browser location (this is the required input the whole plan is built
around), then tracks position live and shows distance to the next stop updating as you
move. "Tracking happens in the browser and is never sent to the server."

**4:00–5:00 — Close on reproducibility.**
"Everything you just saw runs from a clean clone: `uv sync`, no API keys, open
`?replay=1` — the judges' agent gets exactly what you saw, byte for byte." Then name
the future honestly: "Replanning is next — the engine already versions plans and
computes diffs, so a changed constraint becomes a minimal revision instead of a fresh
plan. That's the roadmap, not the demo."

## Fallback rules (pre-decided, not improvised)

- If the server won't start: the fixture file alone tells the story — it's
  self-contained JSON with the request, all 12 events, and the full result. Walk
  through it as a document.
- If the browser blocks geolocation: skip the live tracking beat and narrate it —
  "on a real device this shows live distance to the next stop; the recording covers
  the planning half."
- If anything else breaks: you still have the pitch, the honesty beat (unknowns marked
  unknown), and the reproducibility close. Those three beats alone make the demo.
- Never switch to claiming the recording is live. The REPLAY badge stays visible.

## Submission checklist

- [x] `skills/plan-and-validate.md` is actually loaded by the runtime: `server/agent/runner.py`
      calls `load_skills()` at run start (raises `FileNotFoundError` if the file is missing) —
      verified, not just present on disk.
- [x] `.env.example` exists; `.env` is gitignored (`.gitignore` covers `.env` and `.env.*`).
- [x] Clean-clone replay needs no keys: `uv sync` → `uvicorn` → `?replay=1`. No `.env` required.
- [ ] Confirm the web track's `?replay=1` player renders this fixture's exact schema before rehearsal.
- [ ] **Read the organizer's submission instructions** (grail-hackathon repo) — not retrieved by
      anyone yet. Deadline, upload format, and the registration form are still unchecked.
- [ ] Coordinate with the teammate's `docs/BUILD_PLAN.md` edits (commit 2032fb9) so the plan
      doc and this demo script don't contradict each other.
- [ ] When the demo is final, record which commit was demoed so the submission matches the stage.
