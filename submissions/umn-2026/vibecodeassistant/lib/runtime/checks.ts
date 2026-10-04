// Turn crawl records into runtime findings. Each finding cites the evidence it was built from.
import type { AuthInfo, Finding, LeakProbe, PageRecord, RequestRecord, Severity, Submission } from "./models.ts";

const STACK_TRACE =
  /Traceback \(most recent call last\)|\n\s+at [\w.<>$]+ \(.+:\d+:\d+\)|Exception in thread|Werkzeug Debugger|node_modules\//i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const path = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

type Draft = Omit<Finding, "id" | "source" | "revision" | "retest_result" | "prerequisites" | "validation_status" | "uncertainty" | "location"> &
  Partial<Pick<Finding, "prerequisites" | "validation_status" | "uncertainty">> & { url: string; selector?: string | null };

const f = ({ url, selector = null, ...d }: Draft): Finding => ({
  id: "",
  source: "runtime",
  location: { url, selector },
  prerequisites: "None",
  validation_status: "observed",
  uncertainty: "",
  revision: null,
  retest_result: null,
  ...d,
});

function pageChecks(rec: PageRecord, linkSources: Map<string, Set<string>>): Finding[] {
  const out: Finding[] = [];
  const { url, status } = rec;
  const shot = rec.screenshot ? [`screenshot: ${rec.screenshot}`] : [];
  const linkedFrom = [...(linkSources.get(url) ?? [])].sort();
  const refs = linkedFrom.slice(0, 5).map((s) => `linked from ${path(s)}`);

  if (rec.error) {
    out.push(f({
      category: "page-load-failure", title: `Page failed to load: ${path(url)}`, url,
      observed: `Navigation failed: ${rec.error}`, evidence: [rec.error, ...refs, ...shot],
      impact: "Users following this link get a browser error.", severity: "medium",
      severity_rationale: "Route is unreachable from inside the app.",
      proposed_fix: "Fix the route handler or remove links to it.",
      uncertainty: "Could be a timeout on a slow dev server; rerun to confirm.",
    }));
  } else if (status && status >= 500) {
    out.push(f({
      category: "server-error", title: `Server error ${status} on ${path(url)}`, url,
      observed: `GET ${path(url)} returned ${status}.`, evidence: [`GET ${path(url)} -> ${status}`, ...refs, ...shot],
      impact: "The page is broken for every user who reaches it.", severity: "medium",
      severity_rationale: "Reachable route crashes server-side.",
      proposed_fix: "Check the server logs for this route and handle the failing case.",
    }));
    if (rec.body_excerpt && STACK_TRACE.test(rec.body_excerpt))
      out.push(f({
        category: "verbose-error", title: `Stack trace exposed on ${path(url)}`, url,
        observed: "Error response body contains a stack trace / debugger output.",
        evidence: [`GET ${path(url)} -> ${status}`, "body excerpt: " + rec.body_excerpt.slice(0, 300), ...shot],
        impact: "Reveals file paths, framework versions and code to anyone; a Werkzeug debugger page means remote code execution.",
        severity: "medium", severity_rationale: "Information disclosure observed directly in the response (OWASP A02/A10).",
        proposed_fix: "Disable debug mode in deployed config and return a generic error page.",
      }));
  } else if (status && status >= 400) {
    out.push(f({
      category: linkedFrom.length ? "broken-link" : "broken-page", title: `${status} on ${path(url)}`, url,
      observed: `GET ${path(url)} returned ${status}.` + (linkedFrom.length ? ` Linked from ${linkedFrom.length} page(s).` : ""),
      evidence: [`GET ${path(url)} -> ${status}`, ...refs, ...shot],
      impact: "Dead end for users; signals unfinished pages.", severity: "low",
      severity_rationale: "Broken navigation, no data exposure.", proposed_fix: "Create the page or fix/remove the link.",
    }));
  }

  // Only forms that will natively submit as GET: explicit method="get", or an action with no method. React-style
  // forms with neither usually submit via JS (onSubmit + preventDefault); fake_data mode checks those by submitting.
  for (const form of rec.forms)
    if (form.fields.some((x) => x.type === "password") &&
        (form.method_attr?.toLowerCase() === "get" || (form.method_attr === null && !!form.action_attr)))
      out.push(f({
        category: "password-in-get-form", title: `Password form submits via GET on ${path(url)}`, url,
        selector: form.selector,
        observed: `Form posting to ${path(form.action)} uses method=GET with a password field.`,
        evidence: [`form ${form.selector}: method=get, fields=${JSON.stringify(form.fields.map((x) => x.name))}`],
        impact: "Passwords land in the URL, browser history, server/proxy logs and Referer headers.",
        severity: "high", severity_rationale: "Credential exposure on every submit; trivially observable.",
        proposed_fix: 'Use method="post" and send credentials in the request body.',
      }));
  return out;
}

