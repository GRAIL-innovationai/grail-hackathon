"""LiveWorld unit tests. No network is used: the HTTP client is mocked or _load is bypassed."""
from __future__ import annotations

from datetime import UTC, date, datetime

import httpx
import pytest

from server.providers.base import ProviderError
from server.providers.live import LiveWorld


def _world(client=None) -> LiveWorld:
    return LiveWorld(lat=44.97, lon=-93.26, tz="America/Chicago", origin_id="here",
                     now=datetime.now(UTC), client=client)


def _element(**tags):
    return {"tags": tags, "lat": 44.971, "lon": -93.261, "type": "node", "osm_id": 1}


def test_construction_survives_unparseable_proxy_env(monkeypatch):
    monkeypatch.setenv("NO_PROXY", "localhost,[::1]")
    monkeypatch.setenv("no_proxy", "localhost,[::1]")
    assert _world().name  # must not raise httpx.InvalidURL


def test_cafe_allows_a_shortened_visit_but_a_park_does_not():
    w = _world()
    w._elements = {"osm-node-1": _element(amenity="cafe", name="Cafe"),
                   "osm-node-2": _element(leisure="park", name="Park")}
    day = date(2026, 10, 3)
    assert w.details("osm-node-1", day).place.optional_shrink is True
    assert w.details("osm-node-2", day).place.optional_shrink is False


def _garbage_client() -> httpx.Client:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>not json</html>")

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_garbled_overpass_body_is_a_labeled_provider_error():
    w = _world(_garbage_client())
    with pytest.raises(ProviderError) as exc:
        w.search(category="", query="", limit=5)
    assert exc.value.kind == "unavailable"


def test_garbled_open_meteo_body_is_a_labeled_provider_error():
    w = _world(_garbage_client())
    now = datetime.now(UTC)
    with pytest.raises(ProviderError) as exc:
        w.forecast(44.97, -93.26, now, now)
    assert exc.value.kind == "unavailable"
