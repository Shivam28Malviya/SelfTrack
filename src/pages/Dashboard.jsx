import { useState, useMemo } from 'react'
import { useAuth, weeksPlayedCount } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import RightPanel from '../components/RightPanel'
import AddPointsModal from '../components/AddPointsModal'
import Avatar from '../components/Avatar'
import KudosBar from '../components/KudosBar'
import { levelFromXp, currentStreak, projectMonthScore } from '../lib/gamification'
import { downloadCsv } from '../lib/csv'
import { useToast } from '../components/Toast'

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }

const PODIUM_STYLES = {
  1: {
    wrapper: 'bg-gradient-to-br from-amber-300/30 to-amber-500/20 border-2 border-amber-300/50 backdrop-blur-md hover:shadow-2xl hover:shadow-amber-500/20 hover:-translate-y-1',
    badge: 'bg-amber-500 text-white',
    label: 'text-amber-100',
    score: 'text-amber-50',
  },
  2: {
    wrapper: 'bg-gradient-to-br from-slate-200/25 to-slate-400/15 border-2 border-slate-200/40 backdrop-blur-md hover:shadow-2xl hover:shadow-slate-300/20 hover:-translate-y-1',
    badge: 'bg-slate-400 text-white',
    label: 'text-slate-100',
    score: 'text-white',
  },
  3: {
    wrapper: 'bg-gradient-to-br from-orange-300/25 to-orange-500/15 border-2 border-orange-300/40 backdrop-blur-md hover:shadow-2xl hover:shadow-orange-400/20 hover:-translate-y-1',
    badge: 'bg-orange-500 text-white',
    label: 'text-orange-100',
    score: 'text-orange-50',
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
  if (!prev) return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-100 animate-fade-in">NEW</span>
  const diff = prev - cur
  if (diff > 0) return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-500/25 text-green-200 animate-fade-in">▲ {diff}</span>
  if (diff < 0) return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-500/25 text-red-200 animate-fade-in">▼ {Math.abs(diff)}</span>
  return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">—</span>
}

function PodiumCard({ user, rank, large = false, canAward, isMe, currentRanks, lastRanks, delay }) {
  const style = PODIUM_STYLES[rank]
  const [modal, setModal] = useState(false)

  if (!user) return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`rounded-2xl ${large ? 'p-6' : 'p-4'} bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center text-slate-300 text-sm animate-fade-in`}
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
        className={`rounded-2xl ${style.wrapper} ${large ? 'p-6' : 'p-4'} flex flex-col gap-3 relative animate-slide-up cursor-default ${isMe ? 'ring-2 ring-indigo-300/60' : ''}`}
      >
        {/* Rank badge */}
        <div className="flex items-center justify-between">
          <span className={`${style.badge} text-xs font-bold px-2.5 py-1 rounded-full shadow-md`}>
            {RANK_MEDALS[rank]} #{rank}
          </span>
          <div className="flex items-center gap-1.5">
            {streak > 1 && <span className="text-xs font-bold text-amber-200" title={`${streak}-week streak`}>🔥{streak}</span>}
            <RankDelta userId={user.id} currentRanks={currentRanks} lastRanks={lastRanks} />
            {canAward && (
              <button
                onClick={() => setModal(true)}
                className="text-xs bg-white/30 hover:bg-white/50 font-semibold px-2.5 py-1 rounded-full text-white active:scale-95"
              >
                + Points
              </button>
            )}
          </div>
        </div>

        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <Avatar user={user} className={`${large ? 'w-16 h-16 text-5xl' : 'w-10 h-10 text-3xl'} leading-none ring-2 ring-white/30`} />
          <div>
            <p className={`font-bold ${large ? 'text-xl' : 'text-base'} text-white leading-tight`}>
              {isMe ? 'You' : user.username}
              <span className="ml-1.5 text-xs font-bold text-indigo-200 align-middle">Lv{lvl.level}</span>
            </p>
            <p className={`${style.score} font-semibold ${large ? 'text-base' : 'text-sm'}`}>
              {user.periodScore.toLocaleString()} pts
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mt-1">
          <div className="bg-white/15 rounded-xl px-3 py-2 text-center flex-1 hover:bg-white/25">
            <p className={`text-lg font-bold ${style.score}`}>{user.stats.wins}</p>
            <p className={`text-xs ${style.label} font-medium`}>Wins</p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2 text-center flex-1 hover:bg-white/25">
            <p className={`text-lg font-bold ${style.score}`}>{weeks}</p>
            <p className={`text-xs ${style.label} font-medium`}>Weeks Played</p>
          </div>
        </div>

        {large && <KudosBar user={user} />}
      </div>

      {modal && <AddPointsModal onClose={() => setModal(false)} targetUserId={user.id} />}
    </>
  )
}

