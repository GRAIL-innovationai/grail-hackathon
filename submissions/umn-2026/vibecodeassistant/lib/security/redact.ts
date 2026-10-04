export function redact(text: string): string {
  return text
    .replace(
      /sk-[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
      "[REDACTED]",
    )
    .replace(
      /([?&](?:token|key|api_key|secret|password|session|access_token)=)[^&\s#]+/gi,
      "$1[REDACTED]",
    )
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]");
}
