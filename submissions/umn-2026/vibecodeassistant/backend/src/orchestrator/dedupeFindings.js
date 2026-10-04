export function dedupeFindings(findings) {
  const deduped = new Map();

  for (const finding of findings) {
    const existing = deduped.get(finding.dedupeKey);

    if (!existing) {
      deduped.set(finding.dedupeKey, finding);
      continue;
    }

    const existingScore = scoreFinding(existing);
    const incomingScore = scoreFinding(finding);

    if (incomingScore > existingScore) {
      deduped.set(finding.dedupeKey, finding);
    }
  }

  return Array.from(deduped.values());
}

function scoreFinding(finding) {
  const severityWeight = { high: 3, medium: 2, low: 1 }[finding.severity];
  const confidenceWeight = { high: 3, medium: 2, low: 1 }[finding.confidence];
  return severityWeight * 10 + confidenceWeight;
}
