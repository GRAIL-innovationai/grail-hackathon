"use client";

import { useEffect, useState } from "react";
import type { Candidate, Evaluation, Iteration, Job, JobMatch, Persona, Run } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, init);
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}
const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const OUTCOME_STYLE: Record<string, string> = {
  no_response: "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300",
  connection_accepted: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  generic_reply: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  meaningful_conversation: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  interview_or_referral: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

const card = "rounded-xl border border-black/10 dark:border-white/15 p-4";
const btn =
  "rounded-lg px-3 py-2 text-sm font-medium bg-foreground text-background disabled:opacity-40 hover:opacity-90";
const btnGhost = "rounded-lg px-3 py-2 text-sm border border-black/15 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10";

export default function Home() {
  const [health, setHealth] = useState<{ mock: boolean; model: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [resumeText, setResumeText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [jobId, setJobId] = useState("");
  const [n, setN] = useState(4);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<typeof health>("/health"), api<Job[]>("/jobs"), api<Persona[]>("/personas")])
      .then(([h, j, p]) => {
        setHealth(h);
        setJobs(j);
        setPersonas(p);
        setCatalogReady(j.length > 0 && p.length > 0);
      })
      .catch(() => setError(`Backend not reachable at ${API}. Start it: uvicorn backend.main:app --reload --port 8000`));
  }, []);

  async function busy<T>(label: string, fn: () => Promise<T>) {
    setLoading(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }

  const matchFor = (c: Candidate) =>
    busy("Matching jobs…", async () => {
      if (!jobs.length) {
        const [j, p] = await Promise.all([api<Job[]>("/jobs"), api<Persona[]>("/personas")]);
        setJobs(j);
        setPersonas(p);
        setCatalogReady(j.length > 0 && p.length > 0);
      }
      setCandidate(c);
      setRun(null);
      const m = await post<JobMatch[]>("/match", { candidate: c, target_role: targetRole });
      setMatches(m);
      setJobId(m[0]?.job_id ?? "");
    });

  const parseAndMatch = () =>
    busy("Parsing resume…", async () => {
      let c: Candidate;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        c = await api<Candidate>("/resume", { method: "POST", body: form });
      } else c = await post<Candidate>("/resume", { text: resumeText });
      await matchFor(c);
    });

  const useSample = () =>
    busy("Loading sample…", async () => {
      const [c] = await api<Candidate[]>("/resumes");
      setFile(null);
      setResumeText(c.lines.map((l) => l.text).join("\n"));
      await matchFor(c);
    });

  const startRun = () =>
    busy("Optimizing outreach…", async () => {
      setRun(null);
      setProgress({ done: 0, total: 1, label: "Starting the loop…" });
      const r = await fetch(API + "/run/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate, job_id: jobId, n }),
      });
      if (!r.ok || !r.body) throw new Error(`${r.status}: ${await r.text()}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished: Run | null = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as {
            label?: string;
            done?: number;
            total?: number;
            run?: Run;
            error?: string;
          };
          if (ev.error) throw new Error(ev.error);
          if (ev.run) finished = ev.run;
          else if (ev.label != null && ev.done != null && ev.total != null)
            setProgress({ done: ev.done, total: ev.total, label: ev.label });
        }
      }
      if (!finished) throw new Error("Run ended before a result arrived");
      setProgress({ done: 1, total: 1, label: "Done" });
      setRun(finished);
    }).finally(() => setProgress(null));

  const jobById = Object.fromEntries(jobs.map((j) => [j.id, j]));
  const personaById = Object.fromEntries(personas.map((p) => [p.id, p]));
  const contactOf = (id: string): Persona | undefined => personaById[jobById[id]?.contact_persona_id];
  const contact = contactOf(jobId);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-3xl font-semibold">Career Coach</h1>
          <p className="text-neutral-500">A self-improving outreach agent that can&apos;t learn to lie.</p>
        </div>
        {health && (
          <span className="text-xs rounded-full px-2 py-1 bg-black/5 dark:bg-white/10">
            {health.mock ? "MOCK MODE (no API key)" : `live: ${health.model}`}
          </span>
        )}
      </header>

      {error && <p className="rounded-lg bg-red-500/10 text-red-700 dark:text-red-300 p-3 text-sm">{error}</p>}

      {/* 1. Resume */}
      <section className={card + " space-y-3"}>
        <h2 className="font-semibold">1. Resume</h2>
        <textarea
          className="w-full min-h-36 max-h-[28rem] rounded-lg border border-black/15 dark:border-white/20 bg-transparent p-2 text-sm font-mono field-sizing-content"
          placeholder="Paste your resume, one bullet per line…"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".pdf,.txt" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <textarea
            rows={2}
            className="flex-1 min-w-64 rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-2 py-1 text-sm"
            placeholder="Describe the job you want (role, stack, company type)"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
          />
          <button className={btn} disabled={!!loading || (!file && !resumeText.trim())} onClick={parseAndMatch}>
            Parse &amp; match
          </button>
          <button className={btnGhost} disabled={!!loading || !catalogReady} onClick={useSample}>
            Use sample resume
          </button>
        </div>
        {candidate && <p className="text-xs text-neutral-500">{candidate.lines.length} lines parsed (R1–R{candidate.lines.length}).</p>}
      </section>

      {/* 2. Matches */}
      {matches.length > 0 && (
        <section className={card + " space-y-3"}>
          <h2 className="font-semibold">2. Matched jobs</h2>
          <ul className="max-h-72 overflow-y-auto divide-y divide-black/10 dark:divide-white/10">
            {matches.map((m) => {
              const job = jobById[m.job_id];
              const c = contactOf(m.job_id);
              const count = (s: string) => m.rows.filter((r) => r.status === s).length;
              return (
                <li key={m.job_id}>
                  <button
                    onClick={() => setJobId(m.job_id)}
                    className={`w-full text-left px-2 py-2 flex items-center gap-3 rounded ${m.job_id === jobId ? "bg-black/5 dark:bg-white/10" : ""}`}
                  >
                    <span className="w-10 text-right font-mono text-sm">{m.score}</span>
                    <span className="flex-1 text-sm">
                      {job?.title ?? m.job_id}{" "}
                      <span className="text-neutral-500">· {job?.company ?? "—"}</span>
                      {c && <span className="block text-xs text-neutral-500">Contact: {c.name}, {c.role}</span>}
                    </span>
                    <span className="text-xs text-emerald-600">{count("Covered")} covered</span>
                    <span className="text-xs text-red-500">{count("Gap")} gap</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {jobId && jobById[jobId] && (
            <div className="grid gap-4 md:grid-cols-2 pt-2">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Full resume</h3>
                {candidate ? (
                  <ol className="max-h-80 overflow-y-auto space-y-1 text-sm">
                    {candidate.lines.map((line) => (
                      <li key={line.id} className="flex gap-2">
                        <span className="shrink-0 font-mono text-xs text-neutral-500 pt-0.5">{line.id}</span>
                        <span>{line.text}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-neutral-500">Load a resume to see every parsed line.</p>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Full job description</h3>
                <p className="text-sm font-medium">
                  {jobById[jobId].title}{" "}
                  <span className="font-normal text-neutral-500">· {jobById[jobId].company}</span>
                </p>
                {contact && (
                  <p className="text-xs text-neutral-500">
                    Contact: {contact.name}, {contact.role} at {contact.company}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap">
                  {jobById[jobId].description?.trim() || "No description on this posting."}
                </p>
                <ul className="space-y-1 text-sm">
                  {jobById[jobId].reqs.map((req) => (
                    <li key={req.id} className="flex gap-2">
                      <span className="shrink-0 font-mono text-xs text-neutral-500 pt-0.5">{req.id}</span>
                      <span>{req.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3. Run */}
      {jobId && (
        <section className={card + " flex flex-wrap items-center gap-3"}>
          <h2 className="font-semibold">3. Optimize outreach</h2>
          <span className="text-sm text-neutral-500">
            {jobById[jobId]?.title} · {jobById[jobId]?.company}
            {contact && ` — to ${contact.name}, ${contact.role} at ${contact.company}`}
          </span>
          <label className="text-sm ml-auto">
            Iterations{" "}
            <select
              className="rounded border border-black/15 dark:border-white/20 bg-transparent px-1 py-1"
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <button className={btn} disabled={!!loading} onClick={startRun}>
            Run
          </button>
        </section>
      )}

      {progress && (
        <section className={card + " space-y-3"}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Optimizing outreach</h2>
            <span className="font-mono text-sm tabular-nums">
              {Math.min(100, Math.round((progress.done / Math.max(progress.total, 1)) * 100))}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className={`h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out ${progress.done === 0 ? "w-[12%] animate-pulse" : ""}`}
              style={progress.done === 0 ? undefined : { width: `${Math.min(100, (progress.done / Math.max(progress.total, 1)) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-neutral-500">{progress.label}</p>
          <div className="flex gap-1.5">
            {Array.from({ length: n }, (_, i) => {
              const frac = progress.done / Math.max(progress.total, 1);
              const start = i / n;
              const end = (i + 1) / n;
              const fill = frac <= start ? 0 : frac >= end ? 1 : (frac - start) / (end - start);
              return (
                <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full rounded-full bg-emerald-500/80 transition-[width] duration-500" style={{ width: `${fill * 100}%` }} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {loading && !progress && (
        <p className="flex items-center gap-2 text-sm text-neutral-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {loading}
        </p>
      )}

      {run && <Dashboard run={run} personaById={personaById} />}
    </main>
  );
}

function Dashboard({ run, personaById }: { run: Run; personaById: Record<string, Persona> }) {
  const [view, setView] = useState(run.best_n);
  const first = run.iterations[0];
  const best = run.iterations[run.best_n - 1];
  const shown = run.iterations[view - 1] ?? best;
  const base = mean(run.baseline_test.map((e) => e.outcome_reward));
  const opt = mean(run.optimized_test.map((e) => e.outcome_reward));

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">4. Results <span className="text-sm font-normal text-neutral-500">run {run.id}</span></h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={card}>
          <h3 className="font-medium mb-2">Score by iteration (train personas)</h3>
          <ScoreChart iterations={run.iterations} bestN={run.best_n} />
        </div>
        <div className={card}>
          <h3 className="font-medium mb-1">Held-out test personas</h3>
          <p className="text-xs text-neutral-500 mb-3">Never seen by the optimizer. Mean outcome reward.</p>
          {[["Baseline (v0)", base], [`Optimized (v${run.best_n - 1})`, opt]].map(([label, v]) => (
            <div key={label as string} className="mb-2">
              <div className="flex justify-between text-sm"><span>{label}</span><span className="font-mono">{(v as number).toFixed(2)}</span></div>
              <div className="h-2 rounded bg-black/10 dark:bg-white/10">
                <div className="h-2 rounded bg-emerald-500" style={{ width: `${(v as number) * 100}%` }} />
              </div>
            </div>
          ))}
          <table className="w-full text-xs mt-3">
            <tbody>
              {run.baseline_test.map((b, i) => {
                const p = personaById[b.persona_id];
                return (
                  <tr key={b.persona_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="py-1">{p?.name} <span className="text-neutral-500">({p?.role})</span></td>
                    <td><OutcomeBadge e={b} /></td>
                    <td>→</td>
                    <td><OutcomeBadge e={run.optimized_test[i]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MessageCard title="Baseline message (iteration 1)" it={first} />
        <MessageCard title={`Optimized message (iteration ${best.n})`} it={best} />
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-medium mr-2">Train personas</h3>
          {run.iterations.map((it) => (
            <button
              key={it.n}
              onClick={() => setView(it.n)}
              className={`rounded px-2 py-1 text-xs border border-black/15 dark:border-white/20 ${it.n === view ? "bg-foreground text-background" : ""}`}
            >
              iter {it.n} · {it.score.toFixed(2)}
            </button>
          ))}
        </div>
        <div className="mb-3">
          <MessageCard title={`Iteration ${shown.n} message`} it={shown} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.evals.map((e) => {
            const p = personaById[e.persona_id];
            return (
              <div key={e.persona_id} className="rounded-lg bg-black/[0.03] dark:bg-white/5 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{p?.name}</span>
                  <span className="text-neutral-500">{p?.role}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <OutcomeBadge e={e} />
                  <span className="font-mono">quality {e.quality_score.toFixed(1)}</span>
                </div>
                <p className="text-sm italic">{e.reply || "(no reply)"}</p>
                <p className="text-xs text-neutral-500">{e.critique}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[["Prompt v0", first.prompt], [`Best prompt (iteration ${best.n})`, best.prompt]].map(([t, p]) => (
          <div key={t} className={card}>
            <h3 className="font-medium mb-2">{t}</h3>
            <pre className="text-xs whitespace-pre-wrap font-mono">{p}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}

function OutcomeBadge({ e }: { e?: Evaluation }) {
  if (!e) return null;
  return <span className={`rounded px-1.5 py-0.5 text-xs ${OUTCOME_STYLE[e.outcome]}`}>{e.outcome.replaceAll("_", " ")}</span>;
}

function MessageCard({ title, it }: { title: string; it: Iteration }) {
  return (
    <div className={card + " space-y-2"}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${it.lint.passed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}
        >
          LINT {it.lint.passed ? "PASS" : "FAIL"}
        </span>
      </div>
      <p className="text-sm">{it.message.text}</p>
      <div className="flex flex-wrap gap-1 text-xs">
        <span className={it.message.chars > 300 ? "text-red-500" : "text-neutral-500"}>{it.message.chars}/300 chars</span>
        {it.message.citations.map((c) => (
          <span key={c} className="rounded bg-black/5 dark:bg-white/10 px-1.5">{c}</span>
        ))}
      </div>
      {!it.lint.passed && <p className="text-xs text-red-600 dark:text-red-400">Not in resume: {it.lint.offending.join(", ")}</p>}
    </div>
  );
}

function ScoreChart({ iterations, bestN }: { iterations: Iteration[]; bestN: number }) {
  const W = 420, H = 180, P = 28;
  const x = (i: number) => P + (iterations.length > 1 ? (i * (W - 2 * P)) / (iterations.length - 1) : (W - 2 * P) / 2);
  const y = (s: number) => H - P - s * (H - 2 * P);
  const pts = iterations.map((it, i) => `${x(i)},${y(it.score)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Score by iteration">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={P} x2={W - P} y1={y(t)} y2={y(t)} className="stroke-current opacity-10" />
          <text x={4} y={y(t) + 4} className="fill-current text-[10px] opacity-60">{t.toFixed(1)}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" className="stroke-emerald-500" strokeWidth={2.5} />
      {iterations.map((it, i) => (
        <g key={it.n}>
          <circle cx={x(i)} cy={y(it.score)} r={it.n === bestN ? 6 : 4}
            className={it.lint.passed ? "fill-emerald-500" : "fill-red-500"} />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-current text-[10px] opacity-60">{it.n}</text>
          <text x={x(i)} y={y(it.score) - 10} textAnchor="middle" className="fill-current text-[10px]">{it.score.toFixed(2)}</text>
        </g>
      ))}
    </svg>
  );
}
