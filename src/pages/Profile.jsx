import { useState, useMemo } from 'react'
import { useAuth, weeksPlayedCount } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Avatar from '../components/Avatar'
import LineChart from '../components/charts/LineChart'
import Heatmap from '../components/charts/Heatmap'
import { BadgeGrid } from '../components/Badges'
import { useToast } from '../components/Toast'
import { levelFromXp, currentStreak, earnedAchievements } from '../lib/gamification'
import { compressImage } from '../lib/image'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB raw cap before compression

function startOfWeekLabel(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function Profile() {
  const { currentUser, sortedUsers, requestAvatarChange, adminSetAvatar, changePassword, setBio } = useAuth()
  const { toast } = useToast()

  const rank = sortedUsers.findIndex(u => u.id === currentUser?.id) + 1
  const isAdmin = currentUser?.role === 'admin'
  const total = sortedUsers.length
  const weeks = weeksPlayedCount(currentUser?.history)

  const lvl = levelFromXp(currentUser?.score || 0)
  const streak = currentStreak(currentUser?.history)
  const earnedIds = useMemo(
    () => earnedAchievements({ user: currentUser, rank, weeks, streak, level: lvl.level }).map(a => a.id),
    [currentUser, rank, weeks, streak, lvl.level]
  )

  // points-per-week series (last 8 weeks)
  const weekly = useMemo(() => {
    const WEEK = 7 * 86400000
    const now = Date.now()
    const buckets = []
    for (let i = 7; i >= 0; i--) {
      const start = now - i * WEEK
      const d = new Date(start); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay())
      const ws = d.getTime()
      const value = (currentUser?.history || [])
        .filter(h => { const x = new Date(h.date); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x.getTime() === ws })
        .reduce((s, h) => s + h.points, 0)
      buckets.push({ label: startOfWeekLabel(ws), value })
    }
    return buckets
  }, [currentUser])

  const progressPct = total > 1 && rank > 0
    ? Math.round(((total - rank) / (total - 1)) * 100)
    : 100

  // Avatar upload — compress, then submit
  const handleAvatarFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); e.target.value = ''; return }
    if (file.size > MAX_AVATAR_BYTES) { toast('Image too large. Max 5 MB.', 'error'); e.target.value = ''; return }
    try {
      const dataUrl = await compressImage(file, { max: 256, quality: 0.82 })
      if (isAdmin) {
        adminSetAvatar(currentUser.id, dataUrl)
        toast('Profile picture updated.', 'success')
      } else {
        requestAvatarChange(currentUser.id, dataUrl)
        toast('Photo submitted for admin approval.', 'info', 3500)
      }
    } catch {
      toast('Failed to process image.', 'error')
    }
    e.target.value = ''
  }

  // Bio editor
  const [bioDraft, setBioDraft] = useState(currentUser?.bio || '')
  const saveBio = () => { setBio(currentUser.id, bioDraft.slice(0, 140)); toast('Bio saved.', 'success') }

  // Password change
  const [pwForm, setPwForm] = useState({ next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [showPw, setShowPw] = useState(false)

  const pwMatch = pwForm.next && pwForm.next === pwForm.confirm
  const pwDifferent = pwForm.next && pwForm.next !== currentUser?.password

  const submitPassword = (e) => {
    e.preventDefault()
    setPwError('')
    if (pwForm.next.length < 6) return setPwError('New password must be at least 6 characters.')
    if (pwForm.next !== pwForm.confirm) return setPwError('New passwords do not match.')
    if (pwForm.next === currentUser.password) return setPwError('New password must be different from current password.')
    changePassword(currentUser.id, pwForm.next)
    setPwForm({ next: '', confirm: '' })
    toast('Password updated successfully.', 'success')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 animate-slide-up">
          <h1 className="text-3xl font-extrabold text-white mb-6">Profile</h1>

          {/* Player card */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg overflow-hidden mb-5 animate-slide-up" style={{ animationDelay: '80ms' }}>
            <div className="bg-gradient-to-r from-indigo-600/80 to-violet-600/80 px-6 py-8 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-4 left-4 w-2 h-2 bg-white rounded-full animate-pulse-soft" />
                <div className="absolute top-12 right-10 w-1 h-1 bg-white rounded-full animate-pulse-soft" style={{ animationDelay: '1s' }} />
                <div className="absolute bottom-8 left-1/3 w-1.5 h-1.5 bg-white rounded-full animate-pulse-soft" style={{ animationDelay: '2s' }} />
              </div>
              <div className="relative inline-block">
                <Avatar user={currentUser} className="w-24 h-24 text-7xl mb-3 mx-auto block ring-4 ring-white/30 shadow-2xl" />
                <label className="absolute bottom-2 right-0 bg-white text-slate-700 rounded-full w-8 h-8 flex items-center justify-center text-sm cursor-pointer shadow-lg hover:bg-slate-100 hover:scale-110 active:scale-95">
                  📷
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                </label>
              </div>
              <h2 className="text-2xl font-extrabold text-white relative">{currentUser?.username}</h2>
              <p className="text-indigo-100 text-sm mt-1 capitalize relative">{currentUser?.role}</p>
              {currentUser?.pendingAvatar && (
                <p className="text-amber-200 text-xs mt-2 bg-amber-900/40 inline-block px-3 py-1 rounded-full animate-pulse-soft relative">
                  ⏳ New photo pending admin approval
                </p>
              )}
            </div>

            <div className="px-6 py-5 grid grid-cols-3 gap-4 text-center">
              {[
                { value: currentUser?.score?.toLocaleString() ?? 0, label: 'Total Points' },
                { value: isAdmin ? '—' : rank > 0 ? `#${rank}` : '—', label: 'Rank' },
                { value: currentUser?.stats?.wins ?? 0, label: 'Wins' },
              ].map((s, i) => (
                <div key={s.label} className="animate-fade-in" style={{ animationDelay: `${i * 100 + 200}ms` }}>
                  <p className="text-2xl font-extrabold text-white">{s.value}</p>
                  <p className="text-slate-300 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Level / XP / streak */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg p-5 mb-5 animate-slide-up" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⭐</span>
                <div>
                  <p className="font-bold text-white">Level {lvl.level}</p>
                  <p className="text-slate-300 text-xs">{lvl.xp.toLocaleString()} XP total</p>
                </div>
              </div>
              {streak > 0 && (
                <div className="text-right">
                  <p className="font-bold text-amber-200 text-lg">🔥 {streak}</p>
                  <p className="text-slate-300 text-xs">week streak</p>
                </div>
              )}
            </div>
            <div className="w-full bg-white/15 rounded-full h-3 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-400 to-orange-400 h-3 rounded-full"
                style={{ width: `${lvl.pct}%`, transition: 'width 1s cubic-bezier(0.16,1,0.3,1)' }} />
            </div>
            <p className="text-slate-300 text-xs mt-2">{lvl.intoLevel}/{lvl.levelSpan} XP to level {lvl.level + 1}</p>
          </div>

          {/* Progress bar (non-admin only) */}
          {!isAdmin && rank > 0 && (
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg p-5 mb-5 animate-slide-up" style={{ animationDelay: '160ms' }}>
              <div className="flex justify-between text-sm font-medium mb-2">
                <span className="text-slate-100">Leaderboard position</span>
                <span className="text-indigo-200 font-bold">Top {progressPct}%</span>
              </div>
              <div className="w-full bg-white/15 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 h-3 rounded-full"
                  style={{ width: `${progressPct}%`, transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)' }}
                />
              </div>
              <p className="text-slate-300 text-xs mt-2">
                Rank #{rank} out of {total} players
              </p>
            </div>
          )}

          {/* Stats */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg p-5 mb-5 animate-slide-up" style={{ animationDelay: '240ms' }}>
            <h3 className="font-bold text-white mb-4">Stats</h3>
            <div className="space-y-3">
              {[
                { label: 'Wins', value: currentUser?.stats?.wins ?? 0, icon: '🏆' },
                { label: 'Weeks Played', value: weeks, icon: '📅' },
                { label: 'Email', value: currentUser?.email, icon: '📧' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b last:border-b-0 border-white/10 hover:bg-white/5 px-2 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-200 text-sm">
                    <span>{icon}</span>
                    <span>{label}</span>
                  </div>
                  <span className="font-semibold text-white text-sm">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bio */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg p-5 mb-5 animate-slide-up" style={{ animationDelay: '260ms' }}>
            <h3 className="font-bold text-white mb-3">Bio</h3>
            <textarea
              value={bioDraft}
              onChange={e => setBioDraft(e.target.value)}
              rows={2}
              maxLength={140}
              placeholder="Add a short tagline…"
              className="w-full border border-white/20 bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-400">{bioDraft.length}/140</span>
              <button onClick={saveBio} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-1.5 rounded-lg text-sm active:scale-95">
                Save Bio
              </button>
            </div>
          </div>

          {/* Achievements */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg p-5 mb-5 animate-slide-up" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Achievements</h3>
              <span className="text-xs text-slate-300">{earnedIds.length} unlocked</span>
            </div>
            <BadgeGrid earnedIds={earnedIds} />
          </div>

          {/* Points per week */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg p-5 mb-5 animate-slide-up" style={{ animationDelay: '340ms' }}>
            <h3 className="font-bold text-white mb-3">Points — last 8 weeks</h3>
            <LineChart data={weekly} />
          </div>

          {/* Activity heatmap */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg p-5 mb-5 animate-slide-up" style={{ animationDelay: '380ms' }}>
            <h3 className="font-bold text-white mb-3">Activity</h3>
            <Heatmap history={currentUser?.history} weeks={26} />
          </div>

          {/* Change password */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg p-5 animate-slide-up" style={{ animationDelay: '420ms' }}>
            <h3 className="font-bold text-white mb-4">Password</h3>
            <div className="flex items-center justify-between mb-4 bg-white/10 rounded-lg px-3 py-2">
              <span className="text-slate-200 text-sm font-mono">
                {showPw ? currentUser?.password : '•'.repeat(currentUser?.password?.length || 8)}
              </span>
              <button onClick={() => setShowPw(s => !s)} className="text-xs text-indigo-200 hover:text-indigo-100 hover:underline">
                {showPw ? 'Hide' : 'View'}
              </button>
            </div>

            <form onSubmit={submitPassword} className="space-y-3">
              <input
                type="password"
                placeholder="New password (min 6 chars)"
                value={pwForm.next}
                onChange={e => { setPwForm(p => ({ ...p, next: e.target.value })); setPwError('') }}
                className="w-full border border-white/20 bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={pwForm.confirm}
                onChange={e => { setPwForm(p => ({ ...p, confirm: e.target.value })); setPwError('') }}
                className={`w-full border bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  pwForm.confirm && !pwMatch ? 'border-red-400/60' : 'border-white/20'
                }`}
              />
              {pwForm.next && !pwDifferent && (
                <p className="text-amber-300 text-xs animate-fade-in">New password must differ from current.</p>
              )}
              {pwForm.confirm && !pwMatch && (
                <p className="text-red-300 text-xs animate-fade-in">Passwords do not match.</p>
              )}
              {pwError && <p className="text-red-300 text-xs animate-slide-down">{pwError}</p>}
              <button
                type="submit"
                disabled={!pwMatch || !pwDifferent || pwForm.next.length < 6}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm shadow-lg shadow-indigo-500/30 active:scale-[0.98]"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
