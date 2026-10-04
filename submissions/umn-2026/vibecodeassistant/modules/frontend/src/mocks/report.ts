import type { CoverageEntry, ScanReport } from '../contracts/finding'
import { mockFindings } from './findings'
import { mockScans } from './scans'

export const mockCoverage = (scanId: string): CoverageEntry[] => {
  const scan = mockScans.find((item) => item.id === scanId) ?? mockScans[0]
  return scan.modules.map((module) => ({
    module: module.module,
    status: module.status,
    message: module.message,
  }))
}

export const buildMockReport = (scanId: string): ScanReport => ({
  scanId,
  generatedAt: '2026-10-03T10:00:00.000Z',
  coverage: mockCoverage(scanId),
  findings: mockFindings,
})
