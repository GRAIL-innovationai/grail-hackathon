// Tiny localhost app with seeded defects, used to test the runtime inspector.
// Every state-changing request (form submit, logout, delete link) is recorded in SUBMITS so tests can prove
// read_only mode never changed anything. Stats live at /__fixture/stats (not linked anywhere).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlc2VjcmV0";
export const SESSION_SECRET = "SESSIONSECRET123";
export const URL_SECRET = "supersecrettoken123";
export const TEST_USER = "tester@example.test";
export const TEST_PASS = "correct-horse";
export const SUBMITS: string[] = [];
let loginAttempts = 0;

const page = (title: string, body: string) =>
  `<!doctype html><html lang=en><head><title>${title}</title></head><body>${body}</body></html>`;

const NAV =
  '<a href="/">Home</a> <a href="/about">About</a> <a href="/missing">Missing page</a> ' +
  '<a href="/error500">Reports</a> <a href="/js-error">Widgets</a> <a href="/fetch-fail">Data</a> ' +
  '<a href="/login">Login</a> <a href="/signin">Sign in</a> <a href="/account">Account</a> ' +
  '<a href="/dashboard">Dashboard</a> <a href="/files/report.pdf">Report PDF</a> <a href="/logout">Log out</a> ' +
  '<a href="/register">Register</a> <a href="/legacy-login">Old login</a> <a href="/feedback-js">Feedback</a>' +
  // footer form on every page: must be submitted once, and it crashes the server
  '<form action="/api/newsletter" method="post"><input name="email" type="email" required><button>Subscribe</button></form>';

const PAGES: Record<string, string> = {
  "/": page("Home", NAV + `<script>
    fetch('/api/data?token=${URL_SECRET}', {headers: {Authorization: 'Bearer ${FAKE_JWT}'}});
    console.warn('debug key', '${FAKE_JWT}');
  </script>`),
  "/about": page("About", NAV + "<p>About us</p>"),
  "/js-error": page("Widgets", NAV + "<script>console.error('Checkout widget failed to init'); window.notDefinedFn();</script>"),
  "/fetch-fail": page("Data", NAV + "<script>fetch('/api/missing'); fetch('/api/boom');</script>"),
  "/login": page("Login", NAV + `<form action="/api/login-get" method="get">
    Log in <input name="email" type="email"><input name="password" type="password"><button>Log in</button></form>`),
  "/signin": page("Sign in", NAV + `<form action="/signin" method="post">
    Sign in <input name="username" type="email"><input name="password" type="password"><button>Sign in</button></form>`),
  // React-style: no method/action, JS handles submit. Must NOT be flagged as password-over-GET.
  "/register": page("Register", NAV + `<form id="reg" onsubmit="event.preventDefault(); this.querySelector('p').textContent = 'ok'">
    Create account <input name="email" type="email"><input name="password" type="password"><input name="confirm" type="password">
    <button>Create account</button><p></p></form>`),
  // No method, no action, no JS: the browser GETs the password into the URL. Only provable by submitting.
  "/legacy-login": page("Old login", NAV + `<form>Member login <input name="user"><input name="password" type="password"><button>Go</button></form>`),
  // Controlled-input style: no name attributes at all, required fields, JS fetch POST on submit.
  "/feedback-js": page("Feedback", NAV + `<form id="fb">Send feedback
    <input id="fb-email" type="email" required><textarea required placeholder="Your feedback"></textarea><button>Send</button></form>
    <script>document.getElementById('fb').addEventListener('submit', (e) => { e.preventDefault();
      const [email, msg] = e.target.querySelectorAll('input, textarea');
      fetch('/api/feedback', {method: 'POST', body: JSON.stringify({email: email.value, message: msg.value})}); });</script>`),
  "/account": page("Account", NAV + `
    <form id="contact" action="/api/contact" method="post">Contact us
      <input name="name" required><input name="email" type="email" required>
      <textarea name="message"></textarea><input name="age" type="number" min="18" max="99"><button>Send</button></form>
    <form id="danger" action="/api/delete-account" method="post"><button>Delete my account</button></form>
    <a href="/account/delete?confirm=1">Delete account (link)</a>`),
};

