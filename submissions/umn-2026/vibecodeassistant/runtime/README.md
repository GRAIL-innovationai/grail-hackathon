# Runtime Inspector (Team Member 2 — Anvith)

Connects to a running **localhost** app, crawls it in headless Chromium, and reports runtime findings: broken pages and links, server errors, exposed stack traces, console errors, uncaught JS exceptions, failed network requests, and risky forms. Anything it didn't check is listed under `gaps`, never reported as "passed".

```bash
pip install -r requirements.txt && python -m playwright install chromium
python -m runtime http://localhost:3000 --preflight-only        # reachability, stack, external backends
python -m runtime http://localhost:3000 --out runs/run.json     # read_only crawl
python tests/test_runtime.py                                    # fixture-site tests
```

## Modes (the end user picks one per run)
| Mode | Behaviour |
|---|---|
| `read_only` (default) | Follows links only. Forms are inventoried, never submitted. |
| `fake_data` | Also submits forms with obviously fake values. Destructive forms (delete, pay, checkout…) are skipped and listed as gaps. |
| `authenticated` | `fake_data` plus logging in with **test** credentials (`VIBEAUDIT_USERNAME`/`VIBEAUDIT_PASSWORD` env vars, or `--storage-state`). |

In `authenticated` mode, login counts as successful only if the response isn't an error, the browser leaves the login URL, **and** a new cookie, localStorage key or IndexedDB database appears. A redirect alone is not proof. Afterwards, 5 wrong-password attempts for a non-existent user run in a separate browser context to check for login throttling (`run.auth.rate_limit_probe`). Credentials are scrubbed from the report, including URL-encoded copies.

Links that look state-changing (`/logout`, `/delete…`) are never followed in any mode. Non-local targets are refused.

**Why preflight first:** a vibe-coded app on localhost usually talks to a *real* Supabase or Firebase project, so `fake_data` writes can land in production data. `preflight()` returns `backend_hosts` so the UI can show the user exactly where writes would go before they pick a mode.

## Integration
```python
from runtime import preflight, inspect, to_json
pf = preflight("http://localhost:3000")       # {"reachable", "fingerprint", "backend_hosts", ...}
report = inspect("http://localhost:3000", mode="read_only")
json_text = to_json(report)                   # always serialize via to_json: it applies secret redaction
```

The report has these top-level keys:
- `run`: id, target, mode, caps, `fingerprint` (e.g. `Next.js`, `server: Werkzeug/…`), `backend_hosts` (`[{host, kind}]`, where kind is Supabase / Firestore / OpenAI / analytics / external).
- `pages[]`: per URL: status, final_url, response headers (secrets masked), console, page_errors, requests, links (href and text), forms (fields, method, kind, `has_csrf_token`, `destructive`), and text_excerpt. **Arush / Giovanni:** headers, cookies, links and page text are here, so there's no need to crawl twice.
- `submissions[]` (`fake_data`/`authenticated` only): per submitted form: request, status, final_url, console and page errors, failed requests, fields it couldn't fill.
- `cookies[]`: name, domain, flags (`httpOnly`, `secure`, `sameSite`), no values.
- `findings[]`: `id, source, category, title, location{url, selector}, observed, evidence[], impact, prerequisites, severity, severity_rationale, validation_status, uncertainty, proposed_fix, revision, retest_result`. Field names follow the team agent spec's finding record.
- `gaps[]`: `{check, target, reason}`.
