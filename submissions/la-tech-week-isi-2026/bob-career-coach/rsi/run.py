"""Orchestration entry point: build examples, run the RSI loop, write results for Agent A.

Offline demo (no API key, uses TEMPORARY fixtures for Agents B and C):
    python -m rsi.run --out results

Real components:
    python -m rsi.run --personas B.json --profiles C.json --jobs jobs.json \
        --generator agent_c.generator:generate_message --improver rule --out results
LLM mode (needs `pip install anthropic` and ANTHROPIC_API_KEY):
    python -m rsi.run --generator llm --improver llm --out results
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .contracts import CRITERIA, Example, Persona, load_callable, load_json
from .generators import FIXTURE_GENERATOR_LABEL, LLMGenerator, fixture_generate
from .improvers import LLMImprover, RuleImprover
from .optimizer import OptimizerConfig, RSIOptimizer
from .simulator import RubricJudge

BASELINE_INSTRUCTIONS = (
    "Write a short LinkedIn-style outreach message from the candidate to the hiring contact about the job. "
    "Be polite and express interest."
)
FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
SCHEMA_VERSION = "1.0"


def _unwrap(data: Any, key: str) -> List[Dict[str, Any]]:
    return data[key] if isinstance(data, dict) and key in data else data


def build_examples(profiles: List[Dict[str, Any]], personas: List[Persona], jobs: List[Dict[str, Any]],
                   per_profile: int = 4) -> List[Example]:
    """Pair each profile with the persona/job combinations the app would recommend: the jobs whose
    required skills overlap the candidate's skills most (ties broken by job id)."""
    jobs_by_id = {j["id"]: j for j in jobs}
    pairs = []
    for p in personas:
        job = jobs_by_id.get(p.job_id) or next((j for j in jobs if j.get("company") == p.company), None)
        if job:
            pairs.append((p, job))
    examples: List[Example] = []
    for prof in profiles:
        have = {s.lower() for s in prof.get("skills", [])}
        ranked = sorted(pairs, key=lambda pj: (-len(have & {s.lower() for s in pj[1].get("required_skills", [])}), pj[1]["id"]))
        for persona, job in ranked[:per_profile]:
            examples.append(Example(id=f"{prof['id']}__{persona.id}", profile=prof, persona=persona, job=job))
    return examples


def run_optimization(*, profiles: List[Dict[str, Any]], personas: List[Dict[str, Any]], jobs: List[Dict[str, Any]],
                     generator, generator_label: str, improver, improver_label: str,
                     baseline: str = BASELINE_INSTRUCTIONS, config: Optional[OptimizerConfig] = None,
                     per_profile: int = 4, is_fixture_run: bool = False) -> Dict[str, Any]:
    cfg = config or OptimizerConfig()
    persona_objs = [Persona.from_dict(p) for p in personas]
    examples = build_examples(profiles, persona_objs, jobs, per_profile)
    opt = RSIOptimizer(generator, improver, RubricJudge(), cfg)
    result = opt.run(baseline, examples)
    splits = {k: [e for e in examples if e.id in set(v["example_ids"])] for k, v in result["splits"].items()}
    assumed = {p.id: p.assumed_fields for p in persona_objs if p.assumed_fields}
    caveats = [
        "All outcomes are SIMULATED from a transparent rubric and persona parameters. They are not evidence of real-world recruiter response rates.",
        "Quality (rubric score) is what the optimizer maximizes; outcomes are probabilistic and a single non-response is not treated as proof of a poor message.",
        "Only the generator INSTRUCTIONS were optimized. Train feedback drove revisions, dev gated acceptance, test was held out.",
        "Held-out sample is small; read the bootstrap confidence intervals, not just the means.",
    ]
    if is_fixture_run:
        caveats.insert(0, "FIXTURE RUN: personas, profiles, jobs and the generator are temporary stand-ins. The offline generator "
                          "reacts to the same directive sentences the rule improver writes, so improvements are guaranteed by construction. "
                          "This demonstrates the loop mechanics, not how a real LLM generator behaves.")
    if assumed:
        caveats.append(f"Persona fields defaulted because they were missing: {assumed}")
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mode": "offline_fixture" if is_fixture_run else "integrated",
        "components": {"generator": generator_label, "improver": improver_label, "judge": RubricJudge.name},
        "config": {"max_iters": cfg.max_iters, "min_delta": cfg.min_delta, "patience": cfg.patience,
                   "candidates_per_iter": cfg.candidates_per_iter, "seed": cfg.seed, "per_profile": per_profile},
        "scoring": {
            "criteria": CRITERIA,
            "default_weights": persona_objs[0].weights if persona_objs else {},
            "grounding_penalty": "0.15 per ungrounded claim, capped at 0.45, subtracted from the weighted rubric score",
            "outcome_values": {"no_response": 0.0, "passive_accept": 0.25, "conversation": 0.7, "strong_interest": 1.0},
            "objective": "mean rubric quality (simulated outcomes reported separately)",
        },
        **result,
        "examples": opt.example_comparisons(baseline, result["optimized_instructions"], splits),
        "caveats": caveats,
    }


