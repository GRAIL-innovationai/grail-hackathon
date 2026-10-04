"""A bounded retry for the rate limit observed during live testing."""
import httpx
import pytest
import literature


def test_rate_limit_retries_once(monkeypatch):
    request = httpx.Request("GET", literature.CROSSREF)
    replies = iter([httpx.Response(429, request=request), httpx.Response(200, json={"ok": True}, request=request)])
    monkeypatch.setattr(literature.httpx, "get", lambda *a, **k: next(replies))
    monkeypatch.setattr(literature.time, "sleep", lambda seconds: None)
    assert literature.get_json(literature.CROSSREF) == {"ok": True}


def test_persistent_rate_limit_surfaces_failure(monkeypatch):
    request = httpx.Request("GET", literature.CROSSREF)
    count = []
    def limited(*args, **kwargs):
        count.append(1)
        return httpx.Response(429, request=request)
    monkeypatch.setattr(literature.httpx, "get", limited)
    monkeypatch.setattr(literature.time, "sleep", lambda seconds: None)
    with pytest.raises(httpx.HTTPStatusError):
        literature.get_json(literature.CROSSREF)
    assert len(count) == 2
