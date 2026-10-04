import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://localhost:3000";
const response = await fetch(base + "/api/run", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    target: base + "/demo",
    watch: process.env.WATCH_GHOSTS === "true",
  }),
});
assert.equal(response.status, 200, await response.clone().text());
let run = await response.json();
const deadline = Date.now() + 300000;
while (run.status === "running" && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 1000));
  run = await (await fetch(base + "/api/run?id=" + run.id)).json();
}
assert.equal(run.status, "complete", JSON.stringify(run));
const expected = process.env.SINGLE_GHOST ? 1 : 3;
assert.equal(
  run.bugs.length,
  expected,
  JSON.stringify(
    run.ghosts.map((g) => ({ id: g.id, error: g.error, actions: g.actions })),
  ),
);
for (const bug of run.bugs) {
  assert.equal(bug.reproduced, true);
  assert.ok(bug.stepsToReproduce.length > 2);
  assert.ok(bug.executionLog.some((e) => e.phase === "REPRODUCTION"));
  assert.ok(bug.executionLog.some((e) => e.phase === "VERIFY"));
}
if (!process.env.SINGLE_GHOST) {
  const signup = run.bugs.find((b) => /password.*minimum/i.test(b.title));
  assert.ok(signup, "Short-password signup report is missing.");
  const passwordLength = Number(
    signup.observedBehavior.match(/(\d+)-character/)?.[1],
  );
  assert.ok(passwordLength > 0 && passwordLength < 8, signup.observedBehavior);
  assert.ok(run.bugs.some((b) => /cart total/i.test(b.title)));
  assert.ok(run.bugs.some((b) => /empty submission/i.test(b.title)));
  assert.ok(
    !run.findings.some(
      (f) =>
        f.source === "runtime-scanner" && f.ruleId === "password-in-get-form",
    ),
    "The React demo produced a false native GET password report.",
  );
  assert.ok(
    run.ghosts.every((g) => !g.error),
    "A demo ghost reported an execution error.",
  );
}
console.log(
  JSON.stringify(
    {
      status: run.status,
      bugs: run.bugs.map((b) => ({ title: b.title, reproduced: b.reproduced })),
      actions: run.ghosts.map((g) => ({
        ghost: g.persona,
        count: g.actions.length,
      })),
    },
    null,
    2,
  ),
);
