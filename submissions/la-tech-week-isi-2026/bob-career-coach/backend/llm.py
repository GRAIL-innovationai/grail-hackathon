"""One LLM entry point. OpenRouter when OPENROUTER_API_KEY is set, fixtures from backend/mock/ otherwise."""
import json
import os
import re
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
MOCK_DIR = Path(__file__).resolve().parent / "mock"

# Minimal .env loader so `cp .env.example .env` just works (real env vars win).
_env = ROOT / ".env"
if _env.exists():
    for _line in _env.read_text().splitlines():
        _k, _, _v = _line.partition("=")
        if _k.strip() and not _k.startswith("#"):
            os.environ.setdefault(_k.strip(), _v.strip())

API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
MODEL = os.environ.get("BOB_MODEL", "").strip() or "anthropic/claude-sonnet-4.5"
MOCK = not API_KEY
if MOCK:
    print("[career-coach] mock mode: no OPENROUTER_API_KEY, serving fixtures from backend/mock/")


def complete(system: str, user: str, skill_tag: str) -> str:
    if MOCK:
        return _mock(system, user, skill_tag)
    r = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "model": MODEL,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        },
        timeout=120,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _mock(system: str, user: str, skill_tag: str) -> str:
    """Fixture file = list of {"when": [substrings], "response": ...}.
    The LAST case whose substrings all appear in system+user wins; case 0 is the default."""
    try:
        cases = json.loads((MOCK_DIR / f"{skill_tag}.json").read_text())
        text = system + "\n" + user
        hits = [c for c in cases if all(w in text for w in c.get("when", []))]
        resp = (hits or cases)[-1 if hits else 0]["response"]
        return resp if isinstance(resp, str) else json.dumps(resp)
    except Exception as e:  # never raise in mock mode
        print(f"[career-coach] mock fixture error for {skill_tag!r}: {e}")
        return "{}"


def parse_json(raw: str) -> dict:
    """Pull the first {...} object out of a model reply (handles ```json fences and chatter)."""
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        out = json.loads(m.group(0)) if m else {}
        return out if isinstance(out, dict) else {}
    except json.JSONDecodeError:
        return {}
