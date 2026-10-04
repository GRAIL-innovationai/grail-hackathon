import type { ComplianceSignal } from "./types.js";

export function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function collectSearchSpace(signal: ComplianceSignal): string[] {
  return unique([
    ...signal.discoveredUrls,
    ...signal.discoveredLinkTexts,
    ...signal.pageTextSnippets,
    ...signal.filePaths,
    ...Object.keys(signal.fileContents ?? {}),
    ...Object.values(signal.fileContents ?? {})
  ].map(normalizeValue));
}

export function findMatches(values: string[], keywords: readonly string[]): string[] {
  return values.filter((value) =>
    keywords.some((keyword) => value.includes(normalizeValue(keyword)))
  );
}

export function collectEvidence(signal: ComplianceSignal, keywords: readonly string[]): string[] {
  const searchSources = [
    ...signal.discoveredUrls,
    ...signal.discoveredLinkTexts,
    ...signal.pageTextSnippets,
    ...signal.filePaths,
    ...Object.keys(signal.fileContents ?? {})
  ];

  return unique(
    searchSources.filter((entry) =>
      keywords.some((keyword) => normalizeValue(entry).includes(normalizeValue(keyword)))
    )
  );
}
