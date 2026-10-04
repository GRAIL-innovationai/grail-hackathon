"""Runtime inspector checks against the seeded fixture site. Run: python tests/test_runtime.py (or pytest)."""
import json
import sys
import urllib.request
from pathlib import Path
from urllib.parse import quote, quote_plus

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]

import fixture_site  # noqa: E402
from runtime import inspect, preflight, to_json, validate_target  # noqa: E402


def _stats(base):
    return json.loads(urllib.request.urlopen(base + "/__fixture/stats").read())


def _cats(report):
    return {f.category for f in report["findings"]}


def test_refuses_non_local_targets():
    for bad in ("https://example.com", "http://10.0.0.5:3000", "http://localhost.evil.com", "file:///etc/passwd"):
        try:
            validate_target(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted non-local target {bad}")
    assert validate_target("localhost:3000") == "http://localhost:3000/"
    assert validate_target("http://app.localhost:5173/x") == "http://app.localhost:5173/x"


def test_read_only():
    srv, base = fixture_site.start()
    try:
        pf = preflight(base)
        assert pf["reachable"] and pf["status"] == 200

        report = inspect(base, max_pages=30)
        cats = _cats(report)
        for expected in ("broken-link", "server-error", "verbose-error", "uncaught-exception", "console-error",
                         "network-failure", "password-in-get-form"):
            assert expected in cats, f"missing {expected}: {sorted(cats)}"
        titles = " | ".join(f.title for f in report["findings"])
        assert "/files/report.pdf" in titles and "/api/missing" in titles and "/api/boom" in titles, titles

        assert _stats(base)["submits"] == [], "read_only mode changed server state"
        gap_text = " | ".join(f"{g.target} {g.reason}" for g in report["gaps"])
        assert "/logout" in gap_text and "/account/delete" in gap_text and "auth-gated" in gap_text, gap_text

        out = to_json(report)
        for secret in (fixture_site.SESSION_SECRET, fixture_site.FAKE_JWT, fixture_site.URL_SECRET):
            assert secret not in out, f"secret leaked into report: {secret}"
        json.loads(out)  # still valid JSON after redaction
    finally:
        srv.shutdown()


def test_fake_data():
    srv, base = fixture_site.start()
    try:
        report = inspect(base, mode="fake_data", max_pages=30)
        submits = _stats(base)["submits"]
        contact = [s for s in submits if s.startswith("POST /api/contact")]
        assert len(contact) == 1 and "vibeaudit%2B" in contact[0] and "age=18" in contact[0], submits
        assert sum(s.startswith("POST /api/newsletter") for s in submits) == 1, "footer form must be deduped"
        assert not any("delete" in s for s in submits), f"destructive action taken: {submits}"
        assert not any(s in ("GET /logout", "GET /account/delete") for s in submits), submits

        gap_text = " | ".join(f"{g.target} {g.reason}" for g in report["gaps"])
        assert "destructive form" in gap_text, gap_text
        bad = [f for f in report["findings"] if f.category == "form-submit-error"]
        assert len(bad) == 1 and "500" in bad[0].title and bad[0].validation_status == "reproduced", bad
        statuses = {s["action"].rsplit("/", 1)[-1]: s["status"] for s in report["submissions"]}
        assert statuses.get("contact") == 200 and statuses.get("newsletter") == 500, statuses
    finally:
        srv.shutdown()


def test_authenticated():
    srv, base = fixture_site.start()
    try:
        creds = {"username": fixture_site.TEST_USER, "password": fixture_site.TEST_PASS}
        report = inspect(base, mode="authenticated", credentials=creds, max_pages=30)
        auth = report["run"]["auth"]
        assert auth["success"] and auth["login_url"].endswith("/signin"), auth
        # /login's GET form "succeeds" by redirecting but creates no session: must not count as logged in
        assert auth["attempts"][0]["login_url"].endswith("/login") and not auth["attempts"][0]["success"], auth

        visited = {p["final_url"].replace(base, ""): p["status"] for p in report["pages"] if p["final_url"]}
        assert visited.get("/dashboard/settings") == 200, visited
        assert not any("auth-gated" in g.reason for g in report["gaps"])
        assert "no-login-rate-limit" in _cats(report)
        assert _stats(base)["login_attempts"] == 6, "expected 1 real login + 5 probe attempts"

        out = to_json(report)
        for cred in (fixture_site.TEST_USER, fixture_site.TEST_PASS):
            for form in (cred, quote(cred, safe=""), quote_plus(cred)):  # apps echo creds URL-encoded too
                assert form not in out, f"credential leaked: {form}"

        failed = inspect(base, mode="authenticated", credentials={**creds, "password": "wrong-pass"}, max_pages=5)
        assert failed["run"]["auth"]["success"] is False
        assert any(g.check == "auth" for g in failed["gaps"])
    finally:
        srv.shutdown()


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