function groupedChecks(pages: PageRecord[], targetHost: string): Finding[] {
  const out: Finding[] = [];
  const errors = new Map<string, Set<string>>();
  const exceptions = new Map<string, Set<string>>();
  const net = new Map<string, { r: RequestRecord; where: string; status: string | number; urls: Set<string> }>();
  const insecure = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => m.set(k, (m.get(k) ?? new Set()).add(v));

  for (const rec of pages) {
    for (const c of rec.console)
      // "Failed to load resource" duplicates the network finding below
      if (c.level === "error" && !c.text.startsWith("Failed to load resource")) add(errors, c.text.slice(0, 200), rec.url);
    for (const e of rec.page_errors) add(exceptions, e.slice(0, 200), rec.url);
    for (const r of rec.requests) {
      if (r.url === rec.final_url || r.url === rec.url) continue; // the document itself is covered by page checks
      const host = new URL(r.url).hostname;
      if (r.failure || (r.status && r.status >= 400)) {
        const where = host === targetHost ? path(r.url) : r.url;
        const status = r.status ?? r.failure!;
        const k = JSON.stringify([r.method, where, status]);
        const entry = net.get(k) ?? { r, where, status, urls: new Set<string>() };
        entry.urls.add(rec.url);
        net.set(k, entry);
      }
      if (r.url.startsWith("http://") && !LOCAL_HOSTS.has(host) && !host.endsWith(".localhost")) add(insecure, host, r.url);
    }
  }

  for (const [text, urls] of exceptions) {
    const u = [...urls].sort();
    out.push(f({
      category: "uncaught-exception", title: `Uncaught JavaScript exception: ${text.slice(0, 80)}`, url: u[0],
      observed: `Uncaught exception on ${u.length} page(s): ${text}`, evidence: u.slice(0, 5).map((x) => `pageerror on ${path(x)}`),
      impact: "Part of the page's JavaScript stopped running; features on these pages may be broken.", severity: "medium",
      severity_rationale: "Runtime crash in the browser, observed directly.",
      proposed_fix: "Fix the throwing code path; add an error boundary.",
    }));
  }
  for (const [text, urls] of errors) {
    const u = [...urls].sort();
    out.push(f({
      category: "console-error", title: `Console error: ${text.slice(0, 80)}`, url: u[0],
      observed: `console.error on ${u.length} page(s): ${text}`, evidence: u.slice(0, 5).map((x) => `console[error] on ${path(x)}`),
      impact: "Indicates failing app logic or noisy debug output.", severity: "low",
      severity_rationale: "Observed error log; impact depends on what failed.",
      proposed_fix: "Investigate the logged error and fix or remove it.",
    }));
  }
  for (const { r, where, status, urls } of net.values()) {
    const u = [...urls].sort();
    const api = r.type === "fetch" || r.type === "xhr";
    const sev: Severity = api && typeof status === "number" && status >= 500 ? "medium" : "low";
    out.push(f({
      category: "network-failure", title: `${r.method} ${where.slice(0, 80)} -> ${status}`, url: u[0],
      observed: `${r.type} request ${r.method} ${where} failed with ${status} on ${u.length} page(s).`,
      evidence: u.slice(0, 5).map((x) => `${r.method} ${where} -> ${status} (from ${path(x)})`),
      impact: "Data or assets the page expects did not load.", severity: sev,
      severity_rationale: sev === "medium" ? "Server error on an API call breaks a feature." : "Failed request, limited impact.",
      proposed_fix: "Fix the endpoint or the client call; handle the error state in the UI.",
      uncertainty: status === 401 || status === 403 ? "401/403 may be expected for unauthenticated requests." : "",
    }));
  }
  for (const [host, urls] of insecure) {
    const u = [...urls].sort();
    out.push(f({
      category: "insecure-request", title: `Plain-HTTP request to external host ${host}`, url: u[0],
      observed: `${u.length} request(s) to http://${host}.`, evidence: u.slice(0, 5),
      impact: "Traffic to this host can be read or modified in transit; becomes mixed content when deployed on HTTPS.",
      severity: "low", severity_rationale: "Only exploitable on hostile networks.", proposed_fix: `Use https:// for ${host}.`,
    }));
  }
  return out;
}

