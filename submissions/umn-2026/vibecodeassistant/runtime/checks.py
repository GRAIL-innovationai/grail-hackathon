"""Turn crawl records into runtime findings. Each finding cites the evidence it was built from."""
import re
from urllib.parse import urlsplit

from .models import Finding

STACK_TRACE = re.compile(r"Traceback \(most recent call last\)|\n\s+at [\w.<>$]+ \(.+:\d+:\d+\)|Exception in thread|Werkzeug Debugger|node_modules/", re.I)
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _path(url: str) -> str:
    p = urlsplit(url)
    return p.path + (f"?{p.query}" if p.query else "")


def _f(category, title, url, observed, evidence, impact, severity, rationale, fix, selector=None, **extra) -> Finding:
    return Finding(category=category, title=title, location={"url": url, "selector": selector}, observed=observed,
                   evidence=evidence, impact=impact, severity=severity, severity_rationale=rationale,
                   proposed_fix=fix, **extra)


def _page_checks(rec, link_sources) -> list:
    out, url, status = [], rec["url"], rec["status"]
    shot = [f"screenshot: {rec['screenshot']}"] if rec.get("screenshot") else []
    linked_from = sorted(link_sources.get(url, ()))
    refs = [f"linked from {_path(s)}" for s in linked_from[:5]]

    if rec["error"]:
        out.append(_f("page-load-failure", f"Page failed to load: {_path(url)}", url,
                      f"Navigation failed: {rec['error']}", [rec["error"], *refs, *shot],
                      "Users following this link get a browser error.", "medium",
                      "Route is unreachable from inside the app.", "Fix the route handler or remove links to it.",
                      uncertainty="Could be a timeout on a slow dev server; rerun to confirm."))
    elif status and status >= 500:
        out.append(_f("server-error", f"Server error {status} on {_path(url)}", url,
                      f"GET {_path(url)} returned {status}.", [f"GET {_path(url)} -> {status}", *refs, *shot],
                      "The page is broken for every user who reaches it.", "medium",
                      "Reachable route crashes server-side.", "Check the server logs for this route and handle the failing case."))
        if rec.get("body_excerpt") and STACK_TRACE.search(rec["body_excerpt"]):
            out.append(_f("verbose-error", f"Stack trace exposed on {_path(url)}", url,
                          "Error response body contains a stack trace / debugger output.",
                          [f"GET {_path(url)} -> {status}", "body excerpt: " + rec["body_excerpt"][:300], *shot],
                          "Reveals file paths, framework versions and code to anyone; a Werkzeug debugger page means remote code execution.",
                          "medium", "Information disclosure observed directly in the response (OWASP A02/A10).",
                          "Disable debug mode in deployed config and return a generic error page."))
    elif status and status >= 400:
        out.append(_f("broken-link" if linked_from else "broken-page", f"{status} on {_path(url)}", url,
                      f"GET {_path(url)} returned {status}." + (f" Linked from {len(linked_from)} page(s)." if linked_from else ""),
                      [f"GET {_path(url)} -> {status}", *refs, *shot],
                      "Dead end for users; signals unfinished pages.", "low",
                      "Broken navigation, no data exposure.", "Create the page or fix/remove the link."))

    for form in rec.get("forms", []):
        # Unnamed controls are not included in native form submission. The bundled
        # React signup handles submission in JS and its password has no name.
        if form["method"] == "get" and any(f["type"] == "password" and f.get("name") for f in form["fields"]):
            out.append(_f("password-in-get-form", f"Password form submits via GET on {_path(url)}", url,
                          f"Form posting to {_path(form['action'])} uses method=GET with a password field.",
                          [f"form {form['selector']}: method=get, fields={[f['name'] for f in form['fields']]}"],
                          "Passwords land in the URL, browser history, server/proxy logs and Referer headers.",
                          "high", "Credential exposure on every submit; trivially observable.",
                          'Use method="post" and send credentials in the request body.', selector=form["selector"]))
    return out


