"""Natural-language instruction directives.

Used by (a) the offline RuleImprover, which appends these sentences to the generator
instructions, and (b) the offline FixtureGenerator, which detects them to decide how to write.

This coupling is a property of the *offline fixtures only*. It lets the loop run with no API
key, and it means offline improvements are guaranteed by construction. They demonstrate loop
mechanics, not how a real LLM generator responds. With a real generator (Agent C) the same
sentences are just ordinary prompt text that the model may or may not follow.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class Directive:
    key: str
    criterion: str  # rubric criterion it targets ("grounding" targets the grounding guard)
    sentence: str
    pattern: str  # regex (lowercase) that detects the directive in instructions


DIRECTIVES: Dict[str, Directive] = {
    d.key: d
    for d in [
        Directive("personalization", "personalization",
                  "Address the contact by first name and mention their company and role.",
                  r"first name"),
        Directive("persona_hook", "persona_hook",
                  "Connect the message to something this contact cares about, using their stated priorities.",
                  r"stated priorities|cares about"),
        Directive("specificity", "specificity",
                  "Cite one or two concrete projects or results taken directly from the resume.",
                  r"directly from the resume|concrete projects"),
        Directive("job_relevance", "job_relevance",
                  "Explicitly connect the candidate's skills to the job's required skills.",
                  r"required skills"),
        Directive("clear_ask", "clear_ask",
                  "End with one low-friction ask, such as a 15-minute call.",
                  r"low-friction ask|15-minute"),
        Directive("no_boilerplate", "no_boilerplate",
                  "Avoid generic phrases such as 'I am writing to express my interest' or 'passionate'.",
                  r"avoid generic"),
        Directive("tone_fit", "tone_fit",
                  "Match the contact's communication style (formal, casual, or direct) in greeting and sign-off.",
                  r"communication style"),
        Directive("grounding", "grounding",
                  "Only state facts that appear in the resume; never invent experience, years, or numbers.",
                  r"never invent|only state facts"),
    ]
}

CONCISION_TEMPLATE = "Keep the message under {n} words."
_CONCISION_RE = re.compile(r"under (\d+) words")


def has_directive(instructions: str, key: str) -> bool:
    return re.search(DIRECTIVES[key].pattern, instructions.lower()) is not None


def word_limit(instructions: str) -> Optional[int]:
    m = _CONCISION_RE.search(instructions.lower())
    return int(m.group(1)) if m else None


def add_directive_line(instructions: str, sentence: str) -> str:
    return instructions.rstrip() + "\n- " + sentence


def set_word_limit(instructions: str, n: int) -> str:
    """Add or replace the word-limit sentence."""
    if word_limit(instructions) is not None:
        return _CONCISION_RE.sub(f"under {n} words", instructions, count=1)
    return add_directive_line(instructions, CONCISION_TEMPLATE.format(n=n))
