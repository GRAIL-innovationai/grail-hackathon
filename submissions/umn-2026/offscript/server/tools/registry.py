"""Typed tool registry. Arguments are validated by Pydantic models; failures come back to the
model as structured errors instead of exceptions, so the loop can continue or stop cleanly."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ValidationError

from server.agent.model import ToolSpec


@dataclass
class ToolOutput:
    data: dict[str, Any]
    summary: str  # one line for the activity feed: a real action or outcome, never reasoning
    ok: bool = True
    terminal: str | None = None  # "proposal_saved" | "needs_clarification" ends the run


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args_model: type[BaseModel]
    handler: Callable[[Any], ToolOutput]


def _strip_titles(node: Any) -> Any:
    if isinstance(node, dict):
        return {k: _strip_titles(v) for k, v in node.items() if k != "title"}
    if isinstance(node, list):
        return [_strip_titles(v) for v in node]
    return node


def error(kind: str, message: str, **extra: Any) -> ToolOutput:
    return ToolOutput({"error": {"type": kind, "message": message, **extra}}, f"{kind}: {message}", ok=False)


@dataclass
class ToolRegistry:
    tools: dict[str, Tool] = field(default_factory=dict)

    def register(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def specs(self) -> list[ToolSpec]:
        return [ToolSpec(t.name, t.description, _strip_titles(t.args_model.model_json_schema()))
                for t in self.tools.values()]

    def call(self, name: str, raw_args: dict[str, Any]) -> ToolOutput:
        tool = self.tools.get(name)
        if tool is None:  # models can request tools that do not exist; never execute anything else
            return error("unknown_tool", f"no tool named {name!r}", available=sorted(self.tools))
        try:
            args = tool.args_model.model_validate(raw_args or {})
        except ValidationError as exc:
            problems = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
            return error("invalid_arguments", problems)
        return tool.handler(args)
