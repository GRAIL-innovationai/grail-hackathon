export const RULES = [
  {
    ruleId: "CMP-001",
    title: "Missing Privacy Policy",
    category: "compliance",
    defaultSeverity: "medium",
    description: "Checks whether the website exposes a privacy policy page or footer link."
  },
  {
    ruleId: "SEC-001",
    title: "Potential Exposed Secret",
    category: "security",
    defaultSeverity: "high",
    description: "Detects hardcoded secrets or tokens inside repository files."
  },
  {
    ruleId: "PERF-001",
    title: "Possible useEffect Cleanup Issue",
    category: "performance",
    defaultSeverity: "medium",
    description: "Flags effects that may register listeners or timers without cleanup."
  }
];
