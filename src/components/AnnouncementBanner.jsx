import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const DISMISS_KEY = 'selftrack_dismissed_announcement'

export default function AnnouncementBanner() {
  const { meta } = useAuth()
  const a = meta.announcement
  // Stays dismissed across reloads (keyed to this announcement's expiry);
  // login() clears the key so it shows again next session, and a new
  // announcement has a different `until` so it reappears too.
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === String(a?.until))

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(a?.until))
    setDismissed(true)
  }

  const active = a?.text && a.until > Date.now()
  if (!active || dismissed) return null

  return (
    <div className="fixed inset-x-0 top-16 lg:top-3 z-[70] flex justify-center px-4 pointer-events-none animate-slide-down">
      <div className="pointer-events-auto w-full max-w-lg bg-white border border-neutral-200 pl-2 pr-2 py-2 rounded-2xl shadow-[0_16px_50px_-24px_rgba(27,26,23,0.45)] flex items-start gap-3">
        <span className="shrink-0 w-8 h-8 rounded-xl bg-[#f3ece3] border border-[#e0cdb6] flex items-center justify-center text-base">📢</span>
        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#a97e5d]">Announcement</p>
          <p className="text-sm font-medium leading-snug text-neutral-800">{a.text}</p>
        </div>
        <button
          onClick={dismiss}
          className="text-neutral-400 hover:text-neutral-900 w-7 h-7 rounded-full hover:bg-neutral-100 text-lg leading-none flex items-center justify-center shrink-0"
          aria-label="Dismiss announcement"
        >
          ×
        </button>
      </div>
    </div>
  )
}
