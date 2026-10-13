# Patch Oracle

An agent that reads Dota 2 patch notes, predicts how each change will shift the pro meta, checks itself against real match data, and rewrites its own playbook when the evals say it was wrong.

## Team

**Team name:** Patch Oracle

| Name | GitHub |
|---|---|
| Thomas Cantuti | @ThomasCantuti |

## Summary

Game studios ship balance patches and then wait weeks to find out whether the nerfs landed. Patch Oracle predicts it from the notes alone. For each hero changed in a patch it predicts whether the hero's **pro pick rate goes up, down or stays flat**. The ground truth is not an LLM's opinion: it comes from a two-proportion z-test on thousands of real pro matches from the OpenDota explorer.

The model follows a **playbook**, a short skill file of rules for reading patch notes. The playbook improves itself in an eval-gated loop:

1. **Train (7.38):** the playbook predicts every changed hero. Code scores the predictions with macro-F1 and breaks the errors down by how popular each hero was before the patch.
2. **Reflect:** a second model reads the mistakes, then makes a *small edit* to the playbook (at most 3 rules), the way GEPA mutates prompts. Rewrites that name a hero, or that run over 400 words, are rejected in code, so the rules have to generalise instead of memorising.
3. **Gate (validation, 7.39):** the edit is kept only if it beats the current best playbook in at least 80% of 1,000 paired bootstrap resamples of the 7.39 heroes, a patch the reflector never saw. A plain "the score went up" would accept noise: with 110 heroes, macro-F1 moves by about 0.04 from sampling alone. Every rejected edit is fed back with the reason, so the next attempt tries something else. Every version is saved in `playbooks/`.
4. **Held-out test (7.40, 7.41):** the seed playbook and the best one are scored on patches the loop never touched. Two baselines are reported: always guessing the most common answer, and a no-LLM **popularity rule** (popular heroes drop, unpopular heroes rise, i.e. regression to the mean).
5. **Online eval:** the best playbook predicts the live patch (7.41f, released 2026-09-15). Every `online` run re-fetches the pro matches played since, so the score updates as new games arrive (`runs/online.json`).
6. **Ablation:** `ablate` scores the best playbook on the held-out patches again with the patch notes hidden, to check that the model really reads them.

The LLMs only predict and rewrite the playbook. Code does all the counting, statistics and scoring, so every number in `runs/` can be reproduced.

## Results

From the recorded run on 2026-10-13: Claude Haiku 5.5 predicts, Claude Sonnet 5.5 reflects, and 6 rounds cost $0.39. Scores are macro-F1 over up/down/flat, where higher is better.

| | Gate patch 7.39 (110 heroes) | Held-out 7.40 + 7.41 (243 heroes) | Live patch 7.41f (35 heroes, 502 matches) |
|---|---|---|---|
| Majority guess | 0.220 | 0.197 | 0.226 |
| Popularity rule (no LLM) | 0.424 | 0.361 | 0.291 |
| Playbook v0 (human seed) | 0.461 | 0.295 | — |
| Best playbook (v3) | **0.537** | **0.395** | **0.516** |

The gate kept v1, v2 and v3, and rejected v4, v5 and v6. Compare [`playbooks/v0.md`](playbooks/v0.md) with [`playbooks/best.md`](playbooks/best.md) to see what the loop learned on its own. This run used the earlier gate (any increase) and had no word cap. Under today's gate, v3 (444 words) would have been rejected on length.

**Ablation with the current defaults** (Gemma 4 31B predicts with `best.md`, `oracle.py ablate`, $0.02):

| Held-out 7.40 + 7.41 (243 heroes) | macro-F1 |
|---|---|
| Best playbook, patch notes shown | **0.431** |
| Best playbook, patch notes hidden | 0.216 |
| Popularity rule (no LLM) | 0.361 |

Hiding the notes halves the score, so the model reads them. Notes help in 100% of paired resamples, and the playbook beats the popularity rule in 99%. A second run reproduced 0.431 exactly, because every call now uses a fixed seed and the same provider. Gemma 4's training data ends in January 2025, before every patch scored here, so it cannot have memorised the outcomes.

**Episodic memory** (`oracle.py memory`, $0.03): each held-out hero also gets the 4 most similar past changes from 7.38 and 7.39 (word overlap) with their measured outcomes. Held-out macro-F1 is 0.433 without memory and 0.427 with it. Memory wins only 36% of paired resamples, so there's no clear gain yet from simple retrieval. Better retrieval (by change type and popularity tier) is the next experiment.

