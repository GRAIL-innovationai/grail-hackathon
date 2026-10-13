"""RSI loop for tailor_resume programs."""

from __future__ import annotations

import time
from typing import Any, Callable

from agent_d.card import card
from agent_d.evaluator import evaluator
from agent_d.llm import ask_all, over_budget
from agent_d.prompts import format_attempt, improvement_prompt
from agent_d.sandbox import extract_program

TARGET_GAIN = 0.10
MIN_ITERATIONS = 8
MAX_ITERATIONS = 8
MAX_MINUTES = 12


def out_of_time(started: float, minutes: float | None = None) -> bool:
    return time.time() - started > 60 * (minutes or MAX_MINUTES) or over_budget()


def target_of(start: dict) -> float:
    p = start["practice"]
    return p + TARGET_GAIN * (1 - p)


def first_working_program(
    prompt: str,
    model: str,
    tries: int = 5,
    eval_split: str = "val",
) -> dict:
    for attempt in range(1, tries + 1):
        reply = ask_all({model: prompt}, tag=f"zero-shot {attempt}")[model]
        source = extract_program(reply)
        metrics = evaluator(source, split=eval_split) if source else {"combined_score": 0.0, "error": "no Python code"}
        if "error" not in metrics:
            return {
                "source": source,
                "practice": metrics["combined_score"],
                "model": model,
            }
    raise RuntimeError(f"No runnable program after {tries} tries")


def rsi_loop(
    starts: dict[str, dict] | None = None,
    model: str | None = None,
    task: str | None = None,
    rounds: int | None = None,
    minutes: float | None = None,
    on_step: Callable | None = None,
    eval_split: str = "val",
) -> tuple[dict[str, dict], dict[str, list]]:
    """Improve each model's program (single model by default)."""
    if starts is None:
        raise ValueError("starts required: run zero-shot first")
    rounds = rounds or MAX_ITERATIONS
    minutes = minutes or MAX_MINUTES
    started = time.time()
    runs: dict[str, Any] = {}
    for m, start in starts.items():
        runs[m] = {
            "start": start,
            "target": target_of(start),
            "best": dict(start, name=card(start["source"])["name"], iteration=0),
            "history": [
                {
                    "iteration": 0,
                    **card(start["source"]),
                    "practice": start["practice"],
                    "error": None,
                    "new_best": True,
                    "source": start["source"],
                }
            ],
        }
    for it in range(1, rounds + 1):
        if out_of_time(started, minutes):
            break
        if on_step:
            on_step(runs, waiting=it)
        prompts = {}
        for m, run in runs.items():
            recent = [
                format_attempt(h)
                for h in run["history"][-5:]
                if h["iteration"] > 0
            ][::-1]
            prompts[m] = improvement_prompt(run["best"], recent, run["start"], task=task)
        replies = ask_all(prompts, tag=f"rsi {it}")
        for m, run in runs.items():
            source = extract_program(replies[m])
            metrics = (
                evaluator(source, split=eval_split)
                if source
                else {"combined_score": 0.0, "error": "no Python code in the reply"}
            )
            if "error" in metrics:
                score, error = None, metrics["error"]
            else:
                score, error = metrics["combined_score"], None
            step_card = card(source)
            step = {
                "iteration": it,
                **step_card,
                "practice": score,
                "error": error,
                "new_best": score is not None and score > run["best"]["practice"],
                "source": source,
            }
            run["history"].append(step)
            if step["new_best"] and source:
                run["best"] = {
                    "source": source,
                    "practice": score,
                    "name": step_card["name"],
                    "iteration": it,
                    "model": m,
                }
        if on_step:
            on_step(runs)
        if it >= min(MIN_ITERATIONS, rounds) and all(
            run["best"]["practice"] >= run["target"] for run in runs.values()
        ):
            break
    best = {m: run["best"] for m, run in runs.items()}
    history = {m: run["history"] for m, run in runs.items()}
    return best, history
