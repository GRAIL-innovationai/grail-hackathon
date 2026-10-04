export const isSafeHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const buildCweUrl = (cweId?: string): string | null => {
  if (!cweId) {
    return null
  }

  const match = cweId.match(/CWE-(\d+)/i)
  if (!match) {
    return null
  }

  return `https://cwe.mitre.org/data/definitions/${match[1]}.html`
}
