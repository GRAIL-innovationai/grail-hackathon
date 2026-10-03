"""A scripted stand-in for a model, for deterministic tests of the agent loop.

It is NOT a planner: it replays fixed turns. Anything shown using it must be labeled as
scripted, never as a live model run.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from .model import ModelError, ModelTurn, ToolResult, ToolSpec

Turn = ModelTurn | Callable[[list[ToolResult], str | None], ModelTurn]


@dataclass
class ScriptedProvider:
    turns: Sequence[Turn]
    name: str = "scripted"
    sessions: list[ScriptedSession] = field(default_factory=list)

    def start(self, *, system: str, tools: Sequence[ToolSpec]) -> ScriptedSession:
        s = ScriptedSession(list(self.turns), system, tuple(tools))
        self.sessions.append(s)
        return s


@dataclass
class ScriptedSession:
    turns: list[Turn]
    system: str
    tools: tuple[ToolSpec, ...]
    log: list[tuple[str | None, list[ToolResult]]] = field(default_factory=list)

    def send(self, *, user: str | None = None, tool_results: Sequence[ToolResult] = ()) -> ModelTurn:
        if (user is None) == (not tool_results):
            raise ModelError("send() needs exactly one of user or tool_results")
        self.log.append((user, list(tool_results)))
        if not self.turns:
            raise ModelError("scripted model has no more turns")
        turn = self.turns.pop(0)
        return turn(list(tool_results), user) if callable(turn) else turn
