"""Provider-neutral model interface for the agent loop.

A provider starts a *session* with a system prompt and tool specs; the agent then calls
`send` with either a user message or the results of the tool calls the model requested.
Sessions are stateful so a provider can use server-side conversation state (Gemini's
`previous_interaction_id`) or keep its own message list (Anthropic-style APIs).
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol


class ModelError(RuntimeError):
    """The model call failed. Messages never contain credentials."""


class ModelRateLimited(ModelError):
    """Rate limit or temporary overload persisted after bounded retries."""


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema object


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ToolResult:
    call_id: str
    name: str
    content: str  # JSON text produced by the tool, including provenance and errors


@dataclass(frozen=True)
class ModelTurn:
    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    usage: dict[str, int] = field(default_factory=dict)


class ModelSession(Protocol):
    def send(self, *, user: str | None = None, tool_results: Sequence[ToolResult] = ()) -> ModelTurn:
        ...


class ModelProvider(Protocol):
    name: str

    def start(self, *, system: str, tools: Sequence[ToolSpec]) -> ModelSession:
        ...
