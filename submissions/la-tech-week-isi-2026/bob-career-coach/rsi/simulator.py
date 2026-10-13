"""Hiring-persona simulation: transparent scoring + simulated outcomes.

Two deliberately separate things:

1. QUALITY (what the message controls). A weighted rubric of 8 criteria, each in [0,1], judged
   from the persona's stated preferences, minus a penalty for ungrounded claims. Deterministic.
   The optimizer maximizes this.

2. OUTCOME (what happens next, simulated). P(outcome) depends on quality AND the persona's
   ``base_response_rate`` (busyness). A single "no_response" draw is therefore NOT treated as
   evidence of a bad message: each result carries a ``nonresponse_attribution`` that says whether
   silence is expected for a high-quality message to a low-propensity contact. Aggregates use
   analytic outcome probabilities, not noisy single draws.

All outcomes are simulated. They are not evidence of real-world recruiter response rates.
"""

from __future__ import annotations

import hashlib
import random
import re
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

from .contracts import CRITERIA, OUTCOME_VALUE, OUTCOMES, Example, profile_text
from .grounding import check_grounding

BOILERPLATE = [
    "i am writing to express", "passionate", "hard-working", "hardworking", "pick your brain",
    "great fit", "i hope this message finds you well", "to whom it may concern", "team player", "synergy",
]

LOW_FRICTION_ASK = re.compile(r"\b\d+[- ]minute\b|quick (?:call|chat)|\b15 minutes\b", re.I)
SOFT_ASK = re.compile(r"would you be open|could we|can we|happy to (?:chat|talk|connect)|let me know|appreciate the opportunity|hear back", re.I)

FEEDBACK_TEMPLATES = {
    "personalization": "It doesn't read as written for me or {company}. Use my name and my company.",
    "persona_hook": "Nothing connects to what my team cares about ({cares}).",
    "specificity": "No concrete project or result from your resume. Show me one specific thing you built or achieved.",
    "job_relevance": "It never ties your skills to what this job requires ({req}).",
    "clear_ask": "I can't tell what you want from me. Make one small, easy ask.",
    "concision": "Too long for me: {wc} words, and I'd read about {pref}.",
    "no_boilerplate": "This reads like a template (e.g. '{phrases}').",
    "tone_fit": "The greeting/sign-off doesn't match how I write ({tone}).",
}


@dataclass
class Evaluation:
    quality: float
    criteria: Dict[str, float]
    penalty: float
    violations: List[Dict[str, str]]
    outcome_probs: Dict[str, float]
    expected_outcome: float
    sampled_outcome: str
    nonresponse_attribution: Optional[Dict[str, str]]
    feedback: List[Dict[str, Any]]
    strengths: List[str]
    word_count: int
    persona_id: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _has(text: str, term: str) -> bool:
    return re.search(r"(?<![\w])" + re.escape(term.lower()) + r"(?![\w])", text) is not None


def score_criteria(message: str, ex: Example) -> Dict[str, float]:
    p, prof, job = ex.persona, ex.profile, ex.job
    low = message.lower()
    wc = len(message.split())
    ptxt = profile_text(prof)

    # personalization: name (0.4) + company (0.4) + role (0.2)
    name_in = _has(low, p.first_name)
    comp_in = _has(low, p.company) or _has(low, job.get("company", p.company))
    role_words = [w for w in re.findall(r"[a-z]+", p.title.lower()) if len(w) > 3]
    role_in = any(_has(low, w) for w in role_words)
    personalization = 0.4 * name_in + 0.4 * comp_in + 0.2 * role_in

    # persona_hook: how many of the contact's stated priorities are addressed
    hits = sum(1 for kw in p.cares_about if _has(low, kw))
    persona_hook = 0.0 if hits == 0 else (0.6 if hits == 1 else 1.0)

    # specificity: project names, employers, resume numbers, skills (half credit)
    hit_pts = 0.0
    for proj in prof.get("projects", []):
        if proj.get("name") and _has(low, proj["name"]):
            hit_pts += 1
    for e in prof.get("experience", []):
        if e.get("org") and _has(low, e["org"]):
            hit_pts += 1
    msg_nums = {m.group(1) for m in re.finditer(r"(\d+)(?!\d)(?!\s*\+?\s*(?:years?|yrs?))", low)}
    prof_nums = set(re.findall(r"\d+", ptxt))
    if any(n in prof_nums for n in msg_nums if not re.search(rf"{n}[- ]minute", low)):
        hit_pts += 1
    skill_hits = [s for s in prof.get("skills", []) if _has(low, s)]
    hit_pts += 0.5 * min(2, len(skill_hits))
    specificity = _clamp(hit_pts / 2.0)

    # job_relevance: required skills the candidate really has, mentioned in the message
    matched = [s for s in job.get("required_skills", []) if _has(low, s) and _has(ptxt, s)]
    job_relevance = _clamp(len(matched) / 2.0)

    # clear_ask
    clear_ask = 1.0 if LOW_FRICTION_ASK.search(message) else (0.5 if SOFT_ASK.search(message) else 0.0)

    # concision vs this persona's preferred length
    pref = max(1, p.preferred_max_words)
    concision = 1.0 if wc <= pref else _clamp(1 - (wc - pref) / pref)
    if wc < 35:
        concision *= 0.5

    # no_boilerplate
    bp_hits = [b for b in BOILERPLATE if b in low]
    no_boilerplate = _clamp(1 - 0.25 * len(bp_hits))

    # tone_fit
    first_line = message.strip().split("\n", 1)[0].lower()
    tail = message.strip()[-80:].lower()
    if p.tone == "formal":
        ok = [re.match(r"(dear|hello)\b", first_line) is not None,
              re.search(r"(best regards|kind regards|sincerely|regards),", tail) is not None]
    elif p.tone == "casual":
        ok = [re.match(r"(hi|hey)\b", first_line) is not None,
              re.search(r"\b(thanks|cheers|best)\b", tail) is not None]
    else:  # direct
        ok = [re.match(r"(hi|hello|hey|dear)\b", first_line) is not None,
              "hope this message finds you" not in low and message.count("!") <= 1]
    tone_fit = sum(bool(x) for x in ok) / 2.0

    return {
        "personalization": personalization, "persona_hook": persona_hook, "specificity": specificity,
        "job_relevance": job_relevance, "clear_ask": clear_ask, "concision": concision,
        "no_boilerplate": no_boilerplate, "tone_fit": tone_fit,
    }


