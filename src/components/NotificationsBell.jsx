import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function NotificationsBell() {
  const { notifications, markNotifRead, markAllNotifsRead } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const unread = notifications.filter(n => !n.read).length

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-lg active:scale-95"
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pop">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-slate-900 border border-white/15 rounded-2xl shadow-2xl z-50 animate-scale-in origin-top-left">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-slate-900">
            <h3 className="font-bold text-white text-sm">Notifications</h3>
            {unread > 0 && (
              <button onClick={markAllNotifsRead} className="text-xs text-indigo-300 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No notifications yet.</p>
          ) : (
            notifications.slice(0, 30).map(n => (
              <button
                key={n.id}
                onClick={() => markNotifRead(n.id)}
                className={`w-full text-left flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 border-white/5 hover:bg-white/10 ${
                  n.read ? 'opacity-60' : ''
                }`}
              >
                <span className="text-lg shrink-0">{n.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white leading-snug">{n.text}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{timeAgo(n.ts)}</p>
                </div>
                {!n.read && <span className="w-2 h-2 bg-indigo-400 rounded-full mt-1.5 shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
