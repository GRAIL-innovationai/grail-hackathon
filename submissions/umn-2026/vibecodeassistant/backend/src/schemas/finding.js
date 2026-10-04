export const FINDING_CATEGORIES = [
  "security",
  "performance",
  "compliance",
  "accessibility",
  "ux",
  "architecture"
];

export const SEVERITIES = ["high", "medium", "low"];
export const CONFIDENCE_LEVELS = ["high", "medium", "low"];
export const FINDING_SOURCES = [
  "runtime-scanner",
  "static-analyzer",
  "security-engine",
  "compliance-checker",
  "manual"
];

export function createFinding(overrides = {}) {
  return {
    id: "",
    title: "",
    category: "security",
    severity: "low",
    confidence: "low",
    source: "manual",
    ruleId: "",
    summary: "",
    whyItMatters: "",
    evidence: [],
    locations: [],
    reproSteps: [],
    suggestedFix: "",
    tags: [],
    dedupeKey: "",
    createdAt: new Date().toISOString(),
    ...overrides
  };
}
