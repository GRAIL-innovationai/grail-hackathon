// Connect to a running localhost app, crawl it, and capture runtime evidence.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import { launchBrowser } from "../browser/browser.ts";
import { runChecks } from "./checks.ts";
import { fill, formKey, inventory, type Credentials } from "./forms.ts";
import {
  firstLine, redactHeaders, scrub,
  type AuthInfo, type Finding, type FormInfo, type Gap, type HeapSample, type LeakProbe, type PageRecord,
  type RateLimitProbe, type Submission,
} from "./models.ts";

export const VERSION = "0.2.0";
export const MODES = ["read_only", "fake_data", "authenticated"] as const;
export type Mode = (typeof MODES)[number];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ASSET_EXT = /\.(pdf|zip|png|jpe?g|gif|svg|webp|ico|mp4|mp3|woff2?|ttf|csv|xlsx?|docx?)$/i;
// GET links can change state too (logout, delete-by-link); never follow these in any mode.
const STATE_CHANGING_LINK = /(?<![a-z])(log-?out|sign-?out|delete|remove|destroy|unsubscribe|deactivate)(?![a-z])/i;
const LOGIN_PATHS = ["login", "signin", "sign-in", "auth/login", "auth/signin", "account/login", "users/sign_in"];
const RATE_LIMIT_TEXT = /too many|rate.?limit|try again (?:later|in)|temporarily locked|slow down/i;
const KNOWN_HOSTS: Record<string, string> = {
  "supabase.co": "Supabase", "supabase.in": "Supabase", "firebaseio.com": "Firebase Realtime DB",
  "firestore.googleapis.com": "Firestore", "identitytoolkit.googleapis.com": "Firebase Auth",
  "securetoken.googleapis.com": "Firebase Auth", "firebasestorage.googleapis.com": "Firebase Storage",
  "api.openai.com": "OpenAI", "api.anthropic.com": "Anthropic", "generativelanguage.googleapis.com": "Gemini",
  "api.stripe.com": "Stripe", "js.stripe.com": "Stripe", "clerk.accounts.dev": "Clerk",
  "google-analytics.com": "analytics", "googletagmanager.com": "analytics", "connect.facebook.net": "analytics",
  "hotjar.com": "analytics", "posthog.com": "analytics", "segment.io": "analytics", "mixpanel.com": "analytics",
};

export interface InspectOptions {
  mode?: Mode;
  credentials?: Credentials | null; // test account only
  storageState?: string | null; // Playwright storageState file for an already-logged-in test session
  maxPages?: number;
  maxDepth?: number;
  pageTimeoutMs?: number;
  timeBudgetS?: number;
  outDir?: string | null; // screenshots of broken pages go here
  leakProbe?: boolean; // cycle client-side routes and watch heap/DOM/listener growth (default true)
  leakCycles?: number;
}

export interface Preflight {
  target: string;
  reachable: boolean;
  status: number | null;
  error: string | null;
  fingerprint: string[];
  backend_hosts: { host: string; kind: string }[];
  note: string;
}

export interface RuntimeReport {
  run: {
    id: string; tool: "runtime-inspector"; version: string; target: string; mode: Mode;
    started_at: string; finished_at: string;
    caps: { max_pages: number; max_depth: number; page_timeout_ms: number; time_budget_s: number };
    pages_visited: number; fingerprint: string[]; backend_hosts: { host: string; kind: string }[];
    auth: AuthInfo | null;
  };
  leak_probes: LeakProbe[];
  pages: PageRecord[];
  submissions: Submission[];
  cookies: Record<string, unknown>[];
  findings: Finding[];
  gaps: Gap[];
}

export function validateTarget(url: string): string {
  let u: URL;
  try {
    u = new URL(url.includes("://") ? url : "http://" + url);
  } catch {
    throw new Error(`refusing target ${JSON.stringify(url)}: not a valid URL`);
  }
  const host = u.hostname.toLowerCase();
  if (!["http:", "https:"].includes(u.protocol) || !(LOCAL_HOSTS.has(host) || host.endsWith(".localhost")) || u.username || u.password)
    throw new Error(`refusing target ${JSON.stringify(url)}: only localhost, 127.0.0.1, [::1] and *.localhost are allowed`);
  u.hash = "";
  return u.href;
}

function normalize(href: string, origin: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(u.protocol) || u.origin !== origin) return null;
  if (!u.hash.startsWith("#/")) u.hash = ""; // keep hash routes like #/about
  return u.href;
}

