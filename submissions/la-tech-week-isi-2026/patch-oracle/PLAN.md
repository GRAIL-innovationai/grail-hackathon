# Plan

Deadline: **2026-10-13, 14:00 PT**.

## Status

- [x] Data pipeline: patch notes, pro-match stats, z-test labels (`data/`)
- [x] Prediction, scoring (macro-F1 + majority baseline), self-improvement loop, online eval
- [x] Offline test (`test_oracle.py`), agent skill, README, public repo
- [x] Working OpenRouter key
- [x] Live demo page (`serve.py` + the React page in `ui/`, built to `ui/dist`) with live runs and replay
- [x] Recorded run 4 (`improve 6` + `online`), committed with `runs/recorded.jsonl`
- [x] Real numbers in the README Results section
- [x] Gemma 4 + Haiku defaults, bootstrap gate, word cap in code, seed/provider pinning, notes-hidden ablation (13:20)
- [ ] Open the submission PR to `submissions/la-tech-week-isi-2026/patch-oracle/` (by 13:30)
- [ ] Fill in the Google form (Thomas)
- [ ] Rehearse the 5-minute demo

## Timeline

| Time | Step |
|---|---|
| now | new key, run `improve` + `online` (~5 min, ~$0.20) |
| 13:00 | README results, commit, push |
| 13:15 | submission PR + Google form |
| 13:30–14:00 | demo rehearsal, buffer |

## Demo script (5 min, no slides)

1. **Problem (30 s):** every balance patch is a guess. Studios, pro teams and analysts only learn weeks later, after thousands of matches, whether a nerf landed. Reading patch notes is expert gut feeling that nobody scores.
2. **The prediction (60 s):** open `data/notes_7.40.json` for one hero. Show the model's prediction and its one-line reason from `runs/test_predictions.json`.
3. **The answer key (60 s):** show the real pick rate before and after from about 7,800 pro matches. Code decides up, down or flat with a z-test, not the LLM.
4. **It teaches itself (90 s):** `diff playbooks/v0.md playbooks/best.md`, then `runs/offline.json` with validation (7.39) scores per version (accepted or rejected) and the held-out score against v0 and the baselines. Then `runs/ablation.json`: hiding the notes drops held-out from 0.431 to 0.216.
5. **Live (30 s):** `python3 oracle.py online` scores the 7.41f predictions against matches played since Sept 15.
6. **Close (10 s):** the same loop works for any live-service game: predict, check against reality, rewrite the rules.

## Fallback if no paid key works

A free OpenRouter account can call `:free` models, but only about 50 requests a day. Set `MODEL` and `REFLECT_MODEL` to a `:free` model and raise the batch size in `run()` to 40. A full run is then roughly 40 requests.

## After the hackathon

- Swap the hand-rolled loop for DSPy GEPA and compare.
- Use public-match data (bigger samples) and add a win-rate target.
- Run `online` daily on a schedule, and feed online errors into the next rewrite.
- Other games with public patch notes and match APIs (League of Legends, Deadlock).
