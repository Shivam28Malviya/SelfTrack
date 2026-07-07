// Pure gamification helpers — no deps, derived from user data.

// Weeks run Monday–Sunday (consistent with AuthContext + week numbering).
function startOfWeek(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// ---- XP / Levels ----
// XP = total points. Level grows on a soft curve: level N needs N*N*100 XP.
export function levelFromXp(xp) {
  let level = 1
  while (xp >= level * level * 100) level++
  const current = level
  const floor = (current - 1) * (current - 1) * 100
  const ceil = current * current * 100
  const into = xp - floor
  const span = ceil - floor
  return {
    level: current,
    xp,
    intoLevel: into,
    levelSpan: span,
    pct: Math.min(100, Math.round((into / span) * 100)),
    nextAt: ceil,
  }
}

// ---- Streak (consecutive weeks with activity, ending this or last week) ----
export function currentStreak(history) {
  if (!history || history.length === 0) return 0
  const weeks = new Set(history.map(h => startOfWeek(h.date)))
  const thisWeek = startOfWeek(Date.now())
  // streak counts back from this week; allow it to start at last week too
  let anchor = weeks.has(thisWeek) ? thisWeek : thisWeek - WEEK_MS
  if (!weeks.has(anchor)) return 0
  let streak = 0
  let cursor = anchor
  while (weeks.has(cursor)) {
    streak++
    cursor -= WEEK_MS
  }
  return streak
}

// ---- Achievements (derived) ----
// Each: id, label, icon, desc, earned(predicate over {user, rank, weeks, streak, level})
export const ACHIEVEMENTS = [
  { id: 'first_points', icon: '🌱', label: 'First Steps', desc: 'Earn your first points', test: c => c.user.score > 0 },
  { id: 'wins_5', icon: '🎖️', label: 'High Five', desc: 'Win 5 times', test: c => c.user.stats.wins >= 5 },
  { id: 'wins_10', icon: '🏅', label: 'Veteran', desc: 'Win 10 times', test: c => c.user.stats.wins >= 10 },
  { id: 'points_5k', icon: '💰', label: 'Five-K Club', desc: 'Reach 5,000 points', test: c => c.user.score >= 5000 },
  { id: 'points_10k', icon: '💎', label: 'Ten-K Titan', desc: 'Reach 10,000 points', test: c => c.user.score >= 10000 },
  { id: 'streak_3', icon: '🔥', label: 'On Fire', desc: '3-week streak', test: c => c.streak >= 3 },
  { id: 'streak_6', icon: '☄️', label: 'Unstoppable', desc: '6-week streak', test: c => c.streak >= 6 },
  { id: 'level_5', icon: '⭐', label: 'Rising Star', desc: 'Reach level 5', test: c => c.level >= 5 },
  { id: 'level_10', icon: '🌠', label: 'Elite', desc: 'Reach level 10', test: c => c.level >= 10 },
  { id: 'podium', icon: '🏆', label: 'Podium Finish', desc: 'Rank top 3', test: c => c.rank > 0 && c.rank <= 3 },
  { id: 'champion', icon: '👑', label: 'Champion', desc: 'Rank #1', test: c => c.rank === 1 },
  { id: 'weeks_4', icon: '📅', label: 'Committed', desc: 'Play 4 different weeks', test: c => c.weeks >= 4 },
]

export function earnedAchievements(ctx) {
  return ACHIEVEMENTS.filter(a => {
    try { return a.test(ctx) } catch { return false }
  })
}

// ---- Predictive ranking ----
// Avg points/week over weeks played, projected to month end.
export function projectMonthScore(history) {
  if (!history || history.length === 0) return 0
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const earned = history.filter(h => h.date >= monthStart).reduce((s, h) => s + h.points, 0)
  const daysIn = now.getDate()
  const daysTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  if (daysIn === 0) return earned
  return Math.round((earned / daysIn) * daysTotal)
}

// ---- Activity heatmap buckets (last 53 weeks x 7 days) ----
export function activityGrid(history) {
  const map = {}
  if (history) {
    for (const h of history) {
      const d = new Date(h.date)
      d.setHours(0, 0, 0, 0)
      const key = d.getTime()
      map[key] = (map[key] || 0) + h.points
    }
  }
  return map
}
