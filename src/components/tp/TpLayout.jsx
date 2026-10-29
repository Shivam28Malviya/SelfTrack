import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useTp } from '../../context/TpContext'
import { canOpen } from '../../lib/tpApi'
import { TpLoading, TpError } from './States'

const NAV = [
  { to: '/tp', label: 'Overview', key: 'overview', end: true },
  { to: '/tp/people', label: 'People', key: 'people' },
  { to: '/tp/delivery', label: 'Delivery', key: 'delivery' },
  { to: '/tp/entries', label: 'Entries', key: 'entries' },
  { to: '/tp/attendance', label: 'Attendance', key: 'attendance' },
  { to: '/tp/skills', label: 'Skills', key: 'skills' },
  { to: '/tp/settings', label: 'Settings', key: 'settings' },
]

/**
 * Shell for every TeamPulse screen.
 *
 * The design boards are fixed 1440px canvases; this is fluid from 360px up so
 * the mobile work later is a set of layout tweaks rather than a rewrite.
 */
export default function TpLayout({ title, children }) {
  const { loading, error, role, person, reload } = useTp()
  const location = useLocation()
  // Seven nav items do not fit a phone. Below `sm` they collapse behind a
  // disclosure rather than wrapping into three lines above every screen.
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const items = NAV.filter(n => (canOpen[n.key] ? canOpen[n.key](role) : true))

  return (
    <div className="tp">
      <a href="#tp-main" className="sr-only focus:not-sr-only focus:absolute focus:m-3 focus:p-3 focus:bg-white focus:rounded-xl">
        Skip to content
      </a>

      <div className="mx-auto w-full max-w-[1480px] p-4 md:p-5 flex flex-col gap-5">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 px-2 md:px-5 py-2" aria-label="TeamPulse">
          <Link to="/tp" className="text-[22px] tracking-[-0.04em] mr-auto">TeamPulse</Link>

          <button
            type="button"
            className="tp-btn-ghost sm:hidden order-2"
            aria-expanded={menuOpen}
            aria-controls="tp-nav-links"
            onClick={() => setMenuOpen(v => !v)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>

          <div
            id="tp-nav-links"
            className={`${menuOpen ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row flex-wrap
                        items-start sm:items-center gap-x-6 gap-y-3 text-sm
                        order-4 sm:order-none w-full sm:w-auto`}
          >
            {items.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  'pb-0.5 min-h-[44px] sm:min-h-0 flex items-center ' +
                  (isActive ? 'border-b border-[color:var(--tp-navy)]' : 'hover:opacity-70')
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-3 ml-auto order-3 sm:order-none">
            {(role === 'admin' || role === 'manager') && (
              <Link to="/tp/entry" className="tp-btn">Quick log</Link>
            )}
            <Link to="/" className="text-sm hover:opacity-70 hidden sm:inline" title="Back to SelfTrack">
              SelfTrack
            </Link>
          </div>
        </nav>

        <main id="tp-main" className="flex flex-col gap-5">
          {loading && <TpLoading label={`Loading ${title || 'TeamPulse'}`} />}
          {!loading && error && <TpError error={error} onRetry={reload} />}
          {!loading && !error && children}
        </main>

        <footer className="px-2 md:px-5 pb-2 text-xs" style={{ color: 'var(--tp-muted)' }}>
          Signed in as {role}{person ? ` · ${person.name}` : ''}. Attendance and
          individual performance data are access-logged. Retention: raw records
          24 months, aggregates 5 years.
        </footer>
      </div>
    </div>
  )
}
