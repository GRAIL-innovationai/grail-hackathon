# SideQuest — Hackathon Submission Checklist

Last updated: 2026-10-03. Event: `umn-2026` in GRAIL-innovationai/grail-hackathon.

## Organizer instructions (retrieved 2026-10-03 — verify again before submitting)

Source: https://github.com/GRAIL-innovationai/grail-hackathon (README + `skills/grail-hackathon-submit/SKILL.md`).

- Submission = a pull request adding `submissions/umn-2026/<team-slug>/` (lowercase, digits, hyphens).
- Copy project code in; leave out `node_modules/`, virtualenvs, `.env`, private keys, any file over 10 MB. Folder must stay under **50 MB**.
- `README.md` must contain exactly these level-2 sections: `## Team`, `## Summary`, `## How to run`. `## Demo` only with a real video/slides link — never a placeholder.
- Run `python3 scripts/validate_submission.py submissions/umn-2026/<team-slug>` until it prints `OK: submission looks good.` Never edit the validator.
- Secret scan runs on the PR — every commit is scanned, so a key removed in a later commit still fails if an earlier commit contains it. Rotate any exposed key.
- One PR per team; the PR may only touch files inside the team folder. Submissions are public, MIT-licensed unless the folder has its own LICENSE.
- **Deadline and judging criteria are still "To be announced"** on the event page. Check again before finalizing.
- The Google Form registration (team + idea) from the hackathon brief is a separate requirement — don't forget it.

## What the AI judge will try

Per the brief, an AI agent will attempt to re-run the project from the submission. Our reproducibility story:

```bash
uv sync && uv run pytest          # 57 tests, no keys needed
uv run uvicorn server.api.app:app --port 8000
# open http://localhost:8000/?replay=1   # recorded demo, zero keys, zero model calls
```

Live mode additionally needs `GEMINI_API_KEY` in `.env` (see `.env.example`; `.env` is gitignored and must never be committed).

## Checklist

### Done

- [x] Core engine: contracts, money handling, schedule assembler, 14-check validator (57 tests, incl. mutation-tested planning core)
- [x] Tool-calling agent loop with bounded repair (`RunLimits`: 20 turns / 40 tool calls / 6 validations / 120 s; web run allows 300 s)
- [x] `skills/plan-and-validate.md` is actually loaded into the agent's system prompt by `server/agent/runner.py` (verified in code)
- [x] Live providers: OpenStreetMap places + Open-Meteo weather (verified returning real data)
- [x] Single-page web app: location required before planning, map, validation display, client-side-only quest tracking
- [x] Replay mode (`?replay=1`): recorded run fixture, visibly labeled "REPLAY — recorded run, not a live agent run" — implemented on branches `muse/ui-polish` + `muse/demo-mode` (merge required, see below)
- [x] Demo script: `docs/DEMO.md` (5-minute choreography) + pitch/Q&A: `docs/PITCH.md`

### Team must do (assign owners)

- [ ] **Read the organizer repo once more before submitting** — deadline/criteria were "TBA" on 2026-10-03. OWNER: ________
- [ ] **Merge the feature branches into main**: `muse/ui-polish`, `muse/demo-mode`, `muse/verify`, `muse/submission`. Then record the exact commit hash that was demoed below. OWNER: ________
- [ ] **Fill in the team**: README `## Team` section is still TODO (names + GitHub usernames). OWNER: ________
- [ ] **Choose the team slug** and confirm it's free in `submissions/umn-2026/`. OWNER: ________
- [ ] **Fill the Google Form** (team + idea registration). Be specific on novelty/innovation/technical ambition — drafts in `docs/PITCH.md`. OWNER: ________
- [ ] **Rehearse the demo 3+ times**, timed, including the fallback (replay works fully offline — decide in advance when to switch to it). OWNER: ________
- [ ] **Run the organizer's validator** on the submission folder and fix all errors. OWNER: ________
- [ ] **Submit**: fork → branch → copy code → PR to `main` (one PR, team folder only). Get explicit team go-ahead before publishing — it's public and permanent. OWNER: ________
- [ ] Optional: record a demo video; only link it in `## Demo` if it exists. OWNER: ________

Demoed commit: `________` (fill in after the final rehearsal; the submission must match what was shown).

## Known honest limitations (do not misrepresent)

- A complete **live** run (real Gemini + live data → saved plan in the browser) has not yet been verified end to end.
- Live mode needs a Gemini key and quota; free-tier limits (e.g. 20 req/day on some models) can stop runs mid-demo. The replay fallback exists for exactly this reason.
- Not built: group planning, multi-day trips, live replan UI — all named as future work in the demo close.
- Route times are straight-line estimates, not a routing engine; hours/prices come from community map data and may be missing (shown as `unknown`, never assumed fine).
