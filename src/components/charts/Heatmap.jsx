// GitHub-style activity heatmap — last `weeks` weeks. No deps.
import { activityGrid } from '../../lib/gamification'

const DAY_MS = 24 * 60 * 60 * 1000

export default function Heatmap({ history, weeks = 26 }) {
  const grid = activityGrid(history)
  const values = Object.values(grid)
  const max = values.length ? Math.max(...values) : 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // align end to upcoming Saturday so columns are full weeks
  const end = today.getTime()
  const start = end - (weeks * 7 - 1) * DAY_MS

  const cols = []
  let cursor = start
  // shift start back to Sunday
  const startDay = new Date(start).getDay()
  cursor = start - startDay * DAY_MS
  while (cursor <= end) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const ts = cursor + d * DAY_MS
      const v = grid[ts] || 0
      week.push({ ts, v, future: ts > end })
    }
    cols.push(week)
    cursor += 7 * DAY_MS
  }

  const shade = (v) => {
    if (v <= 0) return 'rgba(255,255,255,0.07)'
    const t = max ? v / max : 0
    if (t > 0.75) return '#4f46e5'
    if (t > 0.5) return '#6366f1'
    if (t > 0.25) return '#818cf8'
    return '#a5b4fc'
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {cols.map((week, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            {week.map((cell, di) => (
              <div
                key={di}
                className="w-3 h-3 rounded-sm"
                style={{ background: cell.future ? 'transparent' : shade(cell.v) }}
                title={cell.future ? '' : `${new Date(cell.ts).toLocaleDateString()}: ${cell.v} pts`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-400">
        <span>Less</span>
        {['rgba(255,255,255,0.07)', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5'].map((c, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