const newRecord = (url: string): PageRecord => ({
  url, final_url: null, status: null, title: null, headers: {}, load_ms: null, console: [], page_errors: [],
  requests: [], links: [], forms: [], text_excerpt: null, body_excerpt: null, error: null, screenshot: null,
});

function attach(page: Page, rec: PageRecord) {
  page.on("console", (m) => rec.console.push({ level: m.type(), text: m.text().slice(0, 500), source: m.location().url || null }));
  page.on("pageerror", (e) => rec.page_errors.push(e.message.slice(0, 500)));
  page.on("response", (r) =>
    rec.requests.push({ method: r.request().method(), url: r.url(), status: r.status(), type: r.request().resourceType() }));
  page.on("requestfailed", (r) =>
    rec.requests.push({ method: r.method(), url: r.url(), status: null, type: r.resourceType(), failure: r.failure()?.errorText }));
}

/** Open url in a fresh tab and capture everything. Caller closes the returned page. */
async function visit(context: BrowserContext, url: string, timeoutMs: number): Promise<[PageRecord, Page]> {
  const page = await context.newPage();
  const rec = newRecord(url);
  attach(page, rec);
  const t0 = Date.now();
  try {
    const resp = await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    // long-polling / HMR sockets keep the network busy; "load" is enough
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    rec.load_ms = Date.now() - t0;
    rec.final_url = page.url();
    if (resp) {
      rec.status = resp.status();
      rec.headers = await resp.allHeaders(); // .headers() drops Set-Cookie/security headers
    }
    rec.title = await page.title();
    rec.links = await page.$$eval("a[href]", (els) =>
      els.map((e) => ({ href: (e as HTMLAnchorElement).href, text: ((e as HTMLElement).innerText || "").trim().slice(0, 80) })));
    rec.forms = await inventory(page);
    rec.text_excerpt = (await page.innerText("body")).slice(0, 2000);
    if (rec.status && rec.status >= 500) rec.body_excerpt = (await page.content()).slice(0, 2000);
  } catch (e) {
    rec.error = firstLine(e);
  }
  return [rec, page];
}

/** Names (never values) of cookies, localStorage keys and IndexedDB databases: login creates new ones. */
async function sessionKeys(context: BrowserContext, page: Page): Promise<Set<string>> {
  const st = await page
    .evaluate(async () => ({
      ls: Object.keys(localStorage),
      idb: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name ?? "") : [],
    }))
    .catch(() => ({ ls: [] as string[], idb: [] as string[] }));
  return new Set([
    ...(await context.cookies()).map((c) => `cookie:${c.name}`),
    ...st.ls.map((k) => `localStorage:${k}`),
    ...st.idb.map((k) => `indexedDB:${k}`),
  ]);
}

/** Reload url in a fresh tab, fill the form, submit it, and capture what happened. */
async function submit(
  context: BrowserContext, url: string, form: FormInfo, runId: string, timeoutMs: number, credentials?: Credentials | null,
): Promise<Submission> {
  const page = await context.newPage();
  const rec = newRecord(url);
  attach(page, rec);
  const result: Submission = {
    page: url, selector: form.selector, action: form.action, method: form.method, kind: form.kind, request: null,
    status: null, final_url: null, skipped_fields: [], console_errors: [], page_errors: [], failed_requests: [],
    new_session_keys: [], password_in_url: null, text_excerpt: null, error: null,
  };
  try {
    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    const loc = page.locator(form.selector);
    result.skipped_fields = await fill(loc, form, runId, credentials);
    const [nReq, nCon, nErr] = [rec.requests.length, rec.console.length, rec.page_errors.length];
    const before = await sessionKeys(context, page);
    const invalid = await loc.evaluate((f) =>
      Array.from((f as HTMLFormElement).elements as HTMLCollectionOf<HTMLInputElement>)
        .filter((e) => e.willValidate && !e.checkValidity())
        .map((e) => `${e.name || e.id || e.type}: ${e.validationMessage}`));
    await loc.evaluate((f) => {
      const form = f as HTMLFormElement;
      return form.requestSubmit ? form.requestSubmit() : form.submit();
    });
    await page.waitForTimeout(500);
    for (const state of ["load", "networkidle"] as const) await page.waitForLoadState(state, { timeout: 5000 }).catch(() => {});
    const fresh = rec.requests.slice(nReq);
    const sub = fresh.find((r) => r.type === "document" || ((r.type === "fetch" || r.type === "xhr") && r.method !== "GET"));
    const after = await sessionKeys(context, page);
    Object.assign(result, {
      request: sub ? `${sub.method} ${sub.url}` : null,
      status: sub?.status ?? null,
      final_url: page.url(),
      console_errors: rec.console.slice(nCon).filter((c) => c.level === "error").map((c) => c.text),
      page_errors: rec.page_errors.slice(nErr),
      failed_requests: fresh
        .filter((r) => r !== sub && (r.failure || (r.status ?? 0) >= 400))
        .map((r) => `${r.method} ${r.url} -> ${r.status ?? r.failure}`),
      new_session_keys: [...after].filter((k) => !before.has(k)).sort(),
      password_in_url: sub?.method === "GET"
        ? form.fields.find((x) => x.type === "password" && x.name && new URL(sub.url).searchParams.has(x.name))?.name ?? null
        : null,
      text_excerpt: (await page.innerText("body")).slice(0, 300),
    });
    if (!sub)
      result.error = invalid.length
        ? `browser validation blocked submit: ${invalid.join("; ").slice(0, 200)}`
        : "no network request after submit: handled client-side only (or a JS handler dropped it)";
  } catch (e) {
    result.error = firstLine(e);
  }
  await page.close();
  return result;
}

