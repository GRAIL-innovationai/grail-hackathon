"""Gemini adapter using the Interactions REST API.

Request/response shapes follow Google's published reference (POST /v1beta/interactions:
`input`, `system_instruction`, `tools`, `previous_interaction_id`; response `id`, `status`,
`steps[]` with `model_output` and `function_call` steps). This module has been tested against
that documented shape with a mock transport; run `python -m server.agent.smoke` with a real key
to verify it against the live service.
"""
from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from typing import Any

import httpx

from server.http import make_client

from .model import (
    ModelError,
    ModelRateLimited,
    ModelTurn,
    ToolCall,
    ToolResult,
    ToolSpec,
)

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
RETRY_STATUSES = {429, 500, 502, 503, 504}


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str, *, client: httpx.Client | None = None,
                 base_url: str = BASE_URL, max_retries: int = 3, backoff_s: float = 5.0, max_wait_s: float = 60.0,
                 sleep: Callable[[float], None] = time.sleep, timeout_s: float = 60.0):
        if not api_key:
            raise ModelError("GEMINI_API_KEY is not set")
        self._key = api_key
        self.model = model
        self._client = client or make_client(timeout=timeout_s)
        self._base = base_url.rstrip("/")
        self._max_retries = max_retries
        self._backoff = backoff_s
        self._max_wait = max_wait_s
        self._sleep = sleep

    def _wait_s(self, resp: httpx.Response, attempt: int) -> float:
        """Honor Retry-After when present; otherwise exponential backoff. Always capped."""
        hinted = _retry_after(resp)
        wait = hinted if hinted is not None else self._backoff * (2 ** attempt)
        return max(0.0, min(wait, self._max_wait))

    def start(self, *, system: str, tools: Sequence[ToolSpec]) -> GeminiSession:
        return GeminiSession(self, system, tuple(tools))

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base}/interactions"
        headers = {"x-goog-api-key": self._key, "Content-Type": "application/json"}
        for attempt in range(self._max_retries + 1):
            try:
                resp = self._client.post(url, json=body, headers=headers)
            except httpx.HTTPError as exc:  # network failure; the key is never in the message
                raise ModelError(f"Gemini request failed: {type(exc).__name__}") from None
            if resp.status_code in RETRY_STATUSES and attempt < self._max_retries:
                self._sleep(self._wait_s(resp, attempt))
                continue
            if resp.status_code in RETRY_STATUSES:
                raise ModelRateLimited(f"Gemini returned {resp.status_code} after "
                                       f"{self._max_retries + 1} attempts")
            if resp.status_code >= 400:
                raise ModelError(f"Gemini returned {resp.status_code}: {_error_text(resp)}")
            return resp.json()
        raise ModelError("unreachable")


class GeminiSession:
    def __init__(self, provider: GeminiProvider, system: str, tools: tuple[ToolSpec, ...]):
        self._p = provider
        self._system = system
        self._tools = [{"type": "function", "name": t.name, "description": t.description,
                        "parameters": t.parameters} for t in tools]
        self._previous_id: str | None = None

    def send(self, *, user: str | None = None, tool_results: Sequence[ToolResult] = ()) -> ModelTurn:
        if (user is None) == (not tool_results):
            raise ModelError("send() needs exactly one of user or tool_results")
        if tool_results:
            payload: Any = [{"type": "function_result", "name": r.name, "call_id": r.call_id,
                             "result": [{"type": "text", "text": r.content}]} for r in tool_results]
        else:
            payload = user
        body: dict[str, Any] = {"model": self._p.model, "input": payload,
                                "system_instruction": self._system, "tools": self._tools}
        if self._previous_id:
            body["previous_interaction_id"] = self._previous_id
        data = self._p._post(body)

        status = data.get("status")
        if status in {"failed", "cancelled"}:
            raise ModelError(f"Gemini interaction {status}")
        self._previous_id = data.get("id") or self._previous_id
        text_parts: list[str] = []
        calls: list[ToolCall] = []
        for step in data.get("steps", []):
            kind = step.get("type")
            if kind == "model_output":
                text_parts += [c["text"] for c in step.get("content", []) if c.get("text")]
            elif kind == "function_call":
                calls.append(ToolCall(id=step.get("id", ""), name=step["name"],
                                      arguments=step.get("arguments") or {}))
        usage = {k: v for k, v in (data.get("usage") or {}).items() if isinstance(v, int)}
        return ModelTurn(text="".join(text_parts), tool_calls=tuple(calls), usage=usage)


def _retry_after(resp: httpx.Response) -> float | None:
    raw = resp.headers.get("retry-after")
    try:
        return float(raw) if raw is not None else None
    except ValueError:
        return None


def _error_text(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error", {})
        return str(err.get("message", ""))[:300] or "no message"
    except ValueError:
        return "non-JSON error body"
