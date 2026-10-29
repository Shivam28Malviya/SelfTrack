import { DASH } from '../../../lib/tpFormat'

/**
 * Absence split by type.
 *
 * Widths are a share of the largest total in the set, so a long absence
 * cannot draw past its track — the design's `days * 8 + '%'` overflowed at 13
 * days. Segments are separated by a 2px surface gap so adjacent types stay
 * distinguishable, and the legend plus the per-segment tooltip mean the split
 * is never carried by colour alone.
 */
const SERIES = [
  { key: 'planned', label: 'Planned', color: 'var(--tp-scale-3)' },
  { key: 'unplanned', label: 'Unplanned', color: 'var(--tp-bad-fg)' },
  { key: 'sick', label: 'Sick', color: 'var(--tp-cat-2)' },
]

export const ABSENCE_SERIES = SERIES

export default function StackedBars({ rows, unit = ' d' }) {
  if (!rows.length) {
    return <p className="m-0 py-8 text-center text-sm" style={{ color: 'var(--tp-muted)' }}>
      No absence recorded in this period
    </p>
  }
  const max = Math.max(...rows.map(r => r.total)) || 1

  return (
    <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
      {rows.map(r => (
        <li key={r.personId} className="flex items-center gap-3 text-[13px]">
          <span className="w-24 shrink-0 truncate" title={r.name}>{r.name}</span>
          <span className="grow h-4 flex gap-0.5" style={{ background: 'var(--tp-track)', borderRadius: 9999 }}>
            {SERIES.map(s => {
              const value = r[s.key]
              if (!value) return null
              return (
                <span
                  key={s.key}
                  tabIndex={0}
                  title={`${r.name}: ${value} ${s.label.toLowerCase()} day${value === 1 ? '' : 's'}`}
                  className="h-4 first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(value / max) * 100}%`, background: s.color, borderRadius: 6 }}
                />
              )
            })}
          </span>
          <span className="w-12 text-right tabular-nums">{r.total ? `${r.total}${unit}` : DASH}</span>
        </li>
      ))}
    </ul>
  )
}
