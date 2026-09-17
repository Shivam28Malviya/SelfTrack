import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import KpiTile from '../../components/tp/KpiTile'
import StatusPill from '../../components/tp/StatusPill'
import { TpLoading, TpError, TpEmpty } from '../../components/tp/States'
import { ChartFrame, RankedBars, Sparkline, SimpleTable } from '../../components/tp/charts/Primitives'
import { tpGet } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'
import { shortDate, DASH } from '../../lib/tpFormat'

/**
 * Team overview.
 *
 * The attention table shows the signals that produced each status, not just
 * the label. A person marked "at risk" with no reasons attached is neither
 * reviewable nor fair, and the manager cannot act on it either.
 */
export default function TpOverview() {
  const { role, config } = useTp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await tpGet('/overview')
    if (!res.success) { setError(res.error); setLoading(false); return }
    setData(res)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <TpLayout title="Overview"><TpLoading label="Loading the overview" rows={8} /></TpLayout>
  if (error) return <TpLayout title="Overview"><TpError error={error} onRetry={load} /></TpLayout>

  const m = data.metrics
  const t = m.targets || {}
  const flagged = (data.attention.people || []).filter(p => p.status !== 'On track')
  const headcount = data.shape.headcount

  return (
    <TpLayout title="Overview">
      <section className="tp-panel flex flex-col gap-6">
        <div>
          <p className="tp-label m-0">
            {shortDate(m.period.from)} to {shortDate(m.period.to)} · {headcount} {headcount === 1 ? 'person' : 'people'}
          </p>
          <h1 className="tp-h1 mt-2">Team at a glance</h1>
          <p className="mt-3 m-0 max-w-[560px] text-base leading-relaxed" style={{ color: 'var(--tp-muted)' }}>
            Delivery, client impact, attendance and growth for everyone in your
            team, in one place.
          </p>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiTile label="On-time completion" value={m.onTimePct} unit="%" target={t.on_time_pct}
            basis={`${m.onTimeBasis} judged`}
            tone={m.onTimePct == null ? 'plain' : m.onTimePct >= t.on_time_pct ? 'ok' : 'bad'}
            hint="no tasks due or completed yet" />
          <KpiTile label="Avg client score" value={m.clientScore} target={t.client_score}
            basis={`${m.clientCount} rating${m.clientCount === 1 ? '' : 's'}`}
            tone={m.clientScore == null ? 'plain' : m.clientScore >= t.client_score ? 'ok' : 'warn'}
            hint="no client feedback recorded yet" />
          <KpiTile label="Defects leaked" value={m.defectsLeaked} target={t.defects_leaked}
            tone={m.defectsLeaked > (t.defects_leaked ?? 0) ? 'bad' : 'ok'} />
          <KpiTile label="Unplanned absences" value={m.unplannedDays}
            basis={`over ${m.workingDays} person-days`}
            tone={m.unplannedDays > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Overdue tasks" value={m.overdueOpen}
            basis="open and past due" tone={m.overdueOpen > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Overtime" value={m.overtimeHours} unit=" h"
            basis={`recorded by ${m.peopleWithOvertime} people`}
            tone={m.overtimeHours == null ? 'plain' : 'warn'}
            hint="nobody has recorded overtime" />
        </div>

        {/* Utilization is deliberately absent rather than shown empty: nothing
            records billable hours, so there is no denominator to divide by. */}
        <p className="m-0 text-xs" style={{ color: 'var(--tp-muted)' }}>
          Utilization is not shown: it needs billable hours, and nothing records
          them yet. Overtime is entered by hand, so read it alongside how many
          people it covers.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr] items-start">
        <div className="tp-card flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-2xl tracking-[-0.02em]">Needs attention</span>
              <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
                {data.attention.rules
                  ? `Flagged at ${data.attention.rules.watch_signals} signals, at risk at ${data.attention.rules.at_risk_signals}. Each person is compared with their own previous quarter, not with each other.`
                  : 'No rules configured.'}
              </p>
            </div>
            <Link to="/tp/people" className="tp-btn-ghost">All people</Link>
          </div>

          {flagged.length === 0 ? (
            <TpEmpty
              title={headcount === 0 ? 'No people yet' : 'Nobody is flagged'}
              body={headcount === 0
                ? 'Add or import the team and the figures above start filling in.'
                : 'No two signals have moved the wrong way for anyone in your team. A person with too little data recorded is never flagged on that basis.'}
              action={headcount === 0 && (role === 'admin' || role === 'manager')
                ? <Link to="/tp/people/new" className="tp-btn">Add person</Link>
                : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[720px]">
                <caption className="sr-only">People with signals moving the wrong way</caption>
                <thead>
                  <tr>
                    {['Person', 'On-time', 'Client', 'Unplanned', 'Aged overdue', 'Status', ''].map(h => (
                      <th key={h} scope="col" className="tp-label text-left font-normal pb-3 px-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flagged.map(p => (
                    <tr key={p.personId}>
                      <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                        <Link to={`/tp/people/${p.personId}`} className="flex items-center gap-3">
                          <span aria-hidden="true" className="w-9 h-9 rounded-full grid place-items-center text-[13px]"
                            style={{ background: 'var(--tp-scale-1)' }}>{p.initials}</span>
                          <span className="flex flex-col">
                            <span>{p.name}</span>
                            <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>{p.designation}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="border-t px-3 py-3 text-sm tabular-nums" style={{ borderColor: 'var(--tp-line)' }}>
                        {p.facts.onTimePct == null ? DASH : `${p.facts.onTimePct}%`}
                      </td>
                      <td className="border-t px-3 py-3 text-sm tabular-nums" style={{ borderColor: 'var(--tp-line)' }}>
                        {p.facts.clientScore == null ? DASH : p.facts.clientScore}
                      </td>
                      <td className="border-t px-3 py-3 text-sm tabular-nums" style={{ borderColor: 'var(--tp-line)' }}>
                        {p.facts.unplannedDays || 0}
                      </td>
                      <td className="border-t px-3 py-3 text-sm tabular-nums" style={{ borderColor: 'var(--tp-line)' }}>
                        {p.facts.agedOverdue || 0}
                      </td>
                      <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                        <StatusPill status={p.status}
                          title={p.overridden ? `Set by a manager: ${p.overrideReason}` : undefined} />
                      </td>
                      <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                        <button type="button" className="tp-btn-ghost"
                          aria-expanded={open === p.personId}
                          onClick={() => setOpen(open === p.personId ? null : p.personId)}>
                          Why
                        </button>
                      </td>
                    </tr>
                  ))}
                  {open != null && (() => {
                    const p = flagged.find(x => x.personId === open)
                    if (!p) return null
                    return (
                      <tr>
                        <td colSpan={7} className="border-t px-3 py-4" style={{ borderColor: 'var(--tp-line)' }}>
                          <p className="tp-label m-0 mb-2">Signals for {p.name}</p>
                          {p.signals.length === 0 ? (
                            <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
                              No signals fired. This status was set by hand
                              {p.overrideReason ? `: ${p.overrideReason}` : '.'}
                            </p>
                          ) : (
                            <ul className="m-0 pl-5 text-sm flex flex-col gap-1">
                              {p.signals.map(s => <li key={s.key}>{s.text}</li>)}
                            </ul>
                          )}
                          {p.overridden && (
                            <p className="m-0 mt-2 text-xs" style={{ color: 'var(--tp-muted)' }}>
                              A manager set this status to “{p.status}” over the computed “{p.computedStatus}”.
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <ChartFrame title="Team shape" subtitle="Active people by designation"
            table={<SimpleTable columns={['Designation', 'People']} rows={data.shape.pyramid.map(r => [r.label, r.n])} />}>
            <RankedBars
              rows={data.shape.pyramid.map(r => ({ label: r.label, value: r.n }))}
              max={Math.max(1, ...data.shape.pyramid.map(r => r.n))}
              unit=""
              emptyLabel="No people yet"
            />
          </ChartFrame>

          <ChartFrame title="Working from" subtitle="Where the team sits"
            table={<SimpleTable columns={['Location', 'People']} rows={data.shape.locations.map(r => [r.label, r.n])} />}>
            <RankedBars
              rows={data.shape.locations.map(r => ({ label: r.label, value: r.n }))}
              max={Math.max(1, ...data.shape.locations.map(r => r.n))}
              unit=""
              emptyLabel="No people yet"
            />
          </ChartFrame>

          <ChartFrame title="On-time, six months" subtitle="Whole months only; the current one is still moving">
            <Sparkline
              points={(data.trend || []).map(t2 => ({ month: t2.month, value: t2.onTimePct }))}
              unit="%"
            />
          </ChartFrame>

          {data.expiringCerts > 0 && (
            <Link to="/tp/skills" className="rounded-[20px] px-5 py-4 text-sm"
              style={{ background: 'var(--tp-warn-bg)', color: 'var(--tp-warn-fg)' }}>
              {data.expiringCerts} certification{data.expiringCerts === 1 ? '' : 's'} expire in the next 90 days
            </Link>
          )}
        </div>
      </div>

      {config?.retention && (
        <p className="m-0 px-2 text-xs" style={{ color: 'var(--tp-muted)' }}>
          Raw attendance and late logins are kept {config.retention.raw_months} months,
          aggregates {config.retention.aggregate_years} years. Every read of another
          person's record is logged.
        </p>
      )}
    </TpLayout>
  )
}
