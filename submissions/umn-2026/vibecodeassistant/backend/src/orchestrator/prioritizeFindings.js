const severityRank = { high: 3, medium: 2, low: 1 };
const confidenceRank = { high: 3, medium: 2, low: 1 };

export function prioritizeFindings(findings) {
  return [...findings].sort((a, b) => {
    const severityDiff = severityRank[b.severity] - severityRank[a.severity];
    if (severityDiff !== 0) return severityDiff;

    const confidenceDiff = confidenceRank[b.confidence] - confidenceRank[a.confidence];
    if (confidenceDiff !== 0) return confidenceDiff;

    return a.title.localeCompare(b.title);
  });
}
