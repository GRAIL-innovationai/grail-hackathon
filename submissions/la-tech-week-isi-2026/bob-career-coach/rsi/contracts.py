"""Interface contracts between Agent D (this package) and Agents A, B, C.

Everything here is deliberately tolerant: adapters accept the field names we *expect* from
teammates plus a few aliases, fill defaults for anything missing, and record which fields were
defaulted (``assumed_fields``) so mismatches are visible instead of silent.

Contracts (see rsi/README.md for the prose version):

* Agent B -> D  : hiring-contact personas (dicts; see ``Persona.from_dict``)
* Agent C -> D  : ``generate_message(instructions, profile, contact, job) -> str | {"message": str}``
* Agent D -> A  : ``results/rsi_results.json`` (schema documented in rsi/README.md)
"""

from __future__ import annotations

import importlib
import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

OUTCOMES = ["no_response", "passive_accept", "conversation", "strong_interest"]
# Value of each outcome for "expected outcome" reporting (simulated, not real-world rates).
OUTCOME_VALUE = {"no_response": 0.0, "passive_accept": 0.25, "conversation": 0.7, "strong_interest": 1.0}

# Rubric criteria, in a stable display order.
CRITERIA = [
    "personalization",
    "persona_hook",
    "specificity",
    "job_relevance",
    "clear_ask",
    "concision",
    "no_boilerplate",
    "tone_fit",
]

DEFAULT_WEIGHTS = {
    "personalization": 0.15,
    "persona_hook": 0.15,
    "specificity": 0.15,
    "job_relevance": 0.15,
    "clear_ask": 0.12,
    "concision": 0.08,
    "no_boilerplate": 0.10,
    "tone_fit": 0.10,
}


def _first(d: Dict[str, Any], keys: List[str], default: Any = None) -> Any:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


@dataclass
class Persona:
    """A fictional hiring contact (Agent B's output), normalized for simulation."""

    id: str
    name: str
    title: str
    company: str
    job_id: Optional[str]
    tone: str  # formal | casual | direct
    cares_about: List[str]
    pet_peeves: List[str]
    preferred_max_words: int
    base_response_rate: float  # P(any reply) for an average message; models busyness
    weights: Dict[str, float]
    bio: str = ""
    raw: Dict[str, Any] = field(default_factory=dict)
    assumed_fields: List[str] = field(default_factory=list)

    @property
    def first_name(self) -> str:
        return self.name.split()[0] if self.name else ""

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Persona":
        assumed: List[str] = []

        def get(keys: List[str], default: Any, label: str) -> Any:
            v = _first(d, keys)
            if v is None:
                assumed.append(label)
                return default
            return v

        pid = str(get(["id", "persona_id", "contact_id"], d.get("name", "unknown"), "id"))
        tone = str(get(["tone", "communication_style", "style"], "direct", "tone")).lower()
        if tone not in ("formal", "casual", "direct"):
            tone = "direct"
        cares = get(["cares_about", "priorities", "interests", "values"], [], "cares_about")
        peeves = get(["pet_peeves", "dislikes"], [], "pet_peeves")
        if isinstance(cares, str):
            cares = [cares]
        if isinstance(peeves, str):
            peeves = [peeves]
        weights = dict(DEFAULT_WEIGHTS)
        w_in = _first(d, ["evaluation_weights", "weights"], None)
        if isinstance(w_in, dict):
            weights.update({k: float(v) for k, v in w_in.items() if k in weights})
        total = sum(weights.values()) or 1.0
        weights = {k: v / total for k, v in weights.items()}
        return cls(
            id=pid,
            name=str(get(["name", "full_name"], "Hiring Manager", "name")),
            title=str(get(["title", "role", "job_title"], "Hiring Manager", "title")),
            company=str(get(["company", "organization", "employer"], "the company", "company")),
            job_id=_first(d, ["job_id", "job"], None),
            tone=tone,
            cares_about=[str(x) for x in cares],
            pet_peeves=[str(x) for x in peeves],
            preferred_max_words=int(get(["preferred_max_words", "max_words", "preferred_length"], 90, "preferred_max_words")),
            base_response_rate=float(get(["base_response_rate", "response_rate", "responsiveness"], 0.3, "base_response_rate")),
            weights=weights,
            bio=str(_first(d, ["bio", "description", "summary"], "")),
            raw=dict(d),
            assumed_fields=assumed,
        )

    def to_contact_dict(self) -> Dict[str, Any]:
        """What the message generator sees about the contact. Excludes simulator-only fields
        (response rate, weights) so the generator cannot game the simulation directly."""
        return {
            "id": self.id,
            "name": self.name,
            "title": self.title,
            "company": self.company,
            "tone": self.tone,
            "cares_about": list(self.cares_about),
            "bio": self.bio,
        }


def profile_text(profile: Dict[str, Any]) -> str:
    """Flatten a profile dict to lowercase text for grounding checks."""
    parts: List[str] = []

    def walk(x: Any) -> None:
        if isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, (list, tuple)):
            for v in x:
                walk(v)
        elif x is not None:
            parts.append(str(x))

    walk(profile)
    return " \n ".join(parts).lower()


@dataclass
class Example:
    """One evaluation unit: a candidate profile paired with a (persona, job)."""

    id: str
    profile: Dict[str, Any]
    persona: Persona
    job: Dict[str, Any]

    @property
    def profile_id(self) -> str:
        return str(self.profile.get("id", self.profile.get("name", "profile")))


# A generator is a callable: (profile, contact, job) -> message.  ``bind_generator`` adapts
# Agent C's ``generate_message(instructions, profile, contact, job)`` to this shape.
BoundGenerator = Callable[[Dict[str, Any], Dict[str, Any], Dict[str, Any]], str]
GeneratorFn = Callable[[str, Dict[str, Any], Dict[str, Any], Dict[str, Any]], Any]


def bind_generator(fn: GeneratorFn, instructions: str) -> BoundGenerator:
    def _bound(profile: Dict[str, Any], contact: Dict[str, Any], job: Dict[str, Any]) -> str:
        out = fn(instructions, profile, contact, job)
        if isinstance(out, dict):
            out = out.get("message") or out.get("text") or out.get("body") or ""
        return str(out).strip()

    return _bound


def load_callable(spec: str) -> Callable[..., Any]:
    """Load ``package.module:function`` (Agent C's generator, for example)."""
    mod_name, _, attr = spec.partition(":")
    if not attr:
        raise ValueError(f"expected 'module:function', got {spec!r}")
    return getattr(importlib.import_module(mod_name), attr)


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)