export default function Dashboard() {
  const { currentUser, getSortedByPeriod, getWeekRankMap, isStaff, isAdmin } = useAuth()
  const { toast } = useToast()
  const [period, setPeriod] = useState('month')
  const [modal, setModal] = useState(false)
  const [inlineTargetId, setInlineTargetId] = useState(null)
  const [search, setSearch] = useState('')

  const ranked = getSortedByPeriod(period)
  const top3 = ranked.slice(0, 3)
  const rest = ranked.slice(3)
  const [first, second, third] = top3

  const currentWeekRanks = getWeekRankMap(0)
  const lastWeekRanks = getWeekRankMap(1)

  const weekChampion = getSortedByPeriod('week')[0]
  const monthChampion = getSortedByPeriod('month')[0]

  const currentUserRank = ranked.findIndex(u => u.id === currentUser?.id) + 1
  const myProjection = currentUser && !isAdmin ? projectMonthScore(currentUser.history) : 0

  const filteredRest = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rest
    return rest.filter(u => u.username.toLowerCase().includes(q))
  }, [rest, search])

  const exportCsv = () => {
    const rows = ranked.map((u, i) => [i + 1, u.username, u.periodScore, u.stats.wins, weeksPlayedCount(u.history), levelFromXp(u.score).level])
    downloadCsv(`leaderboard-${period}.csv`, rows, ['Rank', 'Username', 'Points', 'Wins', 'WeeksPlayed', 'Level'])
    toast('Leaderboard exported as CSV.', 'success')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">

          {/* Header */}
          <div className="flex items-start justify-between mb-6 animate-slide-down">
            <div>
              <h1 className="text-3xl font-extrabold text-white">Leaderboard</h1>
              <p className="text-slate-200 mt-1">
                {isAdmin
                  ? 'Admin view — manage all player scores.'
                  : currentUserRank > 0
                  ? `You're ranked #${currentUserRank} this ${period === 'all' ? 'time' : period}. Keep pushing! 🔥`
                  : 'Track your progress. Climb the ranks.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportCsv}
                className="bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold px-3 py-2.5 rounded-xl text-sm active:scale-95"
                title="Export leaderboard CSV"
              >
                ⬇ Export
              </button>
              {isStaff && (
                <button
                  onClick={() => setModal(true)}
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-violet-500/30 hover:shadow-xl active:scale-95"
                >
                  + Add Points
                </button>
              )}
            </div>
          </div>

          {/* Predictive ranking for current user */}
          {myProjection > 0 && (
            <div className="mb-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3 flex items-center gap-3 animate-slide-up">
              <span className="text-xl">🔮</span>
              <p className="text-sm text-slate-100">
                At your current pace, you're projected to finish this month around{' '}
                <span className="font-bold text-indigo-200">{myProjection.toLocaleString()} pts</span>.
              </p>
            </div>
          )}

          {/* Champion banners */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {weekChampion && (
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3 animate-slide-up hover:bg-white/15" style={{ animationDelay: '80ms' }}>
                <span className="text-2xl animate-float">🏆</span>
                <div>
                  <p className="text-xs font-bold text-indigo-200 uppercase tracking-wide">Week Champion</p>
                  <p className="text-sm font-semibold text-white">
                    {weekChampion.emoji} {weekChampion.id === currentUser?.id ? 'You' : weekChampion.username}
                  </p>
                </div>
              </div>
            )}
            {monthChampion && (
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3 animate-slide-up hover:bg-white/15" style={{ animationDelay: '160ms' }}>
                <span className="text-2xl animate-float" style={{ animationDelay: '500ms' }}>👑</span>
                <div>
                  <p className="text-xs font-bold text-violet-200 uppercase tracking-wide">Month Champion</p>
                  <p className="text-sm font-semibold text-white">
                    {monthChampion.emoji} {monthChampion.id === currentUser?.id ? 'You' : monthChampion.username}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Period tabs */}
          <div className="flex gap-2 mb-6 animate-slide-up" style={{ animationDelay: '240ms' }}>
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium active:scale-95 ${
                  period === p.id
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/30'
                    : 'bg-white/10 backdrop-blur-md border border-white/20 text-slate-100 hover:border-indigo-300 hover:bg-white/20'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>


          {/* === PODIUM SECTION === */}
          <section className="mb-8">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
              Top Performers
            </h2>

            <div className="grid grid-cols-2 gap-4">
              {/* 1st place — large card */}
              <PodiumCard
                user={first} rank={1} large canAward={isStaff}
                isMe={first?.id === currentUser?.id}
                currentRanks={currentWeekRanks} lastRanks={lastWeekRanks}
                delay={300}
              />

              {/* 2nd and 3rd stacked horizontally on the right */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <PodiumCard
                    user={second} rank={2} canAward={isStaff}
                    isMe={second?.id === currentUser?.id}
                    currentRanks={currentWeekRanks} lastRanks={lastWeekRanks}
                    delay={400}
                  />
                </div>
                <div className="flex-1">
                  <PodiumCard
                    user={third} rank={3} canAward={isStaff}
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
              <div className="flex items-center justify-between mb-3 gap-3">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Rankings
                </h2>
                <div className="relative w-56">
                  <input
                    type="text"
                    data-search
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search players…  ( / )"
                    className="w-full text-sm bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder-slate-300 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <span className="absolute left-2.5 top-1.5 text-slate-300 text-sm">🔍</span>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 overflow-hidden shadow-lg">
                {filteredRest.length === 0 && (
                  <p className="text-center text-slate-300 text-sm py-6 animate-fade-in">No players match "{search}".</p>
                )}
                {filteredRest.map((user, idx) => {
                  const rank = ranked.findIndex(u => u.id === user.id) + 1
                  const isMe = user.id === currentUser?.id
                  const weeks = weeksPlayedCount(user.history)

                  return (
                    <div
                      key={user.id}
                      style={{ animationDelay: `${idx * 40}ms` }}
                      className={`flex items-center gap-4 px-5 py-3.5 border-b last:border-b-0 border-white/10 hover:bg-white/10 group animate-fade-in ${isMe ? 'bg-indigo-500/20' : ''}`}
                    >
                      <span className="w-8 text-center text-sm font-bold text-slate-300">
                        #{rank}
                      </span>
                      <Avatar user={user} className="w-9 h-9 text-2xl leading-none ring-1 ring-white/20" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate">
                          {isMe ? 'You' : user.username}
                        </p>
                        <p className="text-slate-300 text-xs">{user.stats.wins} wins · {weeks} weeks played</p>
                      </div>
                      <RankDelta userId={user.id} currentRanks={currentWeekRanks} lastRanks={lastWeekRanks} />
                      <span className="text-white font-bold text-sm">
                        {user.periodScore.toLocaleString()}
                        <span className="text-slate-300 font-normal text-xs ml-1">pts</span>
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
            <div className="text-center py-20 text-slate-300 animate-fade-in">
              <div className="text-5xl mb-3 animate-float inline-block">📭</div>
              <p className="font-medium">No players yet. Sign up to be first!</p>
            </div>
          )}
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
      className="opacity-0 group-hover:opacity-100 text-xs bg-indigo-500/30 hover:bg-indigo-500/50 text-indigo-50 font-semibold px-3 py-1.5 rounded-lg active:scale-95"
    >
      + Points
    </button>
  )
}
