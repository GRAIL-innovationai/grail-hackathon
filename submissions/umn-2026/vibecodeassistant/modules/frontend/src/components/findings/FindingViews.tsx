import { Link } from 'react-router-dom'
import type { Finding, ReviewDecision, Severity, VerificationStatus } from '../../contracts/finding'
import {
  CategoryBadge,
  ReviewBadge,
  SeverityBadge,
  VerificationBadge,
} from '../common/Badges'

export interface FindingsFiltersState {
  severity: Severity | 'all'
  category: Finding['category'] | 'all'
  verification: VerificationStatus | 'all'
  reviewDecision: ReviewDecision | 'all'
}

export const FindingsFilters = ({
  filters,
  onChange,
}: {
  filters: FindingsFiltersState
  onChange: (next: FindingsFiltersState) => void
}) => {
  return (
    <div className="toolbar__filters">
      <label className="field">
        <span>Severity</span>
        <select
          value={filters.severity}
          onChange={(event) => onChange({ ...filters, severity: event.target.value as FindingsFiltersState['severity'] })}
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
      </label>

      <label className="field">
        <span>Category</span>
        <select
          value={filters.category}
          onChange={(event) => onChange({ ...filters, category: event.target.value as FindingsFiltersState['category'] })}
        >
          <option value="all">All categories</option>
          <option value="runtime">Runtime</option>
          <option value="static">Static</option>
          <option value="security">Security</option>
          <option value="compliance">Compliance</option>
        </select>
      </label>

      <label className="field">
        <span>Verification</span>
        <select
          value={filters.verification}
          onChange={(event) =>
            onChange({ ...filters, verification: event.target.value as FindingsFiltersState['verification'] })
          }
        >
          <option value="all">All verification states</option>
          <option value="confirmed">Confirmed</option>
          <option value="hypothesis">Hypothesis</option>
        </select>
      </label>

      <label className="field">
        <span>Review decision</span>
        <select
          value={filters.reviewDecision}
          onChange={(event) =>
            onChange({ ...filters, reviewDecision: event.target.value as FindingsFiltersState['reviewDecision'] })
          }
        >
          <option value="all">All review decisions</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="rejected">Rejected</option>
          <option value="escalated">Escalated</option>
        </select>
      </label>
    </div>
  )
}

export const FindingsTable = ({ findings }: { findings: Finding[] }) => {
  return (
    <div className="panel">
      <table className="finding-table">
        <thead>
          <tr>
            <th scope="col">Finding</th>
            <th scope="col">Severity</th>
            <th scope="col">Category</th>
            <th scope="col">Verification</th>
            <th scope="col">Review</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => (
            <tr key={finding.id}>
              <td>
                <Link to={`/findings/${finding.id}`}>{finding.title}</Link>
                <p className="finding-meta">{finding.description_plain}</p>
              </td>
              <td>
                <SeverityBadge severity={finding.severity} />
              </td>
              <td>
                <CategoryBadge category={finding.category} />
              </td>
              <td>
                <VerificationBadge verification={finding.verification} />
              </td>
              <td>
                <ReviewBadge decision={finding.review.decision} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const FindingsCards = ({ findings }: { findings: Finding[] }) => {
  return (
    <div className="finding-grid">
      {findings.map((finding) => (
        <article className="panel finding-card" key={finding.id}>
          <div className="badge-row">
            <SeverityBadge severity={finding.severity} />
            <CategoryBadge category={finding.category} />
            <VerificationBadge verification={finding.verification} />
            <ReviewBadge decision={finding.review.decision} />
          </div>
          <div>
            <h3>{finding.title}</h3>
            <p className="finding-meta">{finding.description_plain}</p>
          </div>
          <div className="button-row">
            <Link to={`/findings/${finding.id}`}>Open detail view</Link>
          </div>
        </article>
      ))}
    </div>
  )
}
