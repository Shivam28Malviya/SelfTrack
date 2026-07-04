import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import NotificationsBell from './NotificationsBell'
import { useToast } from './Toast'

const NAV = [
  { to: '/', label: 'Leaderboard', icon: '🏆' },
  { to: '/profile', label: 'Profile', icon: '👤' },
  { to: '/compare', label: 'Compare', icon: '⚖️' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: '🏛️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar() {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const handleLogout = () => {
    logout()
    setConfirmLogout(false)
    toast('Signed out.', 'info')
    navigate('/login')
  }

  return (
    <>
      {/* Mobile hamburger — floats above everything, opens the drawer */}
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-40 w-10 h-10 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/15 text-white flex items-center justify-center text-lg active:scale-95"
          aria-label="Open menu"
        >
          ☰
        </button>
      )}

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/60 animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 ease-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:z-30 lg:w-60 min-h-screen bg-[#201e1b] border-r border-black/20 flex flex-col shrink-0`}
      >
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-float inline-block">🏆</span>
              <div>
                <p className="text-white font-bold text-lg leading-none">SelfTrack</p>
                <p className="text-slate-300 text-xs mt-0.5">Gamified Progress</p>
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden w-8 h-8 rounded-full text-white text-xl leading-none flex items-center justify-center hover:bg-white/10"
              aria-label="Close menu"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <NotificationsBell />
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon }, i) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={{ animationDelay: `${i * 60}ms` }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium relative overflow-hidden animate-slide-up ${
                  isActive
                    ? 'bg-[#a97e5d] text-white shadow-sm'
                    : 'text-neutral-400 hover:bg-white/10 hover:text-white hover:translate-x-1'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3 relative">
            <Avatar user={currentUser} className="w-9 h-9 text-xl leading-none ring-2 ring-white/10" />
            {currentUser?.pendingAvatar && (
              <span
                className="absolute left-6 top-0 w-3 h-3 bg-amber-400 rounded-full border-2 border-slate-900 animate-pulse-soft"
                title="Avatar pending approval"
              />
            )}
            <div className="overflow-hidden">
              <p className="text-white text-sm font-medium truncate">{currentUser?.username}</p>
              <p className="text-slate-400 text-xs truncate capitalize">{currentUser?.role}</p>
            </div>
          </div>
          <button
            onClick={() => setConfirmLogout(true)}
            className="w-full text-left text-slate-300 hover:text-red-400 text-xs px-2 py-1.5 rounded hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmLogout}
        title="Sign out?"
        message="You'll need to sign in again to access the dashboard."
        confirmLabel="Sign out"
        danger
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </>
  )
}
