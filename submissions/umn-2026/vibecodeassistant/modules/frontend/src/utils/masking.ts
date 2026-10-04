const SECRET_PATTERN = /(?:sk_[A-Za-z0-9_]+|api[_-]?key|token|secret|password)/i

export const maskSecret = (value: string): string => {
  if (value.length <= 8) {
    return '••••'
  }

  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

export const maskSecretsInText = (value: string): string => {
  return value
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) {
        return part
      }

      return SECRET_PATTERN.test(part) || part.length > 20 ? maskSecret(part) : part
    })
    .join('')
}
