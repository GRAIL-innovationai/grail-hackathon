from data.load import build_batch
from agent_d.baselines import COPY_BASELINE
from agent_d.evaluator import evaluator
from agent_d.sandbox import run_program, screen


def test_illegal_import_rejected():
    bad = "import os\n\ndef tailor_resume(train, tasks):\n    return []\n"
    assert screen(bad) is not None


def test_reorder_baseline_runs_on_val():
    metrics = evaluator(COPY_BASELINE, split="val")
    assert "error" not in metrics
    assert metrics["combined_score"] == 0.0


def test_timeout_returns_an_error():
    slow = """
def tailor_resume(train, tasks):
    import time
    time.sleep(120)
    return []
"""
    _, err = run_program(slow, build_batch("val"), timeout=1)
    assert err is not None
