export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status}`}>
      {status === "idle" ? "Standby" : status}
    </span>
  );
}
