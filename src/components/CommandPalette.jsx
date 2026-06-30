import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { isMuted, setMuted } from '../lib/sound'

// Mounts once for authed users. Handles: Cmd/Ctrl+K palette, g-chords, "/", "?".
export default function CommandPalette() {
  const navigate = useNavigate()
  const { logout, isStaff } = useAuth()
  const { toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)

  const commands = useMemo(() => {
    const base = [
      { id: 'nav-leaderboard', label: 'Go to Leaderboard', icon: '🏆', run: () => navigate('/') },
      { id: 'nav-profile', label: 'Go to Profile', icon: '👤', run: () => navigate('/profile') },
      { id: 'nav-compare', label: 'Compare Players', icon: '⚖️', run: () => navigate('/compare') },
      { id: 'nav-hall', label: 'Hall of Fame', icon: '🏛️', run: () => navigate('/hall-of-fame') },
      { id: 'nav-settings', label: 'Go to Settings', icon: '⚙️', run: () => navigate('/settings') },
      { id: 'theme', label: 'Toggle theme', icon: '🎨', run: () => toggle() },
      { id: 'mute', label: isMuted() ? 'Unmute sounds' : 'Mute sounds', icon: '🔊', run: () => setMuted(!isMuted()) },
      { id: 'logout', label: 'Sign out', icon: '🚪', run: () => { logout(); navigate('/login') } },
    ]
    return base
  }, [navigate, toggle, logout])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return commands
    return commands.filter(c => c.label.toLowerCase().includes(s))
  }, [q, commands])

  useEffect(() => { setIdx(0) }, [q, open])
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])

  useEffect(() => {
    let lastG = 0
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable

      // Cmd/Ctrl+K — palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        return
      }
      if (typing) return

      if (e.key === '?') { e.preventDefault(); setHelp(h => !h); return }
      if (e.key === '/') {
        const search = document.querySelector('input[data-search]')
        if (search) { e.preventDefault(); search.focus() }
        return
      }
      // g-chords
      if (e.key === 'g') { lastG = Date.now(); return }
      if (Date.now() - lastG < 600) {
        if (e.key === 'l') { navigate('/'); lastG = 0 }
        else if (e.key === 'p') { navigate('/profile'); lastG = 0 }
        else if (e.key === 's') { navigate('/settings'); lastG = 0 }
        else if (e.key === 'c') { navigate('/compare'); lastG = 0 }
        else if (e.key === 'h') { navigate('/hall-of-fame'); lastG = 0 }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const exec = (cmd) => { setOpen(false); setQ(''); cmd.run() }

  const onPaletteKey = (e) => {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && filtered[idx]) { e.preventDefault(); exec(filtered[idx]) }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center pt-28 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg mx-4 bg-slate-900/95 backdrop-blur-lg border border-white/15 rounded-2xl shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={onPaletteKey}
              placeholder="Type a command…"
              className="w-full bg-transparent text-white placeholder-slate-400 px-5 py-4 text-sm border-b border-white/10 focus:outline-none"
            />
            <div className="max-h-72 overflow-y-auto py-2">
              {filtered.length === 0 && <p className="text-slate-400 text-sm text-center py-6">No commands.</p>}
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => exec(c)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-left text-sm ${i === idx ? 'bg-indigo-600/40 text-white' : 'text-slate-200 hover:bg-white/5'}`}
                >
                  <span className="text-base">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="px-5 py-2 border-t border-white/10 text-[11px] text-slate-400 flex gap-3">
              <span>↑↓ navigate</span><span>↵ run</span><span>esc close</span>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setHelp(false)}>
          <div className="w-full max-w-md mx-4 bg-slate-900/95 backdrop-blur-lg border border-white/15 rounded-2xl shadow-2xl p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Keyboard Shortcuts</h2>
            <ul className="space-y-2 text-sm">
              {[
                ['⌘/Ctrl + K', 'Command palette'],
                ['g then l', 'Go to Leaderboard'],
                ['g then p', 'Go to Profile'],
                ['g then c', 'Compare players'],
                ['g then h', 'Hall of Fame'],
                ['g then s', 'Go to Settings'],
                ['/', 'Focus search'],
                ['?', 'This cheat sheet'],
              ].map(([k, d]) => (
                <li key={k} className="flex items-center justify-between">
                  <span className="text-slate-300">{d}</span>
                  <kbd className="bg-white/10 border border-white/15 rounded px-2 py-0.5 text-xs text-white font-mono">{k}</kbd>
                </li>
              ))}
            </ul>
            <button onClick={() => setHelp(false)} className="mt-5 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}
    </>
  )
}
