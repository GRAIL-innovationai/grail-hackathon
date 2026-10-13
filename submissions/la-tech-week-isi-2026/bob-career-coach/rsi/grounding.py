"""Grounding guard: flag candidate facts in a message that are not in the submitted profile.

Deliberately simple and transparent (regex + vocabulary), so teammates can read exactly what is
flagged. It is an evaluation guard, not a proof of truthfulness. Production generators should
enforce grounding themselves; here a violation is penalized in the quality score.

Checks:
  1. years_claim   - "3+ years", "over 5 years" must literally appear in the profile
  2. number        - other numbers/percentages must appear in the profile (except durations like
                     "15-minute" and numbers that appear in the job/contact context)
  3. skill_claim   - claiming experience/expertise with a known skill the profile does not list
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from .contracts import profile_text

COMMON_SKILLS = [
    "python", "sql", "java", "javascript", "typescript", "c++", "r", "matlab", "excel", "tableau",
    "power bi", "docker", "kubernetes", "react", "pytorch", "tensorflow", "ros", "figma", "git",
    "machine learning", "deep learning", "financial modeling", "valuation", "google analytics",
    "a/b testing", "copywriting", "market research", "user research", "prototyping", "accessibility",
]

_YEARS_RE = re.compile(r"(\d+)\s*\+?\s*(?:years?|yrs?)\b", re.I)
_NUM_RE = re.compile(r"\d+(?:\.\d+)?%?")
_CLAIM_CUES = re.compile(r"experience (?:with|in)|expertise (?:in|with)|proficien\w* (?:in|with)|skilled (?:in|at)|fluent in|years of", re.I)


def _contains_term(text: str, term: str) -> bool:
    return re.search(r"(?<![\w+#])" + re.escape(term.lower()) + r"(?![\w+#])", text) is not None


def check_grounding(message: str, profile: Dict[str, Any], job: Optional[Dict[str, Any]] = None,
                    contact: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
    ptxt = profile_text(profile)
    ctx = " ".join(profile_text(x) for x in (job or {}, contact or {}))
    violations: List[Dict[str, str]] = []
    years_spans: List[range] = []

    for m in _YEARS_RE.finditer(message):
        years_spans.append(range(m.start(1), m.end(1)))
        n = m.group(1)
        if not re.search(rf"\b{n}\s*\+?\s*(?:years?|yrs?)\b", ptxt):
            violations.append({"type": "years_claim", "text": m.group(0), "detail": f"'{m.group(0)}' is not in the resume"})

    for m in _NUM_RE.finditer(message):
        if any(m.start() in r for r in years_spans):
            continue
        tok = m.group(0)
        after = message[m.end(): m.end() + 8].lower()
        if re.match(r"[- ]?(minute|min)", after):
            continue  # a call duration proposed by the candidate, not a claim about them
        digits = tok.rstrip("%")
        if re.search(rf"(?<!\d){re.escape(digits)}(?!\d)", ptxt) or re.search(rf"(?<!\d){re.escape(digits)}(?!\d)", ctx):
            continue
        violations.append({"type": "number", "text": tok, "detail": f"number '{tok}' is not in the resume"})

    vocab = {s.lower() for s in COMMON_SKILLS} | {s.lower() for s in (job or {}).get("required_skills", [])}
    for sent in re.split(r"(?<=[.!?])\s+|\n+", message):
        if not _CLAIM_CUES.search(sent):
            continue
        low = sent.lower()
        for skill in sorted(vocab):
            if _contains_term(low, skill) and not _contains_term(ptxt, skill):
                violations.append({"type": "skill_claim", "text": skill, "detail": f"claims experience with '{skill}' but it is not in the resume"})
    return violations
