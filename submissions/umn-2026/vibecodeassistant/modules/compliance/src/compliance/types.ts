export type Severity = "low" | "medium" | "high";

export type ComplianceCategory =
  | "privacy-policy"
  | "terms-of-service"
  | "cookie-consent"
  | "contact-page"
  | "about-page"
  | "discoverability";

export interface ComplianceSignal {
  discoveredUrls: string[];
  discoveredLinkTexts: string[];
  pageTextSnippets: string[];
  filePaths: string[];
  fileContents?: Record<string, string>;
}

export interface ComplianceFinding {
  category: ComplianceCategory;
  title: string;
  severity: Severity;
  passed: boolean;
  description: string;
  evidence: string[];
  recommendedFix: string;
}

export interface ComplianceRule {
  id: ComplianceCategory;
  title: string;
  evaluate: (signal: ComplianceSignal) => ComplianceFinding;
}

export interface ComplianceCheckResult {
  findings: ComplianceFinding[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
  };
}
