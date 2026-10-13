from backend.lint import lint_message
from backend.schemas import Candidate, Line

CAND = Candidate(id="t", lines=[
    Line(id="R1", text="Software Engineering Intern, Harborlight Logistics: built a FastAPI service that cut latency from 900 ms to 120 ms"),
    Line(id="R2", text="Moved nightly jobs to Airflow; failed-run rate dropped 60%"),
])


def test_pass():
    lint = lint_message("Hi — at Harborlight Logistics I cut FastAPI latency from 900 ms to 120 ms and moved jobs to Airflow (60% fewer failures).", CAND)
    assert lint.passed, lint.offending


def test_fabricated_number():
    lint = lint_message("I cut latency by 95% at Harborlight Logistics.", CAND)
    assert not lint.passed and "95%" in lint.offending


def test_fabricated_tool():
    lint = lint_message("I built a Kafka pipeline with FastAPI.", CAND)
    assert not lint.passed and "Kafka" in lint.offending
    assert "FastAPI" not in lint.offending


def test_lowercase_tool_and_allowlist():
    lint = lint_message("Hi Priya, I used kubernetes for the Ledgerwise role.", CAND, allow="Priya Sundaram Ledgerwise")
    assert lint.offending == ["kubernetes"]
