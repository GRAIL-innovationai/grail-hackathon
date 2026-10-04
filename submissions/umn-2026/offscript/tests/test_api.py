"""API tests: scripted model + demo (synthetic) data, so no keys or network are used."""
from __future__ import annotations

import time
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from server.agent.model import ModelError, ModelTurn, ToolCall
from server.agent.scripted import ScriptedProvider
from server.api.app import create_app

NOW = datetime(2026, 6, 6, 10, 0, tzinfo=UTC)


def tc(i, name, **args):
    return ModelTurn(tool_calls=(ToolCall(f"c{i}", name, args),))


def script():
    return [tc(1, "search_places", category="outdoor"), tc(2, "get_place_details", place_ids=["lakeside-trail"]),
            tc(3, "estimate_routes", place_ids=["lakeside-trail"], mode="walk"),
            tc(4, "assemble_plan", place_ids=["lakeside-trail"], mode="walk"), tc(5, "validate_plan", plan_id="plan-1"),
            tc(6, "save_proposal", plan_id="plan-1", explanation="A short walk.")]


BODY = {"request": "a short walk", "lat": 44.97, "lon": -93.26, "tz": "America/Chicago", "minutes": 180,
        "budget_dollars": 20, "mode": "walk", "data": "demo"}


def wait(client, rid):
    for _ in range(100):
        j = client.get(f"/api/runs/{rid}").json()
        if j["done"]:
            return j
        time.sleep(0.05)
    raise AssertionError("run did not finish")


def test_plan_flow_returns_checked_proposal_with_coordinates():
    c = TestClient(create_app(lambda: ScriptedProvider(script()), lambda: NOW))
    r = c.post("/api/plans", json=BODY)
    assert r.status_code == 200
    j = wait(c, r.json()["run_id"])
    assert j["error"] is None and j["result"]["status"] == "proposal_saved"
    p = j["result"]["proposal"]
    assert p["overall"] == "checked" and p["blocks"][0]["name"].startswith("Lakeside Trail")
    assert p["blocks"][0]["lat"] is not None and j["result"]["data"]["synthetic"] is True
    assert any("DEMO DATA" in n for n in p["notes"])
    assert j["events"][0]["summary"] == "Called search_places"
    assert j["events"][1]["summary"].startswith("Searched places")


def test_location_is_required_and_validated():
    c = TestClient(create_app(lambda: ScriptedProvider([]), lambda: NOW))
    no_loc = {k: v for k, v in BODY.items() if k not in ("lat", "lon")}
    assert c.post("/api/plans", json=no_loc).status_code == 422
    assert c.post("/api/plans", json={**BODY, "lat": 123}).status_code == 422
    assert c.post("/api/plans", json={**BODY, "tz": "Mars/Base"}).status_code == 422


def test_missing_model_key_gives_clear_503():
    def boom():
        raise ModelError("GEMINI_API_KEY is not set")

    c = TestClient(create_app(boom, lambda: NOW))
    r = c.post("/api/plans", json=BODY)
    assert r.status_code == 503 and "not configured" in r.json()["detail"]
    assert c.get("/api/health").json() == {"ok": True, "model_configured": False}


def test_unknown_run_404_and_index_served():
    c = TestClient(create_app(lambda: ScriptedProvider([]), lambda: NOW))
    assert c.get("/api/runs/nope").status_code == 404
    page = c.get("/")
    assert page.status_code == 200 and "Share my location" in page.text and 'integrity="sha256-' in page.text