/**
 * Find a login form (given login_url, landing page, or common paths) and sign in with the test credentials.
 * Success needs all three: a non-error response, leaving the login URL, and a new cookie/storage key.
 * A redirect alone is not proof (a form can "succeed" without creating a session).
 */
async function login(
  context: BrowserContext, origin: string, target: string, credentials: Credentials, runId: string, timeoutMs: number,
): Promise<AuthInfo & { form?: FormInfo }> {
  const given = credentials.login_url ? normalize(credentials.login_url, origin) : null;
  const urls = given ? [given] : [target, ...LOGIN_PATHS.map((p) => `${origin}/${p}`)];
  const auth: AuthInfo & { form?: FormInfo } = { method: "credentials", success: false, attempts: [] };
  for (const url of urls) {
    const [rec, page] = await visit(context, url, timeoutMs);
    await page.close();
    for (const form of rec.forms.filter((x) => x.kind === "login")) {
      const loginUrl = rec.final_url ?? url;
      const s = await submit(context, loginUrl, form, runId, timeoutMs, credentials);
      const ok = s.status !== null && s.status < 400 && s.new_session_keys.length > 0 &&
        !!s.final_url && new URL(s.final_url).pathname !== new URL(loginUrl).pathname;
      auth.attempts!.push({ login_url: loginUrl, selector: form.selector, status: s.status, final_url: s.final_url,
        new_session_keys: s.new_session_keys, success: ok });
      if (ok) return Object.assign(auth, { success: true, login_url: loginUrl, landing_url: s.final_url, form });
    }
  }
  return auth;
}

/**
 * Up to `tries` wrong-password logins for a non-existent user, in a separate context so the test account
 * and the authenticated session are not locked out. Stops at the first sign of throttling.
 */
async function rateLimitProbe(browser: Browser, loginUrl: string, form: FormInfo, runId: string, timeoutMs: number, tries = 5): Promise<RateLimitProbe> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const wrong = { username: `vibeaudit+ratelimit-${runId}@example.test`, password: `wrong-${runId}` };
  const results: RateLimitProbe["results"] = [];
  for (let i = 0; i < tries; i++) {
    const s = await submit(context, loginUrl, form, runId, timeoutMs, wrong);
    const limited = s.status === 429 || RATE_LIMIT_TEXT.test(s.text_excerpt ?? "");
    results.push({ status: s.status, limited });
    if (limited) break;
  }
  await context.close();
  return { login_url: loginUrl, tries: results.length, results, limited: results.some((r) => r.limited) };
}

async function heapSample(cdp: CDPSession): Promise<HeapSample> {
  // Two GCs: the first can leave objects pending finalization.
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { heap: m.JSHeapUsedSize ?? 0, nodes: m.Nodes ?? 0, listeners: m.JSEventListeners ?? 0 };
}

