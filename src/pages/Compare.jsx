import { useState } from 'react'
import { useAuth, weeksPlayedCount, pointsInPeriod } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import RightPanel from '../components/RightPanel'
import Avatar from '../components/Avatar'
import { levelFromXp, currentStreak } from '../lib/gamification'

function StatRow({ label, a, b, better }) {
  const aWin = better === 'a'
  const bWin = better === 'b'
  return (
    <div className="grid grid-cols-3 items-center py-2.5 border-b last:border-b-0 border-neutral-100 text-sm">
      <span className={`text-right font-bold ${aWin ? 'text-[#8a6446]' : 'text-neutral-900'}`}>{a}</span>
      <span className="text-center text-neutral-400 text-xs uppercase tracking-wide">{label}</span>
      <span className={`text-left font-bold ${bWin ? 'text-[#8a6446]' : 'text-neutral-900'}`}>{b}</span>
    </div>
  )
}

export default function Compare() {
  const { approvedUsers } = useAuth()
  const [aId, setAId] = useState(approvedUsers[0]?.id || '')
  const [bId, setBId] = useState(approvedUsers[1]?.id || '')

  const a = approvedUsers.find(u => u.id === aId)
  const b = approvedUsers.find(u => u.id === bId)

  const cmp = (x, y) => (x > y ? 'a' : y > x ? 'b' : null)

  const select = (val, onChange, label) => (
    <select value={val} onChange={e => onChange(e.target.value)}
      aria-label={label}
      className="w-full sm:w-auto border border-neutral-300 bg-white rounded-full px-4 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/15">
      <option value="" className="bg-white text-slate-900">Select…</option>
      {approvedUsers.map(u => <option key={u.id} value={u.id} className="bg-white text-slate-900">{u.username}</option>)}
    </select>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-8 lg:pt-8 animate-slide-up">
          <span className="eyebrow">/Compare</span>
          <h1 className="display text-5xl text-neutral-900 mt-1 mb-1">HEAD TO HEAD</h1>
          <p className="text-neutral-500 mb-6">Compare two players side by side.</p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mb-6">
            {select(aId, setAId, 'Player A')}
            <span className="text-[#a97e5d] font-bold text-center">VS</span>
            {select(bId, setBId, 'Player B')}
          </div>

          {a && b ? (
            <div className="card p-6 animate-scale-in">
              <div className="grid grid-cols-3 items-center mb-4">
                <div className="text-center">
                  <Avatar user={a} className="w-16 h-16 text-5xl mx-auto block ring-2 ring-black/5" />
                  <p className="font-bold text-neutral-900 mt-2">{a.username}</p>
                </div>
                <p className="text-center text-neutral-400 text-sm">compared to</p>
                <div className="text-center">
                  <Avatar user={b} className="w-16 h-16 text-5xl mx-auto block ring-2 ring-black/5" />
                  <p className="font-bold text-neutral-900 mt-2">{b.username}</p>
                </div>
              </div>

              <StatRow label="Total Points" a={a.score.toLocaleString()} b={b.score.toLocaleString()} better={cmp(a.score, b.score)} />
              <StatRow label="Wins" a={a.stats.wins} b={b.stats.wins} better={cmp(a.stats.wins, b.stats.wins)} />
              <StatRow label="Level" a={levelFromXp(a.score).level} b={levelFromXp(b.score).level} better={cmp(levelFromXp(a.score).level, levelFromXp(b.score).level)} />
              <StatRow label="Streak (wks)" a={currentStreak(a.history)} b={currentStreak(b.history)} better={cmp(currentStreak(a.history), currentStreak(b.history))} />
              <StatRow label="Weeks Played" a={weeksPlayedCount(a.history)} b={weeksPlayedCount(b.history)} better={cmp(weeksPlayedCount(a.history), weeksPlayedCount(b.history))} />
              <StatRow label="This Month" a={pointsInPeriod(a.history, 'month').toLocaleString()} b={pointsInPeriod(b.history, 'month').toLocaleString()} better={cmp(pointsInPeriod(a.history, 'month'), pointsInPeriod(b.history, 'month'))} />
              <StatRow label="Kudos" a={a.kudos?.length || 0} b={b.kudos?.length || 0} better={cmp(a.kudos?.length || 0, b.kudos?.length || 0)} />
            </div>
          ) : (
            <p className="text-neutral-400 text-center py-10">Pick two players to compare.</p>
          )}
        </div>
      </main>
      <RightPanel />
    </div>
  )
}
