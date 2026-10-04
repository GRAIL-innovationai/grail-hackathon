export function createScanRequest(overrides = {}) {
  return {
    projectName: "student-learning-app",
    repoPath: "/path/to/repo",
    localhostUrl: "http://localhost:3000",
    framework: "nextjs",
    scanOptions: {
      runtime: true,
      static: true,
      security: true,
      compliance: true,
      accessibility: true
    },
    ...overrides
  };
}

export function createEmptySummary() {
  return {
    totalFindings: 0,
    high: 0,
    medium: 0,
    low: 0
  };
}
