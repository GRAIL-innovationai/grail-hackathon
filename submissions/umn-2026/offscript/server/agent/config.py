"""Model provider selection from environment variables / a local .env file.

SIDEQUEST_MODEL_PROVIDER = gemini (default). GEMINI_API_KEY and GEMINI_MODEL come from the
environment; secrets are read server-side only and are never logged.
"""
from __future__ import annotations

import os
from pathlib import Path

from .gemini import GeminiProvider
from .model import ModelError, ModelProvider

DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"  # free tier: gemini-3.8-flash allows only 20 requests/day; override with GEMINI_MODEL


def load_dotenv(path: Path | str = ".env") -> None:
    """Minimal .env loader: KEY=VALUE lines; real environment variables win."""
    p = Path(path)
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if v:
            os.environ.setdefault(k.strip(), v)


def provider_from_env() -> ModelProvider:
    name = os.environ.get("SIDEQUEST_MODEL_PROVIDER", "gemini").lower()
    if name == "gemini":
        return GeminiProvider(os.environ.get("GEMINI_API_KEY", ""),
                              os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL))
    raise ModelError(f"unknown SIDEQUEST_MODEL_PROVIDER {name!r}")
