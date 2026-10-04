interface StateProps {
  title: string
  message: string
}

export const LoadingState = ({ title, message }: StateProps) => (
  <div className="loading-state panel" role="status" aria-live="polite">
    <h2>{title}</h2>
    <p>{message}</p>
  </div>
)

export const ErrorState = ({ title, message }: StateProps) => (
  <div className="error-state panel" role="alert">
    <h2>{title}</h2>
    <p>{message}</p>
  </div>
)

export const EmptyState = ({ title, message }: StateProps) => (
  <div className="empty-state panel">
    <h2>{title}</h2>
    <p>{message}</p>
  </div>
)