def _grouped_checks(pages, target_host) -> list:
    out = []
    errors, exceptions, net, insecure = {}, {}, {}, {}
    for rec in pages:
        for c in rec.get("console", []):
            # "Failed to load resource" duplicates the network finding below
            if c["level"] == "error" and not c["text"].startswith("Failed to load resource"):
                errors.setdefault(c["text"][:200], set()).add(rec["url"])
        for e in rec.get("page_errors", []):
            exceptions.setdefault(e[:200], set()).add(rec["url"])
        for r in rec.get("requests", []):
            host = urlsplit(r["url"]).hostname or ""
            if r["url"] == rec.get("final_url") or r["url"] == rec["url"]:
                continue  # the document itself is covered by page checks
            if r.get("failure") or (r["status"] and r["status"] >= 400):
                key = (r["method"], _path(r["url"]) if host == target_host else r["url"], r["status"] or r.get("failure"))
                net.setdefault(key, (r, set()))[1].add(rec["url"])
            if r["url"].startswith("http://") and host not in LOCAL_HOSTS and not host.endswith(".localhost"):
                insecure.setdefault(host, set()).add(r["url"])

    for text, urls in exceptions.items():
        u = sorted(urls)
        out.append(_f("uncaught-exception", f"Uncaught JavaScript exception: {text[:80]}", u[0],
                      f"Uncaught exception on {len(u)} page(s): {text}", [f"pageerror on {_path(x)}" for x in u[:5]],
                      "Part of the page's JavaScript stopped running; features on these pages may be broken.", "medium",
                      "Runtime crash in the browser, observed directly.", "Fix the throwing code path; add an error boundary."))
    for text, urls in errors.items():
        u = sorted(urls)
        out.append(_f("console-error", f"Console error: {text[:80]}", u[0],
                      f"console.error on {len(u)} page(s): {text}", [f"console[error] on {_path(x)}" for x in u[:5]],
                      "Indicates failing app logic or noisy debug output.", "low",
                      "Observed error log; impact depends on what failed.", "Investigate the logged error and fix or remove it."))
    for (method, where, status), (r, urls) in net.items():
        api = r["type"] in ("fetch", "xhr")
        sev = "medium" if api and isinstance(status, int) and status >= 500 else "low"
        out.append(_f("network-failure", f"{method} {where[:80]} -> {status}", sorted(urls)[0],
                      f"{r['type']} request {method} {where} failed with {status} on {len(urls)} page(s).",
                      [f"{method} {where} -> {status} (from {_path(x)})" for x in sorted(urls)[:5]],
                      "Data or assets the page expects did not load.", sev,
                      "Server error on an API call breaks a feature." if sev == "medium" else "Failed request, limited impact.",
                      "Fix the endpoint or the client call; handle the error state in the UI.",
                      uncertainty="401/403 may be expected for unauthenticated requests." if status in (401, 403) else ""))
    for host, urls in insecure.items():
        u = sorted(urls)
        out.append(_f("insecure-request", f"Plain-HTTP request to external host {host}", u[0],
                      f"{len(u)} request(s) to http://{host}.", u[:5],
                      "Traffic to this host can be read or modified in transit; becomes mixed content when deployed on HTTPS.",
                      "low", "Only exploitable on hostile networks.", f"Use https:// for {host}."))
    return out


def _submission_checks(submissions) -> list:
    out = []
    for s in submissions:
        where = f"{s['selector']} on {_path(s['page'])}"
        ev = [f"submitted {where} with fake data", f"{s['request']} -> {s['status']}",
              *[f"console[error]: {c}" for c in s["console_errors"][:3]], *s["failed_requests"][:3]]
        if s["status"] and s["status"] >= 500:
            out.append(_f("form-submit-error", f"Form submit returns {s['status']}: {where}", s["page"],
                          f"Submitting the {s['kind']} form with valid-looking fake data returned {s['status']}.", ev,
                          "Users submitting this form hit a server crash; input handling is likely unvalidated.", "medium",
                          "Reproducible server error on a user-facing action.",
                          "Validate input server-side and handle the failing case; return a 4xx for bad input.",
                          selector=s["selector"], validation_status="reproduced"))
        for err in s["page_errors"]:
            out.append(_f("form-submit-exception", f"JS exception on submit: {where}", s["page"],
                          f"Uncaught exception after submitting: {err}", ev + [f"pageerror: {err}"],
                          "The form's client-side handler crashes; the submission may silently fail.", "medium",
                          "Reproducible client crash on a user-facing action.", "Fix the submit handler; surface errors to the user.",
                          selector=s["selector"], validation_status="reproduced"))
    return out


def _auth_checks(auth) -> list:
    probe = (auth or {}).get("rate_limit_probe")
    if not probe or probe["limited"]:
        return []
    statuses = [r["status"] for r in probe["results"]]
    return [_f("no-login-rate-limit", f"No login throttling after {probe['tries']} failed attempts", probe["login_url"],
               f"{probe['tries']} consecutive wrong-password logins all returned {sorted(set(map(str, statuses)))} "
               "with no 429 or lockout message.",
               [f"attempt {i}: status {st}" for i, st in enumerate(statuses, 1)],
               "Attackers can guess passwords or replay leaked credentials (credential stuffing) at full speed.",
               "medium", "Reproduced directly; OWASP A07 Authentication Failures.",
               "Add per-IP and per-account rate limiting to login (e.g. express-rate-limit, slowapi, Supabase auth rate limits).",
               validation_status="reproduced",
               uncertainty="Limits may exist above 5 attempts, or at a WAF/edge only present in production.")]


def run(pages, link_sources, target_host, submissions=(), auth=None) -> list:
    findings = ([f for rec in pages for f in _page_checks(rec, link_sources)] + _grouped_checks(pages, target_host)
                + _submission_checks(submissions) + _auth_checks(auth))
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    findings.sort(key=lambda f: (order[f.severity], f.category, f.location["url"]))
    for i, f in enumerate(findings, 1):
        f.id = f"RT-{i:03d}"
    return findings
