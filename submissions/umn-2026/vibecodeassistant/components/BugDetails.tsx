import { useEffect, useRef } from "react";
import type { BugReport } from "@/lib/types";
export function BugDetails({
  bug,
  onClose,
}: {
  bug: BugReport;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="bug-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <span className={`severity ${bug.severity}`}>{bug.severity}</span>
        <button onClick={onClose} aria-label="Close report">
          ✕
        </button>
      </header>
      <span className="eyebrow">VERIFIED BUG REPORT</span>
      <h2>{bug.title}</h2>
      <p className="muted">
        Found by {bug.ghostName} · {Math.round(bug.confidence * 100)}%
        confidence · {bug.reproductionAttempts} reproduction attempt
      </p>
      <h4>Goal</h4>
      <p>{bug.goal}</p>
      <div className="expect-observe">
        <section>
          <h4>Expected behavior</h4>
          <p>{bug.expectedBehavior}</p>
        </section>
        <section>
          <h4>Observed behavior</h4>
          <p>{bug.observedBehavior}</p>
        </section>
      </div>
      <h4>Steps to reproduce</h4>
      <ol>
        {bug.stepsToReproduce.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <div className="report-result">
        ✓ Reproduced in a fresh browser context<p>{bug.summary}</p>
      </div>
      <h4>Agent execution log</h4>
      <div className="report-log">
        {bug.executionLog.map((e) => (
          <p key={e.id}>
            <b>{e.phase}</b> {e.message}
          </p>
        ))}
      </div>
    </dialog>
  );
}
