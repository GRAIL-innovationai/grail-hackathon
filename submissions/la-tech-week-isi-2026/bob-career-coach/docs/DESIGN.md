# Career Coach: design (one page)

**What it is.** An outreach agent for new grads whose generator prompt improves itself against simulated recipients, while a deterministic linter stops it from learning to make things up.

## The loop (`backend/rsi_optimizer.py::run_rsi`)

```
prompt_v0 (data/prompts/generator_v0.md)
  └─ for i in 1..n:
       message = generate(prompt, candidate, job, contact)       outreach_agent.py
       lint    = lint_message(message, candidate)                 lint.py      (no LLM)
       evals   = [evaluate(p, message) for p in TRAIN personas]   persona_evaluator.py
       score   = (0.5·mean(outcome_reward) + 0.5·mean(quality)) · lint.passed
       prompt  = optimize(prompt, message, evals, lint)           rewrites the PROMPT
  best = argmax score
  held-out: evaluate v0 message and best message on TEST personas (never fed back)
```

- **What improves:** the generator prompt (text). No fine-tuning, no weight updates.
- **Reward:** `no_response 0.0 · connection_accepted 0.2 · generic_reply 0.4 · meaningful_conversation 0.7 · interview_or_referral 1.0`. Quality is relevance (0–3), specificity (0–3), concise (0–2), and clear ask (0–2), summed and divided by 10.
- **Hard constraint:** the linter pulls numbers (`95%`, `2M`, `10x`, `$5k`), capitalised tokens, and ~60 tool names out of the message. Anything not found in the candidate's lines is `offending`, and the score is 0. The recipient's name, company and the job title are allowlisted; job requirements are not, because that is exactly where fabrication comes from. When lint fails, the optimizer appends a `- Never mention …` rule, and code carries that rule forward even if the LLM drops it.
- **Generalization:** 9 personas (3 CEO, 3 Recruiter, 3 Engineer). Six are train; three are test, one per role. The generator sees only the contact's name, role and company, never anyone's priorities.

## Contracts

All shapes live in `backend/schemas.py` (mirrored in `frontend/lib/types.ts`). They are frozen: change them together, in one PR.

## Mock mode

When `OPENROUTER_API_KEY` is empty, `llm.complete` serves `backend/mock/<skill_tag>.json`. Each fixture is a list of `{when: [substrings], response}`, and the last case whose substrings all appear in the prompt wins. That is how the four prompt versions map to four messages and to rising persona reactions. To add a case, append to the list.

## Who works where (Agents A–D, per ROLE_SEPARATION.md)

| Agent | Owns | Main handoff |
|---|---|---|
| A: Web experience & demo | `frontend/`, deployment (Vercel), `README.md` | one UI flow over everyone's real outputs |
| B: Synthetic data | `data/` (jobs, personas, resumes, train/test splits) | structured test data for C and D |
| C: Resume, matching & outreach | `backend/resume_parser.py`, `backend/job_matcher.py`, `backend/outreach_agent.py`, `data/prompts/` | candidate profile, ranked jobs, a reusable `generate()` |
| D: Persona simulation & RSI | `backend/persona_evaluator.py`, `backend/rsi_optimizer.py`, `backend/runs/` | the `Run` trace that A renders |

`backend/schemas.py` and `frontend/lib/types.ts` are the shared contract: they change together, in one PR.

## What it will not do

- **Send anything.** It drafts; a human copies and sends.
- **Scrape LinkedIn or anything else.** Jobs and personas are synthetic, in `data/`.
- **Claim real-world response rates.** Every reward comes from an LLM playing a persona.
- **Guess about the candidate.** If it isn't in a resume line, it can't be in the message.
