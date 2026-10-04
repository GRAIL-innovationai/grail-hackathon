import type { AuditFinding, BugReport, RunState } from "@/lib/types";
import { dedupeFindings } from "@/backend/src/orchestrator/dedupeFindings.js";
import { prioritizeFindings } from "@/backend/src/orchestrator/prioritizeFindings.js";
export function finding(
  data: Partial<AuditFinding> &
    Pick<AuditFinding, "title" | "source" | "summary">,
): AuditFinding {
  return {
    id: crypto.randomUUID(),
    category: "ux",
    severity: "low",
    confidence: "medium",
    ruleId: "",
    whyItMatters: "Review the recorded evidence in context.",
    evidence: [],
    locations: [],
    reproSteps: [],
    suggestedFix: "Investigate and retest this behavior.",
    tags: [],
    dedupeKey: `${data.source}:${data.title}`,
    createdAt: new Date().toISOString(),
    validationStatus: "observed",
    ...data,
  };
}
export function addFindings(run: RunState, items: AuditFinding[]) {
  run.findings = prioritizeFindings(
    dedupeFindings([...run.findings, ...items]),
  ) as AuditFinding[];
}
export function fromBug(b: BugReport): AuditFinding {
  return finding({
    id: b.id,
    title: b.title,
    source: "ghost-agent",
    category: "ux",
    severity: b.severity === "critical" ? "high" : b.severity,
    confidence: "high",
    summary: b.observedBehavior,
    whyItMatters: b.expectedBehavior,
    reproSteps: b.stepsToReproduce,
    evidence: [{ type: "reproduction", value: b.summary }],
    validationStatus: "reproduced",
    dedupeKey: `ghost:${b.title}:${b.observedBehavior}`,
  });
}
