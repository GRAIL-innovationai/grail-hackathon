"""OpenRouter client for RSI (workshop-style)."""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any

from openai import OpenAI

from agent_d.prompts import SYSTEM

LOG: dict[str, Any] = {"calls": []}
_client: OpenAI | None = None
SPEND_LIMIT = 2.0
TEMPERATURE = 0.7
REASONING = "low"
MAX_TOKENS = {"low": 12000, "medium": 24000, "high": 48000}
DEFAULT_MODEL = "openai/gpt-oss-20b"


class Stop(Exception):
    pass


def _load_dotenv() -> None:
    """Read repo-root .env when the key is not already in the environment."""
    if os.environ.get("OPENROUTER_API_KEY"):
        return
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    try:
        with open(path) as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, value = line.split("=", 1)
                os.environ.setdefault(name.strip(), value.strip().strip("'\""))
    except OSError:
        return


def connect() -> OpenAI:
    global _client
    _load_dotenv()
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise Stop("OPENROUTER_API_KEY is not set")
    _client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=key)
    return _client


def spent() -> float:
    total = 0.0
    for call in LOG["calls"]:
        usage = call.get("usage") or {}
        if usage.get("cost") is not None:
            total += float(usage["cost"])
    return total


def over_budget() -> bool:
    return spent() >= SPEND_LIMIT


def ask_llm(user_message: str, tag: str, model: str = DEFAULT_MODEL) -> str:
    if _client is None:
        connect()
    if over_budget():
        raise Stop(f"Spending limit {SPEND_LIMIT} reached")
    prompt_id = hashlib.sha256((SYSTEM + "\x00" + user_message).encode()).hexdigest()[:16]
    for attempt in range(4):
        try:
            reply = _client.chat.completions.create(
                model=model,
                temperature=TEMPERATURE,
                max_tokens=MAX_TOKENS.get(REASONING, 12000),
                messages=[
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": user_message},
                ],
                extra_body={
                    "provider": {"sort": "throughput"},
                    "reasoning": {"effort": REASONING},
                    "usage": {"include": True},
                },
            )
            text = reply.choices[0].message.content or ""
            counts = reply.usage.model_dump() if reply.usage else {}
            usage = {k: counts.get(k) for k in ("prompt_tokens", "completion_tokens", "cost")}
            LOG["calls"].append(
                {
                    "tag": tag,
                    "model": model,
                    "prompt_id": prompt_id,
                    "usage": usage,
                }
            )
            return text
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            if status in (401, 402, 403):
                raise Stop(f"OpenRouter refused the call (HTTP {status})") from None
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    return ""


def ask_all(prompts: dict[str, str], tag: str) -> dict[str, str]:
    from concurrent.futures import ThreadPoolExecutor

    if len(prompts) == 1:
        model, prompt = next(iter(prompts.items()))
        return {model: ask_llm(prompt, tag, model)}
    with ThreadPoolExecutor(len(prompts)) as pool:
        futures = {m: pool.submit(ask_llm, p, tag, m) for m, p in prompts.items()}
        return {m: futures[m].result() for m in futures}
