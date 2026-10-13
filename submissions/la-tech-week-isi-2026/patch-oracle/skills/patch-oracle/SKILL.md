---
name: patch-oracle
description: Predict how a Dota 2 balance patch shifts each hero's pro pick rate, score the predictions against real pro-match data, and improve the prediction playbook from eval results. Use when asked what a patch did or will do to the meta, whether a nerf or buff landed, or to run Patch Oracle's evals.
---

# Patch Oracle

All commands run from the repo root. `oracle.py` uses only the Python standard library.

## Answer "what did patch X do to hero Y?"

1. Run `python3 oracle.py data`. It caches patch notes and pro-match stats in `data/`.
2. Read `data/notes_<patch>.json` for the hero's changes and `data/stats_<patch>_{before,after}.json` for picks and wins. Pick rate = picks / matches.
3. Report the measured change with its sample size (matches in each window). Call a change significant only if the z-test in `oracle.py` (`z_label`) says so; otherwise say "no measurable change".

## Predict and evaluate

- `python3 oracle.py improve 5` reflects on mistakes from the train patch (7.38). It keeps a playbook edit only if it beats the best playbook in at least 80% of paired bootstrap resamples of the validation patch (7.39), and rejects edits that name a hero or run over 400 words. Then it scores the held-out patches (7.40, 7.41). It writes `playbooks/v*.md`, `playbooks/best.md`, `runs/offline.json` and `runs/test_predictions.json`. With `PO_LIVE=1` it writes to `runs/live/` instead.
- `python3 oracle.py online` scores `playbooks/best.md` on the live patch with freshly fetched matches and appends to `runs/online.json` (`runs/live/` with `PO_LIVE=1`).
- `python3 oracle.py ablate` scores `best.md` on the held-out patches with and without the patch notes and writes `runs/ablation.json`.
- `python3 oracle.py report` prints stored results.

## Rules

- Never state a pick-rate change that the data does not show. The model's `why` field is a hypothesis, not evidence.
- Quote the sample size with every number, and say "inconclusive" when the after-patch window has few matches (the online patch).
- Never edit `playbooks/best.md` by hand. It changes only through the eval gate.
