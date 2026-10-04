import type {
  Finding,
  FixReviewPayload,
  ReviewPayload,
  ScanRecord,
  ScanReport,
  ScanStartPayload,
} from '../contracts/finding'
import { mockFindings } from '../mocks/findings'
import { buildMockReport } from '../mocks/report'
import { mockScans } from '../mocks/scans'
import { apiConfig } from './types'

const mockLatency = async () => {
  await Promise.resolve()
}

const scansStore = [...mockScans]
const findingsStore = mockFindings.map((finding) => ({ ...finding }))

const assertMockMode = () => {
  if (apiConfig.mode !== 'mock') {
    throw new Error('Only mock mode is implemented. Update src/api/client.ts to switch backends.')
  }
}

export const apiClient = {
  async startScan(payload: ScanStartPayload): Promise<ScanRecord> {
    assertMockMode()
    await mockLatency()

    const scan: ScanRecord = {
      id: `scan-${Date.now()}`,
      target_url: payload.target_url,
      repo_path: payload.repo_path,
      authorization_confirmed: payload.authorization_confirmed,
      created_at: new Date().toISOString(),
      modules: [
        { module: 'runtime', status: 'queued', message: 'Runtime module queued.' },
        { module: 'static', status: 'queued', message: 'Static module queued.' },
        { module: 'security', status: 'queued', message: 'Security module queued.' },
        { module: 'compliance', status: 'queued', message: 'Compliance module queued.' },
      ],
    }

    scansStore.unshift(scan)
    return scan
  },

  async getScan(scanId: string): Promise<ScanRecord> {
    assertMockMode()
    await mockLatency()
    return scansStore.find((scan) => scan.id === scanId) ?? scansStore[0]
  },

  async getFindings(_scanId: string): Promise<Finding[]> {
    assertMockMode()
    await mockLatency()
    return findingsStore
  },

  async getFinding(findingId: string): Promise<Finding | undefined> {
    assertMockMode()
    await mockLatency()
    return findingsStore.find((finding) => finding.id === findingId)
  },

  async patchReview(findingId: string, payload: ReviewPayload): Promise<Finding | undefined> {
    assertMockMode()
    await mockLatency()
    const finding = findingsStore.find((item) => item.id === findingId)
    if (!finding) {
      return undefined
    }

    finding.review = {
      decision: payload.decision,
      reason: payload.reason,
      reviewer: payload.reviewer,
      timestamp: new Date().toISOString(),
    }

    return finding
  },

  async patchFixReview(
    findingId: string,
    payload: FixReviewPayload,
  ): Promise<Finding | undefined> {
    assertMockMode()
    await mockLatency()
    const finding = findingsStore.find((item) => item.id === findingId)
    if (!finding) {
      return undefined
    }

    finding.fix_review = {
      decision: payload.decision,
      reviewer: payload.reviewer,
      timestamp: new Date().toISOString(),
    }

    return finding
  },

  async getReport(scanId: string, _format: 'json' | 'markdown'): Promise<ScanReport> {
    assertMockMode()
    await mockLatency()
    return buildMockReport(scanId)
  },
}
