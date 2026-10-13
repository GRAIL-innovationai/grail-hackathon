"""Evaluator returning combined_score for resume-tailoring RSI."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from data.load import build_batch, labels_for_split
from agent_d.metrics import score_tailored_resume
from agent_d.sandbox import run_program

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "synthetic"
DEFAULT_TIMEOUT = 60


def evaluate_program(
    source: str,
    *,
    split: str = "val",
    data_dir: Path = DEFAULT_DATA_DIR,
    timeout: int = DEFAULT_TIMEOUT,
) -> tuple[float | None, list[float] | None, str | None]:
    batch = build_batch(split, data_dir=data_dir)
    outputs, error = run_program(source, batch, timeout=timeout)
    if error:
        return None, None, error
    labels = labels_for_split(split, data_dir)
    per = []
    for output, task in zip(outputs, batch["tasks"]):
        metrics = score_tailored_resume(output["tailored_resume"], labels[task["task_id"]])
        per.append(metrics["combined_score"])
    mean = sum(per) / len(per) if per else 0.0
    return mean, per, None


def evaluator(
    source: str | None,
    *,
    split: str = "val",
    data_dir: Path = DEFAULT_DATA_DIR,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    if not source:
        return {"combined_score": 0.0, "error": "no program"}
    score, per, error = evaluate_program(source, split=split, data_dir=data_dir, timeout=timeout)
    if error:
        return {"combined_score": 0.0, "error": error}
    return {
        "combined_score": round(score, 4),
        "per_task": [round(value, 4) for value in (per or [])],
        "worst": round(min(per or [0]), 4),
    }


def evaluate_test(
    source: str,
    *,
    data_dir: Path = DEFAULT_DATA_DIR,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    return evaluator(source, split="test", data_dir=data_dir, timeout=timeout)
