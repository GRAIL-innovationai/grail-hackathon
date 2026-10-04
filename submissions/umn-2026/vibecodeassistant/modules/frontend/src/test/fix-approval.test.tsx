import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FindingDetailPage } from '../pages/FindingDetailPage'
import { renderRoute } from './test-utils'

describe('Fix approval controls', () => {
  it('keeps Approve fix unavailable on an unconfirmed finding', async () => {
    renderRoute(
      'findings/:findingId',
      <FindingDetailPage />,
      '/findings/finding-static-high-route-leak',
    )

    expect(await screen.findByText(/unbounded event listeners in dashboard route/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve fix/i })).toBeDisabled()
  })

  it('requires explicit confirmation before approving a fix', async () => {
    const user = userEvent.setup()
    renderRoute(
      'findings/:findingId',
      <FindingDetailPage />,
      '/findings/finding-runtime-critical-auth-loop',
    )

    expect(await screen.findByText(/login flow crashes after token refresh loop/i)).toBeInTheDocument()
    const approveButton = screen.getByRole('button', { name: /approve fix/i })
    expect(approveButton).toBeDisabled()

    await user.click(screen.getByLabelText(/i confirm that i want to approve this fix recommendation/i))

    expect(approveButton).toBeEnabled()
  })
})
