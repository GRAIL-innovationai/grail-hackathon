"""Tiny localhost app with seeded defects, used to test the runtime inspector.

Every state-changing request (form submit, logout, delete link) is recorded in SUBMITS so tests can
prove read_only mode never changed anything. Stats live at /__fixture/stats (not linked anywhere).
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlc2VjcmV0"
SESSION_SECRET = "SESSIONSECRET123"
URL_SECRET = "supersecrettoken123"
TEST_USER, TEST_PASS = "tester@example.test", "correct-horse"
SUBMITS: list = []
LOGIN_ATTEMPTS: list = []


def _page(title, body):
    return f"<!doctype html><html lang=en><head><title>{title}</title></head><body>{body}</body></html>"


NAV = ('<a href="/">Home</a> <a href="/about">About</a> <a href="/missing">Missing page</a> '
       '<a href="/error500">Reports</a> <a href="/js-error">Widgets</a> <a href="/fetch-fail">Data</a> '
       '<a href="/login">Login</a> <a href="/signin">Sign in</a> <a href="/account">Account</a> '
       '<a href="/dashboard">Dashboard</a> <a href="/files/report.pdf">Report PDF</a> <a href="/logout">Log out</a>'
       # footer form on every page: must be submitted once, and it crashes the server
       '<form action="/api/newsletter" method="post"><input name="email" type="email" required><button>Subscribe</button></form>')

PAGES = {
    "/": _page("Home", NAV + f"""<script>
        fetch('/api/data?token={URL_SECRET}', {{headers: {{Authorization: 'Bearer {FAKE_JWT}'}}}});
        console.warn('debug key', '{FAKE_JWT}');
    </script>"""),
    "/about": _page("About", NAV + "<p>About us</p>"),
    "/js-error": _page("Widgets", NAV + "<script>console.error('Checkout widget failed to init'); window.notDefinedFn();</script>"),
    "/fetch-fail": _page("Data", NAV + "<script>fetch('/api/missing'); fetch('/api/boom');</script>"),
    "/login": _page("Login", NAV + """<form action="/api/login-get" method="get">
        Log in <input name="email" type="email"><input name="password" type="password"><button>Log in</button></form>"""),
    "/signin": _page("Sign in", NAV + """<form action="/signin" method="post">
        Sign in <input name="username" type="email"><input name="password" type="password"><button>Sign in</button></form>"""),
    "/account": _page("Account", NAV + """
        <form id="contact" action="/api/contact" method="post">Contact us
          <input name="name" required><input name="email" type="email" required>
          <textarea name="message"></textarea><input name="age" type="number" min="18" max="99"><button>Send</button></form>
        <form id="danger" action="/api/delete-account" method="post"><button>Delete my account</button></form>
        <a href="/account/delete?confirm=1">Delete account (link)</a>"""),
}

TRACEBACK = _page("Error", "<pre>Traceback (most recent call last):\n  File \"/srv/app/views.py\", line 12, in reports\nKeyError: 'user'</pre>")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, status, body, ctype="text/html", headers=()):
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _authed(self):
        return "auth=ok" in (self.headers.get("Cookie") or "")

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/__fixture/stats":
            return self._send(200, json.dumps({"submits": SUBMITS, "login_attempts": len(LOGIN_ATTEMPTS)}), "application/json")
        if path in ("/api/login-get", "/logout", "/account/delete"):
            SUBMITS.append(f"GET {path}")
            return self._send(200, _page("Done", "ok"))
        if path == "/dashboard":
            if not self._authed():
                return self._send(302, "", headers=[("Location", "/signin")])
            return self._send(200, _page("Dashboard", NAV + '<p>Welcome back</p><a href="/dashboard/settings">Settings</a>'))
        if path == "/dashboard/settings":
            return self._send(200 if self._authed() else 401, _page("Settings", NAV + "<p>Settings</p>"))
        if path == "/":
            return self._send(200, PAGES["/"], headers=[("Set-Cookie", f"session={SESSION_SECRET}; Path=/; HttpOnly")])
        if path in PAGES:
            return self._send(200, PAGES[path])
        if path == "/error500":
            return self._send(500, TRACEBACK)
        if path == "/api/data":
            return self._send(200, '{"ok": true}', "application/json")
        if path == "/api/boom":
            return self._send(500, '{"error": "boom"}', "application/json")
        return self._send(404, _page("Not found", "not found"))

    def do_POST(self):
        path = urlsplit(self.path).path
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        if path == "/signin":
            LOGIN_ATTEMPTS.append(1)
            form = parse_qs(body)
            if form.get("username") == [TEST_USER] and form.get("password") == [TEST_PASS]:
                return self._send(302, "", headers=[("Location", "/dashboard"), ("Set-Cookie", "auth=ok; Path=/; HttpOnly")])
            return self._send(401, _page("Sign in", NAV + "<p>Invalid credentials</p>"))
        SUBMITS.append(f"POST {path} {body}")
        if path == "/api/newsletter":
            return self._send(500, _page("Error", "internal error"))
        if path == "/api/contact" and "@" not in parse_qs(body).get("email", [""])[0]:
            return self._send(400, _page("Bad request", "invalid email"))
        return self._send(200, _page("Thanks", NAV + "<p>Thanks</p>"))


def start():
    """Start on a random port; returns (server, base_url). Call server.shutdown() when done."""
    SUBMITS.clear()
    LOGIN_ATTEMPTS.clear()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


if __name__ == "__main__":
    srv, base = start()
    print(f"fixture site on {base} (Ctrl+C to stop)")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        srv.shutdown()
