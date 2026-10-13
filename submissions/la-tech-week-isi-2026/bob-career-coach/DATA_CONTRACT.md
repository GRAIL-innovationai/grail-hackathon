# Agent B data contract

Synthetic world for Agents C and D. Regenerate with `python -m data.generate` (also refreshes app fixtures below).

## App fixtures (backend + UI)

The running FastAPI app loads **`data/jobs.json`**, **`data/personas.json`**, and **`data/resumes.json`** (shapes in `backend/schemas.py`). These are **exported** from `data/synthetic/` on each generate run via `data/export_app.py`. The UI does not read `data/synthetic/` directly.

## Files (`data/synthetic/`)

| File | Owner | Purpose |
|------|-------|---------|
| `companies.json` | B | Fictional employers (`company_id`, `name`, `kind`, `location`, `focus`) |
| `contacts.json` | B | Hiring personas (`contact_id`, `company_id`, `persona_role`, `priorities`, `communication_preference`, `response_likelihood`, `outcome_weights`, `job_ids`) |
| `jobs.json` | B | Postings (`job_id`, `company_id`, `contact_id`, `title`, `description`, `skills`, …) |
| `inputs.jsonl` | B | Candidates: `candidate_id`, `resume`, `blurb`, `profile` |
| `profiles.jsonl` | B | Same `profile` objects keyed by `candidate_id` |
| `match_labels.jsonl` | B | Per candidate, per-job `relevance`, `hard_reject`, `evidence_spans`, `forbidden_claims` (for matching + grounding) |
| `splits.json` | B | `train` / `val` / `test` candidate ids |
| `tasks.jsonl` | B → D | Optional resume-tailoring fixtures for Agent D RSI experiments |
| `labels.jsonl` | B → D | Scoring labels for `tasks.jsonl` |

## Ground truth (`profile`)

```json
{
  "name": "Ava Chen",
  "degree": {"level": "bs", "label": "B.S.", "field": "Computer Science"},
  "institution": "Cedar Hill College",
  "skills": [{"id": "pytorch", "truthful_phrases": ["PyTorch", "deep learning frameworks such as PyTorch", ...]}]
}
```

Agent C outreach and any resume edits must only use facts supported by `profile` (and the resume derived from it).

## Agent C — outreach generation

Use `data.load.build_outreach_example(candidate_id, job_id)` to get:

- `resume`, `blurb`, `profile`
- `job`, `contact`, `company`

Generate a message with `contact` persona fields in the prompt. Use `match_labels.jsonl` to rank jobs or filter hard rejects.

## Agent D — simulation + RSI

- **Outreach RSI (product):** simulate replies using `contact.outcome_weights` and `response_likelihood`; improve Agent C’s **message prompt** (not implemented here yet).
- **Resume-tailor RSI (prototype):** `agent_d/` uses `tasks.jsonl` + `labels.jsonl` and `build_tailor_batch()`.

## Environment

Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` for LLM calls. `.env` is gitignored.
