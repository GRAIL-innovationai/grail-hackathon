import { useMemo, useState, type FormEvent } from 'react'
import type { Finding, ReviewDecision } from '../../contracts/finding'
import { validateReasonRequired } from '../../utils/validation'

interface ReviewDecisionFormProps {
  finding: Finding
  onSubmit: (input: { decision: ReviewDecision; reason: string; reviewer: string }) => Promise<void>
}

export const ReviewDecisionForm = ({ finding, onSubmit }: ReviewDecisionFormProps) => {
  const [decision, setDecision] = useState<ReviewDecision>(finding.review.decision || 'pending')
  const [reason, setReason] = useState(finding.review.reason)
  const [reviewer, setReviewer] = useState(finding.review.reviewer || 'Norman')
  const [submitting, setSubmitting] = useState(false)
  const error = useMemo(() => validateReasonRequired(decision, reason), [decision, reason])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (error || decision === 'pending') {
      return
    }

    setSubmitting(true)
    await onSubmit({ decision, reason, reviewer })
    setSubmitting(false)
  }

  return (
    <form className="grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="review-decision">Review decision</label>
        <select
          id="review-decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value as ReviewDecision)}
        >
          <option value="pending">Pending</option>
          <option value="confirmed">Confirm</option>
          <option value="rejected">Reject</option>
          <option value="escalated">Escalate</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="review-reason">Reason</label>
        <textarea
          id="review-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        <p className="helper">Reject and Escalate decisions require a written reason.</p>
        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="reviewer-name">Reviewer</label>
        <input
          id="reviewer-name"
          type="text"
          value={reviewer}
          onChange={(event) => setReviewer(event.target.value)}
        />
      </div>

      <div className="button-row">
        <button className="button" type="submit" disabled={Boolean(error) || decision === 'pending' || submitting}>
          {decision === 'confirmed'
            ? 'Confirm finding'
            : decision === 'rejected'
              ? 'Reject finding'
              : decision === 'escalated'
                ? 'Escalate finding'
                : 'Save review'}
        </button>
      </div>
    </form>
  )
}
