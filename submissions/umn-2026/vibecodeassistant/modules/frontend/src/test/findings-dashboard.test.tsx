import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FindingsPage } from '../pages/FindingsPage'
import { renderRoute } from './test-utils'

describe('FindingsPage', () => {
  it('switches between table and card views', async () => {
    const user = userEvent.setup()
    renderRoute('scans/:scanId/findings', <FindingsPage />, '/scans/scan-demo-001/findings')

    expect(await screen.findByRole('button', { name: /table view/i })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: /card view/i }))

    expect(screen.getByRole('button', { name: /card view/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText(/open detail view/i).length).toBeGreaterThan(0)
  })

  it('filters findings by severity and keeps hypothesis marked as unverified', async () => {
    const user = userEvent.setup()
    renderRoute('scans/:scanId/findings', <FindingsPage />, '/scans/scan-demo-001/findings')

    await screen.findByText(/login flow crashes after token refresh loop/i)
    await user.selectOptions(screen.getByLabelText(/severity/i), 'medium')

    expect(screen.getByText(/captured xss payload appears in app output/i)).toBeInTheDocument()
    expect(screen.queryByText(/login flow crashes after token refresh loop/i)).not.toBeInTheDocument()
    expect(screen.getByText(/hypothesis · unverified/i)).toBeInTheDocument()
  })
})
