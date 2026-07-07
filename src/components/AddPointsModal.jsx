import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { fireConfetti } from '../lib/confetti'
import { playPoints, playLevelUp } from '../lib/sound'
import { levelFromXp } from '../lib/gamification'

const QUICK_AMOUNTS = [10, 25, 50, 100]

export default function AddPointsModal({ onClose, targetUserId }) {
  const { users, addPoints, meta } = useAuth()
  const { toast } = useToast()
  const nonAdminUsers = users.filter(u => u.role !== 'admin' && u.role !== 'spectator' && u.status === 'approved')
  const categories = meta.categories || ['General']

  const [selectedUserId, setSelectedUserId] = useState(targetUserId || '')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[0] || 'General')
  const [error, setError] = useState('')

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const target = users.find(u => u.id === selectedUserId)

  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const pts = parseInt(amount, 10)
    if (!selectedUserId) return setError('Select a user.')
    if (!target || target.role === 'admin' || target.role === 'spectator' || target.status !== 'approved') return setError('Invalid recipient.')
    if (!Number.isFinite(pts) || pts <= 0) return setError('Enter a positive number.')
    if (pts > 10000) return setError('Maximum 10,000 points per add.')
    const before = levelFromXp(target.score).level
    const after = levelFromXp(target.score + pts).level
    setSubmitting(true)
    const result = await addPoints(selectedUserId, pts, category)
    setSubmitting(false)
    if (!result.success) return setError(result.error || 'Failed to award points.')
    if (after > before) {
      playLevelUp()
      fireConfetti({ particleCount: 200, duration: 2200 })
      toast(`${target.username} reached level ${after}! 🎉`, 'success', 4000)
    } else {
      playPoints()
      fireConfetti()
      toast(`+${pts} points awarded to ${target.username}`, 'success')
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span className="text-2xl animate-float">🎯</span>
            Add Points
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 w-8 h-8 rounded-full text-xl leading-none flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!targetUserId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">User</label>
              <select
                value={selectedUserId}
                onChange={e => { setSelectedUserId(e.target.value); setError('') }}
                className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="" className="bg-white text-slate-900">Select user…</option>
                {nonAdminUsers.map(u => (
                  <option key={u.id} value={u.id} className="bg-white text-slate-900">
                    {u.emoji} {u.username} — {u.score.toLocaleString()} pts
                  </option>
                ))}
              </select>
            </div>
          )}

          {target && (
            <div className="flex items-center gap-3 bg-indigo-50 rounded-xl px-3 py-2 animate-slide-down">
              <span className="text-2xl">{target.emoji}</span>
              <div className="text-sm">
                <p className="font-semibold text-slate-800">{target.username}</p>
                <p className="text-slate-500 text-xs">Current: {target.score.toLocaleString()} pts</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Points to add</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {QUICK_AMOUNTS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setAmount(String(q)); setError('') }}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium border active:scale-95 ${
                    amount === String(q)
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'border-neutral-300 text-neutral-600 hover:border-[#a97e5d] hover:bg-[#f3ece3]'
                  }`}
                >
                  +{q}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              max="10000"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError('') }}
              placeholder="Custom amount…"
              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {categories.map(c => <option key={c} value={c} className="bg-white text-slate-900">{c}</option>)}
            </select>
          </div>

          {error && <p className="text-red-500 text-xs animate-slide-down">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:opacity-60 text-white font-semibold py-3 rounded-full text-sm active:scale-[0.98]"
          >
            {submitting ? 'Awarding…' : 'Add Points  ↗'}
          </button>
        </form>
      </div>
    </div>
  )
}
