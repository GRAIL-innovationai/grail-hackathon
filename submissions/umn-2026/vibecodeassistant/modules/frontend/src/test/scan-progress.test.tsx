import { screen } from '@testing-library/react'
import { ScanProgressPage } from '../pages/ScanProgressPage'
import { renderRoute } from './test-utils'

describe('ScanProgressPage', () => {
  it('shows failed modules as failed rather than zero issues', async () => {
    renderRoute(
      'scans/:scanId/progress',
      <ScanProgressPage />,
      '/scans/scan-demo-001/progress',
    )

    expect(
      await screen.findByText(/compliance crawler failed before checking all legal pages/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/^failed$/i)).toBeInTheDocument()
  })
})
