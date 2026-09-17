import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import StatusPill from '../../components/tp/StatusPill'
import { TpLoading, TpError, TpEmpty } from '../../components/tp/States'
import { tpGet } from '../../lib/tpApi'
import { DASH } from '../../lib/tpFormat'

/**
 * The phone view of the overview.
 *
 * Kept as its own route rather than a media query on the main overview: the
 * priorities differ. A manager on a phone wants who needs attention and a way
 * to log something, not six KPIs and three charts. Every other screen is
 * responsive rather than duplicated.
 */
export default function TpMobile() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    tpGet('/overview').then(r => {
      if (r.success) setData(r)
      else setError(r.error)
      setLoading(false)
    })
  }, [])

  if (loading) return <TpLayout title="Today"><TpLoading label="Loading" rows={4} /></TpLayout>
  if (error) return <TpLayout title="Today"><TpError error={error} /></TpLayout>

  const m = data.metrics
  const flagged = (data.attention.people || []).filter(p => p.status !== 'On track')

  const tiles = [
    ['On-time', m.onTimePct == null ? DASH : `${m.onTimePct}%`],
    ['Client score', m.clientScore == null ? DASH : m.clientScore],
    ['Unplanned', m.unplannedDays],
    ['Overdue', m.overdueOpen],
  ]

  return (
    <TpLayout title="Today">
      <section className="tp-panel flex flex-col gap-4">
        <div>
          <p className="tp-label m-0">{data.shape.headcount} people</p>
          <h1 className="tp-h1 mt-1">Team at a glance</h1>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-[20px] bg-white/60 px-4 py-3 flex flex-col gap-1">
              <span className="text-2xl tracking-[-0.03em] tabular-nums">{value}</span>
              <span className="tp-label">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="tp-card flex flex-col gap-2">
        <span className="text-lg">Needs attention</span>
        {flagged.length === 0 ? (
          <TpEmpty title="Nobody is flagged" />
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col">
            {flagged.map(p => (
              <li key={p.personId}>
                <Link to={`/tp/people/${p.personId}`}
                  className="flex items-center gap-3 py-3 border-t min-h-[44px]"
                  style={{ borderColor: 'var(--tp-line)' }}>
                  <span aria-hidden="true" className="w-9 h-9 rounded-full grid place-items-center text-xs shrink-0"
                    style={{ background: 'var(--tp-scale-1)' }}>{p.initials}</span>
                  <span className="flex flex-col grow min-w-0">
                    <span className="text-sm">{p.name}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--tp-muted)' }}>
                      {p.signals[0]?.text || 'set by a manager'}
                    </span>
                  </span>
                  <StatusPill status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/tp/entry" className="tp-btn justify-center text-base py-4">Quick log</Link>
    </TpLayout>
  )
}
