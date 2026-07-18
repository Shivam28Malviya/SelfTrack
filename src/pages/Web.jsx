import { useState, useEffect, useRef, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiCall } from '../lib/api'
import Sidebar from '../components/Sidebar'

const RECENTS_KEY = 'selftrack_web_recents'
const MAX_RECENTS = 8

function normalizeUrl(input) {
  const v = input.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  // Bare domain (has a dot, no spaces) -> https://, otherwise treat as a search.
  if (/^[^\s]+\.[^\s]+$/.test(v) && !v.includes(' ')) return `https://${v}`
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`
}

const proxySrc = (url) => `/api/web-proxy?url=${encodeURIComponent(url)}`
const hostOf = (u) => { try { return new URL(u).hostname } catch { return u } }

function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY)) || [] } catch { return [] }
}

export default function Web() {
  const { isAdmin, initializing } = useAuth()
  const [input, setInput] = useState('')
  const [address, setAddress] = useState('')   // human URL shown in the bar
  const [src, setSrc] = useState('')            // proxied iframe src
  const [loading, setLoading] = useState(false)
  const [recents, setRecents] = useState(loadRecents)
  const [frameKey, setFrameKey] = useState(0)
  const iframeRef = useRef(null)

  // Mirror the admin session into a path-scoped cookie the iframe can use.
  const ensureAuth = useCallback(() => apiCall('POST', '/web-proxy/auth'), [])
  useEffect(() => { if (isAdmin) ensureAuth() }, [isAdmin, ensureAuth])

  const pushRecent = useCallback((url) => {
    setRecents(prev => {
      const next = [url, ...prev.filter(r => r !== url)].slice(0, MAX_RECENTS)
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // The proxied page reports its address up as it navigates (link/form clicks).
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data && typeof e.data.__wpx === 'string') {
        setAddress(e.data.__wpx)
        setInput(e.data.__wpx)
        pushRecent(e.data.__wpx)
        setLoading(true)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [pushRecent])

  if (!initializing && !isAdmin) return <Navigate to="/" replace />

  const go = async (raw) => {
    const url = normalizeUrl(raw ?? input)
    if (!url) return
    await ensureAuth()               // refresh the cookie window before loading
    setInput(url)
    setAddress(url)
    setLoading(true)
    setSrc(proxySrc(url))
    setFrameKey(k => k + 1)
    pushRecent(url)
  }

  const reload = () => { if (src) { setLoading(true); setFrameKey(k => k + 1) } }
  const openNewTab = () => { if (address) window.open(address, '_blank', 'noopener,noreferrer') }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden bg-[#0b0d10]">
        {/* Toolbar */}
        <div className="shrink-0 px-4 sm:px-6 pt-20 lg:pt-5 pb-4 border-b border-white/10 bg-[#0b0d10]">
          <div className="flex items-center gap-2 mb-1">
            <span className="eyebrow text-[#a97e5d]">/Admin · Web</span>
          </div>
          <form onSubmit={e => { e.preventDefault(); go() }} className="relative flex items-center gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button" onClick={reload} disabled={!src} title="Reload"
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors active:scale-90"
              >
                <span className={loading ? 'animate-spin inline-block' : ''}>{loading ? '◌' : '↻'}</span>
              </button>
              <button
                type="button" onClick={openNewTab} disabled={!address} title="Open in a real browser tab"
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors active:scale-90"
              >
                ↗
              </button>
            </div>

            <div className="relative flex-1 group">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#a97e5d]/40 via-[#d8ab6a]/30 to-[#a97e5d]/40 opacity-0 group-focus-within:opacity-100 blur-md transition-opacity pointer-events-none" />
              <div className="relative flex items-center bg-white/[0.06] border border-white/10 group-focus-within:border-[#d8ab6a]/60 rounded-full px-4 py-2 transition-colors">
                <span className="text-white/30 text-xs mr-2 shrink-0">{address.startsWith('https') ? '🔒' : '🌐'}</span>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Search or enter address"
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/30 font-mono"
                />
                {loading && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-[#d8ab6a] rounded-full animate-spin shrink-0" />}
              </div>
            </div>

            <button
              type="submit"
              className="shrink-0 bg-[#a97e5d] hover:bg-[#93683f] text-white text-sm font-semibold px-4 py-2 rounded-full active:scale-95 transition-colors"
            >
              Go
            </button>
          </form>

          {recents.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3 overflow-x-auto no-scrollbar">
              {recents.map(r => (
                <button
                  key={r} onClick={() => go(r)} title={r}
                  className="shrink-0 text-[11px] font-mono text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 transition-colors"
                >
                  {hostOf(r)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Viewport */}
        <div className="relative flex-1 bg-[#0b0d10]">
          {!src ? (
            <div className="h-full flex flex-col items-center justify-center text-white/30 gap-3 animate-fade-in px-6 text-center">
              <div className="text-5xl">🌐</div>
              <p className="text-sm">Enter a URL above to start browsing.</p>
              <p className="text-xs text-white/20 max-w-sm">
                Pages load through a proxy so they render right here. Some interactive or
                login-gated sites may still work best via ↗ in a real tab.
              </p>
            </div>
          ) : (
            <>
              {loading && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5 overflow-hidden z-10">
                  <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#d8ab6a] to-transparent animate-[loadingBar_1.1s_ease-in-out_infinite]" />
                </div>
              )}
              <iframe
                key={frameKey}
                ref={iframeRef}
                src={src}
                onLoad={() => setLoading(false)}
                title="Embedded web browser"
                className="w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
              />
            </>
          )}
        </div>
      </main>
    </div>
  )
}
