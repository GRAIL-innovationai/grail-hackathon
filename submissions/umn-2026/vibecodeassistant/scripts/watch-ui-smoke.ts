import { chromium } from "playwright";
import assert from "node:assert/strict";
import {
  showWatchStatus,
  showWatchResults,
} from "../lib/browser/watchStatus.ts";
import { createGhosts } from "../lib/agents/personas.ts";
import type { RunState } from "../lib/types/index.ts";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(
    "<main><h1>Cart</h1><button>Remove item</button></main>",
  );
  await showWatchStatus(
    page,
    "Impatient Shopper",
    "NEXT ACTION",
    "Remove an item to check the total.",
  );
  // A full navigation destroys the DOM banner but must preserve the displayed execution history.
  await page.goto(
    "data:text/html,<main><h1>One item remains; total is stale</h1></main>",
  );
  await showWatchStatus(
    page,
    "Impatient Shopper",
    "TEST MISMATCH",
    "Expected: $24. Observed: $42.",
  );
  assert.ok(
    (await page.locator("#ghostqa-watch-banner").innerText()).includes(
      "Remove an item",
    ),
  );
  assert.ok(
    (await page.locator("#ghostqa-watch-banner").innerText()).includes(
      "Expected: $24",
    ),
  );
  const run: RunState = {
    id: "presentation-fixture",
    target: "http://localhost:3000/demo",
    watch: true,
    profile: "demo",
    allowForms: true,
    includeSource: false,
    userGoal: "",
    findings: [],
    modules: [],
    gaps: [],
    status: "complete",
    startedAt: new Date().toISOString(),
    mode: "Presentation fixture — not a live agent run",
    ghosts: createGhosts(),
    activity: [],
    bugs: [],
  };
  const summary = await showWatchResults(browser, run);
  assert.ok(
    await summary
      .getByRole("heading", { name: "Exploration complete" })
      .isVisible(),
  );
  assert.ok(
    await summary
      .getByText("No bug was confirmed by fresh-session replay.", {
        exact: false,
      })
      .isVisible(),
  );
  assert.equal(page.isClosed(), false);
  run.profile = "website";
  run.target = "https://fixture-one.example/";
  Object.assign(run.ghosts[0], {
    goal: "Inspect the fixture documentation",
    outcome: "No links were visible on the fixture landing page. Goal completion was not verified.",
    stopReason: "Completion decision (Heuristic fallback)",
    visitedUrls: [run.target],
    decisionModes: { "Heuristic fallback": 1 },
    lastAction: "A proposed action is not an outcome",
  });
  const first = await showWatchResults(browser, run);
  const firstText = await first.locator("body").innerText();
  assert.ok(firstText.includes("Inspect the fixture documentation"));
  assert.ok(firstText.includes("No browser interactions completed. This is not a test pass."));
  assert.ok(firstText.includes("Heuristic fallback: 1 decision(s)"));
  assert.ok(!firstText.includes("A proposed action is not an outcome"));
  run.target = "https://fixture-two.example/";
  Object.assign(run.ghosts[0], {
    goal: "Inspect the fixture pricing page",
    outcome: "Pricing navigation completed; checkout remains untested.",
    visitedUrls: [run.target, run.target + "pricing"],
    decisionModes: { "OpenRouter agent": 2, "Heuristic fallback": 1 },
    actions: [{ action: { type: "click", elementId: "el-1", reasoningSummary: "Inspect pricing" }, description: "Clicked Pricing", decisionMode: "OpenRouter agent" }],
  });
  const second = await showWatchResults(browser, run);
  const secondText = await second.locator("body").innerText();
  assert.ok(secondText.includes("Pricing navigation completed; checkout remains untested."));
  assert.ok(secondText.includes("2 distinct observed URLs"));
  await second.getByText("Observed URLs and executed actions", { exact: true }).first().click();
  assert.ok(await second.getByText("https://fixture-two.example/pricing", { exact: true }).isVisible());
  assert.ok(!secondText.includes("Inspect the fixture documentation"));
  console.log(
    "Watch UI passed: navigation history, evidence, persistent results, and distinct truthful site-specific outcomes.",
  );
} finally {
  await browser.close();
}
