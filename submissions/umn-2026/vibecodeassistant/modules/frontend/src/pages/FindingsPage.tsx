import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { PageHeader } from '../components/layout/PageHeader'
import { FindingsCards, FindingsFilters, FindingsTable, type FindingsFiltersState } from '../components/findings/FindingViews'
import { FindingSummary } from '../components/findings/FindingSummary'
import type { Finding } from '../contracts/finding'

const defaultFilters: FindingsFiltersState = {
  severity: 'all',
  category: 'all',
  verification: 'all',
  reviewDecision: 'all',
}

export const FindingsPage = () => {
  const { scanId = 'scan-demo-001' } = useParams()
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [filters, setFilters] = useState<FindingsFiltersState>(defaultFilters)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiClient.getFindings(scanId)
        setFindings(response)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load findings.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [scanId])

  const filteredFindings = useMemo(() => {
    return findings.filter((finding) => {
      return (
        (filters.severity === 'all' || finding.severity === filters.severity) &&
        (filters.category === 'all' || finding.category === filters.category) &&
        (filters.verification === 'all' || finding.verification === filters.verification) &&
        (filters.reviewDecision === 'all' || finding.review.decision === filters.reviewDecision)
      )
    })
  }, [filters, findings])

  if (loading) {
    return <LoadingState title="Loading findings" message="Fetching merged findings from the Team 6 adapter." />
  }

  if (error) {
    return <ErrorState title="Could not load findings" message={error} />
  }

  return (
    <div className="grid">
      <PageHeader
        title="Findings dashboard"
        description="Review merged findings, filter by risk and verification status, and switch between table and card views."
        actions={
          <div className="toggle-group" aria-label="View mode toggle">
            <button type="button" aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}>
              Table view
            </button>
            <button type="button" aria-pressed={viewMode === 'cards'} onClick={() => setViewMode('cards')}>
              Card view
            </button>
          </div>
        }
      />

      <FindingSummary findings={findings} />

      <section className="panel toolbar">
        <h2>Filters</h2>
        <FindingsFilters filters={filters} onChange={setFilters} />
      </section>

      {filteredFindings.length === 0 ? (
        <EmptyState
          title="No findings match the current filters"
          message="Adjust severity, category, verification, or review filters to broaden the result set."
        />
      ) : viewMode === 'table' ? (
        <FindingsTable findings={filteredFindings} />
      ) : (
        <FindingsCards findings={filteredFindings} />
      )}
    </div>
  )
}
