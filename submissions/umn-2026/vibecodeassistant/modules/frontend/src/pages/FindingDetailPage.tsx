import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import {
  CategoryBadge,
  FixReviewBadge,
  ReviewBadge,
  SeverityBadge,
  VerificationBadge,
} from '../components/common/Badges'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { FixApprovalPanel } from '../components/findings/FixApprovalPanel'
import { SafeEvidence } from '../components/common/SafeEvidence'
import { ReviewDecisionForm } from '../components/findings/ReviewDecisionForm'
import { PageHeader } from '../components/layout/PageHeader'
import type { Finding } from '../contracts/finding'
import { buildCweUrl, isSafeHttpUrl } from '../utils/safeLinks'

export const FindingDetailPage = () => {
  const { findingId = '' } = useParams()
  const navigate = useNavigate()
  const [finding, setFinding] = useState<Finding | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiClient.getFinding(findingId)
        setFinding(response)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load finding detail.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [findingId])

  if (loading) {
    return <LoadingState title="Loading finding" message="Fetching detailed evidence and review state." />
  }

  if (error) {
    return <ErrorState title="Could not load finding" message={error} />
  }

  if (!finding) {
    return <EmptyState title="Finding not found" message="The selected finding could not be found in the adapter." />
  }

  const cweUrl = buildCweUrl(finding.cwe_id)
  const locationLabel = 'file' in finding.location
    ? `${finding.location.file}:${finding.location.line_start}-${finding.location.line_end}`
    : `${finding.location.url} (${finding.location.element})`

  return (
    <div className="grid">
      <PageHeader
        title={finding.title}
        description="Review the plain-language issue summary, inspect evidence, and record a human triage decision."
        actions={
          <div className="button-row">
            <Link to="/scans/scan-demo-001/findings">Back to dashboard</Link>
            <button className="button button--secondary" type="button" onClick={() => navigate(`/findings/${finding.id}/fix`)}>
              Open fix approval
            </button>
          </div>
        }
      />

      <div className="detail-layout grid">
        <section className="panel detail-section">
          <div className="badge-row">
            <SeverityBadge severity={finding.severity} />
            <CategoryBadge category={finding.category} />
            <VerificationBadge verification={finding.verification} />
            <ReviewBadge decision={finding.review.decision} />
            <FixReviewBadge decision={finding.fix_review.decision} />
          </div>

          <div>
            <h2>Description</h2>
            <p>{finding.description_plain}</p>
          </div>

          <div>
            <h2>Impact</h2>
            <p>{finding.impact_plain}</p>
          </div>

          <div className="definition-list">
            <div>
              <dt>Location</dt>
              <dd>{locationLabel}</dd>
            </div>
            <div>
              <dt>Source modules</dt>
              <dd>{finding.source_modules.join(', ')}</dd>
            </div>
            <div>
              <dt>Verification status</dt>
              <dd>{finding.verification}</dd>
            </div>
            {finding.cwe_id ? (
              <div>
                <dt>CWE</dt>
                <dd>
                  {cweUrl && isSafeHttpUrl(cweUrl) ? (
                    <a href={cweUrl} target="_blank" rel="noopener noreferrer">
                      {finding.cwe_id}
                    </a>
                  ) : (
                    finding.cwe_id
                  )}
                </dd>
              </div>
            ) : null}
          </div>

          <SafeEvidence label="Evidence snippet" value={finding.evidence.snippet} />
          <SafeEvidence label="Captured output" value={finding.evidence.captured_output} />
        </section>

        <section className="panel detail-section">
          <div>
            <h2>Triage review</h2>
            <p className="review-note">Reject and escalate actions require a written explanation.</p>
          </div>
          <ReviewDecisionForm
            finding={finding}
            onSubmit={async (input) => {
              const updated = await apiClient.patchReview(finding.id, input)
              setFinding(updated)
            }}
          />

          <FixApprovalPanel
            finding={finding}
            onSubmit={async (input) => {
              const updated = await apiClient.patchFixReview(finding.id, input)
              setFinding(updated)
            }}
          />
        </section>
      </div>
    </div>
  )
}
