import { z } from "zod";
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    elementId: z.string(),
    reasoningSummary: z.string(),
  }),
  z.object({
    type: z.literal("fill"),
    elementId: z.string(),
    value: z.string().max(2000),
    reasoningSummary: z.string(),
  }),
  z.object({
    type: z.literal("press"),
    key: z.enum(["Tab", "Enter", "Escape"]),
    reasoningSummary: z.string(),
  }),
  z.object({ type: z.literal("wait"), reasoningSummary: z.string() }),
  z.object({
    type: z.literal("investigate"),
    suspectedIssue: z.string().max(1000),
    reasoningSummary: z.string(),
  }),
  z.object({
    type: z.literal("complete"),
    outcome: z.string(),
    reasoningSummary: z.string(),
  }),
]);
export type AgentAction = z.infer<typeof actionSchema>;
export interface Observation {
  url: string;
  pageTitle: string;
  visibleText: string;
  status?: number;
  pageErrors?: string[];
  interactiveElements: {
    id: string;
    role: string;
    text: string;
    label: string;
    value: string;
    href?: string;
    inputType?: string;
    required?: boolean;
    disabled?: boolean;
    inForm?: boolean;
    formText?: string;
    formMethod?: string;
    formAction?: string;
  }[];
}
export interface RecordedAction {
  decisionMode?: string;
  action: AgentAction;
  description: string;
  locator?: { text: string; label: string; role: string; occurrence: number };
}
export interface CandidateIssue {
  verification?: "confirmed" | "unconfirmed";
  rule?: VerificationRule;
  severity?: "low" | "medium" | "high";
  id: string;
  title: string;
  description: string;
  triggerAction: string;
  expectedBehavior: string;
  observedBehavior: string;
  stepsSoFar: string[];
  kind: "signup" | "cart" | "feedback" | "unclassified" | "generic";
}
export interface BugReport {
  id: string;
  title: string;
  ghostName: string;
  severity: "low" | "medium" | "high" | "critical";
  goal: string;
  expectedBehavior: string;
  observedBehavior: string;
  stepsToReproduce: string[];
  reproduced: boolean;
  reproductionAttempts: number;
  confidence: number;
  summary: string;
  executionLog: Activity[];
}
export interface Activity {
  id: string;
  time: string;
  ghostId: string;
  ghostName: string;
  phase: string;
  message: string;
}
export interface GhostState {
  id: string;
  persona: string;
  personality: string;
  goal: string;
  status:
    | "idle"
    | "observing"
    | "acting"
    | "investigating"
    | "reproducing"
    | "complete";
  currentUrl: string;
  observations: string[];
  actions: RecordedAction[];
  candidateIssues: CandidateIssue[];
  currentObservation: string;
  lastAction: string;
  progress: number;
  mode: string;
  outcome?: string;
  stopReason?: string;
  visitedUrls?: string[];
  decisionModes?: Record<string, number>;
  error?: string;
}
export interface VerificationRule {
  textPresent: string;
  textAbsent: string;
  urlIncludes: string;
  minimumStatus: number;
  errorIncludes: string;
}
export interface AuditFinding {
  id: string;
  title: string;
  category: string;
  severity: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  source: string;
  ruleId: string;
  summary: string;
  whyItMatters: string;
  evidence: { type: string; value: string }[];
  locations: { url?: string; file?: string; line?: number }[];
  reproSteps: string[];
  suggestedFix: string;
  tags: string[];
  dedupeKey: string;
  createdAt: string;
  validationStatus: "observed" | "reproduced" | "unverified";
}
export interface ModuleState {
  id: string;
  name: string;
  status: "idle" | "running" | "complete" | "unavailable" | "failed";
  summary: string;
  count: number;
}
export interface RunState {
  watch: boolean;
  profile: "demo" | "website";
  allowForms: boolean;
  includeSource: boolean;
  userGoal: string;
  findings: AuditFinding[];
  modules: ModuleState[];
  gaps: string[];
  id: string;
  status: "running" | "complete" | "failed";
  target: string;
  mode: string;
  ghosts: GhostState[];
  activity: Activity[];
  bugs: BugReport[];
  startedAt: string;
  error?: string;
}
