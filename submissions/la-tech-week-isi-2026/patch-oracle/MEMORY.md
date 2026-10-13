# Memory

Decisions and constraints, with the reasons behind them. Newest entries go at the bottom of each section.

## Context

- GRAIL agentic AI hackathon, event `la-tech-week-isi-2026`. The final submission is due **2026-10-13 at 14:00 PT**.
- Rule change announced in person: teams of 1 are allowed. Thomas is submitting solo.
- **Judging:** a human and an AI judge pick the top 10 on novelty, innovation, technical ambition and how detailed the GitHub upload is. The AI judge tries to rerun the repo.
- **Final:** 5-minute live demo, no slides.
- **Submission:** a pull request to `GRAIL-innovationai/grail-hackathon` under `submissions/la-tech-week-isi-2026/patch-oracle/`, plus the Google form.

## Constraints

- Free tools only. The one paid exception is OpenRouter models, and that account has about $4 left. Use cheap models: Gemma 4 31B predicts ($0.09/M in, $0.34/M out) and Haiku 5.5 reflects ($0.10/$0.50). Sonnet 5.5 ($2/$10) is no longer used (2026-10-13), but the recorded run 4 stays as it is. Hard cap is `BUDGET_USD`.
- No dependencies beyond the Python standard library, so the AI judge can run it anywhere.

## Decisions

