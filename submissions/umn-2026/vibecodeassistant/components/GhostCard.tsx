import type { GhostState } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
export function GhostCard({
  ghost,
  index,
}: {
  ghost: GhostState;
  index: number;
}) {
  return (
    <article className={`ghost-card ghost-${index}`}>
      <div className="ghost-top">
        <div className="ghost-avatar">
          <svg width="25" height="28" viewBox="0 0 28 32" aria-hidden="true">
            <path
              fill="currentColor"
              d="M2 30V14a12 12 0 0 1 24 0v16l-6-4-6 4-6-4z"
            />
            <ellipse cx="10" cy="14" rx="2" ry="3" fill="#17261f" />
            <ellipse cx="18" cy="14" rx="2" ry="3" fill="#17261f" />
          </svg>
          <span>✦</span>
        </div>
        <StatusBadge status={ghost.status} />
      </div>
      <div className="ghost-number">GHOST / 0{index + 1}</div>
      <h3>{ghost.persona}</h3>
      <p className="goal">{ghost.goal}</p>
      <div className="ghost-readout">
        <span>OBSERVATION</span>
        <p>{ghost.currentObservation.replace(/\n/g, " · ")}</p>
      </div>
      <div className="ghost-readout action">
        <span>{ghost.status === "complete" ? "OUTCOME" : "NEXT ACTION"}</span>
        <p>{ghost.status === "complete" ? ghost.outcome || ghost.error || "No completion outcome recorded." : ghost.lastAction}</p>
        {ghost.stopReason && <p>{ghost.stopReason}</p>}
      </div>
      {ghost.candidateIssues.map((i) => (
        <div className={`candidate ${i.verification || "pending"}`} key={i.id}>
          {i.verification === "confirmed"
            ? "✓ Verified"
            : i.verification === "unconfirmed"
              ? "○ Unconfirmed"
              : "⚠ Candidate"}{" "}
          · {i.title}
        </div>
      ))}
      {ghost.error && <p className="error">{ghost.error}</p>}
      <div className="progress-line">
        <i style={{ width: ghost.progress + "%" }} />
      </div>
      <div className="ghost-footer">
        <span>{ghost.actions.length} actions executed</span>
        <span>{ghost.mode || "Ready"}</span>
      </div>
    </article>
  );
}
