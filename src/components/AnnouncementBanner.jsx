import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AnnouncementBanner() {
  const { meta } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const a = meta.announcement
  const active = a?.text && a.until > Date.now()
  if (!active || dismissed) return null

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-[90vw] animate-slide-down">
      <div className="bg-gradient-to-r from-amber-500/95 to-orange-500/95 text-white pl-4 pr-2 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-amber-300/40 backdrop-blur-md">
        <span className="text-lg">📢</span>
        <p className="text-sm font-medium truncate">{a.text}</p>
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
