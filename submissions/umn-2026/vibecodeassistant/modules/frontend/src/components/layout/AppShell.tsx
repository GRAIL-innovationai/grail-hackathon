import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'New scan', end: true },
  { to: '/scans/scan-demo-001/progress', label: 'Progress' },
  { to: '/scans/scan-demo-001/findings', label: 'Findings' },
  { to: '/scans/scan-demo-001/export', label: 'Export' },
]

export const AppShell = () => {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav__brand">
          <p className="top-nav__title">Reporting and Fix Recommendation</p>
          <span className="top-nav__subtitle">Team 1 frontend dashboard</span>
        </div>
        <nav className="top-nav__links" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              end={item.end}
              to={item.to}
              className={({ isActive }) =>
                `top-nav__link ${isActive ? 'top-nav__link--active' : ''}`.trim()
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
