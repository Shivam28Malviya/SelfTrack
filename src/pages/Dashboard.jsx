import { useState, useMemo } from 'react'
import { useAuth, weeksPlayedCount } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import RightPanel from '../components/RightPanel'
import AddPointsModal from '../components/AddPointsModal'
import Avatar from '../components/Avatar'
import KudosBar from '../components/KudosBar'
import PlayerLink from '../components/PlayerLink'
import { levelFromXp, currentStreak, projectMonthScore } from '../lib/gamification'
import { downloadCsv } from '../lib/csv'
import { useToast } from '../components/Toast'

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }

// Monday of the week containing 2026-07-01 — this week is Week 1, weeks run Mon–Sun.
const WEEK_ANCHOR = new Date(2026, 5, 29)
function weekNumberSinceAnchor(d = new Date()) {
  const anchor = new Date(WEEK_ANCHOR)
  anchor.setHours(0, 0, 0, 0)
  const today = new Date(d)
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today - anchor) / 86400000)
  return Math.floor(diffDays / 7) + 1
}
const currentMonthName = () => new Date().toLocaleString('default', { month: 'long' })

// The monthly champion is only revealed once we've entered the final Mon–Sun
// week of the month (the week that contains the month's last day).
function isLastWeekOfMonth(d = new Date()) {
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const mondayOfLastWeek = new Date(lastDay)
  const dow = (lastDay.getDay() + 6) % 7 // 0 = Monday
  mondayOfLastWeek.setDate(lastDay.getDate() - dow)
  mondayOfLastWeek.setHours(0, 0, 0, 0)
  const today = new Date(d); today.setHours(0, 0, 0, 0)
  return today >= mondayOfLastWeek
}

const PODIUM_STYLES = {
  1: {
    wrapper: 'bg-[#f3ece3] border border-[#e0cdb6]',
    badge: 'bg-[#a97e5d] text-white', accent: 'text-[#8a6446]',
    glow: 'radial-gradient(circle at 100% 0%, rgba(216,171,106,0.45), transparent 55%)',
    watermark: '🥇',
  },
  2: {
    wrapper: 'bg-white border border-neutral-200',
    badge: 'bg-neutral-800 text-white', accent: 'text-neutral-600',
    glow: 'radial-gradient(circle at 100% 0%, rgba(150,155,165,0.35), transparent 55%)',
    watermark: '🥈',
  },
  3: {
    wrapper: 'bg-white border border-neutral-200',
    badge: 'bg-neutral-500 text-white', accent: 'text-neutral-600',
    glow: 'radial-gradient(circle at 100% 0%, rgba(200,140,90,0.32), transparent 55%)',
    watermark: '🥉',
  },
}

const PERIODS = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
]