/** Growth that persists after GC on every cycle is a leak signal; one-off growth (caches, lazy chunks) is not. */
export function analyzeLeak(samples: HeapSample[]): Pick<LeakProbe, "growth" | "leaking" | "signals"> {
  const base = samples[0];
  const last = samples[samples.length - 1];
  const steps = samples.length - 1;
  const rising = (k: keyof HeapSample) => samples.slice(1).filter((s, i) => s[k] > samples[i][k]).length;
  const growth = {
    heap_bytes: Math.round(last.heap - base.heap),
    heap_per_cycle: Math.round((last.heap - base.heap) / steps),
    nodes: last.nodes - base.nodes,
    listeners: last.listeners - base.listeners,
  };
  const signals: string[] = [];
  // >=1 listener / node retained per cycle, rising on (nearly) every cycle
  if (growth.listeners >= steps && rising("listeners") >= steps - 1)
    signals.push(`event listeners +${growth.listeners} over ${steps} cycles`);
  if (growth.nodes >= steps * 5 && rising("nodes") >= steps - 1)
    signals.push(`DOM nodes +${growth.nodes} over ${steps} cycles (detached nodes retained)`);
  // A leak grows linearly; warm-up (caches, dev-mode bookkeeping) decelerates. Require the second half of the run
  // to grow at least half as much as the first.
  const mid = samples[Math.floor(steps / 2)].heap;
  const linear = last.heap - mid >= 0.5 * (mid - base.heap);
  if (growth.heap_bytes > 1_000_000 && growth.heap_per_cycle > 50_000 && rising("heap") >= Math.ceil(steps * 0.8) && linear)
    signals.push(`JS heap +${(growth.heap_bytes / 1e6).toFixed(1)} MB after GC (~${Math.round(growth.heap_per_cycle / 1024)} KB per cycle)`);
  return { growth, leaking: signals.length > 0, signals };
}

/**
 * Leaks only accumulate while the JS context survives, i.e. client-side (SPA) navigation. For up to 3 links on the
 * landing page that navigate without a full reload, cycle "open route -> history.back()" and sample after GC.
 * Read-only: only same-origin anchors that already passed the crawl's state-changing filter are clicked.
 */
