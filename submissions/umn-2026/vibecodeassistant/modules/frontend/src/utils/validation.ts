const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export const validateLocalTargetUrl = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return 'Enter a localhost URL, for example http://localhost:3000.'
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'Enter a valid http or https URL for a local app.'
  }

  if (!(parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    return 'Use an http or https URL.'
  }

  if (!LOCAL_HOSTNAMES.has(parsed.hostname)) {
    return 'Use localhost, 127.0.0.1, or [::1] as the host.'
  }

  return null
}

export const validateRepoPath = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return 'Enter an absolute repository path on this machine.'
  }

  const isUnixAbsolute = trimmed.startsWith('/')
  const isWindowsAbsolute = /^[A-Za-z]:\\/.test(trimmed)
  if (!isUnixAbsolute && !isWindowsAbsolute) {
    return 'Use an absolute repository path, such as /Users/name/app or C:\\repo\\app.'
  }

  return null
}

export const validateReasonRequired = (decision: string, reason: string): string | null => {
  if ((decision === 'rejected' || decision === 'escalated') && !reason.trim()) {
    return 'A written reason is required for reject and escalate decisions.'
  }

  return null
}