function RankDelta({ userId, currentRanks, lastRanks }) {
  const cur = currentRanks[userId]
  const prev = lastRanks[userId]
  if (!cur) return null
  if (!prev) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#a97e5d]/15 text-[#8a6446]">NEW</span>
  const diff = prev - cur
  if (diff > 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700">▲ {diff}</span>
  if (diff < 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600">▼ {Math.abs(diff)}</span>
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-400">—</span>
}

function PodiumCard({ user, rank, large = false, canAward, isMe, currentRanks, lastRanks, delay }) {
  const style = PODIUM_STYLES[rank]
  const [modal, setModal] = useState(false)

  if (!user) return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`rounded-[24px] ${large ? 'p-6' : 'p-4'} bg-neutral-100 border-2 border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 text-sm animate-fade-in`}
    >
      Empty
    </div>
  )

  const weeks = weeksPlayedCount(user.history)
  const lvl = levelFromXp(user.score)
  const streak = currentStreak(user.history)

  return (
    <>
      <div
        style={{ animationDelay: `${delay}ms` }}
        className={`rounded-[24px] ${style.wrapper} ${large ? 'p-6' : 'p-4'} flex flex-col gap-3 relative overflow-hidden animate-slide-up shadow-[0_10px_40px_-28px_rgba(27,26,23,0.5)] hover:-translate-y-1 transition-transform ${isMe ? 'ring-2 ring-[#a97e5d]/50' : ''}`}
      >
        {/* rank-based decorative background */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: style.glow }} />
        <span
          className={`absolute -bottom-3 -right-1 pointer-events-none select-none opacity-[0.08] ${large ? 'text-[9rem]' : 'text-[6rem]'} leading-none`}
          aria-hidden="true"
        >
          {style.watermark}
        </span>

        <div className="relative flex items-center justify-between">
          <span className={`${style.badge} text-xs font-bold px-2.5 py-1 rounded-full`}>
            {RANK_MEDALS[rank]} #{rank}
          </span>
          <div className="flex items-center gap-1.5">
            {streak > 1 && <span className="text-xs font-bold text-[#a97e5d]" title={`${streak}-week streak`}>🔥{streak}</span>}
            <RankDelta userId={user.id} currentRanks={currentRanks} lastRanks={lastRanks} />
            {canAward && (
              <button
                onClick={() => setModal(true)}
                className="text-xs bg-neutral-900 hover:bg-neutral-800 font-semibold px-2.5 py-1 rounded-full text-white active:scale-95"
              >
                + Points
              </button>
            )}
          </div>
        </div>

        <div className="relative flex items-center gap-3">
          <Avatar user={user} className={`${large ? 'w-16 h-16 text-5xl' : 'w-10 h-10 text-3xl'} leading-none ring-2 ring-black/5`} />
          <div>
            <p className={`font-bold ${large ? 'text-xl' : 'text-base'} text-neutral-900 leading-tight`}>
              <PlayerLink user={user} self={isMe} className="text-neutral-900" />
              <span className="ml-1.5 text-xs font-bold text-[#a97e5d] align-middle">Lv{lvl.level}</span>
            </p>
            <p className={`${style.accent} font-bold ${large ? 'text-base' : 'text-sm'}`}>
              {user.periodScore.toLocaleString()} pts
            </p>
          </div>
        </div>

        <div className="relative flex gap-3 mt-1">
          <div className="bg-white/70 border border-white/60 rounded-2xl px-3 py-2 text-center flex-1 backdrop-blur-sm">
            <p className="text-lg font-bold text-neutral-900">{user.stats.wins}</p>
            <p className="text-xs text-neutral-500 font-medium">Wins</p>
          </div>
          <div className="bg-white/70 border border-white/60 rounded-2xl px-3 py-2 text-center flex-1 backdrop-blur-sm">
            <p className="text-lg font-bold text-neutral-900">{weeks}</p>
            <p className="text-xs text-neutral-500 font-medium">Weeks Played</p>
          </div>
        </div>

        {large && <div className="relative"><KudosBar user={user} /></div>}
      </div>

      {modal && <AddPointsModal onClose={() => setModal(false)} targetUserId={user.id} />}
    </>
  )
}