function submissionChecks(submissions: Submission[]): Finding[] {
  const out: Finding[] = [];
  for (const s of submissions) {
    const where = `${s.selector} on ${path(s.page)}`;
    const ev = [
      `submitted ${where} with fake data`,
      `${s.request} -> ${s.status}`,
      ...s.console_errors.slice(0, 3).map((c) => `console[error]: ${c}`),
      ...s.failed_requests.slice(0, 3),
    ];
    if (s.password_in_url)
      out.push(f({
        category: "password-in-get-form", title: `Password form submits via GET on ${path(s.page)}`, url: s.page,
        selector: s.selector,
        observed: `Submitting the form put the "${s.password_in_url}" field in the URL query string.`,
        evidence: [`submitted ${where} with a fake password`, `${s.request?.split("?")[0]}?${s.password_in_url}=[REDACTED] -> ${s.status}`],
        impact: "Passwords land in the URL, browser history, server/proxy logs and Referer headers.",
        severity: "high", severity_rationale: "Credential exposure reproduced on submit.",
        proposed_fix: 'Use method="post", or handle the submit in JS with preventDefault and POST the body.',
        validation_status: "reproduced",
      }));
    if (s.status && s.status >= 500)
      out.push(f({
        category: "form-submit-error", title: `Form submit returns ${s.status}: ${where}`, url: s.page, selector: s.selector,
        observed: `Submitting the ${s.kind} form with valid-looking fake data returned ${s.status}.`, evidence: ev,
        impact: "Users submitting this form hit a server crash; input handling is likely unvalidated.", severity: "medium",
        severity_rationale: "Reproducible server error on a user-facing action.",
        proposed_fix: "Validate input server-side and handle the failing case; return a 4xx for bad input.",
        validation_status: "reproduced",
      }));
    for (const err of s.page_errors)
      out.push(f({
        category: "form-submit-exception", title: `JS exception on submit: ${where}`, url: s.page, selector: s.selector,
        observed: `Uncaught exception after submitting: ${err}`, evidence: [...ev, `pageerror: ${err}`],
        impact: "The form's client-side handler crashes; the submission may silently fail.", severity: "medium",
        severity_rationale: "Reproducible client crash on a user-facing action.",
        proposed_fix: "Fix the submit handler; surface errors to the user.", validation_status: "reproduced",
      }));
  }
  return out;
}

function authChecks(auth: AuthInfo | null): Finding[] {
  const probe = auth?.rate_limit_probe;
  if (!probe || probe.limited) return [];
  const statuses = probe.results.map((r) => r.status);
  return [f({
    category: "no-login-rate-limit", title: `No login throttling after ${probe.tries} failed attempts`, url: probe.login_url,
    observed: `${probe.tries} consecutive wrong-password logins all returned ${JSON.stringify([...new Set(statuses.map(String))].sort())} with no 429 or lockout message.`,
    evidence: statuses.map((st, i) => `attempt ${i + 1}: status ${st}`),
    impact: "Attackers can guess passwords or replay leaked credentials (credential stuffing) at full speed.",
    severity: "medium", severity_rationale: "Reproduced directly; OWASP A07 Authentication Failures.",
    proposed_fix: "Add per-IP and per-account rate limiting to login (e.g. express-rate-limit, slowapi, Supabase auth rate limits).",
    validation_status: "reproduced",
    uncertainty: "Limits may exist above 5 attempts, or at a WAF/edge only present in production.",
  })];
}

function leakChecks(probes: LeakProbe[]): Finding[] {
  return probes.filter((p) => p.leaking).map((p) => {
    const mbPer100 = (p.growth.heap_per_cycle * 100) / 1e6;
    return f({
      category: "memory-growth", title: `Memory grows on every visit to ${path(p.route)}`, url: p.route,
      observed: `Navigating ${path(p.from)} -> ${path(p.route)} -> back ${p.cycles} times (client-side) kept growing after forced GC: ${p.signals.join("; ")}.`,
      evidence: [
        ...p.signals,
        ...p.samples.map((s, i) => `cycle ${i}${i === 0 ? " (baseline)" : ""}: heap ${(s.heap / 1e6).toFixed(2)} MB, nodes ${s.nodes}, listeners ${s.listeners}`),
      ],
      impact: `Long sessions slow down and can crash the tab (~${mbPer100.toFixed(1)} MB per 100 visits at this rate). Usually a listener, timer or subscription set up on mount and never cleaned up.`,
      severity: mbPer100 > 50 ? "medium" : "low",
      severity_rationale: "Reproduced growth across repeated navigation; impact scales with session length, no data exposure.",
      proposed_fix: `Find the component rendered at ${path(p.route)} and return a cleanup from each useEffect that adds listeners, intervals, or subscriptions (cross-check static LISTENER_LEAK findings for that route).`,
      validation_status: "reproduced",
      uncertainty: "Growth across a few cycles can also be a cache that plateaus later; confirm with a heap-snapshot diff (e.g. MemLab) before a large refactor.",
    });
  });
}

const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function runChecks(
  pages: PageRecord[], linkSources: Map<string, Set<string>>, targetHost: string,
  submissions: Submission[] = [], auth: AuthInfo | null = null, leaks: LeakProbe[] = [],
): Finding[] {
  const all = [
    ...pages.flatMap((rec) => pageChecks(rec, linkSources)),
    ...groupedChecks(pages, targetHost),
    ...submissionChecks(submissions),
    ...authChecks(auth),
    ...leakChecks(leaks),
  ];
  // A reproduced finding supersedes the observed one for the same check and location.
  const at = (x: Finding) => `${x.category} ${x.location.url} ${x.location.selector}`;
  const reproduced = new Set(all.filter((x) => x.validation_status === "reproduced").map(at));
  const findings = all.filter((x) => x.validation_status === "reproduced" || !reproduced.has(at(x)));
  findings.sort((a, b) =>
    ORDER[a.severity] - ORDER[b.severity] || a.category.localeCompare(b.category) || a.location.url.localeCompare(b.location.url));
  findings.forEach((x, i) => (x.id = `RT-${String(i + 1).padStart(3, "0")}`));
  return findings;
}
