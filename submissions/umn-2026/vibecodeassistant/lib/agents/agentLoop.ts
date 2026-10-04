import { hasModelCredentials, providerConfig } from "@/lib/agents/provider";
import type { Browser, Page } from "playwright";
import { launchBrowser, confineToTarget } from "@/lib/browser/browser";
import { observePage } from "@/lib/browser/observePage";
import { executeAction } from "@/lib/browser/executeAction";
import { detectIssue } from "@/lib/qa/issueDetector";
import { reflectIssue } from "@/lib/qa/genericIssue";
import { reproduceIssue } from "@/lib/qa/reproduceIssue";
import { bugReport } from "@/lib/qa/bugReporter";
import { showWatchStatus, showWatchResults } from "@/lib/browser/watchStatus";
import { runModules, moduleState } from "@/lib/audit/pipeline";
import { addFindings, fromBug } from "@/lib/audit/findings";
import { redact } from "@/lib/security/redact";
import { decide } from "./decisionAgent";
import { websiteDecision, planWebsiteGhosts, actionAllowed } from "./websiteDecision";
import type {
  GhostState,
  RunState,
  CandidateIssue,
  Observation,
} from "@/lib/types";
const pause = (watch = false) =>
  new Promise((r) => setTimeout(r, watch ? 1500 : 650));
