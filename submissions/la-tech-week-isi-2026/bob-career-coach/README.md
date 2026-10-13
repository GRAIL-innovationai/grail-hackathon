# Career Coach

A self-improving outreach agent that can't learn to lie.

## Team

| Name | GitHub |
|---|---|
| Aditi Bombe | adi05b |
| George Yu | yjoechuen |
| Paul Jiang | Bingxi-Jiang |
| Shalonda Mitchell | shalondam7-ctrl |

## Summary

Career Coach writes LinkedIn outreach for a new-grad candidate and improves itself by recursive self-improvement (RSI). Here, RSI means one thing: an optimizer rewrites the generator's prompt using feedback from simulated personas (CEOs, recruiters and engineers, each with their own priorities and pet peeves). The prompt is the artifact that improves; the model weights never change. A fabrication linter acts as a hard constraint: any number, tool or proper noun that is not in the candidate's resume zeroes that iteration's score, so the loop cannot learn to win by inventing claims. The optimizer only sees train personas. Results are reported on held-out test personas to show generalization. Every score comes from a simulated reward model (an LLM playing a persona), so the numbers measure generalization to unseen simulated readers, not real recruiter response rates.

## How to run

Live site: **https://career-coach-three-theta.vercel.app** (backend served from a laptop via a Cloudflare tunnel during the hackathon; may be offline later). Local demo: http://localhost:3000 with the backend on :8000.

A saved live run is in docs/demo-run.json

```bash
git clone https://github.com/adi05b/bob-academic-coach.git && cd bob-academic-coach
```

**Backend** (Python 3.11, run from the repo root):

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env        # set OPENROUTER_API_KEY for live LLM calls
uvicorn backend.main:app --reload --port 8000
```

**Frontend** (in a second terminal, then open http://localhost:3000):

```bash
cd frontend && npm install && npm run dev
```

**Tests:** run `pytest` from the repo root. It covers the linter, backend API, and Agent B dataset generation.

**Mock mode:** if `OPENROUTER_API_KEY` is empty, every LLM call returns a fixture from `backend/mock/` and nothing raises. Click **Use sample resume**, pick a job and hit **Run**. Over 4 iterations the score goes 0.00 → 0.40 → 0.63 → 0.87: iteration 1 fabricates "Kafka" and "10x", so the linter zeroes it, and the held-out reward goes 0.07 → 0.80. The fixtures are written for the sample candidate. A different resume in mock mode fails the linter, which is correct behavior. Set the key (and optionally `BOB_MODEL`) in `.env` for live runs. See [docs/DESIGN.md](docs/DESIGN.md) for the loop, contracts, and who owns which file.

**Demo:** the live Vercel URL only works when its `NEXT_PUBLIC_API_URL` points at a backend the viewer's browser can reach. To share it, expose your local backend publicly (for example `cloudflared tunnel --url http://localhost:8000`), set that URL as `NEXT_PUBLIC_API_URL` in the Vercel project (`cd frontend && npx vercel env add NEXT_PUBLIC_API_URL production`), and redeploy (`npx vercel --prod`). The variable is baked in at build time, so the redeploy is required. Otherwise, run the frontend and backend locally as above.

### Agent B: synthetic world (`data/synthetic/`)

Expanded dataset for multi-agent integration (companies, hiring personas, jobs, grounded profiles):

- **8 companies**, **16 contacts**, **100 jobs**, **9 candidates** (3/3/3 train/val/test)
- Ground-truth **`profile`** per candidate; **`match_labels.jsonl`** for job fit
- Regenerate: `pip install -e ".[dev]"` then `python -m data.generate`

Handoff for Agents C and D: [DATA_CONTRACT.md](DATA_CONTRACT.md). Legacy sample fixtures for the app remain in `data/jobs.json`, `data/personas.json`, `data/resumes.json`.

### Agent D: RSI prototype (`agent_d/`)

Workshop-style `tailor_resume` program evolution (separate from the backend outreach-prompt RSI). Run `python agent_d/run_rsi.py --baseline-only` from the repo root.

### Agent C: grounded career intelligence (`career_coach/`)

Independent PDF/text parsing, explainable matching, and a reusable local outreach
generator with candidate claim provenance. Run `python -m career_coach demo` for
the explicitly temporary smoke-test fixture. See [Agent C's integration notes](docs/AGENT_C_HANDOFF.md)
for Python/JSON interfaces and adapters for the shared backend and B's dataset.
