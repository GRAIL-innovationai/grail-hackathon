import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.BASE_URL || "http://localhost:3000", {
    waitUntil: "networkidle",
  });
  await page.screenshot({ path: "/tmp/ghostqa-dashboard.png", fullPage: true });
  const watchToggle = page.getByRole("checkbox", { name: "Watch Ghosts" });
  assert.ok(await watchToggle.isVisible());
  assert.equal(await watchToggle.isChecked(), false);
  await page.getByRole("button", { name: "DEPLOY GHOSTS" }).click();
  await page
    .getByText("EXPLORATION COMPLETE", { exact: true })
    .waitFor({ timeout: 180000 });
  assert.equal(await page.locator(".bug-card").count(), 3);
  assert.ok(
    await page
      .getByText("Signup accepts a password below the stated minimum", {
        exact: true,
      })
      .isVisible(),
  );
  assert.ok(
    await page.getByText("Combined audit", { exact: false }).isVisible(),
  );
  assert.ok((await page.locator(".audit-finding").count()) > 0);
  const exported = await page.request.get(
    new URL(await page.locator(".export-link").getAttribute("href"), page.url())
      .href,
  );
  assert.equal(exported.status(), 200);
  assert.ok((await exported.text()).includes("Verification status"));
  await page.locator(".bug-card").first().click();
  await page.locator("dialog[open]").waitFor();
  assert.ok(
    await page.getByText("Steps to reproduce", { exact: true }).isVisible(),
  );
  await page.screenshot({ path: "/tmp/ghostqa-report.png", fullPage: true });
  await page.getByRole("button", { name: "Close report" }).click();
  await page.screenshot({ path: "/tmp/ghostqa-completed.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/ghostqa-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile overflow",
  );
  assert.deepEqual(errors, []);
  const invalid = await page.request.post(
    (process.env.BASE_URL || "http://localhost:3000") + "/api/run",
    { data: { target: "https://example.com/demo" } },
  );
  assert.equal(invalid.status(), 400);
  console.log(
    "Dashboard passed: deployment, live updates, three reports, dialog, mobile layout, target restriction, no browser errors.",
  );
} finally {
  await browser.close();
}
