"""The RSI loop: improve the *generator instructions* under simulated feedback.

Data discipline (this is what makes the final comparison honest):
  * Examples are split by CANDIDATE PROFILE into train / dev / test, so no candidate appears in
    more than one split.
  * TRAIN produces the feedback the improver sees.
  * DEV gates acceptance: a revision is kept only if it beats the current instructions on dev
    by at least ``min_delta``. (Candidates are chosen on dev, so dev is "used".)
  * TEST is never shown to the improver and never used for selection. It is generated and scored
    once per prompt version at the end, for the baseline-vs-optimized comparison.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from .contracts import CRITERIA, Example, GeneratorFn, bind_generator
from .improvers import Candidate, instructions_diff, summarize_feedback
from .simulator import Evaluation, RubricJudge, aggregate

Rows = List[Tuple[Example, str, Evaluation]]


@dataclass
class OptimizerConfig:
    max_iters: int = 8
    min_delta: float = 0.005
    patience: int = 1  # stop after this many consecutive rejected iterations
    candidates_per_iter: int = 3
    seed: int = 7
    max_instruction_chars: int = 1500


def split_by_profile(examples: Sequence[Example], seed: int, ratios=(0.34, 0.33, 0.33)) -> Dict[str, List[Example]]:
    ids = sorted({e.profile_id for e in examples})
    if len(ids) < 3:
        raise ValueError(f"need at least 3 distinct candidate profiles to split train/dev/test, got {len(ids)}")
    random.Random(seed).shuffle(ids)
    n = len(ids)
    n_train = max(1, round(n * ratios[0]))
    n_dev = max(1, round(n * ratios[1]))
    if n_train + n_dev >= n:
        n_dev = max(1, n - n_train - 1)
    groups = {"train": set(ids[:n_train]), "dev": set(ids[n_train:n_train + n_dev]), "test": set(ids[n_train + n_dev:])}
    return {k: [e for e in examples if e.profile_id in v] for k, v in groups.items()}


class RSIOptimizer:
    def __init__(self, generator: GeneratorFn, improver: Any, judge: Optional[RubricJudge] = None,
                 config: Optional[OptimizerConfig] = None):
        self.generator = generator
        self.improver = improver
        self.judge = judge or RubricJudge()
        self.cfg = config or OptimizerConfig()
        self._cache: Dict[Tuple[str, str], Rows] = {}

    # ---- generation + scoring ----
    def evaluate(self, instructions: str, examples: Sequence[Example]) -> Rows:
        gen = bind_generator(self.generator, instructions)
        key_base = hashlib.sha256(instructions.encode()).hexdigest()
        rows: Rows = []
        for ex in examples:
            key = (key_base, ex.id)
            if key not in self._cache:
                msg = gen(ex.profile, ex.persona.to_contact_dict(), ex.job)
                if not msg:
                    raise RuntimeError(f"generator returned an empty message for example {ex.id}")
                self._cache[key] = [(ex, msg, self.judge.evaluate(msg, ex, self.cfg.seed))]
            rows.append(self._cache[key][0])
        return rows

    def metrics(self, instructions: str, examples: Sequence[Example]) -> Dict[str, Any]:
        return aggregate([r[2] for r in self.evaluate(instructions, examples)])

    # ---- candidate validation ----
    def _validate(self, cand: Candidate, current: str, train: Sequence[Example]) -> Optional[str]:
        if cand.instructions.strip() == current.strip():
            return "no change from current instructions"
        if len(cand.instructions) > self.cfg.max_instruction_chars:
            return f"longer than {self.cfg.max_instruction_chars} characters"
        low = cand.instructions.lower()
        names = {ex.persona.name.lower() for ex in train} | {str(ex.profile.get("name", "")).lower() for ex in train}
        leaked = [n for n in names if n and n in low]
        if leaked:
            return "instructions name specific training people (overfitting guard)"
        return None

    # ---- the loop ----
    def run(self, baseline: str, examples: Sequence[Example]) -> Dict[str, Any]:
        splits = split_by_profile(examples, self.cfg.seed)
        train, dev, test = splits["train"], splits["dev"], splits["test"]
        profile_sets = {k: {e.profile_id for e in v} for k, v in splits.items()}
        overlap = sorted((profile_sets["train"] & profile_sets["dev"]) | (profile_sets["train"] & profile_sets["test"])
                         | (profile_sets["dev"] & profile_sets["test"]))

        current = baseline
        dev_current = self.metrics(current, dev)["mean_quality"]
        iterations: List[Dict[str, Any]] = []
        rejected_streak, stop_reason = 0, "reached max_iters"

        for i in range(1, self.cfg.max_iters + 1):
            train_rows = self.evaluate(current, train)
            summary = summarize_feedback(train_rows)  # TRAIN feedback only
            proposed = self.improver.propose(current, summary, self.cfg.candidates_per_iter)
            cands: List[Dict[str, Any]] = []
            for c in proposed:
                reason = self._validate(c, current, train)
                rec: Dict[str, Any] = {"label": c.label, "rationale": c.rationale, "instructions": c.instructions,
                                       "valid": reason is None, "rejected_reason": reason}
                if reason is None:
                    rec["train_quality"] = self.metrics(c.instructions, train)["mean_quality"]
                    rec["dev_quality"] = self.metrics(c.instructions, dev)["mean_quality"]
                    rec["dev_delta"] = rec["dev_quality"] - dev_current
                cands.append(rec)
            valid = [c for c in cands if c["valid"]]
            record: Dict[str, Any] = {
                "iteration": i, "instructions_before": current, "dev_quality_before": dev_current,
                "train_quality_before": summary["mean_quality"], "feedback_summary": summary, "candidates": cands,
            }
            if not valid:
                record.update(selected=None, accepted=False, decision_reason="improver proposed no valid candidates",
                              dev_quality_after=dev_current, instructions_after=current, instructions_diff=[])
                iterations.append(record)
                stop_reason = "no valid candidates"
                break
            best = max(valid, key=lambda c: c["dev_quality"])
            accepted = best["dev_delta"] >= self.cfg.min_delta
            record["selected"] = best["label"]
            record["accepted"] = accepted
            if accepted:
                record["decision_reason"] = (f"'{best['label']}' improved dev quality by {best['dev_delta']:+.3f} "
                                             f"(>= {self.cfg.min_delta})")
                record["instructions_diff"] = instructions_diff(current, best["instructions"])
                current, dev_current = best["instructions"], best["dev_quality"]
                rejected_streak = 0
            else:
                record["decision_reason"] = (f"best candidate '{best['label']}' changed dev quality by "
                                             f"{best['dev_delta']:+.3f} (< {self.cfg.min_delta}); rejected")
                record["instructions_diff"] = []
                rejected_streak += 1
            record["dev_quality_after"] = dev_current
            record["instructions_after"] = current
            iterations.append(record)
            if rejected_streak >= self.cfg.patience:
                stop_reason = f"no accepted revision for {rejected_streak} iteration(s)"
                break

        return {
            "baseline_instructions": baseline,
            "optimized_instructions": current,
            "iterations": iterations,
            "stop_reason": stop_reason,
            "splits": {k: {"profile_ids": sorted(profile_sets[k]), "example_ids": [e.id for e in v]}
                       for k, v in splits.items()},
            "leakage_check": {"profile_overlap_between_splits": overlap, "passed": not overlap},
            "evaluation": self._final_comparison(baseline, current, splits),
        }

    # ---- held-out comparison ----
    def _final_comparison(self, baseline: str, optimized: str, splits: Dict[str, List[Example]]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for name, exs in splits.items():
            b_rows, o_rows = self.evaluate(baseline, exs), self.evaluate(optimized, exs)
            b, o = aggregate([r[2] for r in b_rows]), aggregate([r[2] for r in o_rows])
            dq = [o_[2].quality - b_[2].quality for b_, o_ in zip(b_rows, o_rows)]
            de = [o_[2].expected_outcome - b_[2].expected_outcome for b_, o_ in zip(b_rows, o_rows)]
            out[name] = {
                "n": len(exs), "baseline": b, "optimized": o,
                "delta": {
                    "mean_quality": o["mean_quality"] - b["mean_quality"],
                    "mean_expected_outcome": o["mean_expected_outcome"] - b["mean_expected_outcome"],
                    "reply_probability": o["reply_probability"] - b["reply_probability"],
                    "grounding_violation_rate": o["grounding_violation_rate"] - b["grounding_violation_rate"],
                    "criterion": {c: o["criterion_means"][c] - b["criterion_means"][c] for c in CRITERIA},
                },
                "ci95_delta_quality": bootstrap_ci(dq, self.cfg.seed),
                "ci95_delta_expected_outcome": bootstrap_ci(de, self.cfg.seed + 1),
                "win_rate_quality": sum(1 for x in dq if x > 1e-9) / len(dq),
                "tie_rate_quality": sum(1 for x in dq if abs(x) <= 1e-9) / len(dq),
            }
        return out

    def example_comparisons(self, baseline: str, optimized: str, splits: Dict[str, List[Example]]) -> List[Dict[str, Any]]:
        rows = []
        for split, exs in splits.items():
            for b, o in zip(self.evaluate(baseline, exs), self.evaluate(optimized, exs)):
                ex = b[0]
                rows.append({
                    "example_id": ex.id, "split": split, "candidate": ex.profile.get("name"),
                    "profile_id": ex.profile_id, "persona_id": ex.persona.id, "persona": ex.persona.name,
                    "persona_title": ex.persona.title, "company": ex.persona.company, "job_id": ex.job.get("id"),
                    "job_title": ex.job.get("title"),
                    "baseline": {"message": b[1], "evaluation": b[2].to_dict()},
                    "optimized": {"message": o[1], "evaluation": o[2].to_dict()},
                    "delta_quality": o[2].quality - b[2].quality,
                })
        return rows


def bootstrap_ci(values: Sequence[float], seed: int, b: int = 2000, alpha: float = 0.05) -> Dict[str, float]:
    """Percentile bootstrap CI of the mean of paired deltas. With few examples it is wide; that is the point."""
    vals = list(values)
    n = len(vals)
    mean = sum(vals) / n
    if n < 2:
        return {"mean": mean, "low": mean, "high": mean, "n": n}
    rng = random.Random(seed)
    means = sorted(sum(rng.choice(vals) for _ in range(n)) / n for _ in range(b))
    return {"mean": mean, "low": means[int(alpha / 2 * b)], "high": means[int((1 - alpha / 2) * b) - 1], "n": n}
