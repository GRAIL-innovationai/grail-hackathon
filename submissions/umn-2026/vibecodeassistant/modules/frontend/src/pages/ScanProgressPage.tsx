import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { CategoryBadge, ModuleStatusBadge, SeverityBadge } from '../components/common/Badges'
import { ErrorState, LoadingState } from '../components/common/States'
import { PageHeader } from '../components/layout/PageHeader'
import type { Finding, ScanRecord } from '../contracts/finding'

export const ScanProgressPage = () => {
  const { scanId = 'scan-demo-001' } = useParams()
  const [scan, setScan] = useState<ScanRecord | undefined>()
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [scanResponse, findingsResponse] = await Promise.all([
          apiClient.getScan(scanId),
          apiClient.getFindings(scanId),
        ])
        setScan(scanResponse)
        setFindings(findingsResponse)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load scan progress.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [scanId])

  if (loading) {
    return <LoadingState title="Loading scan progress" message="Checking module status and findings stream." />
  }

  if (error || !scan) {
    return <ErrorState title="Could not load scan progress" message={error ?? 'Scan record unavailable.'} />
  }

  return (
    <div className="grid">
      <PageHeader
        title="Scan progress"
        description="Track the state of each analysis module. Failed modules remain visible as failed and are never shown as zero issues."
        actions={<Link to={`/scans/${scan.id}/findings`}>Open findings dashboard</Link>}
      />

      <section className="status-grid">
        {scan.modules.map((module) => (
          <article className="panel status-card" key={module.module}>
            <div className="badge-row">
              <CategoryBadge category={module.module} />
              <ModuleStatusBadge status={module.status} />
            </div>
            <p>{module.message}</p>
          </article>
        ))}
      </section>

      <section className="panel grid">
        <div>
          <h2>Findings received so far</h2>
          <p className="metadata">Merged findings appear here as modules complete or partially complete.</p>
        </div>

        <div className="finding-grid">
          {findings.slice(0, 4).map((finding) => (
            <article className="panel finding-card" key={finding.id}>
              <div className="badge-row">
                <SeverityBadge severity={finding.severity} />
                <CategoryBadge category={finding.category} />
              </div>
              <h3>{finding.title}</h3>
              <p className="metadata">{finding.description_plain}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
