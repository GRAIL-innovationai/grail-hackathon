import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { ModuleStatusBadge, ReviewBadge, SeverityBadge } from '../components/common/Badges'
import { ErrorState, LoadingState } from '../components/common/States'
import { PageHeader } from '../components/layout/PageHeader'
import type { ScanReport } from '../contracts/finding'
import { reportToJson, reportToMarkdown } from '../utils/export'

const downloadText = (filename: string, text: string, mimeType: string) => {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const ExportPage = () => {
  const { scanId = 'scan-demo-001' } = useParams()
  const [report, setReport] = useState<ScanReport | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiClient.getReport(scanId, 'json')
        setReport(response)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load export data.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [scanId])

  const jsonText = useMemo(() => (report ? reportToJson(report) : ''), [report])
  const markdownText = useMemo(() => (report ? reportToMarkdown(report) : ''), [report])

  if (loading) {
    return <LoadingState title="Preparing export" message="Building coverage and finding report output." />
  }

  if (error || !report) {
    return <ErrorState title="Could not prepare export" message={error ?? 'Report unavailable.'} />
  }

  return (
    <div className="grid">
      <PageHeader
        title="Export report"
        description="Download JSON or Markdown reports. PDF export is supported through the browser print dialog."
        actions={
          <div className="button-row">
            <button className="button" type="button" onClick={() => downloadText(`${scanId}.json`, jsonText, 'application/json')}>
              Export JSON
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => downloadText(`${scanId}.md`, markdownText, 'text/markdown')}
            >
              Export Markdown
            </button>
          </div>
        }
      />

      <div className="export-grid grid">
        <section className="panel export-preview">
          <h2>Coverage</h2>
          {report.coverage.map((entry) => (
            <div className="badge-row" key={entry.module}>
              <strong>{entry.module}</strong>
              <ModuleStatusBadge status={entry.status} />
              <span className="metadata">{entry.message}</span>
            </div>
          ))}

          <h2>Findings included in export</h2>
          {report.findings.map((finding) => (
            <article className="panel finding-card" key={finding.id}>
              <div className="badge-row">
                <SeverityBadge severity={finding.severity} />
                <ReviewBadge decision={finding.review.decision} />
              </div>
              <h3>{finding.title}</h3>
              <p className="metadata">{finding.description_plain}</p>
            </article>
          ))}
        </section>

        <section className="panel export-preview">
          <h2>Markdown preview</h2>
          <pre className="markdown-preview">{markdownText}</pre>
        </section>
      </div>
    </div>
  )
}
