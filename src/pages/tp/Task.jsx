import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import { TpLoading, TpError } from '../../components/tp/States'
import { tpGet } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'
import { shortDate, DASH } from '../../lib/tpFormat'

const STATUS_LABEL = {
  todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done', cancelled: 'Cancelled', '': 'created',
}

export default function TpTask() {
  const { id } = useParams()
  const { role } = useTp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    tpGet(`/tasks/${id}`).then(r => {
      if (r.success) setData(r)
      else setError(r.error)
      setLoading(false)
    })
  }
  useEffect(load, [id])

  if (loading) return <TpLayout title="Task"><TpLoading label="Loading task" /></TpLayout>
  if (error) return <TpLayout title="Task"><TpError error={error} onRetry={load} /></TpLayout>

  const t = data.task
  const facts = [
    ['Owner', t.ownerId ? <Link to={`/tp/people/${t.ownerId}`}>{t.ownerName}</Link> : 'Unassigned'],
    ['Project', t.projectName || DASH],
    ['Client', t.client || DASH],
    ['Due', shortDate(t.dueDate)],
    ['Status', STATUS_LABEL[t.status]],
    ['Progress', `${t.progressPct}%`],
    ['Estimated', t.estHours == null ? DASH : `${t.estHours} h`],
    ['Actual', t.actualHours == null ? DASH : `${t.actualHours} h`],
    ['Reopened', t.reopenedCount > 0 ? `${t.reopenedCount} time(s)` : 'No'],
    ['Leaked to UAT', t.leakedToUat ? 'Yes' : 'No'],
  ]

  return (
    <TpLayout title={t.title}>
      <section className="tp-panel flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/tp/delivery" className="text-sm hover:opacity-70">← Delivery</Link>
          {(role === 'admin' || role === 'manager') && (
            <Link to={`/tp/tasks/${id}/edit`} className="tp-btn-ghost">Edit</Link>
          )}
        </div>
        <h1 className="tp-h1">{t.title}</h1>
        {t.status === 'blocked' && t.blockedReason && (
          <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="status"
            style={{ background: 'var(--tp-warn-bg)', color: 'var(--tp-warn-fg)' }}>
            Blocked on: {t.blockedReason}
          </p>
        )}
        <dl className="grid gap-2.5 grid-cols-2 md:grid-cols-5 m-0">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-[22px] bg-white/60 px-4 py-3 flex flex-col gap-1">
              <dt className="tp-label">{label}</dt>
              <dd className="m-0 text-base">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="tp-card flex flex-col gap-4">
        <span className="text-xl">History</span>
        <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
          Every status change. Reopen counts and task aging are read from this,
          not from a field anyone can type over.
        </p>
        <ol className="m-0 p-0 list-none flex flex-col gap-3">
          {data.history.map(h => (
            <li key={h.id} className="flex gap-3 text-sm">
              <span aria-hidden="true" className="w-2.5 h-2.5 mt-1.5 rounded-full shrink-0"
                style={{ background: 'var(--tp-cat-1)' }} />
              <span className="flex flex-col">
                <span>
                  {h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}` : `Created as ${STATUS_LABEL[h.to]}`}
                </span>
                <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>
                  {new Date(h.ts).toLocaleString()} · {h.actor}{h.note ? ` · ${h.note}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </TpLayout>
  )
}
