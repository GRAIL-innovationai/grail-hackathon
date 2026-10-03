"""httpx client construction that survives broken proxy environment variables.

Some environments set NO_PROXY entries (e.g. bare "[::1]") that this httpx version cannot
parse, raising httpx.InvalidURL at Client() construction time. Falling back to
trust_env=False keeps the provider working instead of crashing; in sane environments the
default behavior (respecting env proxies) is unchanged.
"""
from __future__ import annotations

from typing import Any

import httpx


def make_client(**kwargs: Any) -> httpx.Client:
    try:
        return httpx.Client(**kwargs)
    except httpx.InvalidURL:
        kwargs["trust_env"] = False
        return httpx.Client(**kwargs)