export default function Dashboard() {
  const { currentUser, users, meta, getSortedByPeriod, getWeekRankMap, isStaff, isAdmin, isSpectator } = useAuth()
  const { toast } = useToast()
  const [period, setPeriod] = useState('month')
  const [modal, setModal] = useState(false)
  const [inlineTargetId, setInlineTargetId] = useState(null)
  const [search, setSearch] = useState('')

  const ranked = getSortedByPeriod(period)
  const maxPeriodScore = ranked[0]?.periodScore || 1
  const rest = ranked.slice(3)
  const [first, second, third] = ranked.slice(0, 3)

  // Competition ranking — equal scores share a place (1, 1, 3, ...).
  const periodRanks = {}
  ranked.forEach((u, i) => {
    periodRanks[u.id] = i > 0 && ranked[i - 1].periodScore === u.periodScore
      ? periodRanks[ranked[i - 1].id]
      : i + 1
  })

  const currentWeekRanks = getWeekRankMap(0)
  const lastWeekRanks = getWeekRankMap(1)

  // Week champions are the admin-declared weekly winners for the current week
  // (matched by the number in the week label), NOT the raw top scorer.
  // A week can have several winners when players tie. If the current week
  // hasn't been declared yet, fall back to the most recent declared week.
  const curWeekNum = weekNumberSinceAnchor()
  const withWeekNum = (meta.weeklyWinners || [])
    .map(w => ({ ...w, weekNum: parseInt((String(w.week).match(/\d+/) || [])[0], 10) }))
    .filter(w => Number.isFinite(w.weekNum) && w.weekNum <= curWeekNum)
  const shownWeekNum = withWeekNum.length > 0 ? Math.max(...withWeekNum.map(w => w.weekNum)) : null
  const isCurrentWeek = shownWeekNum === curWeekNum
  const weekChampions = withWeekNum
    .filter(w => w.weekNum === shownWeekNum)
    .map(w => users.find(u => u.id === w.winnerId) || { username: w.winnerName, emoji: '🏅', id: w.winnerId })

  // Month champions — everyone tied at the top score shares the crown.
  const monthRanked = isLastWeekOfMonth() ? getSortedByPeriod('month') : []
  const monthChampions = monthRanked.length > 0
    ? monthRanked.filter(u => u.periodScore === monthRanked[0].periodScore)
    : []

  const currentUserRank = periodRanks[currentUser?.id] || 0
  const myProjection = currentUser && !isAdmin ? projectMonthScore(currentUser.history) : 0

  const filteredRest = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rest
    return rest.filter(u => u.username.toLowerCase().includes(q))
  }, [rest, search])

  const exportCsv = () => {
    const rows = ranked.map(u => [periodRanks[u.id], u.username, u.periodScore, u.stats.wins, weeksPlayedCount(u.history), levelFromXp(u.score).level])
    downloadCsv(`leaderboard-${period}.csv`, rows, ['Rank', 'Username', 'Points', 'Wins', 'WeeksPlayed', 'Level'])
    toast('Leaderboard exported as CSV.', 'success')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-8 lg:pt-10">

          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-4 mb-8 animate-slide-down">
            <div>
              <span className="eyebrow">/Leaderboard</span>
              <h1 className="display text-5xl sm:text-6xl text-neutral-900 mt-1">RANKINGS</h1>
              <p className="text-neutral-500 mt-2 max-w-md">
                {isAdmin
                  ? 'Admin view — manage all player scores.'
                  : isSpectator
                  ? 'Spectator view — you can browse but not compete.'
                  : currentUserRank > 0
                  ? `You're ranked #${currentUserRank} this ${period === 'all' ? 'time' : period}. Keep pushing.`
                  : 'Track your progress. Climb the ranks.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportCsv} className="btn-ghost" title="Export leaderboard CSV">⬇ Export</button>
              {isStaff && (
                <button onClick={() => setModal(true)} className="btn-dark">+ Add Points ↗</button>
              )}
            </div>
          </div>

          {/* Predictive ranking for current user */}
          {myProjection > 0 && (
            <div className="mb-6 card px-4 py-3 flex items-center gap-3 animate-slide-up">
              <span className="text-xl">🔮</span>
              <p className="text-sm text-neutral-600">
                At your current pace, you're projected to finish this month around{' '}
                <span className="font-bold text-[#8a6446]">{myProjection.toLocaleString()} pts</span>.
              </p>
            </div>
          )}

          {/* Champion banners */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            <div className="flex items-center gap-3 card px-4 py-3.5 animate-slide-up hover:-translate-y-0.5 transition-transform" style={{ animationDelay: '80ms' }}>
              <span className="text-2xl animate-float">🏆</span>
              <div className="min-w-0">
                <p className="eyebrow">
                  Week {isCurrentWeek ? curWeekNum : shownWeekNum} Champion{weekChampions.length > 1 ? 's' : ''}
                  {!isCurrentWeek && shownWeekNum !== null && <span className="text-neutral-400 font-medium"> (last declared)</span>}
                </p>
                {weekChampions.length > 0 ? (
                  <p className="text-base font-bold text-neutral-900 truncate mt-0.5">
                    {weekChampions.map((c, i) => (
                      <span key={c.id || i}>
                        {i > 0 && <span className="text-neutral-400 font-medium"> & </span>}
                        {c.emoji}{' '}
                        <PlayerLink user={c} self={c.id === currentUser?.id} className="text-neutral-900" />
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-neutral-400 italic mt-0.5">Winner not declared yet ⏳</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 card px-4 py-3.5 animate-slide-up hover:-translate-y-0.5 transition-transform" style={{ animationDelay: '160ms' }}>
              <span className="text-2xl animate-float" style={{ animationDelay: '500ms' }}>👑</span>
              <div className="min-w-0">
                <p className="eyebrow">{currentMonthName()}'s Champion{monthChampions.length > 1 ? 's' : ''}</p>
                {monthChampions.length > 0 ? (
                  <p className="text-base font-bold text-neutral-900 truncate mt-0.5">
                    {monthChampions.map((c, i) => (
                      <span key={c.id || i}>
                        {i > 0 && <span className="text-neutral-400 font-medium"> & </span>}
                        {c.emoji}{' '}
                        <PlayerLink user={c} self={c.id === currentUser?.id} className="text-neutral-900" />
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-neutral-400 italic mt-0.5">Announced at month end ⏳</p>
                )}
              </div>
            </div>
          </div>

          {/* Period tabs */}
          <div className="flex flex-wrap gap-2 mb-8 animate-slide-up" style={{ animationDelay: '240ms' }}>
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium active:scale-95 ${
                  period === p.id
                    ? 'bg-neutral-900 text-white'
                    : 'bg-white border border-neutral-300 text-neutral-600 hover:border-neutral-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* === PODIUM SECTION === */}
          <section className="mb-10">
            <h2 className="eyebrow mb-4">Top Performers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PodiumCard
                user={first} rank={first ? periodRanks[first.id] : 1} large canAward={isStaff}
                isMe={first?.id === currentUser?.id}
                currentRanks={currentWeekRanks} lastRanks={lastWeekRanks}
                delay={300}
              />
              <div className="flex gap-4">
                <div className="flex-1">
                  <PodiumCard
                    user={second} rank={second ? periodRanks[second.id] : 2} canAward={isStaff}
                    isMe={second?.id === currentUser?.id}
                    currentRanks={currentWeekRanks} lastRanks={lastWeekRanks}
                    delay={400}
                  />
                </div>
                <div className="flex-1">
                  <PodiumCard
                    user={third} rank={third ? periodRanks[third.id] : 3} canAward={isStaff}
                    isMe={third?.id === currentUser?.id}
                    currentRanks={currentWeekRanks} lastRanks={lastWeekRanks}
                    delay={500}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* === RANKS 4+ LIST === */}
          {rest.length > 0 && (
            <section className="animate-slide-up" style={{ animationDelay: '600ms' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
                <h2 className="eyebrow">Rankings</h2>
                <div className="relative w-full sm:w-56">
                  <input
                    type="text"
                    data-search
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search players…  ( / )"
                    className="w-full text-sm bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 rounded-full pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 focus:border-neutral-900"
                  />
                  <span className="absolute left-3 top-2 text-neutral-400 text-sm">🔍</span>
                </div>
              </div>

              <div className="card overflow-hidden">
                {filteredRest.length === 0 && (
                  <p className="text-center text-neutral-400 text-sm py-6 animate-fade-in">No players match "{search}".</p>
                )}
                {filteredRest.map((user, idx) => {
                  const rank = periodRanks[user.id]
                  const isMe = user.id === currentUser?.id
                  const weeks = weeksPlayedCount(user.history)

                  return (
                    <div
                      key={user.id}
                      style={{ animationDelay: `${idx * 40}ms` }}
                      className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-3.5 border-b last:border-b-0 border-neutral-100 hover:bg-neutral-50 group animate-fade-in ${isMe ? 'bg-[#f3ece3]' : ''}`}
                    >
                      <span className="w-6 sm:w-8 text-center text-sm font-bold text-neutral-400 shrink-0">#{rank}</span>
                      <Avatar user={user} className="w-9 h-9 text-2xl leading-none ring-1 ring-black/5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-neutral-900 text-sm truncate">
                          <PlayerLink user={user} self={isMe} className="text-neutral-900" />
                        </p>
                        <div className="mt-1 h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#a97e5d]"
                            style={{ width: `${Math.max(4, Math.round((user.periodScore / maxPeriodScore) * 100))}%` }}
                          />
                        </div>
                        <p className="hidden sm:block text-neutral-400 text-xs mt-1">{user.stats.wins} wins · {weeks} weeks played</p>
                      </div>
                      <RankDelta userId={user.id} currentRanks={currentWeekRanks} lastRanks={lastWeekRanks} />
                      <span className="text-[#8a6446] font-bold text-sm shrink-0">
                        {user.periodScore.toLocaleString()}
                        <span className="text-neutral-400 font-normal text-xs ml-1">pts</span>
                      </span>
                      {isStaff && <AddPointsInline userId={user.id} onOpen={setInlineTargetId} />}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* No users fallback */}
          {ranked.length === 0 && (
            <div className="text-center py-20 text-neutral-400 animate-fade-in">
              <div className="text-5xl mb-3 animate-float inline-block">📭</div>
              <p className="font-medium">No players yet. Sign up to be first!</p>
            </div>
          )}

          {/* Right-panel content, surfaced inline on screens without the side panel */}
          <div className="xl:hidden mt-12 pt-8 border-t border-neutral-200">
            <RightPanel inline />
          </div>
        </div>
      </main>

      <RightPanel />

      {modal && <AddPointsModal onClose={() => setModal(false)} />}
      {inlineTargetId && <AddPointsModal onClose={() => setInlineTargetId(null)} targetUserId={inlineTargetId} />}
    </div>
  )
}

function AddPointsInline({ userId, onOpen }) {
  return (
    <button
      onClick={() => onOpen(userId)}
      className="shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-xs bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-full active:scale-95"
    >
      + Points
    </button>
  )
}