**What we learned:**
- **The self-improvement carries over to patches the loop never saw.** Held-out macro-F1 rose from 0.295 to 0.395 (+0.10), beating the no-LLM popularity rule (0.361).
- **Giving the model the hero's popularity rank mattered.** In the previous run (`MEMORY.md`), the model only saw the raw pick rate. The same loop then gained just +0.03 held-out and stayed below the popularity rule.
- **On the small, targeted live patch, reading the notes wins clearly:** 0.516 against 0.291.
- **Caveats:**
  - The recorded run accepted steps as small as +0.010, which is within sampling noise at 110 heroes. The gate now requires an 80% bootstrap win rate. In a Gemma rehearsal it rejected both rewrites, which won only 0.8% and 1.2% of resamples.
  - The recorded run's predictor (Haiku 5.5) sees hero names and may know the 2025–26 meta. The Gemma ablation above avoids this, because every patch came out after the model's training cutoff.

Raw results: [`runs/offline.json`](runs/offline.json), [`runs/online.json`](runs/online.json), [`runs/test_predictions.json`](runs/test_predictions.json), [`runs/online_predictions.json`](runs/online_predictions.json), [`runs/ablation.json`](runs/ablation.json).

## How to run

Python 3.10+ and the standard library only. Patch notes and match stats are cached in `data/`, so offline evals do not hit the data APIs again.

```bash
python3 oracle.py report     # stored results, no API key needed
python3 oracle.py data       # fetch any missing patch notes + pro-match stats into data/, show label balance

echo 'OPENROUTER_API_KEY=sk-or-...' > .env
python3 oracle.py improve 5  # offline evals + 5 self-improvement rounds (~$0.10 with the defaults, ~3 min)
python3 oracle.py online     # online eval on the live patch
python3 oracle.py ablate     # held-out with the patch notes hidden: does the model read them?
python3 oracle.py memory     # held-out with similar past cases and their real outcomes in the prompt
python3 test_oracle.py       # offline checks for labels, scoring and the hero-name guard
```

**Live demo page.** Run `python3 serve.py` and open http://localhost:8000/ui/dist/. The page explains each step with diagrams and shows the recorded results and the ablation. Its build is committed, so no npm is needed to run it.
- **Run it live** starts a real 2-round `improve` run. Predictions stream in as they're scored against real matches, and the scores and the playbook update as each gate decides. It writes to `runs/live/`, so the recorded results stay untouched.
- **Check today's patch** runs the online eval on 7.41f, also into `runs/live/`.
- **Replay recorded run** plays back `runs/recorded.jsonl` without a key.

To rebuild the page after editing `ui/src`: `cd ui && npm install && npm run build`.

Optional `.env` settings are `MODEL` (default `google/gemma-4-31b-it`), `REFLECT_MODEL` (default `anthropic/claude-haiku-5.5`) and `BUDGET_USD` (hard spend cap per command, default 1.0).

**Use it as an agent skill.** [`skills/patch-oracle/SKILL.md`](skills/patch-oracle/SKILL.md) works in ApexClaw/OpenClaw and Claude Code.

## Tech stack

Python standard library, OpenRouter (by default Gemma 4 31B predicts and Claude Haiku 5.5 reflects; the recorded run used Haiku 5.5 to predict and Sonnet 5.5 to reflect), the OpenDota explorer (pro-match SQL) and Valve's Dota 2 patch-notes datafeed. The demo page is React 19 + Motion, built with Vite, and its display font is bundled so it works offline. The improvement loop is a hand-rolled version of reflective prompt evolution, the idea behind DSPy's GEPA optimizer.

**Limits:**
- Only pro matches are covered, because the explorer has no public-match history.
- Major-patch windows include their letter patches.
- Pick rate reflects pro teams' choices, not raw hero strength.

## Other games

Only the data layer knows about Dota. Three functions in `oracle.py` turn a game into the same shape:
- `patches()`: release time of each patch, which sets the before and after windows.
- `notes(patch)`: the change lines for each changed character.
- `stats(t0, t1)`: picks and wins per character in a time window, plus the total match count.

The z-test labels, prediction, scoring, baselines, reflection, gate and held-out and online evals all run on that shape unchanged. The rest of a port is the game name in the two prompts and the list of names for the leak guard. What blocks a port is data: you need usage counts from *before and after* each balance change, or there's no ground truth.

| Game | Balance notes | Usage before and after a patch | Status |
|---|---|---|---|
| Deadlock | Official changelog posts | [deadlock-api.com](https://api.deadlock-api.com/docs): free, no key, matches and wins per hero for any time window | Ready to port |
| League of Legends | Official patch notes | Riot match API, needs a free rate-limited key | Possible with a key |
| Clash Royale | Monthly balance posts | Official API battle logs include decks, but only recent battles and only with a key tied to your IP | Forward only: log top players' decks daily, then score the next balance update |
| Clash of Clans | Balance posts on the Supercell blog | No free history of troop usage. The official API needs a key tied to your IP and has no historical army data | Blocked on data. Same forward-only plan once a logger exists |

## License

MIT, the repo default.
