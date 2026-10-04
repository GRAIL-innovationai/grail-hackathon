"""Connect to a running localhost app, crawl it, and capture runtime evidence."""
import re
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from playwright.sync_api import Error as PWError, sync_playwright

from . import checks, forms
from .models import Gap, redact_headers, scrub

VERSION = "0.1.0"
MODES = ("read_only", "fake_data", "authenticated")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
ASSET_EXT = re.compile(r"\.(pdf|zip|png|jpe?g|gif|svg|webp|ico|mp4|mp3|woff2?|ttf|csv|xlsx?|docx?)$", re.I)
# GET links can change state too (logout, delete-by-link); never follow these in any mode.
STATE_CHANGING_LINK = re.compile(r"(?<![a-z])(log-?out|sign-?out|delete|remove|destroy|unsubscribe|deactivate)(?![a-z])", re.I)
LOGIN_PATHS = ("login", "signin", "sign-in", "auth/login", "auth/signin", "account/login", "users/sign_in")
RATE_LIMIT_TEXT = re.compile(r"too many|rate.?limit|try again (?:later|in)|temporarily locked|slow down", re.I)
STORAGE_JS = """async () => ({ls: Object.keys(localStorage),
  idb: indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : []})"""
KNOWN_HOSTS = {
    "supabase.co": "Supabase", "supabase.in": "Supabase", "firebaseio.com": "Firebase Realtime DB",
    "firestore.googleapis.com": "Firestore", "identitytoolkit.googleapis.com": "Firebase Auth",
    "securetoken.googleapis.com": "Firebase Auth", "firebasestorage.googleapis.com": "Firebase Storage",
    "api.openai.com": "OpenAI", "api.anthropic.com": "Anthropic", "generativelanguage.googleapis.com": "Gemini",
    "api.stripe.com": "Stripe", "js.stripe.com": "Stripe", "clerk.accounts.dev": "Clerk",
    "google-analytics.com": "analytics", "googletagmanager.com": "analytics", "connect.facebook.net": "analytics",
    "hotjar.com": "analytics", "posthog.com": "analytics", "segment.io": "analytics", "mixpanel.com": "analytics",
}


def validate_target(url: str) -> str:
    parts = urlsplit(url if "://" in url else "http://" + url)
    host = (parts.hostname or "").lower()
    if parts.scheme not in ("http", "https") or not (host in LOCAL_HOSTS or host.endswith(".localhost")):
        raise ValueError(f"refusing target {url!r}: only localhost, 127.0.0.1, [::1] and *.localhost are allowed")
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", parts.query, ""))


def _normalize(href: str, origin: str) -> str | None:
    p = urlsplit(href)
    if p.scheme not in ("http", "https") or f"{p.scheme}://{p.netloc}" != origin:
        return None
    frag = p.fragment if p.fragment.startswith("/") else ""  # keep hash routes like #/about
    return urlunsplit((p.scheme, p.netloc, p.path or "/", p.query, frag))


def _new_record(url: str) -> dict:
    return {"url": url, "final_url": None, "status": None, "title": None, "headers": {}, "load_ms": None,
            "console": [], "page_errors": [], "requests": [], "links": [], "forms": [], "text_excerpt": None,
            "body_excerpt": None, "error": None, "screenshot": None}


def _attach(page, rec: dict) -> None:
    page.on("console", lambda m: rec["console"].append(
        {"level": m.type, "text": m.text[:500], "source": (m.location or {}).get("url")}))
    page.on("pageerror", lambda e: rec["page_errors"].append(str(e)[:500]))
    page.on("response", lambda r: rec["requests"].append(
        {"method": r.request.method, "url": r.url, "status": r.status, "type": r.request.resource_type}))
    page.on("requestfailed", lambda r: rec["requests"].append(
        {"method": r.method, "url": r.url, "status": None, "type": r.resource_type, "failure": r.failure}))


def _visit(context, url: str, timeout_ms: int):
    """Open url in a fresh tab and capture everything. Returns (record, page); caller closes the page."""
    page = context.new_page()
    rec = _new_record(url)
    _attach(page, rec)
    t0 = time.monotonic()
    try:
        resp = page.goto(url, wait_until="load", timeout=timeout_ms)
        try:
            page.wait_for_load_state("networkidle", timeout=3000)
        except PWError:
            pass  # long-polling / HMR sockets keep the network busy; "load" is enough
        rec["load_ms"] = round((time.monotonic() - t0) * 1000)
        rec["final_url"] = page.url
        if resp:
            rec["status"], rec["headers"] = resp.status, resp.all_headers()  # .headers drops Set-Cookie/security headers
        rec["title"] = page.title()
        rec["links"] = page.eval_on_selector_all(
            "a[href]", "els => els.map(e => ({href: e.href, text: (e.innerText || '').trim().slice(0, 80)}))")
        rec["forms"] = forms.inventory(page)
        rec["text_excerpt"] = page.inner_text("body")[:2000]
        if rec["status"] and rec["status"] >= 500:
            rec["body_excerpt"] = page.content()[:2000]
    except PWError as e:
        rec["error"] = str(e).strip().splitlines()[0][:300]
    return rec, page


