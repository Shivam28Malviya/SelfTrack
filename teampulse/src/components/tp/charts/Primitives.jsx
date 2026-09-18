import { useId, useState } from 'react'
import { DASH } from '../../../lib/tpFormat'
import { stagger, prefersReducedMotion } from '../../../lib/motion'

/**
 * Chart primitives.
 *
 * Shared rules, applied by all of them:
 *  - a bar width is always a share of an explicit maximum, so a raw count can
 *    never draw past its track
 *  - a metric with no data renders an em dash, never a zero-length bar, which
 *    would read as failure rather than absence
 *  - identity is never colour alone: series carry a legend and a direct label,
 *    and every chart has a table view behind a toggle
 *  - a tooltip on hover and on keyboard focus, since a value a reader cannot
 *    inspect is a picture and not data
 */

export function ChartFrame({ title, subtitle, legend, table, children }) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  return (
    <figure className="tp-card tp-rise m-0 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption className="flex flex-col gap-1">
          <span className="text-xl">{title}</span>
          {subtitle && <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>{subtitle}</span>}
        </figcaption>
        {table && (
          <button
            type="button"
            className="tp-btn-ghost"
            aria-expanded={showTable}
            aria-controls={tableId}
            onClick={() => setShowTable(v => !v)}
          >
            {showTable ? 'Show chart' : 'Show values'}
          </button>
        )}
      </div>

      {legend && legend.length > 1 && (
        <ul className="flex flex-wrap gap-4 m-0 p-0 list-none text-xs" style={{ color: 'var(--tp-muted)' }}>
          {legend.map(l => (
            <li key={l.label} className="flex items-center gap-2">
              <span aria-hidden="true" className="w-3.5 h-[3px] rounded-full" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}

      <div id={tableId}>
        {showTable && table ? table : children}
      </div>
    </figure>
  )
}

/** Horizontal ranked bars: the form for comparing a magnitude across people. */
export function RankedBars({ rows, max = 100, target, unit = '%', emptyLabel = 'No data in this period' }) {
  if (!rows.length) return <Empty label={emptyLabel} />
  const scale = Math.max(max, ...rows.map(r => r.value ?? 0))

  return (
    <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
      {rows.map((r, i) => {
        const width = r.value == null ? 0 : Math.max(0, Math.min(100, (r.value / scale) * 100))
        const below = target != null && r.value != null && r.value < target
        return (
          <li key={r.label} className="flex items-center gap-3 text-[13px]">
            <span className="w-24 shrink-0 truncate" title={r.label}>{r.label}</span>
            <span
              className="relative grow h-4 rounded-full"
              style={{ background: 'var(--tp-track)' }}
              tabIndex={0}
              title={`${r.label}: ${r.value == null ? 'no data' : r.value + unit}${r.basis ? ` over ${r.basis} tasks` : ''}`}
            >
              <span
                className="tp-grow-x absolute left-0 top-0 h-4 rounded-full"
                style={{
                  width: `${width}%`,
                  background: below ? 'var(--tp-bad-fg)' : 'var(--tp-cat-1)',
                  animationDelay: `${stagger(i, 55, 400)}ms`,
                }}
              />
              {target != null && (
                // A target is a reference mark, not a series, so it stays grey.
                <span
                  aria-hidden="true"
                  className="absolute top-[-3px] w-0.5 h-[22px]"
                  style={{ left: `${(target / scale) * 100}%`, background: 'var(--tp-heading)' }}
                />
              )}
            </span>
            <span className="w-14 text-right tabular-nums">
              {r.value == null ? DASH : `${r.value}${unit}`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Vertical columns for a small ordered set of buckets. */
export function Columns({ rows, emptyLabel = 'Nothing overdue' }) {
  const total = rows.reduce((a, r) => a + r.n, 0)
  if (total === 0) return <Empty label={emptyLabel} />
  const max = Math.max(...rows.map(r => r.n))

  return (
    <div className="flex items-end gap-3 h-44 pt-2">
      {rows.map((r, i) => (
        <div key={r.label} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
          <span className="text-sm tabular-nums">{r.n}</span>
          <div
            className="tp-grow-y w-full rounded-xl"
            style={{
              animationDelay: `${stagger(i, 70, 350)}ms`,
              height: `${max > 0 ? Math.max(2, (r.n / max) * 100) : 0}%`,
              // One hue, getting darker as the bucket gets worse: this is a
              // magnitude ramp, not four unrelated categories.
              background: ['var(--tp-scale-2)', 'var(--tp-scale-3)', 'var(--tp-cat-2)', 'var(--tp-bad-fg)'][i] || 'var(--tp-scale-3)',
            }}
            tabIndex={0}
            title={`${r.label}: ${r.n} task${r.n === 1 ? '' : 's'}`}
          />
          <span className="text-[11px] text-center" style={{ color: 'var(--tp-muted)' }}>{r.label}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Small multiples of one metric over months. One series each, so no legend
 * box is needed: the title names it and the last value is labelled directly.
 */
export function Sparkline({ points, color = 'var(--tp-cat-1)', unit = '', invertGood = false }) {
  const values = points.map(p => p.value).filter(v => v != null)
  if (values.length < 2) {
    return <Empty label={values.length === 1 ? 'Only one month of data so far' : 'No data yet'} />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const W = 300
  const H = 56
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const y = p.value == null ? null : H - ((p.value - min) / span) * (H - 8) - 4
    return { ...p, x, y }
  })
  const drawn = coords.filter(c => c.y != null)
  const last = drawn[drawn.length - 1]
  const first = drawn[0]
  const rising = last.value > first.value
  const goodDirection = invertGood ? !rising : rising

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} fill="none" role="img"
        aria-label={`${points.length} months, from ${first.value}${unit} to ${last.value}${unit}`}>
        <polyline
          className="tp-draw"
          points={drawn.map(c => `${c.x},${c.y}`).join(' ')}
          stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{
            // Dash the path by its own length, then animate the offset to zero:
            // the line appears to be drawn rather than to fade in.
            '--tp-draw-length': pathLength(drawn),
            strokeDasharray: pathLength(drawn),
          }}
        />
        {/* A surface ring keeps the end marker legible where it sits on the line. */}
        <circle cx={last.x} cy={last.y} r="4" fill={color} stroke="#ffffff" strokeWidth="2" />
      </svg>
      <p className="m-0 text-[11px] flex justify-between" style={{ color: 'var(--tp-muted)' }}>
        <span>{monthLabel(first.month)}</span>
        <span>
          {/* Direction is stated in words: an upward line is good for on-time
              completion and bad for defects. */}
          {goodDirection ? 'improving' : 'worsening'} · {monthLabel(last.month)}
        </span>
      </p>
    </div>
  )
}

/**
 * Estimated against actual hours.
 *
 * A single reference line at y = x does the work a second axis would be
 * tempted to do: a point above it took longer than estimated.
 */
export function EffortScatter({ points, emptyLabel = 'No completed tasks with both an estimate and an actual' }) {
  if (!points.length) return <Empty label={emptyLabel} />
  const max = Math.max(...points.flatMap(p => [p.est, p.actual])) * 1.1 || 1

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-64 ml-6 mb-5 border-l border-b" style={{ borderColor: 'var(--tp-axis)' }}>
        <svg className="absolute inset-0" width="100%" height="100%" viewBox="0 0 100 100"
          preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="100" x2="100" y2="0" stroke="var(--tp-axis)" strokeWidth="0.5" strokeDasharray="2 2" />
        </svg>
        {points.map((p, i) => (
          <span
            key={p.id}
            tabIndex={0}
            title={`${p.title} — estimated ${p.est} h, actual ${p.actual} h${p.owner ? `, ${p.owner}` : ''}`}
            className="tp-pop absolute w-3 h-3 -ml-1.5 -mb-1.5 rounded-full"
            style={{
              animationDelay: `${stagger(i, 28, 420)}ms`,
              left: `${(p.est / max) * 100}%`,
              bottom: `${(p.actual / max) * 100}%`,
              background: p.over ? 'var(--tp-cat-2)' : 'var(--tp-cat-1)',
              // A surface ring separates overlapping points.
              boxShadow: '0 0 0 2px #ffffff',
            }}
          />
        ))}
        <span className="absolute left-0 -bottom-5 text-[11px]" style={{ color: 'var(--tp-muted)' }}>Estimated hours →</span>
        <span className="absolute -left-6 top-0 text-[11px] [writing-mode:vertical-rl] rotate-180"
          style={{ color: 'var(--tp-muted)' }}>Actual hours →</span>
      </div>
      <p className="m-0 text-xs" style={{ color: 'var(--tp-muted)' }}>
        Above the dashed line took longer than estimated
        {' · '}{points.filter(p => p.over).length} of {points.length} did
      </p>
    </div>
  )
}

/** Length of the polyline, so the draw-in dash matches the path exactly.
 *  A fixed guess would make short lines snap and long ones crawl. */
function pathLength(pts) {
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return Math.ceil(total) || 1
}

export function Empty({ label }) {
  return (
    <p className="m-0 py-8 text-center text-sm" style={{ color: 'var(--tp-muted)' }}>{label}</p>
  )
}

export function SimpleTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c} scope="col" className="tp-label text-left font-normal pb-2 px-2">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className="border-t px-2 py-2" style={{ borderColor: 'var(--tp-line)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (iso) => {
  if (!iso) return DASH
  const [y, m] = String(iso).slice(0, 7).split('-')
  return `${MONTHS[Number(m) - 1]} ${String(y).slice(2)}`
}
