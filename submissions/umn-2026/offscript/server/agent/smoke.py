"""Live smoke test: can the configured model call a tool and use its result?

    uv run python -m server.agent.smoke

Needs a real key in .env (GEMINI_API_KEY). Makes two small requests. Exit codes:
0 = tool call round trip worked, 1 = the model did not behave as required, 2 = not configured.
"""
from __future__ import annotations

import json
import sys

from .config import load_dotenv, provider_from_env
from .model import ModelError, ToolResult, ToolSpec

TOOL = ToolSpec(
    name="get_temperature",
    description="Return the current temperature in Celsius for a city.",
    parameters={"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]},
)


def main() -> int:
    load_dotenv()
    try:
        provider = provider_from_env()
    except ModelError as exc:
        print(f"Not configured: {exc}. Put GEMINI_API_KEY in .env (see .env.example).")
        return 2
    print(f"provider={provider.name} model={getattr(provider, 'model', '?')}")
    try:
        session = provider.start(system="Use tools when needed. Be brief.", tools=[TOOL])
        turn = session.send(user="What is the temperature in Minneapolis right now?")
        if not turn.tool_calls:
            print("FAIL: model answered without calling the tool:", turn.text[:200])
            return 1
        call = turn.tool_calls[0]
        print(f"tool call: {call.name} {json.dumps(call.arguments)}")
        if call.name != TOOL.name or "city" not in call.arguments:
            print("FAIL: unexpected tool call shape")
            return 1
        result = ToolResult(call_id=call.id, name=call.name, content=json.dumps({"celsius": 17.5}))
        final = session.send(tool_results=[result])
        print("final:", final.text[:300])
        if "17" not in final.text:
            print("FAIL: final answer does not reflect the tool result")
            return 1
        print("OK: tool-calling round trip works. usage:", final.usage)
        return 0
    except ModelError as exc:
        print(f"FAIL: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
