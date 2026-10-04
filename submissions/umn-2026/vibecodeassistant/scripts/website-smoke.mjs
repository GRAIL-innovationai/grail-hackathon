import http from "node:http";
import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://localhost:3000";
let destructive = 0,
  submissions = 0;
const fixture = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (["/delete", "/logout"].includes(u.pathname)) {
    destructive++;
    res.end("This destructive route must never be visited.");
    return;
  }
  if (u.pathname === "/stats") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ destructive, submissions }));
    return;
  }
  const nav =
    '<nav><a href="/">Home</a> <a href="/workspace">Browse projects</a> <a href="/contact">Contact team</a> <a href="/missing">Help documentation</a> <a href="/delete">Delete project</a> <a href="/logout">Log out</a></nav>';
  let body = "";
  let status = 200;
  if (u.pathname === "/")
    body =
      "<h1>Fieldnotes project manager</h1><p>Organize projects, explore the workspace, and contact our team.</p>";
  else if (u.pathname === "/workspace")
    body =
      '<h1>Your project workspace</h1><p>Project Atlas · Active</p><script>setTimeout(()=>{throw new Error("Workspace rendering failed: fixture exception")},80)</script>';
  else if (u.pathname === "/contact")
    body =
      '<h1>Contact the team</h1><form novalidate><label for="note">Your note</label><textarea id="note" required></textarea><p>Your note is required.</p><button>Send note</button></form><script>document.querySelector("form").onsubmit=e=>{e.preventDefault();fetch("/message",{method:"POST"});document.querySelector("main").innerHTML="<h1>Note sent successfully</h1>"}</script>';
  else if (u.pathname === "/message") {
    submissions++;
    res.end("Accepted");
    return;
  } else {
    status = 404;
    body = "<h1>Documentation page not found</h1>";
  }
  res.writeHead(status, { "Content-Type": "text/html" });
  res.end(
    `<!doctype html><html><head><title>Fieldnotes</title></head><body>${nav}<main>${body}</main></body></html>`,
  );
});
await new Promise((resolve, reject) => {
  fixture.once("error", reject);
  fixture.listen(3200, "127.0.0.1", resolve);
});
try {
  const cfg = await (await fetch(base + "/api/config")).json();
  assert.equal(
    cfg.configured,
    true,
    "Configure a provider key before the live-AI integration test.",
  );
  const unauthorized = await fetch(base + "/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: "http://localhost:3200",
      profile: "website",
    }),
  });
  assert.equal(unauthorized.status, 400);
  const metadata = await fetch(base + "/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: "http://169.254.169.254/",
      profile: "website",
      authorized: true,
    }),
  });
  assert.equal(metadata.status, 400);
  const response = await fetch(base + "/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: "http://localhost:3200/",
      profile: "website",
      authorized: true,
      allowForms: false,
      includeSource: true,
      goal: "Explore projects and help documentation; investigate unexpected page errors. Do not submit forms.",
    }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  let run = await response.json();
  const deadline = Date.now() + 300000;
  let last = "";
  while (run.status === "running" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    run = await (await fetch(base + "/api/run?id=" + run.id)).json();
    const phase = run.ghosts.map((g) => `${g.persona}:${g.status}`).join(" · ");
    if (phase !== last) {
      console.log(phase);
      last = phase;
    }
  }
  assert.equal(
    run.status,
    "complete",
    JSON.stringify(
      run.ghosts.map((g) => ({ persona: g.persona, error: g.error })),
    ),
  );
  const aiActions = run.ghosts
    .flatMap((g) => g.actions)
    .filter(
      (a) =>
        a.decisionMode?.includes("OpenRouter") ||
        a.decisionMode?.includes("OpenAI"),
    );
  assert.ok(
    aiActions.length > 0,
    "No model-selected browser actions executed.",
  );
  assert.ok(
    run.bugs.some(
      (b) => /exception|javascript|render/i.test(b.title) && b.reproduced,
    ),
    "Generic fresh-session exception reproduction was not confirmed.",
  );
  for (const id of ["runtime", "compliance", "static", "orchestrator"])
    assert.equal(
      run.modules.find((m) => m.id === id)?.status,
      "complete",
      JSON.stringify(run.modules),
    );
  assert.ok(run.findings.some((f) => f.source === "runtime-scanner"));
  assert.ok(
    run.findings.some(
      (f) => f.source === "ghost-agent" && f.validationStatus === "reproduced",
    ),
  );
  assert.equal(destructive, 0);
  assert.equal(submissions, 0, "Read-only mode submitted a form.");
  assert.ok(
    !JSON.stringify(run).includes("sk-or-v1-"),
    "Credential appeared in run payload.",
  );
  const report = await fetch(base + "/api/run/export?id=" + run.id);
  assert.equal(report.status, 200);
  assert.ok((await report.text()).includes("Verification status"));
  console.log(
    JSON.stringify(
      {
        mode: run.mode,
        modelSelectedBrowserActions: aiActions.length,
        verifiedBugs: run.bugs.map((b) => b.title),
        sources: [...new Set(run.findings.map((f) => f.source))],
        modules: run.modules.map((m) => ({ module: m.name, status: m.status })),
        destructiveActions: destructive,
        formSubmissions: submissions,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => fixture.close(resolve));
}
