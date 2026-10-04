import { useState } from 'react'
import type { Finding, FixReviewDecision } from '../../contracts/finding'

interface FixApprovalPanelProps {
  finding: Finding
  onSubmit: (input: { decision: FixReviewDecision; reviewer: string }) => Promise<void>
}

export const FixApprovalPanel = ({ finding, onSubmit }: FixApprovalPanelProps) => {
  const [reviewer, setReviewer] = useState(finding.fix_review.reviewer || 'Norman')
  const [confirmApproval, setConfirmApproval] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const canApprove = finding.review.decision === 'confirmed'

  const handleDecision = async (decision: FixReviewDecision) => {
    if (decision === 'approved' && (!canApprove || !confirmApproval)) {
      return
    }

    setSubmitting(true)
    await onSubmit({ decision, reviewer })
    setSubmitting(false)
  }

  return (
    <section className="panel grid">
      <div>
        <h2>Fix approval</h2>
        <p className="metadata">
          Approve fix is only available after the finding is confirmed. The frontend records the decision only; it never applies fixes or opens PRs.
        </p>
      </div>

      <div className="field">
        <label htmlFor="fix-reviewer">Reviewer</label>
        <input
          id="fix-reviewer"
          type="text"
          value={reviewer}
          onChange={(event) => setReviewer(event.target.value)}
        />
      </div>

      {finding.fix_suggestion.diff ? (
        <div className="grid">
          <strong>Proposed diff</strong>
          <pre className="code-block">{finding.fix_suggestion.diff}</pre>
        </div>
      ) : (
        <p className="status-note">No diff was provided for this fix suggestion.</p>
      )}

      <label>
        <input
          type="checkbox"
          checked={confirmApproval}
          onChange={(event) => setConfirmApproval(event.target.checked)}
          disabled={!canApprove}
        />{' '}
        I confirm that I want to approve this fix recommendation.
      </label>

      <div className="button-row">
        <button
          className="button button--success"
          type="button"
          disabled={!canApprove || !confirmApproval || submitting}
          onClick={() => void handleDecision('approved')}
        >
          Approve fix
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={submitting}
          onClick={() => void handleDecision('declined')}
        >
          Decline fix
        </button>
      </div>

      {!canApprove ? (
        <p className="error-text">Approve fix is unavailable until the finding has been confirmed.</p>
      ) : null}
    </section>
  )
}