async function leakProbes(
  context: BrowserContext, target: string, candidates: string[], cycles: number, timeoutMs: number, gap: (c: string, t: string, r: string) => void,
): Promise<LeakProbe[]> {
  const probes: LeakProbe[] = [];
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.goto(target, { waitUntil: "load", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    const from = page.url();
    const go = async (url: string) => {
      const clicked = await page.evaluate((u) => {
        const a = [...document.querySelectorAll("a[href]")].find((x) => (x as HTMLAnchorElement).href === u) as HTMLElement | undefined;
        a?.click();
        return !!a;
      }, url);
      if (!clicked) throw new Error("link no longer on the page");
      await page.waitForFunction((u) => location.href === u, url, { timeout: 5000 });
      await page.waitForTimeout(200);
    };
    const back = async () => {
      await page.evaluate(() => history.back());
      await page.waitForFunction((u) => location.href === u, from, { timeout: 5000 });
      await page.waitForTimeout(200);
    };
    let tested = 0;
    for (const route of candidates) {
      if (tested >= 3) break;
      try {
        await page.evaluate(() => ((window as unknown as { __vibeaudit: number }).__vibeaudit = 1));
        await go(route);
        const spa = await page.evaluate(() => (window as unknown as { __vibeaudit?: number }).__vibeaudit === 1);
        await back();
        if (!spa) continue; // full page load: heap resets on every navigation, nothing can accumulate
        tested++;
        const samples: HeapSample[] = [];
        for (let i = 0; i <= cycles; i++) { // cycle 0 is warm-up (lazy chunks, caches)
          await go(route);
          await back();
          samples.push(await heapSample(cdp));
        }
        probes.push({ route, from, cycles, samples, ...analyzeLeak(samples) });
      } catch (e) {
        gap("leak-probe", route, `probe aborted: ${firstLine(e, 150)}`);
        await page.goto(from, { waitUntil: "load", timeout: timeoutMs }).catch(() => {});
      }
    }
    if (!tested) gap("leak-probe", target, "no client-side (SPA) links on the landing page; full page loads reset the heap, so leaks can't accumulate across navigations");
  } catch (e) {
    gap("leak-probe", target, `probe failed: ${firstLine(e, 150)}`);
  } finally {
    await page.close();
  }
  return probes;
}

async function probeAsset(context: BrowserContext, url: string, timeoutMs: number): Promise<PageRecord> {
  const rec: PageRecord = { ...newRecord(url), kind: "asset" };
  try {
    const r = await context.request.get(url, { timeout: timeoutMs });
    rec.status = r.status();
    rec.final_url = r.url();
    rec.headers = r.headers();
  } catch (e) {
    rec.error = firstLine(e);
  }
  return rec;
}

function fingerprint(pages: PageRecord[]): string[] {
  const hints = new Set<string>();
  for (const rec of pages) {
    const h = Object.fromEntries(Object.entries(rec.headers).map(([k, v]) => [k.toLowerCase(), v]));
    for (const k of ["x-powered-by", "server"]) if (h[k]) hints.add(`${k}: ${h[k]}`);
    for (const { url: u } of rec.requests) {
      if (u.includes("/_next/")) hints.add("Next.js");
      if (u.includes("/@vite/client") || u.includes("/@react-refresh")) hints.add("Vite dev server");
      if (u.includes("/_nuxt/")) hints.add("Nuxt");
      if (u.includes("/static/js/bundle.js")) hints.add("Create React App");
    }
  }
  return [...hints].sort();
}

function backendHosts(pages: PageRecord[], targetHost: string) {
  const hosts = new Map<string, string>();
  for (const rec of pages)
    for (const r of rec.requests) {
      const host = new URL(r.url).hostname;
      if (host && host !== targetHost && !hosts.has(host))
        hosts.set(host, Object.entries(KNOWN_HOSTS).find(([k]) => host === k || host.endsWith("." + k))?.[1] ?? "external");
    }
  return [...hosts].sort(([a], [b]) => a.localeCompare(b)).map(([host, kind]) => ({ host, kind }));
}

const clean = (rec: PageRecord): PageRecord => ({ ...rec, headers: redactHeaders(rec.headers) });

/** Load only the landing page: is it reachable, what stack, which external backends does it call? */
export async function preflight(url: string, timeoutMs = 15000): Promise<Preflight> {
  const target = validateTarget(url);
  const browser = await launchBrowser();
  try {
    const [rec, page] = await visit(await browser.newContext({ ignoreHTTPSErrors: true }), target, timeoutMs);
    await page.close();
    return {
      target,
      reachable: rec.error === null && rec.status !== null,
      status: rec.status,
      error: rec.error,
      fingerprint: fingerprint([rec]),
      backend_hosts: backendHosts([rec], new URL(target).hostname),
      note: "backend_hosts are from the landing page only; modes other than read_only may write to these hosts.",
    };
  } finally {
    await browser.close();
  }
}

/** Crawl the app at url and return the runtime report (run, pages, submissions, cookies, findings, gaps). */
export async function inspect(url: string, opts: InspectOptions = {}): Promise<RuntimeReport> {
  const { mode = "read_only", credentials = null, storageState = null, maxPages = 50, maxDepth = 4,
    pageTimeoutMs = 15000, timeBudgetS = 300, outDir = null, leakProbe = true, leakCycles = 8 } = opts;
  if (!MODES.includes(mode)) throw new Error(`mode must be one of ${MODES.join(", ")}`);
  if (mode === "authenticated" && !(credentials || storageState))
    throw new Error("authenticated mode needs test credentials or a storageState file");
  const target = validateTarget(url);
  const { origin, hostname: targetHost } = new URL(target);
  const runId = crypto.randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const screens = outDir ? join(outDir, `screens-${runId}`) : null;

  const pages: PageRecord[] = [];
  const gaps: Gap[] = [];
  const submissions: Submission[] = [];
  const linkSources = new Map<string, Set<string>>();
  const seenForms = new Set<string>();
  const queue: [string, number][] = [[target, 0]];
  const seen = new Set([target]);
  const gap = (check: string, t: string, reason: string) => gaps.push({ check, target: t, reason });

  const browser = await launchBrowser();
  let cookies: Record<string, unknown>[] = [];
  let auth: (AuthInfo & { form?: FormInfo }) | null = null;
  let leaks: LeakProbe[] = [];
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: storageState ?? undefined });
    if (mode === "authenticated" && storageState) auth = { method: "storage_state", success: null };
    else if (mode === "authenticated") {
      auth = await login(context, origin, target, credentials!, runId, pageTimeoutMs);
      const landing = auth.success && auth.landing_url ? normalize(auth.landing_url, origin) : null;
      if (landing && !seen.has(landing)) {
        seen.add(landing); // post-login landing page may not be linked from home
        queue.push([landing, 0]);
      }
      if (!auth.success) gap("auth", target, "login failed or no login form found; crawl continues unauthenticated");
    }

    const deadline = Date.now() + timeBudgetS * 1000;
    while (queue.length) {
      if (pages.length >= maxPages || Date.now() > deadline) {
        const why = pages.length >= maxPages ? `page cap ${maxPages}` : `time budget ${timeBudgetS}s`;
        for (const [u] of queue) gap("crawl", u, `not visited: ${why} reached`);
        break;
      }
      const [u, depth] = queue.shift()!;
      if (ASSET_EXT.test(new URL(u).pathname)) {
        pages.push(clean(await probeAsset(context, u, pageTimeoutMs)));
        continue;
      }
      const [rec, page] = await visit(context, u, pageTimeoutMs);
      rec.depth = depth;
      if (screens && (rec.error || (rec.status ?? 0) >= 400 || rec.page_errors.length)) {
        mkdirSync(screens, { recursive: true });
        rec.screenshot = join(screens, `page-${String(pages.length).padStart(3, "0")}.png`);
        await page.screenshot({ path: rec.screenshot, fullPage: true }).catch(() => (rec.screenshot = null));
      }
      await page.close();
      pages.push(clean(rec));

      const final = rec.final_url;
      if (final && new URL(final).pathname !== new URL(u).pathname && rec.forms.some((x) => x.kind === "login"))
        gap("crawl", u, `auth-gated: redirected to login page ${final}`);
      for (const form of rec.forms) {
        if (seenForms.has(formKey(form))) continue;
        seenForms.add(formKey(form));
        const where = `${final} ${form.selector}`;
        if (mode === "read_only") gap("form-submit", where, "read_only mode: form inventoried, not submitted");
        else if (mode === "authenticated" && form.kind === "login")
          gap("form-submit", where, "login form not resubmitted, to keep the test session");
        else if (form.destructive) gap("form-submit", where, "skipped: destructive form (delete/pay/checkout/...)");
        else {
          const s = await submit(context, final ?? u, form, runId, pageTimeoutMs);
          submissions.push(s);
          for (const m of s.skipped_fields) gap("form-field", where, `not filled: ${m}`);
          if (s.error) gap("form-submit", where, s.error);
        }
      }

      for (const link of rec.links) {
        const n = normalize(link.href, origin);
        if (!n) continue;
        linkSources.set(n, (linkSources.get(n) ?? new Set()).add(u));
        if (seen.has(n)) continue;
        seen.add(n);
        const nu = new URL(n);
        if (STATE_CHANGING_LINK.test(nu.pathname + nu.search))
          gap("crawl", n, "not followed: link looks state-changing (logout/delete/...)");
        else if (depth + 1 > maxDepth) gap("crawl", n, `not visited: depth cap ${maxDepth} reached`);
        else queue.push([n, depth + 1]);
      }
    }
    if (leakProbe) {
      const home = pages.find((p) => p.url === target);
      const crawlable = (n: string | null): n is string => !!n && n !== target && !ASSET_EXT.test(new URL(n).pathname) &&
        !STATE_CHANGING_LINK.test(new URL(n).pathname + new URL(n).search);
      const candidates = [...new Set((home?.links ?? []).map((l) => normalize(l.href, origin)))].filter(crawlable);
      leaks = await leakProbes(context, target, candidates, leakCycles, pageTimeoutMs, gap);
    }
    if (auth?.success && auth.form && auth.login_url) {
      auth.rate_limit_probe = await rateLimitProbe(browser, auth.login_url, auth.form, runId, pageTimeoutMs);
      delete auth.form;
    } else if (auth?.method === "storage_state")
      gap("auth", target, "login rate-limit probe skipped: no login form used (storage_state)");
    cookies = (await context.cookies()).map(({ name, domain, path, httpOnly, secure, sameSite, expires }) =>
      ({ name, domain, path, httpOnly, secure, sameSite, expires }));
  } finally {
    await browser.close();
  }

  const report: RuntimeReport = {
    run: {
      id: runId, tool: "runtime-inspector", version: VERSION, target, mode, started_at: startedAt,
      finished_at: new Date().toISOString(),
      caps: { max_pages: maxPages, max_depth: maxDepth, page_timeout_ms: pageTimeoutMs, time_budget_s: timeBudgetS },
      pages_visited: pages.length, fingerprint: fingerprint(pages), backend_hosts: backendHosts(pages, targetHost), auth,
    },
    leak_probes: leaks,
    pages,
    submissions,
    cookies,
    findings: runChecks(pages, linkSources, targetHost, submissions, auth, leaks),
    gaps,
  };
  // The test credentials never leave this function, even if the app echoes them back into a page.
  const secrets = [credentials?.username, credentials?.password].filter((v): v is string => !!v && v.length >= 4);
  return secrets.length ? scrub(report, secrets) : report;
}
