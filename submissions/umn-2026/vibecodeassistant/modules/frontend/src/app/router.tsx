import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ExportPage } from '../pages/ExportPage'
import { FindingDetailPage } from '../pages/FindingDetailPage'
import { FindingsPage } from '../pages/FindingsPage'
import { FixApprovalPage } from '../pages/FixApprovalPage'
import { NewScanPage } from '../pages/NewScanPage'
import { ScanProgressPage } from '../pages/ScanProgressPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <NewScanPage /> },
      { path: 'scans/:scanId/progress', element: <ScanProgressPage /> },
      { path: 'scans/:scanId/findings', element: <FindingsPage /> },
      { path: 'findings/:findingId', element: <FindingDetailPage /> },
      { path: 'findings/:findingId/fix', element: <FixApprovalPage /> },
      { path: 'scans/:scanId/export', element: <ExportPage /> },
    ],
  },
])
