import type { Browser, Page } from "playwright";
import type { RunState } from "@/lib/types";
const history = new WeakMap<Page, { phase: string; message: string }[]>();
// Display-only UI; excluded from observations and never used as evidence.
export async function showWatchStatus(
  page: Page,
  ghostName: string,
  phase: string,
  message: string,
) {
  const entries = history.get(page) || [];
  entries.push({ phase, message });
  history.set(page, entries.slice(-8));
  await page.evaluate(
    ({ ghostName, phase, entries }) => {
      let banner = document.getElementById("ghostqa-watch-banner");
      if (!banner) {
        banner = document.createElement("aside");
        banner.id = "ghostqa-watch-banner";
        banner.setAttribute("data-ghostqa-ui", "true");
        banner.style.cssText =
          "position:fixed;bottom:16px;right:16px;width:360px;max-width:calc(100vw - 32px);max-height:65vh;overflow:auto;z-index:2147483647;padding:18px;border:1px solid #78bd92;border-radius:12px;background:#0c181ff5;color:#e3f7eb;font:13px/1.5 Arial,sans-serif;box-shadow:0 6px 30px #0006;pointer-events:none";
        document.body.appendChild(banner);
      }
      banner.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = `👻 ${ghostName} · ${phase}`;
      heading.style.cssText =
        "display:block;color:#a4edbd;margin-bottom:12px;font-size:15px";
      banner.append(heading);
      for (const entry of entries.slice(-5)) {
        const row = document.createElement("div");
        row.style.cssText = "padding:8px 0;border-top:1px solid #ffffff18";
        const label = document.createElement("b");
        label.textContent = entry.phase;
        label.style.cssText =
          "display:block;font-size:10px;letter-spacing:1px;color:#a4edbd";
        const detail = document.createElement("div");
        detail.textContent = entry.message.slice(0, 550);
        row.append(label, detail);
        banner.append(row);
      }
      const footer = document.createElement("small");
      footer.textContent =
        "Live evidence • Full reports appear on the GhostQA dashboard";
      footer.style.cssText = "display:block;margin-top:12px;color:#a5b6b1";
      banner.append(footer);
    },
    { ghostName, phase, entries: history.get(page)! },
  );
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function showWatchResults(browser: Browser, run: RunState) {
  const page = await browser.newPage();
  const dashboard = new URL("/", run.target).href;
  const cards = run.bugs
    .map(
      (b) =>
        `<article><span class="label">${escape(b.severity.toUpperCase())} · REPRODUCED IN A CLEAN SESSION</span><h2>${escape(b.title)}</h2><p><b>Expected:</b> ${escape(b.expectedBehavior)}</p><p><b>Observed:</b> ${escape(b.observedBehavior)}</p><details><summary>Steps to reproduce</summary><ol>${b.stepsToReproduce.map((s) => `<li>${escape(s)}</li>`).join("")}</ol></details></article>`,
    )
    .join("");
  const outcomes = run.ghosts.map((g) => {
    const modes = Object.entries(g.decisionModes || {})
      .map(([mode, count]) => `${mode}: ${count} decision(s)`).join(" · ");
    const pages = g.visitedUrls || (g.currentUrl ? [g.currentUrl] : []);
    const recordedOutcome = g.outcome || run.activity.findLast(
      (entry) => entry.ghostId === g.id && entry.phase === "COMPLETE",
    )?.message || g.error || "No completion outcome was recorded; goal completion is unknown.";
    return `<section><h3>${escape(g.persona)}</h3><p><b>Goal:</b> ${escape(g.goal)}</p><p><b>Outcome:</b> ${escape(recordedOutcome)}</p><p><b>Stopped because:</b> ${escape(g.stopReason || "See completion log")}</p><p>${g.actions.length} executed actions · ${pages.length} distinct observed URLs · ${g.candidateIssues.filter((i) => i.verification === "confirmed").length} reproduced candidates</p><p><b>Decision sources:</b> ${escape(modes || g.mode || "No decisions recorded")}</p>${!g.actions.length ? "<p>No browser interactions completed. This is not a test pass.</p>" : ""}<details><summary>Observed URLs and executed actions</summary><ul>${pages.map((url) => `<li>${escape(url)}</li>`).join("")}</ul><ol>${g.actions.map((action) => `<li>${escape(action.description)} <small>(${escape(action.decisionMode || "Unknown decision source")})</small></li>`).join("")}</ol></details></section>`;
  }).join("");
  await page.setContent(
    `<!doctype html><html><head><title>GhostQA — Run results</title><style>body{background:#0b1218;color:#e6efe9;font:16px/1.6 system-ui;margin:40px auto;max-width:1000px;padding:0 24px}h1{font-size:40px}article{background:#131f26;border:1px solid #344b42;padding:22px;border-radius:12px;margin:16px 0}.label{font:12px monospace;color:#a6efc4}a{color:#a6efc4}p{color:#c1d0c9}li{margin:8px 0}section+section{border-top:1px solid #344b42;margin-top:24px;padding-top:12px}</style></head><body><span class="label">GHOSTQA • ACTUAL RUN RESULTS</span><h1>${run.status === "failed" ? "Run could not finish" : "Exploration complete"}</h1><p>${run.ghosts.reduce((n, g) => n + g.actions.length, 0)} browser actions · ${run.bugs.length} reproduced bugs · ${run.findings.length} combined findings</p><p>${escape(run.mode)}</p><article><h2>Ghost outcomes</h2>${outcomes}</article>${cards || "<article>No bug was confirmed by fresh-session replay. This does not mean the website passed all possible tests.</article>"}<article><h2>Combined audit</h2>${run.modules.map((m) => `<p><b>${escape(m.name)}</b> — ${escape(m.status)}. ${escape(m.summary)}</p>`).join("")}</article><p>Return to your original GhostQA dashboard for complete logs, findings, and the downloadable report.</p>${run.profile === "demo" ? `<p><a href="${escape(dashboard)}">Open GhostQA dashboard</a></p>` : ""}<p>This results window closes in two minutes or when another deployment starts.</p></body></html>`,
  );
  await page.bringToFront();
  return page;
}