# ---------------- markdown report ----------------

def render_report(r: Dict[str, Any]) -> str:
    ev = r["evaluation"]["test"]
    b, o, d = ev["baseline"], ev["optimized"], ev["delta"]
    pct = lambda x: f"{x:.0%}"  # noqa: E731
    L: List[str] = ["# RSI results: baseline vs optimized generator instructions", ""]
    for c in r["caveats"][:1] if r["mode"] == "offline_fixture" else []:
        L += [f"> **{c}**", ""]
    L += ["## What was optimized and how it was scored", "",
          "The optimized artifact is the **generator instructions** (the prompt), not any single message. "
          "Simulated hiring contacts score each message on 8 weighted criteria "
          f"({', '.join(r['scoring']['criteria'])}) minus a grounding penalty for claims not in the resume. "
          "Outcomes (no response / passive accept / conversation / strong interest) are simulated from that quality and each "
          "contact's reply propensity. The optimizer maximizes quality, so a quiet contact does not count against a message.", "",
          "## Instructions", "", "**Baseline**", "", "```", r["baseline_instructions"], "```", "",
          "**Optimized**", "", "```", r["optimized_instructions"], "```", "",
          f"## Iteration history (stop reason: {r['stop_reason']})", "",
          "| Iter | Candidates (dev quality) | Selected | Accepted | Dev before → after |", "|---|---|---|---|---|"]
    for it in r["iterations"]:
        cs = ", ".join(f"{c['label']} {c['dev_quality']:.3f}" if c["valid"] else f"{c['label']} (invalid)" for c in it["candidates"]) or "none"
        L.append(f"| {it['iteration']} | {cs} | {it.get('selected') or '-'} | {'yes' if it['accepted'] else 'no'} | "
                 f"{it['dev_quality_before']:.3f} → {it['dev_quality_after']:.3f} |")
    ci = ev["ci95_delta_quality"]
    L += ["", f"## Held-out test results (n={ev['n']} examples, candidates never seen during optimization)", "",
          "| Metric | Baseline | Optimized | Delta |", "|---|---|---|---|",
          f"| Mean rubric quality | {b['mean_quality']:.3f} | {o['mean_quality']:.3f} | {d['mean_quality']:+.3f} (95% CI {ci['low']:+.3f} to {ci['high']:+.3f}) |",
          f"| Mean expected outcome (0-1) | {b['mean_expected_outcome']:.3f} | {o['mean_expected_outcome']:.3f} | {d['mean_expected_outcome']:+.3f} |",
          f"| Simulated reply probability | {pct(b['reply_probability'])} | {pct(o['reply_probability'])} | {d['reply_probability']*100:+.1f} pts |",
          f"| Messages with ungrounded claims | {pct(b['grounding_violation_rate'])} | {pct(o['grounding_violation_rate'])} | {d['grounding_violation_rate']*100:+.1f} pts |",
          f"| Mean word count | {b['mean_word_count']:.0f} | {o['mean_word_count']:.0f} | |", "",
          f"Optimized beat baseline on {pct(ev['win_rate_quality'])} of test examples (ties: {pct(ev['tie_rate_quality'])}).", "",
          "| Criterion | Baseline | Optimized |", "|---|---|---|"]
    for c in r["scoring"]["criteria"]:
        L.append(f"| {c} | {b['criterion_means'][c]:.2f} | {o['criterion_means'][c]:.2f} |")
    tests = sorted((e for e in r["examples"] if e["split"] == "test"), key=lambda e: -e["delta_quality"])
    for label, e in (("Largest test improvement", tests[0]), ("Smallest test improvement", tests[-1])):
        L += ["", f"## {label}: {e['candidate']} → {e['persona']} ({e['persona_title']}, {e['company']})", ""]
        for side in ("baseline", "optimized"):
            ev_ = e[side]["evaluation"]
            L += [f"**{side.capitalize()}** (quality {ev_['quality']:.2f}, simulated outcome: {ev_['sampled_outcome']})", "",
                  *("> " + ln for ln in e[side]["message"].splitlines()), ""]
            if ev_["feedback"]:
                L += ["Simulated feedback:", *(f"- {f['comment']}" for f in ev_["feedback"][:3]), ""]
            if ev_["nonresponse_attribution"]:
                L += [f"Non-response read: *{ev_['nonresponse_attribution']['verdict']}*. {ev_['nonresponse_attribution']['explanation']}", ""]
    L += ["## Caveats", "", *(f"- {c}" for c in r["caveats"]), ""]
    return "\n".join(L)