def _session_keys(context, page) -> set:
    """Names (never values) of cookies, localStorage keys and IndexedDB databases: login creates new ones."""
    try:
        st = page.evaluate(STORAGE_JS)
    except PWError:
        st = {"ls": [], "idb": []}
    return ({f"cookie:{c['name']}" for c in context.cookies()} | {f"localStorage:{k}" for k in st["ls"]}
            | {f"indexedDB:{k}" for k in st["idb"]})


def _submit(context, url: str, form: dict, run_id: str, timeout_ms: int, credentials: dict | None = None) -> dict:
    """Reload url in a fresh tab, fill the form, submit it, and capture what happened."""
    page = context.new_page()
    rec = _new_record(url)
    _attach(page, rec)
    result = {"page": url, "selector": form["selector"], "action": form["action"], "method": form["method"],
              "kind": form["kind"], "request": None, "status": None, "final_url": None, "skipped_fields": [],
              "console_errors": [], "page_errors": [], "failed_requests": [], "new_session_keys": [],
              "text_excerpt": None, "error": None}
    try:
        page.goto(url, wait_until="load", timeout=timeout_ms)
        loc = page.locator(form["selector"])
        result["skipped_fields"] = forms.fill(loc, form, run_id, credentials)
        n_req, n_con, n_err = len(rec["requests"]), len(rec["console"]), len(rec["page_errors"])
        before = _session_keys(context, page)
        loc.evaluate("f => f.requestSubmit ? f.requestSubmit() : f.submit()")
        page.wait_for_timeout(500)
        for state in ("load", "networkidle"):
            try:
                page.wait_for_load_state(state, timeout=5000)
            except PWError:
                pass
        new = rec["requests"][n_req:]
        sub = next((r for r in new if r["type"] == "document" or (r["type"] in ("fetch", "xhr") and r["method"] != "GET")), None)
        result.update(
            request=f"{sub['method']} {sub['url']}" if sub else None,
            status=sub["status"] if sub else None,
            final_url=page.url,
            console_errors=[c["text"] for c in rec["console"][n_con:] if c["level"] == "error"],
            page_errors=rec["page_errors"][n_err:],
            failed_requests=[f"{r['method']} {r['url']} -> {r['status'] or r.get('failure')}" for r in new
                             if r is not sub and (r.get("failure") or (r["status"] or 0) >= 400)],
            new_session_keys=sorted(_session_keys(context, page) - before),
            text_excerpt=page.inner_text("body")[:300])
        if not sub:
            result["error"] = "no submission request observed (client-side validation or a JS handler blocked it)"
    except PWError as e:
        result["error"] = str(e).strip().splitlines()[0][:300]
    page.close()
    return result


def _login(context, origin: str, target: str, credentials: dict, run_id: str, timeout_ms: int) -> dict:
    """Find a login form (given login_url, landing page, or common paths) and sign in with the test credentials.

    Success needs all three: a non-error response, leaving the login URL, and a new cookie/storage key.
    A redirect alone is not proof (a form can "succeed" without creating a session).
    """
    given = _normalize(credentials["login_url"], origin) if credentials.get("login_url") else None
    urls = [given] if given else [target] + [f"{origin}/{p}" for p in LOGIN_PATHS]
    auth = {"method": "credentials", "success": False, "attempts": []}
    for url in urls:
        rec, page = _visit(context, url, timeout_ms)
        page.close()
        for form in (f for f in rec["forms"] if f["kind"] == "login"):
            s = _submit(context, rec["final_url"], form, run_id, timeout_ms, credentials)
            ok = (s["status"] is not None and s["status"] < 400 and bool(s["new_session_keys"])
                  and urlsplit(s["final_url"]).path != urlsplit(rec["final_url"]).path)
            auth["attempts"].append({"login_url": rec["final_url"], "selector": form["selector"], "status": s["status"],
                                     "final_url": s["final_url"], "new_session_keys": s["new_session_keys"], "success": ok})
            if ok:
                auth.update(success=True, login_url=rec["final_url"], landing_url=s["final_url"], form=form)
                return auth
    return auth


