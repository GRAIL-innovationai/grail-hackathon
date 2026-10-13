# Agent D: persona simulation + RSI loop

Closed-loop demo that tests whether the **instructions used to generate outreach messages** improve
under simulated hiring-contact feedback. The optimized artifact is the generator *prompt*, never a single message.

```
baseline instructions ──► generate (Agent C) ──► simulated contacts score (Agent B personas) ──► feedback
        ▲                                                                                          │
        └────────── improver revises the INSTRUCTIONS (train feedback only), dev set gates it ◄────┘
final: baseline vs optimized on held-out TEST candidates
```

## Run it

Stdlib only for the offline demo (Python 3.9+). From the repo root:

```bash
python3 -m rsi.run --out results                         # offline demo with TEMPORARY fixtures
python3 -m unittest discover -s rsi/tests -t .           # 22 tests, no API key
```

Real components (use these once B and C are ready):

```bash
python3 -m rsi.run \
  --personas path/to/b_personas.json --profiles path/to/profiles.json --jobs path/to/jobs.json \
  --generator agent_c.module:generate_message --improver rule --out results
# optional LLM mode: pip install anthropic; export ANTHROPIC_API_KEY=...; RSI_MODEL defaults to claude-sonnet-5-5
python3 -m rsi.run --generator llm --improver llm --out results
```

Programmatic: `rsi.run.run_optimization(profiles=..., personas=..., jobs=..., generator=fn, generator_label=..., improver=..., improver_label=...)` returns the results dict.

Outputs: `results/rsi_results.json` (for Agent A) and `results/rsi_report.md` (human-readable). **The committed
files in `results/` come from the fixture run; they are sample output, not production results.**

## Contracts (please confirm or tell me what differs)

**Agent C -> D, message generator.** A Python callable:
`generate_message(instructions: str, profile: dict, contact: dict, job: dict) -> str | {"message": str}`
- `instructions` is the optimized prompt text, to be used as the system prompt (or equivalent).
- `profile` is the resume-derived dict. Grounding is checked against *everything* in it.
- Please enforce grounding in the generator itself. The grounding check here is an evaluation guard that penalizes violations.

**Agent B -> D, personas** (`{"personas": [...]}` or a bare list). Fields I read (aliases accepted; defaults are
applied and reported in `caveats` if missing):

| field | meaning | default if missing |
|---|---|---|
| `id`, `name`, `title`, `company` | identity (`persona_id`, `full_name`, `role`, `organization` also accepted) | name/title generic |
| `job_id` | links to a job; otherwise matched by `company` | persona skipped if no job found |
| `tone` | `formal` / `casual` / `direct` (`communication_style` accepted) | `direct` |
| `cares_about` | list of priorities/keywords (`priorities`, `interests`) | `[]` (persona_hook always scores 0) |
| `pet_peeves` | list, informational | `[]` |
| `preferred_max_words` | longest message this contact will read | 90 |
| `base_response_rate` | 0-1 propensity to reply to an average message (models busyness) | 0.3 |
| `evaluation_weights` | optional per-criterion weights over the 8 criteria | defaults |

The generator only receives `id, name, title, company, tone, cares_about, bio`. Simulator-only fields (response rate, weights) are hidden from it.

**Jobs:** `{"id", "title", "company", "required_skills": [...], "description"}`. **Profiles:** `{"id", "name", "school", "major", "year", "skills": [...], "experience": [{title, org, bullets}], "projects": [{name, description}]}` (extra fields are fine; I flatten the whole dict for grounding).

**Agent D -> A, `results/rsi_results.json`** (`schema_version` "1.0"):
- `mode` (`offline_fixture` | `integrated`), `components`, `config`, `scoring`, `caveats[]` (display these)
- `baseline_instructions`, `optimized_instructions`
- `iterations[]`: `iteration`, `instructions_before/after`, `instructions_diff[]`, `feedback_summary` (criterion means, weighted loss, worst examples), `candidates[]` (`label`, `rationale`, `instructions`, `valid`, `train_quality`, `dev_quality`, `dev_delta`), `selected`, `accepted`, `decision_reason`, `dev_quality_before/after`
- `stop_reason`, `splits` (profile and example ids per split), `leakage_check`
- `evaluation.{train,dev,test}`: `baseline`/`optimized` aggregates (`mean_quality`, `mean_expected_outcome`, `outcome_distribution`, `reply_probability`, `grounding_violation_rate`, `criterion_means`, `mean_word_count`), `delta`, `ci95_delta_quality`, `win_rate_quality`. **Headline numbers should come from `evaluation.test`.**
- `examples[]`: per pairing, `split`, candidate/persona/job info, and `baseline` / `optimized` each with `message` and `evaluation` (`quality`, `criteria`, `violations`, `outcome_probs`, `sampled_outcome`, `nonresponse_attribution`, `feedback[]`, `strengths[]`)

## How it is scored (all simulated)

- **Quality** (0-1) = persona-weighted rubric over `personalization, persona_hook, specificity, job_relevance, clear_ask, concision, no_boilerplate, tone_fit`, minus 0.15 per ungrounded claim (cap 0.45). Deterministic; code in `simulator.py`, `grounding.py`.
- **Outcome**: `no_response / passive_accept / conversation / strong_interest`, with probabilities from quality and the persona's `base_response_rate`. Reported as analytic probabilities plus one seeded sample per message for display.
- **Non-response is not blame.** The optimizer maximizes quality, not sampled replies. Each silent result carries a `nonresponse_attribution` (`likely_persona_unavailable` / `inconclusive` / `message_likely_contributed`).
- **No leakage.** Splits are by candidate profile (train/dev/test). Only train feedback reaches the improver, dev gates acceptance (`min_delta`), test is scored only for the final comparison. Candidates naming training people are rejected (overfitting guard). `leakage_check` records it.

## Assumptions and limits (read before presenting numbers)

1. **The fixture run proves mechanics, not model behavior.** The offline generator reacts to the same directive sentences the rule improver writes, so improvement is guaranteed by construction. The ~0.19 -> ~0.98 held-out jump says nothing about real LLMs. Run with Agent C's real generator for a meaningful result.
2. The rubric judge is keyword/regex based: transparent but gameable. The `RubricJudge.evaluate` interface is the swap point for an LLM judge.
3. Simulated outcomes are not evidence of real recruiter response rates.
4. The held-out set is small (8 examples in the fixture run); use the bootstrap CI.
5. `LLMGenerator` / `LLMImprover` are covered only by stubbed-client tests (no `anthropic` package or API access where this was built). Treat the first live run as untested.
6. Fixture personas, profiles and jobs are fictional and temporary: `rsi/fixtures/`.

## Files

`contracts.py` interfaces and adapters · `simulator.py` rubric, outcomes, feedback · `grounding.py` guard · `optimizer.py` loop, splits, comparison · `improvers.py` rule and LLM improvers · `generators.py` fixture and LLM generators · `directives.py` shared instruction sentences · `run.py` CLI and report · `tests/`
