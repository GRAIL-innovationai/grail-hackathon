"use client";
import { useEffect, useState } from "react";
import type { BugReport, RunState } from "@/lib/types";
import { createGhosts } from "@/lib/agents/personas";
import { GhostCard } from "@/components/GhostCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { BugCard } from "@/components/BugCard";
import { AuditResults } from "@/components/AuditResults";
import { BugDetails } from "@/components/BugDetails";
// An API route that crashes returns Next's HTML error page; parsing that blindly shows
// `Unexpected token '<'`. Surface the status instead and point at the server log.
async function readJson(response: Response) {
  if ((response.headers.get("content-type") || "").includes("application/json")) return response.json();
  throw new Error(
    `Server error ${response.status} ${response.statusText} (expected JSON). Check the dev server terminal; ` +
      "if two dev servers run from this folder, stop one and delete .next.",
  );
}
export default function Home() {
  const [target, setTarget] = useState("http://localhost:3000/demo"),
    [run, setRun] = useState<RunState | null>(null),
    [watch, setWatch] = useState(false),
    [profile, setProfile] = useState<"demo" | "website">("demo"),
    [authorized, setAuthorized] = useState(false),
    [allowForms, setAllowForms] = useState(false),
    [includeSource, setIncludeSource] = useState(false),
    [goal, setGoal] = useState(""),
    [aiConfig, setAiConfig] = useState<{
      provider: string;
      model: string;
      configured: boolean;
    } | null>(null),
    [starting, setStarting] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<BugReport | null>(null);
  useEffect(() => {
    setTarget(location.origin + "/demo");
    fetch("/api/config")
      .then(readJson)
      .then(setAiConfig)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!run || run.status !== "running") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/run?id=" + run.id, {
          cache: "no-store",
        });
        if (response.status === 404) {
          if (!cancelled) {
            setRun(null);
            setError(
              "The previous run is no longer available after a server restart. Click Deploy Ghosts to start a new run.",
            );
          }
          return;
        }
        const result = await readJson(response);
        if (!response.ok) throw new Error(result.error);
        if (!cancelled) {
          setRun(result);
          if (result.status === "running") timer = setTimeout(poll, 500);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Connection failed");
          timer = setTimeout(poll, 2000);
        }
      }
    };
    timer = setTimeout(poll, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run?.id, run?.status]);
  const deploy = async () => {
    setStarting(true);
    setError("");
    setSelected(null);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          watch,
          profile,
          authorized,
          allowForms,
          includeSource,
          goal,
        }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(result.error);
      setRun(result);
      requestAnimationFrame(() =>
        document
          .getElementById("ghost-squad")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deployment failed");
    } finally {
      setStarting(false);
    }
  };
  const ghosts = run?.ghosts || createGhosts().map((ghost, i) =>
    profile === "website" ? {
      ...ghost,
      persona: `Website ghost ${i + 1}`,
      goal: "A role and goal will be chosen after observing the target website.",
    } : ghost,
  );
  const active = run?.status === "running";
  const candidates = ghosts.reduce((n, g) => n + g.candidateIssues.length, 0);
  return (
    <div className="dashboard">
      <header className="topbar">
        <a className="brand" href="/">
          ♧{" "}
          <span>
            Ghost<span className="accent">QA</span>
          </span>
          <span className="version">LAB / 01</span>
        </a>
        <div className="top-links">
          <a href="/demo" target="_blank" rel="noreferrer">
            Open demo ↗
          </a>
          <span className="system">
            <i /> Local testing environment
          </span>
        </div>
      </header>
      <main className="dashboard-main">
        <div className="hero">
          <div>
            <div className="eyebrow accent">AUTONOMOUS QUALITY ASSURANCE</div>
            <h1>
              Let your ghosts
              <br />
              <span>find the glitches.</span>
            </h1>
            <p>Autonomous users that find bugs before your users do.</p>
          </div>
          <div className="hero-mark" aria-hidden="true">
            <div className="orbit" />
            <div className="ghost-shape">
              <i />
              <i />
              <span />
            </div>
            <span className="orbit-label">OBSERVE. ADAPT. VERIFY.</span>
          </div>
        </div>
        <div className="provider-line">
          {aiConfig?.configured
            ? `${aiConfig.provider} configured · ${aiConfig.model}`
            : "AI key not configured · website audits use heuristic navigation"}
        </div>
        <div className="audit-controls">
          <label>
            Run mode{" "}
            <select
              value={profile}
              disabled={active || starting}
              onChange={(e) => {
                setProfile(e.target.value as "demo" | "website");
                if (e.target.value === "demo")
                  setTarget(location.origin + "/demo");
              }}
            >
              <option value="demo">Bundled demo</option>
              <option value="website">
                Website audit · live AI when configured
              </option>
            </select>
          </label>
          {profile === "website" && (
            <>
              <label>
                Testing objective{" "}
                <input
                  value={goal}
                  disabled={active || starting}
                  maxLength={1000}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Explore navigation and test search and feedback validation"
                />
              </label>
              <div className="audit-options">
                <label>
                  <input
                    type="checkbox"
                    checked={authorized}
                    disabled={active || starting}
                    onChange={(e) => setAuthorized(e.target.checked)}
                  />{" "}
                  I own or am authorized to test this target
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={allowForms}
                    disabled={active || starting}
                    onChange={(e) => setAllowForms(e.target.checked)}
                  />{" "}
                  Allow synthetic input in non-destructive forms
                </label>
              </div>
              <p>
                Read-only by default. Scope stays on the target origin. Login,
                purchases, destructive actions, and attack payloads are
                excluded.
              </p>
            </>
          )}
          <label className="source-option">
            <input
              type="checkbox"
              checked={includeSource}
              disabled={active || starting}
              onChange={(e) => setIncludeSource(e.target.checked)}
            />{" "}
            Include this server’s repository source analysis (not the remote
            website’s private source)
          </label>
          {profile === "demo" && (
            <p>
              Demo coverage: short-password signup, cart total after removal,
              and empty required feedback. AI choices are checked against these
              goals; coverage interventions are labeled in the activity log.
              Bugs still require clean-session reproduction.
            </p>
          )}
        </div>
        <section className="deploy-panel">
          <div className="target-field">
            <label htmlFor="target">
              TARGET WEBSITE{" "}
              <span>
                {profile === "demo" ? "BUNDLED DEMO" : "AUTHORIZED TARGET"}
              </span>
            </label>
            <div>
              <span>↗</span>
              <input
                id="target"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  if (e.target.value !== location.origin + "/demo")
                    setProfile("website");
                }}
                disabled={active || starting}
              />
            </div>
          </div>
          <button
            className="deploy-button"
            disabled={
              active || starting || (profile === "website" && !authorized)
            }
            onClick={deploy}
          >
            {active
              ? "◌ GHOSTS EXPLORING"
              : starting
                ? "DEPLOYING…"
                : "DEPLOY GHOSTS ↗"}
          </button>
        </section>
        <div className="watch-option">
          <label>
            <input
              type="checkbox"
              checked={watch}
              onChange={(e) => setWatch(e.target.checked)}
              disabled={active || starting}
            />{" "}
            Watch Ghosts
          </label>
          <p>
            Open visible browser windows with slower actions, one ghost at a
            time. The background audit stays hidden. A results window stays open
            for two minutes after completion; full reports appear below.
          </p>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {run?.error && (
          <p role="alert" className="error">
            {run.error}
          </p>
        )}
        <div className="run-meta">
          <span>
            <i className={active ? "live-dot" : ""} />{" "}
            {run
              ? run.status === "complete"
                ? "EXPLORATION COMPLETE"
                : run.status === "failed"
                  ? "RUN FAILED"
                  : "SESSION LIVE"
              : "READY FOR DEPLOYMENT"}
          </span>
          <span>
            {run?.mode ||
              "Demo or configured AI provider · real Playwright browser"}
            {run?.watch ? " · Watch mode" : ""}
          </span>
        </div>
        {run && (
          <p className="provider-line">
            {run.status === "running"
              ? "Watch the browser ledger or follow the live activity below."
              : `${run.bugs.length} reproduced bug(s) · ${run.findings.length} audit finding(s).`}{" "}
            <a href="#bug-results">View results ↓</a>
          </p>
        )}
        <div className="stats">
          <div>
            <b>
              {active
                ? ghosts.filter((g) => g.status !== "complete").length
                : run
                  ? 0
                  : 3}
            </b>
            <span>{run ? "GHOSTS ACTIVE" : "GHOSTS READY"}</span>
          </div>
          <div>
            <b>
              {ghosts
                .reduce((n, g) => n + g.actions.length, 0)
                .toString()
                .padStart(2, "0")}
            </b>
            <span>BROWSER ACTIONS</span>
          </div>
          <div>
            <b>{candidates.toString().padStart(2, "0")}</b>
            <span>CANDIDATE ISSUES</span>
          </div>
          <div>
            <b className="accent">
              {(run?.bugs.length || 0).toString().padStart(2, "0")}
            </b>
            <span>VERIFIED BUGS</span>
          </div>
        </div>
        <section id="ghost-squad">
          <div className="section-heading">
            <h2>
              <span>01</span> The ghost squad
            </h2>
            <span>3 PERSONAS · ADAPTIVE GOALS</span>
          </div>
          <div className="ghost-grid">
            {ghosts.map((g, i) => (
              <GhostCard key={g.id} ghost={g} index={i} />
            ))}
          </div>
        </section>
        <section className="activity-section">
          <div className="section-heading">
            <h2>
              <span>02</span> Live activity
            </h2>
            <span>
              {active ? "● LIVE STREAM" : "EXECUTION TRACE"} ·{" "}
              {run?.activity.length || 0} EVENTS
            </span>
          </div>
          <div className="loop-strip">
            {[
              "OBSERVE",
              "REASON",
              "ACT",
              "INVESTIGATE",
              "VERIFY",
              "REPORT",
            ].map((s, i) => (
              <span key={s}>
                {i > 0 && <i>→</i>}
                {s}
              </span>
            ))}
          </div>
          <ActivityFeed activity={run?.activity || []} />
        </section>
        <section id="bug-results">
          <div className="section-heading">
            <h2>
              <span>03</span> Bugs found{" "}
              <b className="count">{run?.bugs.length || 0}</b>
            </h2>
            <span>ONLY REPRODUCED ISSUES</span>
          </div>
          {run?.bugs.length ? (
            <div className="bugs-grid">
              {run.bugs.map((b) => (
                <BugCard key={b.id} bug={b} onClick={() => setSelected(b)} />
              ))}
            </div>
          ) : (
            <div className="empty-bugs">
              <span>◎</span>
              <div>
                <h3>
                  {active
                    ? "Evidence before conclusions."
                    : "Your next bug is waiting to be found."}
                </h3>
                <p>
                  {active
                    ? "Candidates become reports only after fresh-session verification."
                    : "Deploy the squad to explore the demo and verify what breaks."}
                </p>
              </div>
            </div>
          )}
        </section>
        <AuditResults run={run} />
        <footer className="dashboard-footer">
          <span>GhostQA / Built to haunt your bugs.</span>
          <span>OBSERVE → REASON → ACT → VERIFY</span>
        </footer>
      </main>
      {selected && (
        <BugDetails bug={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
