import { useState, useMemo } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
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
  const { id: viewId } = useParams()
  const { currentUser, users, sortedUsers, canSeeSpectators, requestAvatarChange, adminSetAvatar, changePassword, setBio } = useAuth()
  const { toast } = useToast()

  const targetUser = viewId ? users.find(u => u.id === viewId) : currentUser
  const isSelf = targetUser?.id === currentUser?.id

  // Acted on after all hooks (keeps hook order stable). Admin profiles are
  // private; spectator profiles are hidden from regular users.
  const blocked = !!viewId && (
    !targetUser ||
    (targetUser.role === 'admin' && !isSelf) ||
    (targetUser.role === 'spectator' && !isSelf && !canSeeSpectators)
  )

  // Competition ranking — equal scores share a rank (1, 1, 3, ...).
  const rank = sortedUsers.some(u => u.id === targetUser?.id)
    ? 1 + sortedUsers.filter(u => u.score > targetUser.score).length
    : 0
  const isAdminProfile = targetUser?.role === 'admin'
  const total = sortedUsers.length
  const weeks = weeksPlayedCount(targetUser?.history)

  const lvl = levelFromXp(targetUser?.score || 0)
  const streak = currentStreak(targetUser?.history)
  const earnedIds = useMemo(
    () => targetUser ? earnedAchievements({ user: targetUser, rank, weeks, streak, level: lvl.level }).map(a => a.id) : [],
    [targetUser, rank, weeks, streak, lvl.level]
  )

  const weekly = useMemo(() => {
    const WEEK = 7 * 86400000
    const now = Date.now()
    const buckets = []
    const monday = (t) => { const x = new Date(t); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime() }
    for (let i = 7; i >= 0; i--) {
      const ws = monday(now - i * WEEK)
      const value = (targetUser?.history || [])
        .filter(h => monday(h.date) === ws)
        .reduce((s, h) => s + h.points, 0)
      buckets.push({ label: startOfWeekLabel(ws), value })
    }
    return buckets
  }, [targetUser])

  const progressPct = total > 1 && rank > 0
    ? Math.round(((total - rank) / (total - 1)) * 100)
    : 100

  const handleAvatarFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); e.target.value = ''; return }
    if (file.size > MAX_AVATAR_BYTES) { toast('Image too large. Max 5 MB.', 'error'); e.target.value = ''; return }
    try {
      const dataUrl = await compressImage(file, { max: 256, quality: 0.82 })
      if (isAdminProfile) {
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

  const [bioDraft, setBioDraft] = useState(currentUser?.bio || '')
  const saveBio = () => { setBio(currentUser.id, bioDraft.slice(0, 140)); toast('Bio saved.', 'success') }

  const [pwForm, setPwForm] = useState({ next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const pwMatch = pwForm.next && pwForm.next === pwForm.confirm

  const submitPassword = async (e) => {
    e.preventDefault()
    setPwError('')
    if (pwForm.next.length < 6) return setPwError('New password must be at least 6 characters.')
    if (pwForm.next !== pwForm.confirm) return setPwError('New passwords do not match.')
    setPwSaving(true)
    const result = await changePassword(currentUser.id, pwForm.next)
    setPwSaving(false)
    if (!result.success) return setPwError(result.error)
    setPwForm({ next: '', confirm: '' })
    toast('Password updated successfully.', 'success')
  }

  if (blocked) return <Navigate to="/" replace />

  const card = 'card p-5 mb-5 animate-slide-up'

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-20 pb-8 lg:pt-10 animate-slide-up">
          <div className="flex items-end justify-between mb-6">
            <div>
              <span className="eyebrow">/{isSelf ? 'Your profile' : 'Player'}</span>
              <h1 className="display text-5xl text-neutral-900 mt-1">
                {isSelf ? 'PROFILE' : (targetUser?.username || '').toUpperCase()}
              </h1>
            </div>
            {!isSelf && <Link to="/" className="btn-ghost">← Back</Link>}
          </div>

          {/* Player card — charcoal hero */}
          <div className="card-dark overflow-hidden mb-5 animate-slide-up" style={{ animationDelay: '80ms' }}>
            <div className="px-6 py-8 text-center relative overflow-hidden">
              <div className="relative inline-block">
                <Avatar user={targetUser} className="w-24 h-24 text-7xl mb-3 mx-auto block ring-4 ring-white/15 shadow-2xl" />
                {isSelf && (
                  <label className="absolute bottom-2 right-0 bg-white text-neutral-700 rounded-full w-8 h-8 flex items-center justify-center text-sm cursor-pointer shadow-lg hover:bg-neutral-100 hover:scale-110 active:scale-95">
                    📷
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                  </label>
                )}
              </div>
              <h2 className="text-2xl font-extrabold text-white relative">{targetUser?.username}</h2>
              <p className="text-[#cbb39c] text-sm mt-1 capitalize relative">{targetUser?.role}</p>
              {targetUser?.bio && (
                <p className="text-neutral-300 text-sm mt-2 italic relative max-w-sm mx-auto">&ldquo;{targetUser.bio}&rdquo;</p>
              )}
              {isSelf && currentUser?.pendingAvatar && (
                <p className="text-amber-200 text-xs mt-2 bg-amber-900/40 inline-block px-3 py-1 rounded-full animate-pulse-soft relative">
                  ⏳ New photo pending admin approval
                </p>
              )}
            </div>

            <div className="px-6 py-5 grid grid-cols-3 gap-4 text-center border-t border-white/10">
              {[
                { value: targetUser?.score?.toLocaleString() ?? 0, label: 'Total Points' },
                { value: isAdminProfile ? '—' : rank > 0 ? `#${rank}` : '—', label: 'Rank' },
                { value: targetUser?.stats?.wins ?? 0, label: 'Wins' },
              ].map((s, i) => (
                <div key={s.label} className="animate-fade-in" style={{ animationDelay: `${i * 100 + 200}ms` }}>
                  <p className="text-2xl font-extrabold text-[#cbb39c]">{s.value}</p>
                  <p className="text-neutral-400 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Level / XP / streak */}
          <div className={card} style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⭐</span>
                <div>
                  <p className="font-bold text-neutral-900">Level {lvl.level}</p>
                  <p className="text-neutral-500 text-xs">{lvl.xp.toLocaleString()} XP total</p>
                </div>
              </div>
              {streak > 0 && (
                <div className="text-right">
                  <p className="font-bold text-[#a97e5d] text-lg">🔥 {streak}</p>
                  <p className="text-neutral-500 text-xs">week streak</p>
                </div>
              )}
            </div>
            <div className="w-full bg-neutral-100 rounded-full h-3 overflow-hidden">
              <div className="bg-[#a97e5d] h-3 rounded-full"
                style={{ width: `${lvl.pct}%`, transition: 'width 1s cubic-bezier(0.16,1,0.3,1)' }} />
            </div>
            <p className="text-neutral-500 text-xs mt-2">{lvl.intoLevel}/{lvl.levelSpan} XP to level {lvl.level + 1}</p>
          </div>

          {/* Progress bar */}
          {!isAdminProfile && rank > 0 && (
            <div className={card} style={{ animationDelay: '160ms' }}>
              <div className="flex justify-between text-sm font-medium mb-2">
                <span className="text-neutral-700">Leaderboard position</span>
                <span className="text-[#8a6446] font-bold">Top {progressPct}%</span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-neutral-900 h-3 rounded-full"
                  style={{ width: `${progressPct}%`, transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)' }}
                />
              </div>
              <p className="text-neutral-500 text-xs mt-2">Rank #{rank} out of {total} players</p>
            </div>
          )}

          {/* Stats */}
          <div className={card} style={{ animationDelay: '240ms' }}>
            <h3 className="eyebrow mb-4">Stats</h3>
            <div className="space-y-1">
              {[
                { label: 'Wins', value: targetUser?.stats?.wins ?? 0, icon: '🏆' },
                { label: 'Weeks Played', value: weeks, icon: '📅' },
                ...(isSelf ? [{ label: 'Email', value: targetUser?.email, icon: '📧' }] : []),
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b last:border-b-0 border-neutral-100 px-2 rounded-lg">
                  <div className="flex items-center gap-2 text-neutral-500 text-sm">
                    <span>{icon}</span>
                    <span>{label}</span>
                  </div>
                  <span className="font-semibold text-neutral-900 text-sm">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bio editor — self only */}
          {isSelf && (
            <div className={card} style={{ animationDelay: '260ms' }}>
              <h3 className="eyebrow mb-3">Bio</h3>
              <textarea
                value={bioDraft}
                onChange={e => setBioDraft(e.target.value)}
                rows={2}
                maxLength={140}
                placeholder="Add a short tagline…"
                className="field resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-neutral-400">{bioDraft.length}/140</span>
                <button onClick={saveBio} className="btn-dark">
                  {currentUser?.bio ? 'Update Bio' : 'Save Bio'}
                </button>
              </div>
            </div>
          )}

          {/* Achievements */}
          <div className={card} style={{ animationDelay: '300ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="eyebrow">Achievements</h3>
              <span className="text-xs text-neutral-400">{earnedIds.length} unlocked</span>
            </div>
            <BadgeGrid earnedIds={earnedIds} />
          </div>

          {/* Points per week */}
          <div className={card} style={{ animationDelay: '340ms' }}>
            <h3 className="eyebrow mb-3">Points — last 8 weeks</h3>
            <LineChart data={weekly} />
          </div>

          {/* Activity heatmap */}
          <div className={card} style={{ animationDelay: '380ms' }}>
            <h3 className="eyebrow mb-3">Activity</h3>
            <Heatmap history={targetUser?.history} weeks={26} />
          </div>

          {/* Change password — self only */}
          {isSelf && (
            <div className="card p-5 animate-slide-up" style={{ animationDelay: '420ms' }}>
              <h3 className="eyebrow mb-4">Password</h3>

              <form onSubmit={submitPassword} className="space-y-3">
                <input
                  type="password"
                  placeholder="New password (min 6 chars)"
                  value={pwForm.next}
                  onChange={e => { setPwForm(p => ({ ...p, next: e.target.value })); setPwError('') }}
                  className="field"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={pwForm.confirm}
                  onChange={e => { setPwForm(p => ({ ...p, confirm: e.target.value })); setPwError('') }}
                  className={`field ${pwForm.confirm && !pwMatch ? '!border-red-400' : ''}`}
                />
                {pwForm.confirm && !pwMatch && (
                  <p className="text-red-500 text-xs animate-fade-in">Passwords do not match.</p>
                )}
                {pwError && <p className="text-red-500 text-xs animate-slide-down">{pwError}</p>}
                <button
                  type="submit"
                  disabled={!pwMatch || pwForm.next.length < 6 || pwSaving}
                  className="w-full bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 rounded-full text-sm active:scale-[0.98]"
                >
                  {pwSaving ? 'Saving…' : 'Update Password'}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
