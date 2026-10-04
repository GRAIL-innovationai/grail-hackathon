export const CONTRACT_STATUS = 'PROVISIONAL'

export type FindingCategory = 'runtime' | 'static' | 'security' | 'compliance'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type VerificationStatus = 'confirmed' | 'hypothesis'
export type ReviewDecision = 'pending' | 'confirmed' | 'rejected' | 'escalated'
export type FixReviewDecision = 'pending' | 'approved' | 'declined'
export type ScanModuleKey = 'runtime' | 'static' | 'security' | 'compliance'
export type ModuleStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped'

export interface FileLocation {
  /** PROVISIONAL */
  file: string
  /** PROVISIONAL */
  line_start: number
  /** PROVISIONAL */
  line_end: number
}

export interface UrlLocation {
  /** PROVISIONAL */
  url: string
  /** PROVISIONAL */
  element: string
}

export interface FindingEvidence {
  /** PROVISIONAL */
  snippet: string
  /** PROVISIONAL */
  captured_output: string
}

export interface FixSuggestion {
  /** PROVISIONAL */
  summary: string
  /** PROVISIONAL */
  diff?: string
}

export interface ReviewState {
  /** PROVISIONAL */
  decision: ReviewDecision
  /** PROVISIONAL */
  reason: string
  /** PROVISIONAL */
  reviewer: string
  /** PROVISIONAL */
  timestamp: string
}

export interface FixReviewState {
  /** PROVISIONAL */
  decision: FixReviewDecision
  /** PROVISIONAL */
  reviewer: string
  /** PROVISIONAL */
  timestamp: string
}

export interface Finding {
  /** PROVISIONAL */
  id: string
  /** PROVISIONAL */
  title: string
  /** PROVISIONAL */
  category: FindingCategory
  /** PROVISIONAL */
  severity: Severity
  /** PROVISIONAL */
  verification: VerificationStatus
  /** PROVISIONAL */
  source_modules: ScanModuleKey[]
  /** PROVISIONAL */
  location: FileLocation | UrlLocation
  /** PROVISIONAL */
  evidence: FindingEvidence
  /** PROVISIONAL */
  description_plain: string
  /** PROVISIONAL */
  impact_plain: string
  /** PROVISIONAL */
  cwe_id?: string
  /** PROVISIONAL */
  fix_suggestion: FixSuggestion
  /** PROVISIONAL */
  review: ReviewState
  /** PROVISIONAL */
  fix_review: FixReviewState
}

export interface ModuleProgress {
  /** PROVISIONAL */
  module: ScanModuleKey
  /** PROVISIONAL */
  status: ModuleStatus
  /** PROVISIONAL */
  message: string
}

export interface ScanRecord {
  /** PROVISIONAL */
  id: string
  /** PROVISIONAL */
  target_url: string
  /** PROVISIONAL */
  repo_path: string
  /** PROVISIONAL */
  authorization_confirmed: boolean
  /** PROVISIONAL */
  modules: ModuleProgress[]
  /** PROVISIONAL */
  created_at: string
}

export interface ScanStartPayload {
  target_url: string
  repo_path: string
  authorization_confirmed: boolean
}

export interface ReviewPayload {
  decision: ReviewDecision
  reason: string
  reviewer: string
}

export interface FixReviewPayload {
  decision: FixReviewDecision
  reviewer: string
}

export interface CoverageEntry {
  module: ScanModuleKey
  status: ModuleStatus
  message: string
}

export interface ScanReport {
  scanId: string
  generatedAt: string
  coverage: CoverageEntry[]
  findings: Finding[]
}