// Client-side router. /spa/ leaks on every visit to its "leaky" route (window listener whose closure holds ~800 KB);
// /spa-clean/ renders the same routes but removes its listener when leaving: the false-positive control.
const spa = (root: string, leaky: boolean) => page("SPA", `
  <nav><a href="${root}" data-link>Home</a> <a href="${root}leaky" data-link>Reports</a> <a href="${root}about" data-link>About</a></nav>
  <main id="view"></main>
  <script>
    let cleanup = null;
    function render() {
      if (cleanup) { cleanup(); cleanup = null; }
      const view = document.getElementById('view');
      if (location.pathname.endsWith('/leaky')) {
        const big = new Array(100000).fill(Math.random());
        const onResize = () => big.length;
        window.addEventListener('resize', onResize);
        ${leaky ? "" : "cleanup = () => window.removeEventListener('resize', onResize);"}
        view.textContent = 'Reports view';
      } else view.textContent = location.pathname.endsWith('/about') ? 'About view' : 'Home view';
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-link]');
      if (!a) return;
      e.preventDefault();
      history.pushState({}, '', a.href);
      render();
    });
    window.addEventListener('popstate', render);
    render();
  </script>`);

const TRACEBACK = page("Error",
  "<pre>Traceback (most recent call last):\n  File \"/srv/app/views.py\", line 12, in reports\nKeyError: 'user'</pre>");

function send(res: ServerResponse, status: number, body: string, type = "text/html", headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  const authed = (req.headers.cookie ?? "").includes("auth=ok");
  if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    if (path === "/signin") {
      loginAttempts++;
      if (form.get("username") === TEST_USER && form.get("password") === TEST_PASS)
        return send(res, 302, "", "text/html", { Location: "/dashboard", "Set-Cookie": "auth=ok; Path=/; HttpOnly" });
      return send(res, 401, page("Sign in", NAV + "<p>Invalid credentials</p>"));
    }
    SUBMITS.push(`POST ${path} ${body}`);
    if (path === "/api/newsletter") return send(res, 500, page("Error", "internal error"));
    if (path === "/api/contact" && !(form.get("email") ?? "").includes("@")) return send(res, 400, page("Bad request", "invalid email"));
    return send(res, 200, page("Thanks", NAV + "<p>Thanks</p>"));
  }
  if (path.startsWith("/spa/")) return send(res, 200, spa("/spa/", true));
  if (path.startsWith("/spa-clean/")) return send(res, 200, spa("/spa-clean/", false));
  if (path === "/__fixture/stats") return send(res, 200, JSON.stringify({ submits: SUBMITS, login_attempts: loginAttempts }), "application/json");
  if (["/api/login-get", "/logout", "/account/delete"].includes(path)) {
    SUBMITS.push(`GET ${path}`);
    return send(res, 200, page("Done", "ok"));
  }
  if (path === "/dashboard")
    return authed
      ? send(res, 200, page("Dashboard", NAV + '<p>Welcome back</p><a href="/dashboard/settings">Settings</a>'))
      : send(res, 302, "", "text/html", { Location: "/signin" });
  if (path === "/dashboard/settings") return send(res, authed ? 200 : 401, page("Settings", NAV + "<p>Settings</p>"));
  if (path === "/") return send(res, 200, PAGES["/"], "text/html", { "Set-Cookie": `session=${SESSION_SECRET}; Path=/; HttpOnly` });
  if (PAGES[path]) return send(res, 200, PAGES[path]);
  if (path === "/error500") return send(res, 500, TRACEBACK);
  if (path === "/api/data") return send(res, 200, '{"ok": true}', "application/json");
  if (path === "/api/boom") return send(res, 500, '{"error": "boom"}', "application/json");
  return send(res, 404, page("Not found", "not found"));
}

/** Start on a random port. Close the returned server when done. */
export async function startFixture(): Promise<{ server: Server; base: string }> {
  SUBMITS.length = 0;
  loginAttempts = 0;
  const server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { base } = await startFixture();
  console.log(`fixture site on ${base} (Ctrl+C to stop)`);
}
