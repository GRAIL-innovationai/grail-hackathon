"use client";
import { useState } from "react";
import type { RunState, AuditFinding } from "@/lib/types";
export function AuditResults({ run }: { run: RunState | null }) {
  const [selected, setSelected] = useState<AuditFinding | null>(null),
    [filter, setFilter] = useState("all");
  const findings = (run?.findings || []).filter(
    (f) => filter === "all" || f.source === filter,
  );
  return (
    <section className="audit-section">
      <div className="section-heading">
        <h2>
          <span>04</span> Combined audit{" "}
          <b className="count">{run?.findings.length || 0}</b>
        </h2>
        {run && run.status !== "running" && (
          <a href={`/api/run/export?id=${run.id}`} className="export-link">
            Download report ↓
          </a>
        )}
      </div>
      <div className="module-grid">
        {(
          run?.modules || [
            {
              id: "runtime",
              name: "Runtime inspector",
              status: "idle",
              summary: "Collect actual browser failures.",
              count: 0,
            },
            {
              id: "compliance",
              name: "Compliance checker",
              status: "idle",
              summary: "Review policy and company signals.",
              count: 0,
            },
            {
              id: "static",
              name: "Source analyzer",
              status: "idle",
              summary: "Optional analysis of the server repository.",
              count: 0,
            },
            {
              id: "orchestrator",
              name: "Team orchestrator",
              status: "idle",
              summary: "Deduplicate, prioritize, and export results.",
              count: 0,
            },
          ]
        ).map((m) => (
          <article key={m.id}>
            <div>
              <b>{m.name}</b>
              <span className={`badge status-${m.status}`}>{m.status}</span>
            </div>
            <p>{m.summary}</p>
          </article>
        ))}
      </div>
      <div className="audit-toolbar">
        <label>
          Filter{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All sources</option>
            {[
              "ghost-agent",
              "runtime-scanner",
              "security-signals",
              "compliance-checker",
              "static-analyzer",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span>
          Observed signals and review items are separate from reproduced bugs.
        </span>
      </div>
      {findings.length ? (
        <div className="audit-list">
          {findings.map((f) => (
            <button
              key={f.id}
              className="audit-finding"
              onClick={() => setSelected(f)}
            >
              <span className={`severity ${f.severity}`}>{f.severity}</span>
              <div>
                <b>{f.title}</b>
                <p>
                  {f.source} · {f.category}
                </p>
              </div>
              <span className={`finding-state ${f.validationStatus}`}>
                {f.validationStatus}
              </span>
              <span>↗</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-bugs">
          {run?.status === "running"
            ? "Gathering evidence from connected modules…"
            : "Module findings will appear here after deployment."}
        </div>
      )}
      {!!run?.gaps.length && (
        <details className="coverage-gaps">
          <summary>Coverage gaps & limitations ({run.gaps.length})</summary>
          <ul>
            {run.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </details>
      )}
      {selected && (
        <div className="finding-backdrop" onClick={() => setSelected(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Audit finding details"
            className="finding-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="finding-close" onClick={() => setSelected(null)}>
              Close ✕
            </button>
            <span className={`severity ${selected.severity}`}>
              {selected.severity}
            </span>
            <h2>{selected.title}</h2>
            <p className="muted">
              {selected.source} · {selected.validationStatus} ·{" "}
              {selected.confidence} confidence
            </p>
            <p>{selected.summary}</p>
            <h4>Why review this</h4>
            <p>{selected.whyItMatters}</p>
            <h4>Evidence</h4>
            <ul>
              {selected.evidence.map((e, i) => (
                <li key={i}>{e.value}</li>
              ))}
            </ul>
            <h4>Location</h4>
            {selected.locations.map((l, i) => (
              <p key={i}>
                {l.url || l.file}
                {l.line ? `:${l.line}` : ""}
              </p>
            ))}
            <h4>Recommended next step</h4>
            <p>{selected.suggestedFix}</p>
            {!!selected.reproSteps.length && (
              <>
                <h4>Reproduction steps</h4>
                <ol>
                  {selected.reproSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
