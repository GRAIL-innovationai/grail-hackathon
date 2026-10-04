import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'

export const renderRoute = (
  routePath: string,
  element: React.ReactNode,
  initialEntry?: string,
) => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [{ path: routePath, element }],
      },
    ],
    {
      initialEntries: [initialEntry ?? `/${routePath}`],
    },
  )

  return render(<RouterProvider router={router} />)
}
