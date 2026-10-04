import { screen } from '@testing-library/react'
import { ExportPage } from '../pages/ExportPage'
import { renderRoute } from './test-utils'

describe('ExportPage', () => {
  it('shows failed module coverage in export preview', async () => {
    renderRoute('scans/:scanId/export', <ExportPage />, '/scans/scan-demo-001/export')

    expect(await screen.findByRole('heading', { name: /coverage/i })).toBeInTheDocument()
    expect(screen.getByText(/^failed$/i)).toBeInTheDocument()
    expect(
      screen.getAllByText(/compliance crawler failed before checking all legal pages/i).length,
    ).toBeGreaterThan(0)
  })

  it('masks secrets in the export preview', async () => {
    renderRoute('scans/:scanId/export', <ExportPage />, '/scans/scan-demo-001/export')

    expect(await screen.findByRole('heading', { name: /markdown preview/i })).toBeInTheDocument()
    expect(screen.getAllByText(/demo api key exposed in client bundle/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/sk_l••••OKEN/i)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp('sk_live_' + 'EXPOSEDSECRET1234567890TOKEN', 'i'))).not.toBeInTheDocument()
  })
})
