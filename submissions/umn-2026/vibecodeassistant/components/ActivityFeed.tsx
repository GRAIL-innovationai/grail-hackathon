import { useEffect, useRef } from "react";
import type { Activity } from "@/lib/types";
export function ActivityFeed({ activity }: { activity: Activity[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [activity.length]);
  return (
    <div className="feed" ref={ref} role="log" aria-label="Agent execution log">
      {!activity.length ? (
        <div className="empty-log">
          <span>⌁</span>
          <h3>Awaiting first contact</h3>
          <p>Observations, decisions, and browser results will appear here.</p>
        </div>
      ) : (
        activity.map((e) => (
          <div
            className={`log-row phase-${e.phase.replace(" ", "-")}`}
            key={e.id}
          >
            <time>
              {new Date(e.time).toLocaleTimeString("en-US", { hour12: false })}
            </time>
            <span className="log-ghost">{e.ghostName}</span>
            <span className="log-phase">{e.phase}</span>
            <p>{e.message}</p>
          </div>
        ))
      )}
    </div>
  );
}
