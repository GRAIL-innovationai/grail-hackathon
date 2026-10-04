import type { Finding, ScanReport, Severity } from '../contracts/finding'
import { buildCweUrl, isSafeHttpUrl } from './safeLinks'
import { maskSecretsInText } from './masking'

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

const locationToText = (finding: Finding): string => {
  if ('file' in finding.location) {
    return `${finding.location.file}:${finding.location.line_start}-${finding.location.line_end}`
  }

  return `${finding.location.url} (${finding.location.element})`
}

export const buildSummaryCounts = (findings: Finding[]) => {
  return severityOrder.map((severity) => ({
    severity,
    count: findings.filter((finding) => finding.severity === severity).length,
  }))
}

export const reportToJson = (report: ScanReport): string => {
  const scrubbed = {
    ...report,
    findings: report.findings.map((finding) => ({
      ...finding,
      evidence: {
        snippet: maskSecretsInText(finding.evidence.snippet),
        captured_output: maskSecretsInText(finding.evidence.captured_output),
      },
    })),
  }

  return JSON.stringify(scrubbed, null, 2)
}

export const reportToMarkdown = (report: ScanReport): string => {
  const counts = buildSummaryCounts(report.findings)
  const lines = [
    '# Vulnerability Review Report',
    '',
    `- Scan ID: ${report.scanId}`,
    `- Generated: ${report.generatedAt}`,
    '',
    '## Coverage',
    '',
    ...report.coverage.map(
      (item) => `- ${item.module}: ${item.status} — ${item.message}`,
    ),
    '',
    '## Summary counts',
    '',
    ...counts.map((item) => `- ${item.severity}: ${item.count}`),
    '',
    '## Findings',
    '',
  ]

  report.findings.forEach((finding) => {
    lines.push(`### ${finding.title}`)
    lines.push(`- Severity: ${finding.severity}`)
    lines.push(`- Category: ${finding.category}`)
    lines.push(`- Verification: ${finding.verification}`)
    lines.push(`- Review decision: ${finding.review.decision || 'pending'}`)
    lines.push(`- Fix review: ${finding.fix_review.decision || 'pending'}`)
    lines.push(`- Location: ${locationToText(finding)}`)
    lines.push(`- Description: ${finding.description_plain}`)
    lines.push(`- Impact: ${finding.impact_plain}`)
    lines.push(`- Evidence snippet: ${maskSecretsInText(finding.evidence.snippet)}`)
    lines.push(`- Captured output: ${maskSecretsInText(finding.evidence.captured_output)}`)

    if (finding.cwe_id) {
      const cweUrl = buildCweUrl(finding.cwe_id)
      if (cweUrl && isSafeHttpUrl(cweUrl)) {
        lines.push(`- CWE: [${finding.cwe_id}](${cweUrl})`)
      } else {
        lines.push(`- CWE: ${finding.cwe_id}`)
      }
    }

    lines.push('')
  })

  return lines.join('\n')
}
