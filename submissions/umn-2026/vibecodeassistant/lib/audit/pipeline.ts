import type { Browser, Page } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import type { RunState, ModuleState } from "@/lib/types";
import { confineToTarget } from "@/lib/browser/browser";
import { riskyAction } from "@/lib/security/target";
import { redact } from "@/lib/security/redact";
import { runComplianceChecks } from "@/modules/compliance/src/compliance";
import { addFindings, finding } from "./findings";
import { sourceScan } from "./sourceScanner";
export function moduleState(
  run: RunState,
  id: string,
  status: ModuleState["status"],
  summary: string,
  count = 0,
) {
  const m = run.modules.find((m) => m.id === id);
  if (m) Object.assign(m, { status, summary, count });
  run.activity.push({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    ghostId: id,
    ghostName: m?.name || id,
    phase: "MODULE",
    message: summary,
  });
}
interface RuntimeRecord {
  url: string;
  final_url: string | null;
  status: number | null;
  error: string | null;
  headers: Record<string, string>;
  console: { level: string; text: string; source?: string }[];
  page_errors: string[];
  requests: {
    method: string;
    url: string;
    status: number | null;
    type: string;
    failure?: string;
  }[];
  links: { href: string; text: string }[];
  forms: {
    method: string;
    action: string;
    selector: string;
    fields: { name: string; type: string }[];
  }[];
  text_excerpt: string;
  body_excerpt: string | null;
}
async function crawl(browser: Browser, run: RunState) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await confineToTarget(context, { ...run, allowForms: false });
  const queue = [run.target],
    seen = new Set<string>(),
    pages: RuntimeRecord[] = [],
    linkSources: Record<string, string[]> = {};
  const deadline = Date.now() + 60000;
  try {
    while (queue.length && pages.length < 6 && Date.now() < deadline) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const page = await context.newPage();
      const rec: RuntimeRecord = {
        url,
        final_url: null,
        status: null,
        error: null,
        headers: {},
        console: [],
        page_errors: [],
        requests: [],
        links: [],
        forms: [],
        text_excerpt: "",
        body_excerpt: null,
      };
      page.on("console", (m) => {
        if (rec.console.length < 40)
          rec.console.push({
            level: m.type(),
            text: redact(m.text().slice(0, 500)),
          });
      });
      page.on("pageerror", (e) => {
        if (rec.page_errors.length < 30)
          rec.page_errors.push(redact(e.message.slice(0, 500)));
      });
      page.on("response", (r) => {
        if (rec.requests.length < 120)
          rec.requests.push({
            method: r.request().method(),
            url: redact(r.url()),
            status: r.status(),
            type: r.request().resourceType(),
          });
      });
      // Guard-blocked requests are coverage gaps, not application vulnerabilities.
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        await page
          .waitForLoadState("networkidle", { timeout: 1200 })
          .catch(() => {});
        rec.final_url = page.url();
        rec.status = response?.status() || null;
        const headers = (await response?.allHeaders()) || {};
        for (const [k, v] of Object.entries(headers))
          if (!/cookie|auth|token|key|secret/i.test(k))
            rec.headers[k] = redact(v);
        const info = await page.evaluate(() => ({
          links: Array.from(
            document.querySelectorAll<HTMLAnchorElement>("a[href]"),
          )
            .slice(0, 100)
            .map((a) => ({ href: a.href, text: a.innerText.slice(0, 100) })),
          forms: Array.from(document.querySelectorAll("form"))
            .slice(0, 20)
            .map((f, i) => ({
              method: f.method,
              action: f.action,
              selector: `form:nth-of-type(${i + 1})`,
              fields: Array.from(
                f.querySelectorAll<HTMLInputElement>("input,textarea,select"),
              ).map((e) => ({ name: e.name, type: e.type || "text" })),
            })),
          text: document.body.innerText.slice(0, 8000),
        }));
        rec.links = info.links;
        rec.forms = info.forms;
        rec.text_excerpt = redact(info.text);
        rec.body_excerpt =
          (rec.status || 0) >= 500 ? rec.text_excerpt.slice(0, 2000) : null;
        for (const link of info.links) {
          try {
            const u = new URL(link.href);
            u.hash = "";
            if (
              u.origin !== new URL(run.target).origin ||
              riskyAction.test(u.pathname + u.search) ||
              /\.(pdf|zip|jpg|png|svg|mp4)$/i.test(u.pathname)
            )
              continue;
            if (run.profile === "demo" && !u.pathname.startsWith("/demo"))
              continue;
            (linkSources[u.href] ??= []).push(url);
            if (!seen.has(u.href) && queue.length < 30) queue.push(u.href);
          } catch {}
        }
        if (rec.status && rec.status < 400)
          securitySignals(run, rec, await context.cookies());
      } catch (e) {
        rec.error = redact(
          e instanceof Error ? e.message.slice(0, 300) : "Navigation failed",
        );
      }
      pages.push(rec);
      await page.close();
      moduleState(
        run,
        "runtime",
        "running",
        `Observed ${pages.length} page(s); collecting actual browser errors and response evidence.`,
      );
    }
    if (queue.length)
      run.gaps.push(
        "Runtime crawl reached its six-page or 60-second budget; remaining pages were not inspected.",
      );
    return { pages, linkSources };
  } finally {
    await context.close();
  }
}
function securitySignals(
  run: RunState,
  rec: RuntimeRecord,
  cookies: { name: string; secure: boolean; httpOnly: boolean }[],
) {
  const items = [];
  const headers = rec.headers;
  if (!headers["content-security-policy"])
    items.push(
      finding({
        title: "Content Security Policy header was not observed",
        source: "security-signals",
        category: "security",
        severity: "low",
        confidence: "high",
        summary: `The response at ${rec.url} has no Content-Security-Policy header. A meta policy may exist; this is hardening evidence, not an XSS exploit.`,
        evidence: [
          {
            type: "response",
            value: `HTTP ${rec.status}; Content-Security-Policy header absent`,
          },
        ],
        locations: [{ url: rec.url }],
        dedupeKey: "security:csp",
        suggestedFix:
          "Review the deployed CSP and add a policy appropriate for the application.",
      }),
    );
  if (
    !headers["x-frame-options"] &&
    !/frame-ancestors/i.test(headers["content-security-policy"] || "")
  )
    items.push(
      finding({
        title: "No framing protection was observed in response headers",
        source: "security-signals",
        category: "security",
        severity: "low",
        summary:
          "Neither X-Frame-Options nor a CSP frame-ancestors directive was observed. Clickjacking exploitability has not been tested.",
        evidence: [
          {
            type: "response",
            value: `${rec.url}: framing header signals absent`,
          },
        ],
        locations: [{ url: rec.url }],
        dedupeKey: "security:framing",
      }),
    );
  for (const cookie of cookies)
    if (
      /session|auth|token/i.test(cookie.name) &&
      (!cookie.httpOnly ||
        (new URL(rec.url).protocol === "https:" && !cookie.secure))
    )
      items.push(
        finding({
          title: `Review flags on session-like cookie ${cookie.name}`,
          source: "security-signals",
          category: "security",
          severity: "medium",
          summary:
            "A cookie with a session-like name lacks an expected protection flag. Its purpose and exploitability require review.",
          evidence: [
            {
              type: "cookie-flags",
              value: `${cookie.name}: HttpOnly=${cookie.httpOnly}; Secure=${cookie.secure}`,
            },
          ],
          dedupeKey: `cookie:${cookie.name}`,
        }),
      );
  addFindings(run, items);
}
function runPython(payload: unknown): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON_EXECUTABLE || "python3",
      [path.join(process.cwd(), "scripts/runtime_bridge.py")],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "",
      err = "",
      settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new Error("Runtime rules exceeded their timeout.")),
      15000,
    );
    child.stdout.on("data", (data) => {
      output += data;
      if (output.length > 2000000)
        fail(new Error("Runtime output exceeded the size cap."));
    });
    child.stderr.on("data", (data) => {
      err = (err + data).slice(-1000);
    });
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0)
        return reject(
          new Error("Python runtime rules could not execute. " + redact(err)),
        );
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error("Runtime rules returned invalid JSON."));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
export async function runModules(browser: Browser, run: RunState) {
  moduleState(
    run,
    "runtime",
    "running",
    "Inspecting real pages in read-only mode.",
  );
  let pages: RuntimeRecord[] = [];
  try {
    const capture = await crawl(browser, run);
    pages = capture.pages;
    try {
      const results = await runPython({
        pages,
        link_sources: capture.linkSources,
        target_host: new URL(run.target).hostname,
      });
      addFindings(
        run,
        results.map((r) =>
          finding({
            title: String(r.title),
            source: "runtime-scanner",
            category: "ux",
            ruleId: String(r.category),
            severity:
              r.severity === "high" || r.severity === "critical"
                ? "high"
                : r.severity === "medium"
                  ? "medium"
                  : "low",
            summary: String(r.observed),
            whyItMatters:
              String(r.impact) +
              " Exploitability is not established by this observation.",
            evidence: (r.evidence as string[]).map((value) => ({
              type: "runtime",
              value,
            })),
            locations: [r.location as { url: string }],
            suggestedFix: String(r.proposed_fix),
            dedupeKey: `runtime:${r.category}:${JSON.stringify(r.location)}`,
            validationStatus: "observed",
          }),
        ),
      );
      moduleState(
        run,
        "runtime",
        "complete",
        `Anvith’s runtime rules evaluated ${pages.length} captured page(s).`,
        results.length,
      );
    } catch (e) {
      moduleState(
        run,
        "runtime",
        "unavailable",
        e instanceof Error ? e.message : "Python runtime rules unavailable.",
      );
      run.gaps.push(
        "Runtime rule evaluation is unavailable; configure Python 3. No runtime checks are marked passed.",
      );
    }
  } catch (e) {
    moduleState(
      run,
      "runtime",
      "failed",
      e instanceof Error ? e.message : "Runtime capture failed.",
    );
  }
  moduleState(
    run,
    "compliance",
    "running",
    "Checking policy and company signals from the actual captured pages.",
  );
  if (pages.some((p) => p.status && p.status < 400)) {
    const result = runComplianceChecks({
      discoveredUrls: pages.flatMap((p) => [
        p.url,
        ...p.links.map((l) => l.href),
      ]),
      discoveredLinkTexts: pages.flatMap((p) => p.links.map((l) => l.text)),
      pageTextSnippets: pages.map((p) => p.text_excerpt),
      filePaths: [],
    });
    const failed = result.findings.filter((f) => !f.passed);
    addFindings(
      run,
      failed.map((f) =>
        finding({
          title: f.title,
          source: "compliance-checker",
          category: "compliance",
          severity: "low",
          confidence: "low",
          summary:
            f.description +
            " This is a bounded discoverability check, not a legal conclusion.",
          evidence: [
            {
              type: "coverage",
              value: `Checked ${pages.length} page snapshots and their visible links.`,
            },
          ],
          suggestedFix: f.recommendedFix,
          dedupeKey: `compliance:${f.category}`,
        }),
      ),
    );
    moduleState(
      run,
      "compliance",
      "complete",
      `${result.summary.totalChecks} heuristic checks evaluated; ${failed.length} missing signals require review.`,
      failed.length,
    );
  } else {
    moduleState(
      run,
      "compliance",
      "unavailable",
      "No successfully loaded pages were available; compliance was not evaluated.",
    );
  }
  if (run.includeSource) {
    moduleState(
      run,
      "static",
      "running",
      "Analyzing this server’s source repository with the static-analysis rules.",
    );
    try {
      const result = await sourceScan(process.cwd());
      addFindings(run, result.findings);
      moduleState(
        run,
        "static",
        "complete",
        `${result.count} local source files inspected; findings require source review.`,
        result.findings.length,
      );
      if (result.capped) run.gaps.push("Source scan reached its 250-file cap.");
    } catch {
      moduleState(
        run,
        "static",
        "failed",
        "Local source analysis could not complete.",
      );
    }
  } else
    moduleState(
      run,
      "static",
      "unavailable",
      "Local source analysis was not selected; remote source code is not available from a URL.",
    );
  moduleState(
    run,
    "orchestrator",
    "complete",
    "Team backend deduplicates and prioritizes live findings; no mock scan data is used.",
    run.findings.length,
  );
}