- **Idea:** dropped the first proposal (a paper claim verifier) as too generic. The user wanted a field like gaming. Chose Patch Oracle: the ground truth is real match data, not an LLM's opinion, and it supports offline and online evals.
- **Target is pick rate, not win rate:** pro samples (about 7–18k matches per patch) are too small to detect typical 1–3% win-rate shifts. Pick-rate shifts are large and significant.
- **Labels:** two-proportion z-test on picks/matches, before vs. after window, at 95%. The result is up, down or flat.
- **Pro matches only:** the OpenDota explorer's public-match tables didn't answer our queries.
- **Splits:** train on 7.38 (reflect on its errors), gate on 7.39 (validation), held-out test on 7.40 and 7.41, online on 7.41f (released 2026-09-15; its window keeps growing).
- **Improvement loop:** hand-rolled reflective prompt evolution (the idea behind DSPy's GEPA) instead of DSPy itself. It has no dependencies, every call is visible and capped, and it fit the time we had. A rewrite is accepted only if it beats the best playbook in at least 80% of paired bootstrap resamples on validation. Until 13:15 on 2026-10-13, any increase was accepted. Rewrites that name a hero are rejected to stop memorisation.
- **Kaggle:** considered and rejected. Its Dota datasets are from around 2015–2017 with no patch notes, and the held-out patches already test the predictions.

## Data facts (from `python3 oracle.py data`)

| Patch | Heroes changed | Pro matches after | up / down / flat |
|---|---|---|---|
| 7.38 | 126 | 7,360 | 49 / 57 / 20 |
| 7.39 | 110 | 17,862 | 54 / 44 / 12 |
| 7.40 | 117 | 7,828 | 45 / 51 / 21 |
| 7.41 | 126 | 8,414 | 53 / 51 / 22 |
| 7.41f | 35 | 499 (live) | 4 / 13 / 18 |

## Findings from runs (2026-10-13)

- **Run 1** (gate on train, $0.155): v1 raised train macro-F1 from 0.406 to 0.448, but held-out didn't move (0.361 vs 0.359). Gating on the same data the reflector learned from overfits, so we switched to a separate validation gate.
- **Popularity rule:** "heroes picked more than the patch median go down, the rest go up" scores 0.361 held-out macro-F1 with no LLM. That's the real bar, and it's now reported as a second baseline.
- **Eval noise:** the same playbook scored 0.302 and 0.365 on the same held-out set across runs (the model varies even at temperature 0). Single-run gains under about 0.05 are noise.
- **Run 2** (validation gate, full rewrites, $0.174): no edit beat v0 on validation. Rewrites are now small edits (at most 3 rules), the reflector runs at temperature 0.7, and rejected attempts are fed back.
- **Run 3** (small edits, 5 rounds, $0.34): gate 0.484 to 0.536 (kept v1, v2, v4). Held-out 0.318 to 0.348, still below the popularity rule (0.361). Live 7.41f scored 0.397.
- **Run 4** (adds the popularity rank, "more popular than X% of heroes", to the predictor input; 6 rounds, $0.39): gate 0.461 to 0.537 (kept v1, v2, v3). **Held-out 0.295 to 0.395, beating the popularity rule.** Live 7.41f scored 0.516 against 0.291 for the popularity rule. This is the recorded run (`runs/recorded.jsonl`).
- **Open concerns** (raised by a second Claude session reviewing the repo; resolved between 13:05 and 13:20, see below, except the budget overshoot, which is capped at about 8 in-flight calls of ~$0.001 each and not worth code): the gate accepts any increase, so steps of about +0.01 may be noise. The 300-word cap is only in the prompt (best.md is 444 words). The predictor sees hero names, which is a contamination risk, and no anonymised ablation has been run. The budget check can overshoot by up to 8 parallel calls.
- **Model swap** (2026-10-13 13:05): defaults are now Gemma 4 31B (predicts) and Haiku 5.5 (reflects) to drop Sonnet's cost. Smoke test on one 7.40 batch of 20 heroes with v0: Gemma parsed 20/20 and got 14/20 right for $0.0005, Haiku got 8/20 for $0.0015. Recorded numbers are still from Haiku + Sonnet.
- **Statistical gate and word cap** (2026-10-13 13:15): a rewrite is kept only if it beats the best playbook in at least 80% of paired bootstrap resamples of the validation heroes (`GATE`, `p_better`). Before, any increase passed: at n=110, macro-F1 has a sampling SD of about 0.043, and run 4's accepted steps (+0.041, +0.025, +0.010) were all under one SD. Playbooks over 400 words (`MAX_WORDS`) are rejected in code, and the reason is fed back to the reflector, as are hero-name rejections. Held-out results now include `test_p_better`: in run 4, best v3 beat the popularity rule in only 86% of resamples.
- **Contamination:** Gemma 4's pretraining cutoff is January 2025 (HF model card), and the earliest patch, 7.38, came out on 2025-02-18. With Gemma predicting, every label is after the model's cutoff. Run 4's predictor (Haiku 5.5) may have seen the 2025-26 meta. Anonymising hero names was dropped as a check, because the ability names in the notes identify the hero anyway.
- **Live demo isolation:** runs started from the demo page (`serve.py` sets `PO_LIVE=1`) write to `runs/live/` and never overwrite the recorded results. Since 13:20 this covers `online` too.
- **Less noise per call** (13:10): `llm()` sends seed 0, reasoning effort none, and a provider order of parasail/fp8 then deepinfra/fp8, with fallbacks. Otherwise OpenRouter routes each call to a random provider at fp4 to bf16. The ablation then reproduced 0.431 exactly on a second run.
- **Gemma rehearsal** (13:08, `improve 2` with Gemma + Haiku, $0.06): the new gate rejected both rewrites, which won only 0.8% and 1.2% of resamples.
- **Ablation** (13:20, `oracle.py ablate`, Gemma 4 31B + best.md, held-out n=243, $0.022): 0.431 with notes, 0.216 with notes hidden, popularity rule 0.361. Notes help in 100% of resamples, and it beats the popularity rule in 99%. This is the strongest evidence that the model reads the notes, and that it is post-cutoff.
- **Clash of Clans** (13:12): Thomas asked about a second game. There is no free history of troop usage before and after balance updates: the official API needs a key tied to your IP and has no army history, and the one meta site is behind a bot checkpoint. So there's no ground truth. Instead, the README has an "Other games" section, and Deadlock (deadlock-api.com, free, per-hero stats by time window) is the next port.
- **Episodic memory** (13:41, `oracle.py memory`, Gemma + best.md, held-out n=243, $0.03; Thomas asked whether context beats rules alone): the 4 most similar past changes from 7.38+7.39 (Jaccard word overlap) with measured outcomes go in the prompt. Memory off scored 0.433 and on 0.427; memory wins 36% of resamples, so there's no gain from bag-of-words retrieval. Memory only holds patches released before every held-out patch. Next: retrieve by change type and popularity tier, and add walk-forward memory (7.41 can use 7.40).
- **Hero-name guard:** "Tiny numeric buffs" was flagged as the hero Tiny. Hero names that are also English words are skipped (`WORDS` in `oracle.py`).

## Known issues

- 2026-10-13 12:20: the OpenRouter key returned `401 "User not found"`. It worked again by 12:39 with no change on our side.
