import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewScanPage } from '../pages/NewScanPage'
import { renderRoute } from './test-utils'

describe('NewScanPage', () => {
  it('rejects non-localhost URLs', async () => {
    const user = userEvent.setup()
    renderRoute('', <NewScanPage />, '/')

    const urlField = screen.getByLabelText(/target url/i)
    await user.clear(urlField)
    await user.type(urlField, 'https://example.com')

    expect(screen.getByText(/use localhost, 127.0.0.1, or \[::1\] as the host/i)).toBeInTheDocument()
  })

  it('keeps start scan disabled until authorization is checked', async () => {
    const user = userEvent.setup()
    renderRoute('', <NewScanPage />, '/')

    const startButton = screen.getByRole('button', { name: /start scan/i })
    expect(startButton).toBeDisabled()

    await user.click(screen.getByLabelText(/i own this app or am authorized to test it/i))

    expect(startButton).toBeEnabled()
  })
})