def outcome_probabilities(quality: float, base_response_rate: float) -> Dict[str, float]:
    """P(outcome | quality, persona busyness). Sums to 1."""
    q = _clamp(quality)
    p_any = _clamp(base_response_rate * (0.4 + 1.6 * q), 0.0, 0.95)
    w = {
        "passive_accept": (1 - q) + 0.05,
        "conversation": max(0.1, 1 - 2 * abs(q - 0.6)),
        "strong_interest": q ** 2,
    }
    total = sum(w.values())
    probs = {"no_response": 1 - p_any}
    probs.update({k: p_any * v / total for k, v in w.items()})
    return probs


def _sample(probs: Dict[str, float], seed: int, example_id: str, message: str) -> str:
    h = hashlib.sha256(f"{seed}|{example_id}|{message}".encode()).hexdigest()
    r = random.Random(int(h[:16], 16)).random()
    acc = 0.0
    for k in OUTCOMES:
        acc += probs[k]
        if r <= acc:
            return k
    return OUTCOMES[-1]


def _attribution(outcome: str, quality: float, probs: Dict[str, float], persona_name: str) -> Optional[Dict[str, str]]:
    if outcome != "no_response":
        return None
    p_silence = probs["no_response"]
    if quality >= 0.65:
        verdict, why = "likely_persona_unavailable", (
            f"Quality {quality:.2f} is high; silence from {persona_name} is expected (P(no response)={p_silence:.0%}). "
            "Not evidence the message was weak.")
    elif quality < 0.4:
        verdict, why = "message_likely_contributed", (
            f"Quality {quality:.2f} is low and P(no response)={p_silence:.0%}; the message plausibly contributed.")
    else:
        verdict, why = "inconclusive", (
            f"Quality {quality:.2f} is middling and P(no response)={p_silence:.0%}; silence is not informative.")
    return {"verdict": verdict, "explanation": why}


class RubricJudge:
    """Deterministic, transparent judge. Swap for an LLM judge by matching ``evaluate``."""

    name = "rubric_judge_v1"

    def evaluate(self, message: str, ex: Example, seed: int = 0) -> Evaluation:
        crit = score_criteria(message, ex)
        weights = ex.persona.weights
        base = sum(weights[c] * crit[c] for c in CRITERIA)
        violations = check_grounding(message, ex.profile, ex.job, ex.persona.to_contact_dict())
        penalty = min(0.45, 0.15 * len(violations))
        quality = _clamp(base - penalty)
        probs = outcome_probabilities(quality, ex.persona.base_response_rate)
        expected = sum(probs[o] * OUTCOME_VALUE[o] for o in OUTCOMES)
        sampled = _sample(probs, seed, ex.id, message)
        wc = len(message.split())
        return Evaluation(
            quality=quality, criteria=crit, penalty=penalty, violations=violations,
            outcome_probs=probs, expected_outcome=expected, sampled_outcome=sampled,
            nonresponse_attribution=_attribution(sampled, quality, probs, ex.persona.name),
            feedback=self._feedback(message, ex, crit, violations, wc),
            strengths=[c for c in CRITERIA if crit[c] >= 0.9],
            word_count=wc, persona_id=ex.persona.id,
        )

    @staticmethod
    def _feedback(message: str, ex: Example, crit: Dict[str, float], violations: List[Dict[str, str]], wc: int) -> List[Dict[str, Any]]:
        p, job = ex.persona, ex.job
        low = message.lower()
        out: List[Dict[str, Any]] = []
        for c in CRITERIA:
            if crit[c] >= 0.6:
                continue
            text = FEEDBACK_TEMPLATES[c].format(
                company=p.company, cares=", ".join(p.cares_about) or "n/a",
                req=", ".join(job.get("required_skills", [])), wc=wc, pref=p.preferred_max_words,
                phrases=", ".join(b for b in BOILERPLATE if b in low)[:60], tone=p.tone)
            out.append({"criterion": c, "score": round(crit[c], 2), "weight": round(p.weights[c], 3), "comment": text})
        for v in violations:
            out.append({"criterion": "grounding", "score": 0.0, "weight": 0.15, "comment": f"Ungrounded claim: {v['detail']}."})
        return out


def aggregate(evals: List[Evaluation]) -> Dict[str, Any]:
    n = len(evals)
    if n == 0:
        raise ValueError("no evaluations to aggregate")
    mean = lambda xs: sum(xs) / len(xs)  # noqa: E731
    dist = {o: mean([e.outcome_probs[o] for e in evals]) for o in OUTCOMES}
    return {
        "n": n,
        "mean_quality": mean([e.quality for e in evals]),
        "mean_expected_outcome": mean([e.expected_outcome for e in evals]),
        "outcome_distribution": dist,
        "reply_probability": 1 - dist["no_response"],
        "grounding_violation_rate": mean([1.0 if e.violations else 0.0 for e in evals]),
        "criterion_means": {c: mean([e.criteria[c] for e in evals]) for c in CRITERIA},
        "mean_word_count": mean([e.word_count for e in evals]),
    }
