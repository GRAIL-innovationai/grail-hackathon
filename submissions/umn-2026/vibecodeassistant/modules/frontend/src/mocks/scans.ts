import type { ScanRecord } from '../contracts/finding'

export const mockScans: ScanRecord[] = [
  {
    id: 'scan-demo-001',
    target_url: 'http://localhost:3000',
    repo_path: '/Users/demo/projects/vibe-app',
    authorization_confirmed: true,
    created_at: '2026-10-03T08:55:00.000Z',
    modules: [
      {
        module: 'runtime',
        status: 'done',
        message: 'Runtime crawl completed with interactive coverage.',
      },
      {
        module: 'static',
        status: 'done',
        message: 'Static analysis completed and emitted architectural findings.',
      },
      {
        module: 'security',
        status: 'running',
        message: 'Security checks are still confirming auth and secret issues.',
      },
      {
        module: 'compliance',
        status: 'failed',
        message: 'Compliance crawler failed before checking all legal pages.',
      },
    ],
  },
]
