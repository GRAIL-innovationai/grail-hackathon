"""Prompt improvers: given the current generator instructions and *training-split* feedback,
propose candidate revisions of the instructions (never of an individual message).

* ``RuleImprover``  - offline, deterministic. Appends directive sentences for the criteria with
  the largest weighted loss. Works with any generator (including Agent C's real one).
* ``LLMImprover``   - asks an LLM to revise the instructions. Needs ``anthropic`` + API key.
"""

from __future__ import annotations

import difflib
import os
import re
import statistics
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .contracts import CRITERIA, Example
from .directives import (CONCISION_TEMPLATE, DIRECTIVES, add_directive_line, has_directive,
                         set_word_limit, word_limit)
from .simulator import Evaluation, aggregate

GROUNDING_PENALTY_PER_VIOLATION = 0.15


@dataclass
class Candidate:
    label: str
    instructions: str
    rationale: str


def summarize_feedback(rows: Sequence[Tuple[Example, str, Evaluation]], worst_k: int = 3) -> Dict[str, Any]:
    """Aggregate training feedback into a JSON-serializable summary the improver sees."""
    evals = [r[2] for r in rows]
    agg = aggregate(evals)
    n = len(rows)
    mean_w = {c: sum(r[0].persona.weights[c] for r in rows) / n for c in CRITERIA}
    loss = {c: mean_w[c] * (1 - agg["criterion_means"][c]) for c in CRITERIA}
    loss["grounding"] = agg["grounding_violation_rate"] * GROUNDING_PENALTY_PER_VIOLATION
    comment_counts: Dict[str, int] = {}
    for e in evals:
        for fb in e.feedback:
            comment_counts[fb["criterion"]] = comment_counts.get(fb["criterion"], 0) + 1
    worst = sorted(rows, key=lambda r: r[2].quality)[:worst_k]
    return {
        "n_examples": n,
        "mean_quality": agg["mean_quality"],
        "criterion_means": agg["criterion_means"],
        "mean_weights": mean_w,
        "weighted_loss": dict(sorted(loss.items(), key=lambda kv: -kv[1])),
        "grounding_violation_rate": agg["grounding_violation_rate"],
        "mean_word_count": agg["mean_word_count"],
        "preferred_max_words": sorted(r[0].persona.preferred_max_words for r in rows),
        "examples_flagged_per_criterion": comment_counts,
        "worst_examples": [
            {"persona": f"{r[0].persona.name} ({r[0].persona.title})", "quality": round(r[2].quality, 3),
             "message": r[1], "feedback": [f["comment"] for f in r[2].feedback]}
            for r in worst
        ],
    }


def instructions_diff(before: str, after: str) -> List[str]:
    return [ln for ln in difflib.unified_diff(before.splitlines(), after.splitlines(), lineterm="", n=0)
            if not ln.startswith(("---", "+++", "@@"))]


class RuleImprover:
    name = "rule_improver"

    def propose(self, current: str, summary: Dict[str, Any], k: int = 3) -> List[Candidate]:
        out: List[Candidate] = []
        for crit, loss in summary["weighted_loss"].items():
            if len(out) >= k or loss < 1e-4:
                break
            if crit == "concision":
                prefs = summary["preferred_max_words"]
                n = max(40, int(statistics.median(prefs) // 5 * 5))
                if word_limit(current) == n:
                    continue
                out.append(Candidate("concision", set_word_limit(current, n),
                                     f"Concision scored {summary['criterion_means']['concision']:.2f}; "
                                     f"messages average {summary['mean_word_count']:.0f} words vs a median preference of {n}."))
                continue
            if crit not in DIRECTIVES or has_directive(current, crit):
                continue
            d = DIRECTIVES[crit]
            if crit == "grounding":
                why = f"{summary['grounding_violation_rate']:.0%} of training messages contained ungrounded claims."
            else:
                why = f"'{crit}' scored {summary['criterion_means'][crit]:.2f} on training data (weighted loss {loss:.3f})."
            out.append(Candidate(crit, add_directive_line(current, d.sentence), why))
        return out


IMPROVER_SYSTEM = (
    "You improve the INSTRUCTIONS (a system prompt) given to a model that writes outreach messages from "
    "a student to a hiring contact. You will see aggregate feedback from simulated hiring contacts on "
    "messages written with the current instructions. Revise the instructions so future messages score "
    "better. Rules: keep the instructions general (never mention specific people, companies or candidates "
    "from the feedback); never tell the model to invent facts, experience or numbers; do not mention scores, "
    "simulators or evaluation; make one focused change; keep the result under 1500 characters. "
    "Return the full revised instructions inside <instructions></instructions> tags and a one-sentence "
    "reason inside <rationale></rationale> tags."
)


class LLMImprover:
    name = "llm_improver"

    def __init__(self, client: Any = None, model: Optional[str] = None, max_tokens: int = 900):
        if client is None:
            import anthropic

            client = anthropic.Anthropic()
        self.client = client
        self.model = model or os.environ.get("RSI_MODEL", "claude-sonnet-5-5")
        self.max_tokens = max_tokens

    def propose(self, current: str, summary: Dict[str, Any], k: int = 3) -> List[Candidate]:
        focus = [c for c in summary["weighted_loss"] if summary["weighted_loss"][c] > 1e-4][:k]
        out: List[Candidate] = []
        for crit in focus:
            user = (
                f"CURRENT INSTRUCTIONS:\n{current}\n\n"
                f"TRAINING FEEDBACK SUMMARY (JSON):\n{_compact(summary)}\n\n"
                f"Focus this revision on the weakest area: {crit}."
            )
            resp = self.client.messages.create(
                model=self.model, max_tokens=self.max_tokens, system=IMPROVER_SYSTEM,
                messages=[{"role": "user", "content": user}],
            )
            text = "".join(getattr(b, "text", "") for b in resp.content)
            m = re.search(r"<instructions>(.*?)</instructions>", text, re.S)
            r = re.search(r"<rationale>(.*?)</rationale>", text, re.S)
            if not m:
                continue
            out.append(Candidate(crit, m.group(1).strip(), r.group(1).strip() if r else f"LLM revision targeting {crit}"))
        return out


def _compact(summary: Dict[str, Any]) -> str:
    import json

    slim = {k: v for k, v in summary.items() if k != "mean_weights"}
    return json.dumps(slim, indent=1, default=str)
