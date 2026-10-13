#!/usr/bin/env python3
"""Zero-shot, RSI loop, and locked test evaluation."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent_d.baselines import COPY_BASELINE
from agent_d.evaluator import evaluate_test, evaluator
from agent_d.llm import DEFAULT_MODEL, connect
from agent_d.loop import first_working_program, rsi_loop
from agent_d.prompts import ZERO_SHOT_PROMPT


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--rounds", type=int, default=8)
    parser.add_argument("--minutes", type=float, default=12.0)
    parser.add_argument("--skip-loop", action="store_true", help="Only zero-shot and baseline")
    parser.add_argument("--baseline-only", action="store_true")
    args = parser.parse_args()

    baseline_metrics = evaluator(COPY_BASELINE, split="val")
    print("Baseline (reorder only) validation:", json.dumps(baseline_metrics, indent=2))

    if args.baseline_only:
        test = evaluate_test(COPY_BASELINE)
        print("Baseline test:", json.dumps(test, indent=2))
        return

    connect()
    zero = first_working_program(ZERO_SHOT_PROMPT, args.model)
    print("Zero-shot validation combined_score:", zero["practice"])

    if args.skip_loop:
        test = evaluate_test(zero["source"])
        print("Zero-shot test:", json.dumps(test, indent=2))
        return

    starts = {args.model: zero}
    best, history = rsi_loop(
        starts=starts,
        model=args.model,
        rounds=args.rounds,
        minutes=args.minutes,
    )
    b = best[args.model]
    print(f"Best after loop (iter {b['iteration']}): validation {b['practice']:.4f}")
    test = evaluate_test(b["source"])
    print("Locked test:", json.dumps(test, indent=2))

    out_dir = ROOT / "agent_d" / "artifacts"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "best_program.py").write_text(b["source"])
    (out_dir / "history.json").write_text(json.dumps(history, indent=2))


if __name__ == "__main__":
    main()
