// Runtime inspector checks against the seeded fixture site. Run: npm run test:runtime
import assert from "node:assert/strict";
import { analyzeLeak, inspect, preflight, validateTarget } from "../lib/runtime/inspector.ts";
import { toJson } from "../lib/runtime/models.ts";
import { toBackendFindings, toComplianceSignal } from "../lib/runtime/adapters.ts";
import * as fx from "./runtime-fixture.ts";

const stats = async (base: string) => (await fetch(base + "/__fixture/stats")).json();
const cats = (r: Awaited<ReturnType<typeof inspect>>) => new Set(r.findings.map((f) => f.category));
const gapText = (r: Awaited<ReturnType<typeof inspect>>) => r.gaps.map((g) => `${g.target} ${g.reason}`).join(" | ");

async function withFixture(fn: (base: string) => Promise<void>) {
  const { server, base } = await fx.startFixture();
  try {
    await fn(base);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const tests: Record<string, () => Promise<void> | void> = {
  refusesNonLocalTargets() {
    for (const bad of ["https://example.com", "http://10.0.0.5:3000", "http://localhost.evil.com", "file:///etc/passwd", "http://user:pw@localhost/"])
      assert.throws(() => validateTarget(bad), /refusing target/, bad);
    assert.equal(validateTarget("localhost:3000"), "http://localhost:3000/");
    assert.equal(validateTarget("http://app.localhost:5173/x"), "http://app.localhost:5173/x");
  },

  readOnly: () => withFixture(async (base) => {
    const pf = await preflight(base);
    assert.ok(pf.reachable && pf.status === 200, JSON.stringify(pf));

    const report = await inspect(base, { maxPages: 30 });
    for (const expected of ["broken-link", "server-error", "verbose-error", "uncaught-exception", "console-error", "network-failure", "password-in-get-form"])
      assert.ok(cats(report).has(expected), `missing ${expected}: ${[...cats(report)]}`);
    const pwGet = report.findings.filter((f) => f.category === "password-in-get-form").map((f) => new URL(f.location.url).pathname);
    assert.deepEqual(pwGet, ["/login"], "only the explicit method=get form is provable without submitting");
    const titles = report.findings.map((f) => f.title).join(" | ");
    for (const t of ["/files/report.pdf", "/api/missing", "/api/boom"]) assert.ok(titles.includes(t), titles);

    assert.deepEqual((await stats(base)).submits, [], "read_only mode changed server state");
    for (const t of ["/logout", "/account/delete", "auth-gated"]) assert.ok(gapText(report).includes(t), gapText(report));

    const out = toJson(report);
    for (const secret of [fx.SESSION_SECRET, fx.FAKE_JWT, fx.URL_SECRET]) assert.ok(!out.includes(secret), `secret leaked: ${secret}`);
    JSON.parse(out); // still valid JSON after redaction

    // Xuan's canonical finding schema (backend/src/schemas/finding.js)
    const KEYS = ["id", "title", "category", "severity", "confidence", "source", "ruleId", "summary", "whyItMatters",
      "evidence", "locations", "reproSteps", "suggestedFix", "tags", "dedupeKey", "createdAt"].sort();
    const backend = toBackendFindings(report);
    assert.equal(backend.length, report.findings.length);
    for (const b of backend) {
      assert.deepEqual(Object.keys(b).sort(), KEYS);
      assert.ok(["high", "medium", "low"].includes(b.severity) && b.source === "runtime-scanner", JSON.stringify(b));
    }
    assert.equal(new Set(backend.map((b) => b.dedupeKey)).size, backend.length, "duplicate dedupeKey: orchestrator would drop a finding");
    // Giovanni's ComplianceSignal, runtime half
    const sig = toComplianceSignal(report);
    assert.ok(sig.discoveredUrls.includes("/about") && sig.discoveredLinkTexts.includes("About") && sig.pageTextSnippets.length > 3, JSON.stringify(sig).slice(0, 300));
  }),

  fakeData: () => withFixture(async (base) => {
    const report = await inspect(base, { mode: "fake_data", maxPages: 30 });
    const submits: string[] = (await stats(base)).submits;
    const contact = submits.filter((s) => s.startsWith("POST /api/contact"));
    assert.ok(contact.length === 1 && contact[0].includes("vibeaudit%2B") && contact[0].includes("age=18"), JSON.stringify(submits));
    assert.equal(submits.filter((s) => s.startsWith("POST /api/newsletter")).length, 1, "footer form must be deduped");
    const fb = submits.filter((s) => s.startsWith("POST /api/feedback"));
    assert.ok(fb.length === 1 && fb[0].includes("vibeaudit+") && fb[0].includes("VibeAudit test"), `nameless required fields not filled: ${submits}`);
    assert.ok(!submits.some((s) => s.includes("delete")), `destructive action taken: ${submits}`);
    assert.ok(!submits.some((s) => s === "GET /logout" || s === "GET /account/delete"), JSON.stringify(submits));

    assert.ok(gapText(report).includes("destructive form"), gapText(report));
    const pw = report.findings.filter((f) => f.category === "password-in-get-form");
    assert.deepEqual(pw.map((f) => [new URL(f.location.url).pathname, f.validation_status]).sort(),
      [["/legacy-login", "reproduced"], ["/login", "reproduced"]], "reproduced must supersede observed; JS-handled /register must not appear");
    const bad = report.findings.filter((f) => f.category === "form-submit-error");
    assert.ok(bad.length === 1 && bad[0].title.includes("500") && bad[0].validation_status === "reproduced", JSON.stringify(bad));
    const statuses = Object.fromEntries(report.submissions.map((s) => [s.action.split("/").pop(), s.status]));
    assert.ok(statuses.contact === 200 && statuses.newsletter === 500, JSON.stringify(statuses));
  }),

  leakHeuristic() {
    const run = (heaps: number[], listeners = heaps.map(() => 10)) =>
      analyzeLeak(heaps.map((h, i) => ({ heap: h * 1e6, nodes: 100, listeners: listeners[i] })));
    // Warm-up: big early growth that halves every cycle (dev-mode bookkeeping, caches). Clears every threshold but linearity.
    const warm = run([10, 11, 11.5, 11.75, 11.9, 11.98, 12.03, 12.06, 12.08]);
    assert.equal(warm.leaking, false, JSON.stringify(warm));
    assert.ok(warm.growth.heap_bytes > 1e6 && warm.growth.heap_per_cycle > 50_000, "fixture must clear the size thresholds");
    assert.equal(run([10, 10.4, 10.8, 11.2, 11.6, 12, 12.4, 12.8, 13.2]).leaking, true, "linear 400 KB/cycle is a leak");
    assert.equal(run([10, 10, 10, 10, 10, 10, 10, 10, 10], [10, 11, 12, 13, 14, 15, 16, 17, 18]).leaking, true, "+1 listener per cycle");
    assert.equal(run([10, 10, 10, 10, 10, 10, 10, 10, 10], [10, 11, 11, 11, 11, 11, 11, 11, 11]).leaking, false, "one-off listener");
  },

  leakProbe: () => withFixture(async (base) => {
    const leaky = await inspect(base + "/spa/", { maxPages: 5 });
    const probe = leaky.leak_probes.find((p) => p.route.endsWith("/spa/leaky"))!;
    assert.ok(probe?.leaking && probe.growth.listeners >= probe.cycles, JSON.stringify(leaky.leak_probes.map((p) => [p.route, p.signals, p.growth])));
    const found = leaky.findings.filter((f) => f.category === "memory-growth");
    assert.ok(found.length === 1 && found[0].location.url.endsWith("/spa/leaky") && found[0].validation_status === "reproduced",
      JSON.stringify(found.map((f) => f.title)));
    assert.equal(toBackendFindings(leaky).find((b) => b.ruleId === "RT-memory-growth")?.category, "performance");

    // False-positive control: same routes, listener cleaned up
    const clean = await inspect(base + "/spa-clean/", { maxPages: 5 });
    assert.ok(clean.leak_probes.length >= 2 && clean.leak_probes.every((p) => !p.leaking),
      JSON.stringify(clean.leak_probes.map((p) => [p.route, p.signals, p.growth])));
    assert.ok(!clean.findings.some((f) => f.category === "memory-growth"));

    // Multi-page app: full reloads reset the heap, so the probe must report a gap, not "no leaks"
    const mpa = await inspect(base, { maxPages: 3 });
    assert.equal(mpa.leak_probes.length, 0);
    assert.ok(mpa.gaps.some((g) => g.check === "leak-probe" && g.reason.includes("no client-side")), gapText(mpa));
  }),

  authenticated: () => withFixture(async (base) => {
    const creds = { username: fx.TEST_USER, password: fx.TEST_PASS };
    const report = await inspect(base, { mode: "authenticated", credentials: creds, maxPages: 30 });
    const auth = report.run.auth!;
    assert.ok(auth.success && auth.login_url!.endsWith("/signin"), JSON.stringify(auth));
    // /login's GET form "succeeds" by redirecting but creates no session: must not count as logged in
    assert.ok(auth.attempts![0].login_url.endsWith("/login") && !auth.attempts![0].success, JSON.stringify(auth));

    const visited = Object.fromEntries(report.pages.filter((p) => p.final_url).map((p) => [p.final_url!.replace(base, ""), p.status]));
    assert.equal(visited["/dashboard/settings"], 200, JSON.stringify(visited));
    assert.ok(!report.gaps.some((g) => g.reason.includes("auth-gated")));
    assert.ok(cats(report).has("no-login-rate-limit"));
    assert.equal((await stats(base)).login_attempts, 6, "expected 1 real login + 5 probe attempts");

    const out = toJson(report);
    for (const cred of [fx.TEST_USER, fx.TEST_PASS])
      for (const form of [cred, encodeURIComponent(cred)]) // apps echo creds URL-encoded too
        assert.ok(!out.includes(form), `credential leaked: ${form}`);

    const failed = await inspect(base, { mode: "authenticated", credentials: { ...creds, password: "wrong-pass" }, maxPages: 5 });
    assert.equal(failed.run.auth!.success, false);
    assert.ok(failed.gaps.some((g) => g.check === "auth"));
  }),
};

const only = process.argv[2];
for (const [name, fn] of Object.entries(tests)) {
  if (only && name !== only) continue;
  await fn();
  console.log(`ok  ${name}`);
}
