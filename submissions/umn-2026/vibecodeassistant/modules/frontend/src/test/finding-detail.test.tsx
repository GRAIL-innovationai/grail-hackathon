import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FindingDetailPage } from '../pages/FindingDetailPage'
import { renderRoute } from './test-utils'

describe('FindingDetailPage', () => {
  it('renders hostile snippets as literal text', async () => {
    renderRoute(
      'findings/:findingId',
      <FindingDetailPage />,
      '/findings/finding-security-medium-unescaped-snippet',
    )

    expect(await screen.findByText(/captured xss payload appears in app output/i)).toBeInTheDocument()
    const snippet = screen.getByText('<img src=x onerror=alert(1)>')
    expect(snippet).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).not.toBeInTheDocument()
  })

  it('blocks reject without a reason', async () => {
    const user = userEvent.setup()
    renderRoute(
      'findings/:findingId',
      <FindingDetailPage />,
      '/findings/finding-static-high-route-leak',
    )

    await screen.findByText(/unbounded event listeners in dashboard route/i)

    await user.selectOptions(screen.getByLabelText(/review decision/i), 'rejected')
    expect(screen.getByRole('button', { name: /reject finding/i })).toBeDisabled()
  })

  it('blocks escalate without a reason', async () => {
    const user = userEvent.setup()
    renderRoute(
      'findings/:findingId',
      <FindingDetailPage />,
      '/findings/finding-static-high-route-leak',
    )

    await screen.findByText(/unbounded event listeners in dashboard route/i)

    await user.selectOptions(screen.getByLabelText(/review decision/i), 'escalated')
    expect(screen.getByRole('button', { name: /escalate finding/i })).toBeDisabled()
  })

  it('allows reject after a reason is entered', async () => {
    const user = userEvent.setup()
    renderRoute(
      'findings/:findingId',
      <FindingDetailPage />,
      '/findings/finding-static-high-route-leak',
    )

    await screen.findByText(/unbounded event listeners in dashboard route/i)

    await user.selectOptions(screen.getByLabelText(/review decision/i), 'rejected')

    await user.type(screen.getByLabelText(/reason/i), 'Needs confirmation from repo owner.')
    expect(screen.getByRole('button', { name: /reject finding/i })).toBeEnabled()
  })
})
