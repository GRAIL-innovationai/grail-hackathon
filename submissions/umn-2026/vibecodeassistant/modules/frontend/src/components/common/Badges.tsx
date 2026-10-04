import type {
  FindingCategory,
  FixReviewDecision,
  ModuleStatus,
  ReviewDecision,
  Severity,
  VerificationStatus,
} from '../../contracts/finding'

interface BadgeProps {
  tone:
    | Severity
    | FindingCategory
    | VerificationStatus
    | ReviewDecision
    | FixReviewDecision
    | ModuleStatus
  children: string
}

export const Badge = ({ tone, children }: BadgeProps) => {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Badge tone={severity}>{severity}</Badge>
)

export const CategoryBadge = ({ category }: { category: FindingCategory }) => (
  <Badge tone={category}>{category}</Badge>
)

export const VerificationBadge = ({ verification }: { verification: VerificationStatus }) => (
  <Badge tone={verification}>{verification === 'hypothesis' ? 'hypothesis · unverified' : 'confirmed'}</Badge>
)

export const ReviewBadge = ({ decision }: { decision: ReviewDecision }) => (
  <Badge tone={decision}>{decision}</Badge>
)

export const FixReviewBadge = ({ decision }: { decision: FixReviewDecision }) => (
  <Badge tone={decision}>{decision}</Badge>
)

export const ModuleStatusBadge = ({ status }: { status: ModuleStatus }) => (
  <Badge tone={status}>{status}</Badge>
)
