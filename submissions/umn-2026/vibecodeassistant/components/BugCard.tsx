import type { BugReport } from "@/lib/types";
export function BugCard({
  bug,
  onClick,
}: {
  bug: BugReport;
  onClick: () => void;
}) {
  return (
    <button className="bug-card" onClick={onClick}>
      <div>
        <span className={`severity ${bug.severity}`}>{bug.severity}</span>
        <span className="verified">✓ Reproduced</span>
      </div>
      <h3>{bug.title}</h3>
      <p>{bug.observedBehavior}</p>
      <footer>
        <span>{bug.ghostName}</span>
        <span>View report ↗</span>
      </footer>
    </button>
  );
}
