"""Message generators.

* ``fixture_generate``  - TEMPORARY offline stand-in for Agent C's generator. Deterministic,
  template-based; reacts to the directive sentences in the instructions. Clearly NOT a
  production generator.
* ``LLMGenerator``      - optional generator that calls the Anthropic API with the instructions
  as the system prompt. Requires the ``anthropic`` package and ANTHROPIC_API_KEY.
* Agent C's real generator is plugged in with ``--generator module:function`` (see contracts.py).
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple

from .directives import has_directive, word_limit

FIXTURE_GENERATOR_LABEL = "fixture_generator (TEMPORARY stand-in for Agent C)"


def _words(text: str) -> int:
    return len(text.split())


def _overlap(profile: Dict[str, Any], job: Dict[str, Any]) -> List[str]:
    have = {s.lower(): s for s in profile.get("skills", [])}
    return [have[s.lower()] for s in job.get("required_skills", []) if s.lower() in have]


def _first_project(profile: Dict[str, Any]) -> Tuple[str, str]:
    projects = profile.get("projects") or []
    if not projects:
        return "", ""
    return projects[0].get("name", ""), projects[0].get("description", "")


def fixture_generate(instructions: str, profile: Dict[str, Any], contact: Dict[str, Any], job: Dict[str, Any]) -> str:
    """Deterministic fixture. Without directives it behaves like an under-specified prompt:
    generic, boilerplate, and embellishing. Each directive switches on one good behavior."""
    name = profile.get("name", "A student")
    first = contact.get("name", "").split()[0] if contact.get("name") else ""
    tone = contact.get("tone", "direct")
    skills = _overlap(profile, job)
    proj_name, proj_desc = _first_project(profile)
    exp = (profile.get("experience") or [{}])[0]
    lead_skill = skills[0] if skills else (profile.get("skills") or ["my field"])[0]

    d = lambda key: has_directive(instructions, key)  # noqa: E731

    # greeting
    if d("tone_fit"):
        greet = {"formal": "Dear {f},", "casual": "Hi {f},", "direct": "Hi {f},"}[tone]
    else:
        greet = "Hello {f}," if d("personalization") else "Hello,"
    greet = greet.format(f=first).replace("  ", " ").replace(" ,", ",")

    # opener
    if d("no_boilerplate"):
        opener = (f"I'm {name}, a {profile.get('major', 'student')} {profile.get('year', 'student')} at "
                  f"{profile.get('school', 'my university')}, and I'm applying for the {job.get('title', 'open')} role"
                  + (f" at {contact.get('company', job.get('company', ''))}" if d("personalization") else "") + ".")
    else:
        at_co = f" at {contact.get('company', job.get('company', ''))}" if d("personalization") else ""
        opener = (f"I am writing to express my interest in the {job.get('title', 'open')} position{at_co}. "
                  "As a passionate and hard-working student, I would love to pick your brain about the role.")
    slots: List[Tuple[str, str, int]] = []  # (slot, text, drop_priority: lower = dropped first)
    slots.append(("greeting", greet, 99))
    slots.append(("opener", opener, 99))

    # persona hook
    if d("persona_hook") and contact.get("cares_about"):
        topic = " and ".join(contact["cares_about"][:2])
        role = f" as {contact.get('title')}" if d("personalization") and contact.get("title") else ""
        slots.append(("hook", f"Your focus on {topic}{role} is what drew me to {contact.get('company', job.get('company', 'your team'))}.", 3))

    # specifics
    if d("specificity") and proj_name:
        bits = []
        if exp.get("org") and exp.get("bullets"):
            bits.append(f"At {exp['org']}, I {exp['bullets'][0][0].lower() + exp['bullets'][0][1:]}")
        bits.append(f"I built {proj_name}: {proj_desc}")
        slots.append(("specifics", ". ".join(b.rstrip(".") for b in bits) + ".", 4))

    # relevance
    if d("job_relevance") and skills:
        listed = " and ".join(skills[:2])
        slots.append(("relevance", f"My work with {listed} maps directly to the required skills for this role.", 2))
    else:
        slots.append(("relevance", "I believe my skills are a great fit for your team.", 2))

    # embellishment: what an unconstrained model tends to do (fixture models the habit)
    if not d("grounding"):
        slots.append(("embellish", f"I have 3+ years of hands-on experience with {lead_skill}.", 1))

    # ask
    ask = "Would you be open to a 15-minute call next week?" if d("clear_ask") else "I would appreciate the opportunity to hear back from you."
    slots.append(("ask", ask, 99))

    # sign-off
    if d("tone_fit"):
        sign = {"formal": "Best regards,", "casual": "Thanks!", "direct": "Thanks,"}[tone]
    else:
        sign = "Thank you for your time,"
    slots.append(("signoff", f"{sign}\n{name}", 99))

    # word budget: drop lowest-priority optional slots until it fits
    limit = word_limit(instructions)
    if limit:
        while _words(" ".join(s[1] for s in slots)) > limit:
            droppable = [s for s in slots if s[2] < 99]
            if not droppable:
                break
            slots.remove(min(droppable, key=lambda s: s[2]))

    head = slots[0][1]
    body = " ".join(s[1] for s in slots[1:-1])
    return f"{head}\n\n{body}\n\n{slots[-1][1]}"


class LLMGenerator:
    """Calls the Anthropic Messages API with the instructions as the system prompt."""

    def __init__(self, client: Any = None, model: Optional[str] = None, max_tokens: int = 500):
        if client is None:
            import anthropic  # imported lazily so offline mode needs no dependency

            client = anthropic.Anthropic()
        self.client = client
        self.model = model or os.environ.get("RSI_MODEL", "claude-sonnet-5-5")
        self.max_tokens = max_tokens

    def __call__(self, instructions: str, profile: Dict[str, Any], contact: Dict[str, Any], job: Dict[str, Any]) -> str:
        user = (
            "Write one outreach message from the candidate to the hiring contact.\n\n"
            f"CANDIDATE PROFILE (the only source of facts about the candidate):\n{json.dumps(profile, indent=2)}\n\n"
            f"HIRING CONTACT:\n{json.dumps(contact, indent=2)}\n\n"
            f"JOB:\n{json.dumps(job, indent=2)}\n\n"
            "Return only the message text."
        )
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=instructions,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(getattr(b, "text", "") for b in resp.content).strip()