def _rate_limit_probe(browser, auth: dict, run_id: str, timeout_ms: int, tries: int = 5) -> dict:
    """Up to `tries` wrong-password logins for a non-existent user, in a separate context so the test account
    and the authenticated session are not locked out. Stops at the first sign of throttling."""
    context = browser.new_context(ignore_https_errors=True)
    wrong = {"username": f"vibeaudit+ratelimit-{run_id}@example.test", "password": f"wrong-{run_id}"}
    results = []
    for _ in range(tries):
        s = _submit(context, auth["login_url"], auth["form"], run_id, timeout_ms, wrong)
        limited = s["status"] == 429 or bool(RATE_LIMIT_TEXT.search(s["text_excerpt"] or ""))
        results.append({"status": s["status"], "limited": limited})
        if limited:
            break
    context.close()
    return {"login_url": auth["login_url"], "tries": len(results), "results": results,
            "limited": any(r["limited"] for r in results)}


def _probe_asset(context, url: str, timeout_ms: int) -> dict:
    rec = _new_record(url)
    try:
        r = context.request.get(url, timeout=timeout_ms)
        rec["status"], rec["final_url"], rec["headers"] = r.status, r.url, r.headers
    except PWError as e:
        rec["error"] = str(e).strip().splitlines()[0][:300]
    rec["kind"] = "asset"
    return rec


def _fingerprint(pages: list) -> list:
    hints = set()
    for rec in pages:
        h = {k.lower(): v for k, v in rec["headers"].items()}
        for k in ("x-powered-by", "server"):
            if h.get(k):
                hints.add(f"{k}: {h[k]}")
        for r in rec["requests"]:
            u = r["url"]
            if "/_next/" in u:
                hints.add("Next.js")
            if "/@vite/client" in u or "/@react-refresh" in u:
                hints.add("Vite dev server")
            if "/_nuxt/" in u:
                hints.add("Nuxt")
            if "/static/js/bundle.js" in u:
                hints.add("Create React App")
    return sorted(hints)


def _backend_hosts(pages: list, target_host: str) -> list:
    hosts = {}
    for rec in pages:
        for r in rec["requests"]:
            host = urlsplit(r["url"]).hostname or ""
            if host and host != target_host:
                kind = next((v for k, v in KNOWN_HOSTS.items() if host == k or host.endswith("." + k)), "external")
                hosts.setdefault(host, kind)
    return [{"host": h, "kind": k} for h, k in sorted(hosts.items())]


def _clean(rec: dict) -> dict:
    rec["headers"] = redact_headers(rec["headers"])
    return rec


def preflight(url: str, timeout_ms: int = 15000) -> dict:
    """Load only the landing page: is it reachable, what stack, which external backends does it call?"""
    target = validate_target(url)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        rec, page = _visit(browser.new_context(ignore_https_errors=True), target, timeout_ms)
        page.close()
        browser.close()
    return {
        "target": target,
        "reachable": rec["error"] is None and rec["status"] is not None,
        "status": rec["status"],
        "error": rec["error"],
        "fingerprint": _fingerprint([rec]),
        "backend_hosts": _backend_hosts([rec], urlsplit(target).hostname),
        "note": "backend_hosts are from the landing page only; modes other than read_only may write to these hosts.",
    }


