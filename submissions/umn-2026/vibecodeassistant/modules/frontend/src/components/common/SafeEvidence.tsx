import { useState } from 'react'
import { maskSecretsInText } from '../../utils/masking'

interface SafeEvidenceProps {
  value: string
  label: string
  allowReveal?: boolean
}

export const SafeEvidence = ({ value, label, allowReveal = true }: SafeEvidenceProps) => {
  const [revealed, setRevealed] = useState(false)
  const displayed = revealed ? value : maskSecretsInText(value)

  return (
    <div className="grid">
      <div className="button-row">
        <strong>{label}</strong>
        {allowReveal ? (
          <button
            type="button"
            className="link-button"
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? 'Hide full value' : 'Reveal full value'}
          </button>
        ) : null}
      </div>
      <pre className="code-block">{displayed}</pre>
    </div>
  )
}
