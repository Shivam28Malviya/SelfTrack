import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import NotificationsBell from './NotificationsBell'
import ThemeToggle from './ThemeToggle'
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
  const { toast } = useToast()
  const [confirmLogout, setConfirmLogout] = useState(false)

  const handleLogout = () => {
    logout()
    setConfirmLogout(false)
    toast('Signed out.', 'info')
    navigate('/login')
  }

  return (
    <>
      <aside className="w-60 min-h-screen bg-slate-900/60 backdrop-blur-lg border-r border-white/10 flex flex-col shrink-0 animate-slide-in-right">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-float inline-block">🏆</span>
            <div>
              <p className="text-white font-bold text-lg leading-none">SelfTrack</p>
              <p className="text-slate-300 text-xs mt-0.5">Gamified Progress</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <NotificationsBell />
            <ThemeToggle />
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
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium relative overflow-hidden animate-slide-up ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white hover:translate-x-1'
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