# ---------------- CLI ----------------

def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Run the RSI prompt-optimization demo.")
    ap.add_argument("--personas", help="JSON from Agent B (default: TEMPORARY fixture)")
    ap.add_argument("--profiles", help="JSON of candidate profiles (default: TEMPORARY fixture)")
    ap.add_argument("--jobs", help="JSON of jobs (default: TEMPORARY fixture)")
    ap.add_argument("--generator", default="fixture", help="'fixture' (default), 'llm', or 'module:function' (Agent C)")
    ap.add_argument("--improver", default="rule", choices=["rule", "llm"])
    ap.add_argument("--baseline", help="Path to a text file with baseline instructions")
    ap.add_argument("--max-iters", type=int, default=8)
    ap.add_argument("--candidates", type=int, default=3)
    ap.add_argument("--min-delta", type=float, default=0.005)
    ap.add_argument("--per-profile", type=int, default=4)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="results")
    a = ap.parse_args(argv)

    fixture_data = not (a.personas and a.profiles and a.jobs)
    personas = _unwrap(load_json(a.personas or os.path.join(FIXTURE_DIR, "personas.json")), "personas")
    profiles = _unwrap(load_json(a.profiles or os.path.join(FIXTURE_DIR, "profiles.json")), "profiles")
    jobs = _unwrap(load_json(a.jobs or os.path.join(FIXTURE_DIR, "jobs.json")), "jobs")

    if a.generator == "fixture":
        gen, gen_label = fixture_generate, FIXTURE_GENERATOR_LABEL
    elif a.generator == "llm":
        gen, gen_label = LLMGenerator(), "llm_generator"
    else:
        gen, gen_label = load_callable(a.generator), a.generator
    improver = LLMImprover() if a.improver == "llm" else RuleImprover()
    baseline = open(a.baseline, encoding="utf-8").read().strip() if a.baseline else BASELINE_INSTRUCTIONS

    result = run_optimization(
        profiles=profiles, personas=personas, jobs=jobs, generator=gen, generator_label=gen_label,
        improver=improver, improver_label=improver.name, baseline=baseline,
        config=OptimizerConfig(max_iters=a.max_iters, min_delta=a.min_delta, candidates_per_iter=a.candidates, seed=a.seed),
        per_profile=a.per_profile, is_fixture_run=fixture_data or a.generator == "fixture",
    )
    os.makedirs(a.out, exist_ok=True)
    jp, mp = os.path.join(a.out, "rsi_results.json"), os.path.join(a.out, "rsi_report.md")
    with open(jp, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    with open(mp, "w", encoding="utf-8") as fh:
        fh.write(render_report(result))
    t = result["evaluation"]["test"]
    print(f"wrote {jp} and {mp}")
    print(f"held-out test (n={t['n']}): quality {t['baseline']['mean_quality']:.3f} -> {t['optimized']['mean_quality']:.3f} "
          f"({t['delta']['mean_quality']:+.3f}, 95% CI {t['ci95_delta_quality']['low']:+.3f}..{t['ci95_delta_quality']['high']:+.3f}); "
          f"stop: {result['stop_reason']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