def inspect(url: str, mode: str = "read_only", credentials: dict | None = None, storage_state: str | None = None,
            max_pages: int = 50, max_depth: int = 4, page_timeout_ms: int = 15000, time_budget_s: int = 300,
            out_dir: str | None = None) -> dict:
    """Crawl the app at url and return the runtime report (run, pages, submissions, cookies, findings, gaps)."""
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}")
    if mode == "authenticated" and not (credentials or storage_state):
        raise ValueError("authenticated mode needs test credentials or a storage_state file")
    target = validate_target(url)
    split = urlsplit(target)
    origin, target_host = f"{split.scheme}://{split.netloc}", split.hostname
    run_id = uuid.uuid4().hex[:8]
    started = datetime.now(timezone.utc).isoformat()
    screens = Path(out_dir, f"screens-{run_id}") if out_dir else None

    pages, gaps, submissions, link_sources, seen_forms = [], [], [], {}, set()
    queue, seen = deque([(target, 0)]), {target}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(ignore_https_errors=True, storage_state=storage_state)
        auth = None
        if mode == "authenticated" and storage_state:
            auth = {"method": "storage_state", "success": None}
        elif mode == "authenticated":
            auth = _login(context, origin, target, credentials, run_id, page_timeout_ms)
            if auth["success"]:
                landing = _normalize(auth["landing_url"], origin)
                if landing and landing not in seen:  # post-login landing page may not be linked from home
                    seen.add(landing)
                    queue.append((landing, 0))
            else:
                gaps.append(Gap("auth", target, "login failed or no login form found; crawl continues unauthenticated"))
        deadline = time.monotonic() + time_budget_s
        while queue:
            if len(pages) >= max_pages or time.monotonic() > deadline:
                why = f"page cap {max_pages}" if len(pages) >= max_pages else f"time budget {time_budget_s}s"
                gaps += [Gap("crawl", u, f"not visited: {why} reached") for u, _ in queue]
                break
            u, depth = queue.popleft()
            if ASSET_EXT.search(urlsplit(u).path):
                pages.append(_clean(_probe_asset(context, u, page_timeout_ms)))
                continue
            rec, page = _visit(context, u, page_timeout_ms)
            rec["depth"] = depth
            if screens and (rec["error"] or (rec["status"] or 0) >= 400 or rec["page_errors"]):
                screens.mkdir(parents=True, exist_ok=True)
                rec["screenshot"] = str(screens / f"page-{len(pages):03d}.png")
                try:
                    page.screenshot(path=rec["screenshot"], full_page=True)
                except PWError:
                    rec["screenshot"] = None
            page.close()
            pages.append(_clean(rec))

            final = rec["final_url"]
            if final and urlsplit(final).path != urlsplit(u).path and any(f["kind"] == "login" for f in rec["forms"]):
                gaps.append(Gap("crawl", u, f"auth-gated: redirected to login page {final}"))
            for form in rec["forms"]:
                if forms.key(form) in seen_forms:
                    continue
                seen_forms.add(forms.key(form))
                where = f"{final} {form['selector']}"
                if mode == "read_only":
                    gaps.append(Gap("form-submit", where, "read_only mode: form inventoried, not submitted"))
                elif mode == "authenticated" and form["kind"] == "login":
                    gaps.append(Gap("form-submit", where, "login form not resubmitted, to keep the test session"))
                elif form["destructive"]:
                    gaps.append(Gap("form-submit", where, "skipped: destructive form (delete/pay/checkout/...)"))
                else:
                    s = _submit(context, final, form, run_id, page_timeout_ms)
                    submissions.append(s)
                    gaps += [Gap("form-field", where, f"not filled: {m}") for m in s["skipped_fields"]]
                    if s["error"]:
                        gaps.append(Gap("form-submit", where, s["error"]))

            for link in rec["links"]:
                n = _normalize(link["href"], origin)
                if not n:
                    continue
                link_sources.setdefault(n, set()).add(u)
                if n in seen:
                    continue
                seen.add(n)
                if STATE_CHANGING_LINK.search(urlsplit(n).path + "?" + urlsplit(n).query):
                    gaps.append(Gap("crawl", n, "not followed: link looks state-changing (logout/delete/...)"))
                elif depth + 1 > max_depth:
                    gaps.append(Gap("crawl", n, f"not visited: depth cap {max_depth} reached"))
                else:
                    queue.append((n, depth + 1))
        if auth and auth.get("success"):
            auth["rate_limit_probe"] = _rate_limit_probe(browser, auth, run_id, page_timeout_ms)
            auth.pop("form")
        elif auth and auth["method"] == "storage_state":
            gaps.append(Gap("auth", target, "login rate-limit probe skipped: no login form used (storage_state)"))
        cookies = [{k: c.get(k) for k in ("name", "domain", "path", "httpOnly", "secure", "sameSite", "expires")}
                   for c in context.cookies()]
        browser.close()

    findings = checks.run(pages, link_sources, target_host, submissions, auth)
    report = {
        "run": {"id": run_id, "tool": "runtime-inspector", "version": VERSION, "target": target, "mode": mode,
                "started_at": started, "finished_at": datetime.now(timezone.utc).isoformat(),
                "caps": {"max_pages": max_pages, "max_depth": max_depth, "page_timeout_ms": page_timeout_ms,
                         "time_budget_s": time_budget_s},
                "pages_visited": len(pages), "fingerprint": _fingerprint(pages),
                "backend_hosts": _backend_hosts(pages, target_host), "auth": auth},
        "pages": pages,
        "submissions": submissions,
        "cookies": cookies,
        "findings": findings,
        "gaps": gaps,
    }
    # The test credentials never leave this function, even if the app echoes them back into a page.
    secrets = [v for v in ((credentials or {}).get("username"), (credentials or {}).get("password")) if v and len(v) >= 4]
    return scrub(report, secrets) if secrets else report