const watchStore = globalThis as typeof globalThis & {
  ghostWatchBrowser?: Browser;
};
export function log(
  run: RunState,
  g: GhostState,
  phase: string,
  message: string,
) {
  run.activity.push({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    ghostId: g.id,
    ghostName: g.persona,
    phase,
    message: redact(message),
  });
}
async function investigate(
  browser: Browser,
  run: RunState,
  g: GhostState,
  issue: CandidateIssue,
  page: Page,
) {
  g.candidateIssues.push(issue);
  g.status = "investigating";
  if (run.watch)
    await showWatchStatus(
      page,
      g.persona,
      "TEST MISMATCH",
      `${issue.title}\nExpected: ${issue.expectedBehavior}\nObserved: ${issue.observedBehavior}`,
    );
  log(run, g, "DECISION", `Potential issue: ${issue.title}`);
  await pause(run.watch);
  g.status = "reproducing";
  log(
    run,
    g,
    "REPRODUCTION",
    "Retrying the executed workflow in a clean browser session.",
  );
  const result = await reproduceIssue(browser, run, g, issue);
  issue.verification = result.reproduced ? "confirmed" : "unconfirmed";
  if (run.watch) {
    await page.bringToFront();
    await showWatchStatus(
      page,
      g.persona,
      result.reproduced ? "BUG VERIFIED" : "UNCONFIRMED",
      result.detail,
    );
  }
  log(
    run,
    g,
    "VERIFY",
    result.reproduced
      ? `Bug reproduced. ${result.detail}`
      : `Unconfirmed candidate. ${result.detail}`,
  );
  if (result.reproduced) {
    const report = bugReport(g, issue, run.activity);
    if (
      !run.bugs.some(
        (b) =>
          b.title === report.title &&
          b.observedBehavior === report.observedBehavior,
      )
    )
      run.bugs.push(report);
    addFindings(run, [fromBug(report)]);
    log(run, g, "REPORT", `Confirmed: ${issue.title}`);
  } else run.gaps.push(`${g.persona}: ${issue.title} could not be confirmed.`);
  await pause(run.watch);
}
export async function runGhost(browser: Browser, run: RunState, g: GhostState) {
  g.visitedUrls = [];
  g.decisionModes = {};
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    await confineToTarget(context, run);
    const page = await context.newPage();
    let status = 0;
    const pageErrors: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) pageErrors.length = 0;
    });
    page.on("pageerror", (e) => {
      if (pageErrors.length < 30)
        pageErrors.push(redact(e.message.slice(0, 500)));
    });
    page.on("response", (r) => {
      if (r.request().isNavigationRequest() && r.frame() === page.mainFrame())
        status = r.status();
    });
    const capture = async (): Promise<Observation> => {
      const observation = await observePage(page);
      g.currentUrl = observation.url;
      if (!g.visitedUrls!.includes(observation.url))
        g.visitedUrls!.push(observation.url);
      return { ...observation, status, pageErrors: [...pageErrors] };
    };
    await page.goto(run.target, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page
      .waitForLoadState("networkidle", { timeout: 1500 })
      .catch(() => {});
    const repetitions = new Map<string, number>(),
      deadline = Date.now() + 180000;
    let previous = await capture();
    for (let step = 0; step < 12 && Date.now() < deadline; step++) {
      g.status = "observing";
      if (run.watch)
        await showWatchStatus(page, g.persona, "OBSERVING", g.goal);
      const before = await capture();
      g.currentUrl = before.url;
      g.currentObservation = before.visibleText;
      g.observations.push(before.visibleText);
      g.progress = Math.round((step / 12) * 100);
      log(
        run,
        g,
        "OBSERVE",
        before.visibleText.replace(/\n/g, " · ").slice(0, 700),
      );
      await pause(run.watch);
      const decision =
        run.profile === "demo"
          ? await decide(g, before)
          : await websiteDecision(g, before, run);
      g.mode = decision.mode;
      g.decisionModes[decision.mode] = (g.decisionModes[decision.mode] || 0) + 1;
      if (decision.notice) log(run, g, "MODE", decision.notice);
      const a = decision.action;
      g.lastAction = a.reasoningSummary;
      log(run, g, "NEXT ACTION", `[${decision.mode}] ${a.reasoningSummary}`);
      if (run.watch) {
        await showWatchStatus(
          page,
          g.persona,
          "NEXT ACTION",
          a.reasoningSummary,
        );
        await pause(true);
      }
      if (a.type === "complete") {
        g.outcome = redact(a.outcome);
        g.stopReason = `Completion decision (${decision.mode})`;
        log(run, g, "COMPLETE", a.outcome);
        if (run.watch) {
          await showWatchStatus(
            page,
            g.persona,
            "GHOST COMPLETE",
            `${a.outcome}\n${g.candidateIssues.filter((i) => i.verification === "confirmed").length} reproduced issue(s). Full reports are on the dashboard.`,
          );
          await page.waitForTimeout(3500);
        }
        break;
      }
      const { reasoningSummary: _summary, ...operation } = a;
      const fingerprint = JSON.stringify({
        operation,
        state: before.visibleText,
        values: before.interactiveElements.map((e) => e.value),
      });
      const count = (repetitions.get(fingerprint) || 0) + 1;
      repetitions.set(fingerprint, count);
      if (count > 2) {
        g.outcome = "Stopped after the same action was proposed repeatedly on an unchanged page. The goal may be unfinished.";
        g.stopReason = "Repeated action without progress";
        run.gaps.push(
          `${g.persona}: stopped repeated actions without progress.`,
        );
        break;
      }
      if (a.type === "investigate") {
        const issue =
          run.profile === "website"
            ? await reflectIssue(g, previous, before, a.suspectedIssue)
            : undefined;
        if (issue) await investigate(browser, run, g, issue, page);
        else {
          log(
            run,
            g,
            "VERIFY",
            "Suspicion lacks mechanically verifiable evidence; no confirmed report generated.",
          );
          run.gaps.push(
            `${g.persona}: ${a.suspectedIssue} remains unverified.`,
          );
        }
        continue;
      }
      if (!actionAllowed(a, before, run)) {
        log(
          run,
          g,
          "BLOCKED",
          "The chosen action is outside the permitted scope.",
        );
        continue;
      }
      g.status = "acting";
      try {
        g.actions.push({
          ...(await executeAction(page, a, before)),
          decisionMode: g.mode,
        });
      } catch (e) {
        log(
          run,
          g,
          "ACTION ERROR",
          e instanceof Error ? e.message : "Interaction failed",
        );
        run.gaps.push(`${g.persona}: an interaction could not complete.`);
        continue;
      }
      const after = await capture();
      g.currentObservation = after.visibleText;
      log(
        run,
        g,
        "RESULT",
        after.visibleText.replace(/\n/g, " · ").slice(0, 700),
      );
      if (run.watch) {
        await showWatchStatus(
          page,
          g.persona,
          "RESULT",
          after.visibleText.slice(-350),
        );
        await pause(true);
      }
      const issue =
        run.profile === "demo"
          ? detectIssue(g, before, after)
          : await reflectIssue(g, before, after);
      if (!issue) {
        const detail =
          "No new contradiction established by the evidence checks for this action. Exploration continues; this is not an exhaustive pass.";
        log(run, g, "CHECK", detail);
        if (run.watch)
          await showWatchStatus(page, g.persona, "EVIDENCE CHECK", detail);
      }
      if (issue) await investigate(browser, run, g, issue, page);
      previous = before;
    }
    if (
      !run.activity.some((e) => e.ghostId === g.id && e.phase === "COMPLETE")
    ) {
      g.outcome ||= "The exploration limit was reached. Unvisited flows remain untested.";
      g.stopReason ||= Date.now() >= deadline ? "Time limit reached" : "12-decision limit reached";
      log(
        run,
        g,
        "COMPLETE",
        g.outcome,
      );
      run.gaps.push(
        `${g.persona}: bounded exploration ended before exhaustive coverage.`,
      );
    }
  } catch (e) {
    g.error = redact(e instanceof Error ? e.message : "Ghost failed");
    g.outcome = "Exploration could not finish: " + g.error;
    g.stopReason = "Browser or execution error";
    log(run, g, "ERROR", g.error);
    run.gaps.push(`${g.persona}: ${g.error}`);
  } finally {
    g.status = "complete";
    g.progress = 100;
    await context.close();
  }
}
export async function executeRun(run: RunState) {
  let browser: Browser | undefined;
  let backgroundBrowser: Browser | undefined;
  try {
    await watchStore.ghostWatchBrowser?.close().catch(() => {});
    watchStore.ghostWatchBrowser = undefined;
    browser = await launchBrowser(run.watch);
    if (run.watch) backgroundBrowser = await launchBrowser(false);
    const inspectorBrowser = backgroundBrowser || browser;
    if (run.profile === "website") {
      moduleState(
        run,
        "planner",
        "running",
        "Observing the landing page to tailor goals to the actual website.",
      );
      const context = await inspectorBrowser.newContext({
        serviceWorkers: "block",
      });
      try {
        await confineToTarget(context, run);
        const page = await context.newPage();
        await page.goto(run.target, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        const plan = await planWebsiteGhosts(run, await observePage(page));
        run.ghosts.forEach((g, i) => {
          const role = plan.ghosts[i];
          g.persona = redact(role.name);
          g.goal = redact(role.goal);
          g.personality = redact(role.personality);
          log(run, g, "PLAN", `${plan.mode}. Goal: ${g.goal}`);
        });
        moduleState(run, "planner", "complete", plan.mode);
      } finally {
        await context.close();
      }
    }
    const audit = runModules(inspectorBrowser, run).catch((e) =>
      run.gaps.push(
        `Module pipeline failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      ),
    );
    if (run.watch) {
      for (const g of run.ghosts) await runGhost(browser, run, g);
    } else await Promise.all(run.ghosts.map((g) => runGhost(browser!, run, g)));
    await audit;
    run.status = run.ghosts.every((g) => g.error) ? "failed" : "complete";
    for (const report of run.bugs)
      report.executionLog = run.activity.filter(
        (e) => e.ghostName === report.ghostName,
      );
    moduleState(
      run,
      "orchestrator",
      "complete",
      `Deduplicated and prioritized ${run.findings.length} live findings from connected modules.`,
      run.findings.length,
    );
  } catch (e) {
    run.status = "failed";
    run.error = redact(e instanceof Error ? e.message : "Browser failed");
    run.ghosts.forEach((g) => {
      g.status = "complete";
      g.error = run.error;
    });
    for (const m of run.modules)
      if (m.status === "idle" || m.status === "running") {
        m.status = "failed";
        m.summary = "Run could not complete; this check is not marked passed.";
      }
  } finally {
    await backgroundBrowser?.close();
    if (run.watch && browser && browser.isConnected()) {
      try {
        await showWatchResults(browser, run);
        watchStore.ghostWatchBrowser = browser;
        const finishedBrowser = browser;
        const closeTimer = setTimeout(() => {
          void finishedBrowser.close();
          if (watchStore.ghostWatchBrowser === finishedBrowser)
            watchStore.ghostWatchBrowser = undefined;
        }, 120000);
        closeTimer.unref();
        browser = undefined;
      } catch {
        /* Preserve dashboard reports even if the presentation window fails. */
      }
    }
    await browser?.close();
  }
}
