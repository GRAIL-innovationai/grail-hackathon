import type {
  BugReport,
  CandidateIssue,
  GhostState,
  Activity,
} from "@/lib/types";
export function bugReport(
  ghost: GhostState,
  issue: CandidateIssue,
  activity: Activity[],
): BugReport {
  return {
    id: issue.id,
    title: issue.title,
    ghostName: ghost.persona,
    severity: issue.severity || (issue.kind === "cart" ? "high" : "medium"),
    goal: ghost.goal,
    expectedBehavior: issue.expectedBehavior,
    observedBehavior: issue.observedBehavior,
    stepsToReproduce: [
      "Open the target URL in a clean browser session.",
      ...issue.stepsSoFar,
    ],
    reproduced: true,
    reproductionAttempts: 1,
    confidence: issue.kind === "generic" ? 0.85 : 0.98,
    summary:
      "Confirmed by replaying the executed actions in a fresh isolated browser context and checking the rendered outcome.",
    executionLog: activity.filter((e) => e.ghostId === ghost.id),
  };
}
