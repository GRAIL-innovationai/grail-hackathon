"""Adapter tests. The Gemini tests use a mock HTTP transport that returns responses in the
shape documented by Google's Interactions API reference. They verify OUR request building and
response parsing; they do not prove the live service behaves identically (see smoke.py)."""
from __future__ import annotations

import json

import httpx
import pytest

from server.agent.config import load_dotenv, provider_from_env
from server.agent.gemini import GeminiProvider
from server.agent.model import (
    ModelError,
    ModelRateLimited,
    ModelTurn,
    ToolCall,
    ToolResult,
    ToolSpec,
)
from server.agent.scripted import ScriptedProvider

TOOL = ToolSpec("get_temperature", "temp", {"type": "object", "properties": {"city": {"type": "string"}}})
SECRET = "sk-test-SECRET-123"


def make(handler, **kw):
    seen: list[httpx.Request] = []

    def wrapped(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return handler(req, len(seen))

    client = httpx.Client(transport=httpx.MockTransport(wrapped))
    kw.setdefault("sleep", lambda s: None)
    return GeminiProvider(SECRET, "gemini-test", client=client, **kw), seen


def test_tool_call_round_trip_builds_documented_requests_and_parses_responses():
    def handler(req, n):
        if n == 1:
            return httpx.Response(200, json={"id": "i1", "status": "requires_action", "steps": [
                {"type": "thought", "content": []},
                {"type": "function_call", "id": "c1", "name": "get_temperature",
                 "arguments": {"city": "Minneapolis"}}],
                "usage": {"total_tokens": 10, "extra": {"x": 1}}})
        return httpx.Response(200, json={"id": "i2", "status": "completed", "steps": [
            {"type": "model_output", "content": [{"type": "text", "text": "It is 17.5 C."}]}],
            "usage": {"total_tokens": 20}})

    provider, seen = make(handler)
    session = provider.start(system="SYS", tools=[TOOL])
    t1 = session.send(user="temp?")
    assert t1.tool_calls == (ToolCall("c1", "get_temperature", {"city": "Minneapolis"}),)
    assert t1.usage == {"total_tokens": 10}  # non-integer usage fields dropped
    t2 = session.send(tool_results=[ToolResult("c1", "get_temperature", '{"celsius": 17.5}')])
    assert t2.text == "It is 17.5 C." and not t2.tool_calls

    first, second = (json.loads(r.content) for r in seen)
    assert seen[0].url.path.endswith("/interactions")
    assert first["input"] == "temp?" and first["system_instruction"] == "SYS"
    assert first["tools"][0] == {"type": "function", "name": "get_temperature",
                                 "description": "temp", "parameters": TOOL.parameters}
    assert "previous_interaction_id" not in first
    assert second["previous_interaction_id"] == "i1"
    assert second["input"] == [{"type": "function_result", "name": "get_temperature",
                                "call_id": "c1", "result": [{"type": "text", "text": '{"celsius": 17.5}'}]}]
    assert seen[0].headers["x-goog-api-key"] == SECRET  # sent as a header, not in the URL
    assert SECRET not in str(seen[0].url)


def test_rate_limit_is_retried_a_bounded_number_of_times_then_reported():
    sleeps: list[float] = []

    def handler(req, n):
        return httpx.Response(429, json={"error": {"code": 429, "message": "slow down"}})

    provider, seen = make(handler, max_retries=2, backoff_s=1.0, sleep=sleeps.append)
    with pytest.raises(ModelRateLimited):
        provider.start(system="s", tools=[TOOL]).send(user="hi")
    assert len(seen) == 3 and sleeps == [1.0, 2.0]  # 1 try + 2 retries, exponential backoff


def test_transient_failure_then_success_recovers():
    def handler(req, n):
        if n == 1:
            return httpx.Response(503, json={})
        return httpx.Response(200, json={"id": "i", "status": "completed", "steps": [
            {"type": "model_output", "content": [{"type": "text", "text": "ok"}]}]})

    provider, seen = make(handler)
    assert provider.start(system="s", tools=[]).send(user="hi").text == "ok" and len(seen) == 2


def test_client_errors_are_not_retried_and_never_leak_the_key():
    def handler(req, n):
        return httpx.Response(400, json={"error": {"message": "bad schema"}})

    provider, seen = make(handler)
    with pytest.raises(ModelError) as exc:
        provider.start(system="s", tools=[]).send(user="hi")
    assert len(seen) == 1 and "400" in str(exc.value) and SECRET not in str(exc.value)


def test_network_failure_message_does_not_leak_the_key():
    def handler(req, n):
        raise httpx.ConnectError(f"cannot connect with {SECRET}")

    provider, _ = make(handler)
    with pytest.raises(ModelError) as exc:
        provider.start(system="s", tools=[]).send(user="hi")
    assert SECRET not in str(exc.value)


def test_failed_interaction_status_raises():
    provider, _ = make(lambda req, n: httpx.Response(200, json={"id": "i", "status": "failed", "steps": []}))
    with pytest.raises(ModelError):
        provider.start(system="s", tools=[]).send(user="hi")


def test_send_requires_exactly_one_input_kind():
    provider, _ = make(lambda req, n: httpx.Response(200, json={}))
    s = provider.start(system="s", tools=[])
    with pytest.raises(ModelError):
        s.send()
    with pytest.raises(ModelError):
        s.send(user="x", tool_results=[ToolResult("c", "n", "{}")])


def test_missing_key_is_a_clear_error(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("SIDEQUEST_MODEL_PROVIDER", raising=False)
    with pytest.raises(ModelError, match="GEMINI_API_KEY"):
        provider_from_env()


def test_unknown_provider_is_rejected(monkeypatch):
    monkeypatch.setenv("SIDEQUEST_MODEL_PROVIDER", "nope")
    with pytest.raises(ModelError, match="unknown"):
        provider_from_env()


def test_dotenv_loader_does_not_override_real_env(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("# c\nFOO_A=from_file\nFOO_B='quoted'\nEMPTY=\n", encoding="utf-8")
    monkeypatch.setenv("FOO_A", "from_env")
    monkeypatch.delenv("FOO_B", raising=False)
    monkeypatch.delenv("EMPTY", raising=False)
    load_dotenv(env)
    import os
    assert os.environ["FOO_A"] == "from_env" and os.environ["FOO_B"] == "quoted"
    assert "EMPTY" not in os.environ


def test_scripted_provider_replays_turns_and_records_inputs():
    provider = ScriptedProvider([
        ModelTurn(tool_calls=(ToolCall("c1", "get_temperature", {"city": "X"}),)),
        lambda results, user: ModelTurn(text=f"got {results[0].content}"),
    ])
    s = provider.start(system="s", tools=[TOOL])
    assert s.send(user="go").tool_calls[0].name == "get_temperature"
    assert s.send(tool_results=[ToolResult("c1", "get_temperature", "42")]).text == "got 42"
    with pytest.raises(ModelError):
        s.send(user="more")  # script exhausted
    assert s.log[0] == ("go", [])


def test_retry_after_header_is_honored_but_capped():
    sleeps: list[float] = []

    def handler(req, n):
        wait = {1: "7", 2: "9999"}.get(n)
        if wait:
            return httpx.Response(429, headers={"retry-after": wait}, json={})
        return httpx.Response(200, json={"id": "i", "status": "completed", "steps": [
            {"type": "model_output", "content": [{"type": "text", "text": "ok"}]}]})

    provider, seen = make(handler, max_retries=3, max_wait_s=60.0, sleep=sleeps.append)
    assert provider.start(system="s", tools=[]).send(user="hi").text == "ok"
    assert sleeps == [7.0, 60.0]  # hint used; absurd hint capped


def test_default_backoff_is_long_enough_for_per_minute_limits():
    p = GeminiProvider(SECRET, "m")
    assert p._max_retries >= 3 and p._backoff >= 5.0


def test_construction_survives_unparseable_proxy_env(monkeypatch):
    # Regression: bare "[::1]" in NO_PROXY made httpx raise InvalidURL at Client()
    # construction, which killed provider setup before any request was made.
    monkeypatch.setenv("NO_PROXY", "localhost,[::1]")
    monkeypatch.setenv("no_proxy", "localhost,[::1]")
    p = GeminiProvider(SECRET, "m")
    assert p._max_retries >= 3 and p._backoff >= 5.0
