export function generateMarkdownReport(summary, findings) {
  const lines = [];

  lines.push("# Audit Scan Report");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Total findings: ${summary.totalFindings}`);
  lines.push(`- High: ${summary.high}`);
  lines.push(`- Medium: ${summary.medium}`);
  lines.push(`- Low: ${summary.low}`);
  lines.push("");
  lines.push("## Findings");
  lines.push("");

  for (const finding of findings) {
    lines.push(`### [${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push(`- Category: ${finding.category}`);
    lines.push(`- Source: ${finding.source}`);
    lines.push(`- Confidence: ${finding.confidence}`);
    lines.push(`- Summary: ${finding.summary}`);
    lines.push(`- Why it matters: ${finding.whyItMatters}`);
    lines.push(`- Suggested fix: ${finding.suggestedFix}`);

    if (finding.locations.length > 0) {
      const locationText = finding.locations
        .map(
          (location) =>
            `${location.file || location.url || "unknown"}${location.line ? `:${location.line}` : ""}`,
        )
        .join(", ");
      lines.push(`- Locations: ${locationText}`);
    }

    if (finding.evidence.length > 0) {
      lines.push("- Evidence:");
      for (const evidence of finding.evidence) {
        lines.push(`  - (${evidence.type}) ${evidence.value}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
