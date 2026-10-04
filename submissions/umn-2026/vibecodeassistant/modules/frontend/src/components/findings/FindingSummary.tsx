import type { Finding } from '../../contracts/finding'
import { buildSummaryCounts } from '../../utils/export'

export const FindingSummary = ({ findings }: { findings: Finding[] }) => {
  const bySeverity = buildSummaryCounts(findings)
  const categories = ['runtime', 'static', 'security', 'compliance'] as const

  return (
    <div className="summary-grid">
      {bySeverity.map((item) => (
        <section className="panel summary-card" key={item.severity}>
          <span className="summary-card__value">{item.count}</span>
          <span className="summary-card__label">{item.severity}</span>
        </section>
      ))}
      {categories.map((category) => (
        <section className="panel summary-card" key={category}>
          <span className="summary-card__value">
            {findings.filter((finding) => finding.category === category).length}
          </span>
          <span className="summary-card__label">{category}</span>
        </section>
      ))}
    </div>
  )
}
