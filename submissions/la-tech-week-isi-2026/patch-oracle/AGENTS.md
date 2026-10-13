# Agent instructions

Patch Oracle predicts how a Dota 2 balance patch shifts each hero's **pro pick rate** (up / down / flat). It scores itself against real pro-match data and rewrites its own playbook through an eval gate. Read `MEMORY.md` for why things are the way they are, and `PLAN.md` for current status.

## Layout

- `oracle.py`: the whole system (data fetch, labels, prediction, scoring, self-improvement loop, online eval).
- `test_oracle.py`: offline checks for labels and scoring. It needs no network or key.
- `playbooks/`: `v0.md` is the human seed. `v1..vN.md` are model rewrites, and `best.md` is the version that passed the gate.
- `data/`: cached patch notes and pro-match stats. They're committed so evals rerun without hitting the data APIs.
- `runs/`: eval results (`offline.json`, `online.json`, `ablation.json`, prediction dumps). `runs/live/` (gitignored) holds demo-page runs.
- `skills/patch-oracle/SKILL.md`: the skill for ApexClaw/OpenClaw/Claude Code users.

## Commands

```bash
python3 test_oracle.py       # run before every commit
python3 oracle.py report     # stored results, no key
python3 oracle.py data       # fetch/cache data, print label balance
python3 oracle.py improve 3  # needs OPENROUTER_API_KEY in .env (~$0.20)
python3 oracle.py online     # needs key; re-fetches live matches
python3 oracle.py ablate     # needs key (~$0.02); held-out with notes hidden
```

## Rules

- Use the Python standard library only. Don't add dependencies.
- The LLM only predicts and rewrites the playbook. Counting, statistics and scoring stay in code.
- Never commit `.env`. Keep spend under `BUDGET_USD` and use cheap models. The OpenRouter balance is small.
- Use only free data sources (OpenDota, the Valve datafeed). Don't add paid tools.
- `playbooks/best.md` changes only through `improve`, never by hand.
- Don't delete `data/`. Labels must stay reproducible.

## Submission

Event `la-tech-week-isi-2026`, team slug `patch-oracle`. Submit with https://raw.githubusercontent.com/GRAIL-innovationai/grail-hackathon/main/skills/grail-hackathon-submit/SKILL.md
