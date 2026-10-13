"""End-to-end smoke test in mock mode (no key): the score must rise and the best message must lint clean."""
import pytest
from fastapi.testclient import TestClient

from backend import llm
from backend.main import app

client = TestClient(app)


@pytest.mark.skipif(not llm.MOCK, reason="needs mock mode (unset OPENROUTER_API_KEY)")
def test_mock_run_end_to_end():
    assert client.get("/health").json()["mock"] is True
    cand = client.get("/resumes").json()[0]
    ranked = client.post("/match", json={"candidate": cand, "target_role": "backend"}).json()
    assert len(ranked) == 20 and ranked[0]["score"] >= ranked[-1]["score"]

    run = client.post("/run", json={"candidate": cand, "job_id": ranked[0]["job_id"], "n": 4}).json()
    scores = [it["score"] for it in run["iterations"]]
    assert scores == sorted(scores) and scores[-1] > scores[0], scores
    assert not run["iterations"][0]["lint"]["passed"]  # v0 fabricates, the linter zeroes it
    best = run["iterations"][run["best_n"] - 1]
    assert best["lint"]["passed"] and best["message"]["chars"] < 300
    mean = lambda evs: sum(e["outcome_reward"] for e in evs) / len(evs)
    assert mean(run["optimized_test"]) > mean(run["baseline_test"])
    assert client.get(f"/runs/{run['id']}").json()["id"] == run["id"]


def test_resume_text_and_bad_run_id():
    cand = client.post("/resume", json={"text": "- Built X\n- Shipped Y with 3 users"}).json()
    assert [l["id"] for l in cand["lines"]] == ["R1", "R2"]
    assert client.get("/runs/..%2F..%2Fetc").status_code == 404
