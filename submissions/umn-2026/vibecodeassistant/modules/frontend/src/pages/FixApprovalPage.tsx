import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { FixApprovalPanel } from '../components/findings/FixApprovalPanel'
import { PageHeader } from '../components/layout/PageHeader'
import type { Finding } from '../contracts/finding'

export const FixApprovalPage = () => {
  const { findingId = '' } = useParams()
  const [finding, setFinding] = useState<Finding | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiClient.getFinding(findingId)
        setFinding(response)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load fix approval page.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [findingId])

  if (loading) {
    return <LoadingState title="Loading fix review" message="Fetching fix recommendation details." />
  }

  if (error) {
    return <ErrorState title="Could not load fix review" message={error} />
  }

  if (!finding) {
    return <EmptyState title="Fix suggestion not found" message="The selected finding is unavailable." />
  }

  return (
    <div className="grid">
      <PageHeader
        title="Fix approval"
        description="Inspect the proposed fix and record an approval or decline decision for the backend."
        actions={<Link to={`/findings/${finding.id}`}>Back to finding</Link>}
      />
      <FixApprovalPanel
        finding={finding}
        onSubmit={async (input) => {
          const updated = await apiClient.patchFixReview(finding.id, input)
          setFinding(updated)
        }}
      />
    </div>
  )
}
