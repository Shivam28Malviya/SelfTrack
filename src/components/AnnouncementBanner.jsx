import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AnnouncementBanner() {
  const { meta } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const a = meta.announcement
  const active = a?.text && a.until > Date.now()
  if (!active || dismissed) return null

  return (
    <div className="fixed inset-x-0 top-16 lg:top-3 z-[70] flex justify-center px-4 pointer-events-none animate-slide-down">
      <div className="pointer-events-auto w-full max-w-lg bg-gradient-to-r from-amber-500/95 to-orange-500/95 text-white pl-4 pr-2 py-2.5 rounded-2xl shadow-2xl flex items-start gap-3 border border-amber-300/40 backdrop-blur-md">
        <span className="text-lg shrink-0 mt-0.5">📢</span>
        <p className="text-sm font-medium leading-snug flex-1">{a.text}</p>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/80 hover:text-white w-7 h-7 rounded-full hover:bg-white/20 text-lg leading-none flex items-center justify-center shrink-0"
          aria-label="Dismiss announcement"
        >
          ×
        </button>
      </div>
    </div>
  )
}
