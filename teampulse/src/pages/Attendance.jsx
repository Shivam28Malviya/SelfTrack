import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TpLayout from '../components/tp/TpLayout'
import KpiTile from '../components/tp/KpiTile'
import { TpLoading, TpError, TpEmpty } from '../components/tp/States'
import { ChartFrame, SimpleTable } from '../components/tp/charts/Primitives'
import StackedBars, { ABSENCE_SERIES } from '../components/tp/charts/StackedBars'
import { tpGet, tpPost } from '../lib/tpApi'
import { useTp } from '../context/TpContext'
import { shortDate, DASH } from '../lib/tpFormat'

/**
 * Cell states. `present` unrecorded is drawn as a hollow cell: nobody said the
 * person was there, so an absence of data is shown as an absence of data
 * rather than as attendance.
 */
const STATE_STYLE = {
  present: { bg: 'var(--tp-scale-1)', label: 'Present' },
  wfh: { bg: 'var(--tp-scale-2)', label: 'Working from home' },
  planned: { bg: 'var(--tp-scale-3)', label: 'Planned leave' },
  unplanned: { bg: 'var(--tp-bad-fg)', label: 'Unplanned' },
  sick: { bg: 'var(--tp-cat-2)', label: 'Sick' },
  holiday: { bg: '#efe7d8', label: 'Holiday' },
  off: { bg: '#f7f8fa', label: 'Weekend' },
  future: { bg: '#ffffff', label: 'Not yet' },
  pre_joining: { bg: '#ffffff', label: 'Before joining' },
}

const LEGEND = ['present', 'wfh', 'planned', 'unplanned', 'sick', 'holiday', 'off']

const thisMonth = () => new Date().toISOString().slice(0, 7)

function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

export default function TpAttendance() {
  const { role, person } = useTp()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [leave, setLeave] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : thisMonth()
  const canDecide = role === 'admin' || role === 'manager'

  const setMonth = (m) => {
    const next = new URLSearchParams(params)
    if (m === thisMonth()) next.delete('month'); else next.set('month', m)
    setParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [a, l] = await Promise.all([tpGet('/attendance', { month }), tpGet('/leave')])
    if (!a.success) { setError(a.error); setLoading(false); return }
    setData(a)
    setLeave(l.success ? l.requests : [])
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  const decide = async (id, decision) => {
    setActionError('')
    const res = await tpPost(`/leave/${id}/decide`, { decision })
    if (!res.success) { setActionError(res.error); return }
    load()
  }

  if (loading) return <TpLayout title="Attendance"><TpLoading label="Loading attendance" rows={8} /></TpLayout>
  if (error) return <TpLayout title="Attendance"><TpError error={error} onRetry={load} /></TpLayout>

  const m = data.metrics
  const grid = data.grid
  const pending = (leave || []).filter(r => r.status === 'pending')

  return (
    <TpLayout title="Attendance">
      <section className="tp-panel flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="tp-h1">Attendance</h1>
              <span className="tp-pill" style={{ background: 'rgba(255,255,255,0.7)' }}>
                <span aria-hidden="true">🔒</span>
                {role === 'member' ? 'Your record only' : 'Your team only'}
              </span>
            </div>
            <p className="mt-1.5 m-0 text-base" style={{ color: 'var(--tp-muted)' }}>
              {monthName(month)} · {grid.workingDays} working days ·
              {' '}{grid.rows.length} {grid.rows.length === 1 ? 'person' : 'people'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="tp-btn-ghost" onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Previous month">←</button>
            <span className="text-base px-2 min-w-[7rem] text-center">{monthName(month)}</span>
            <button type="button" className="tp-btn-ghost" onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="Next month" disabled={month >= thisMonth()}>→</button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiTile label="Attendance rate" value={m.attendanceRatePct} unit="%"
            basis={`${m.workingDays} person-days`}
            tone={m.attendanceRatePct == null ? 'plain' : m.attendanceRatePct >= 95 ? 'ok' : 'warn'}
            hint="no working days counted yet" />
          <KpiTile label="Unplanned days" value={m.unplannedDays}
            tone={m.unplannedDays > 0 ? 'warn' : 'ok'} basis="counts against the rate" />
          <KpiTile label="Sick days" value={m.sickDays} basis="counts against the rate" />
          <KpiTile label="Planned leave" value={m.plannedDays} tone="ok" basis="does not count against the rate" />
          <KpiTile label="Late logins" value={m.lateLogins}
            basis={m.avgMinutesLate != null ? `${m.avgMinutesLate} min on average` : undefined}
            tone={m.lateLogins > 0 ? 'warn' : 'ok'} />
        </div>
      </section>

      {actionError && (
        <p className="tp-card m-0 py-4 text-sm" role="alert" style={{ color: 'var(--tp-bad-fg)' }}>{actionError}</p>
      )}

      {grid.rows.length === 0 ? (
        <TpEmpty
          title="Nobody to show"
          body={person
            ? 'No active people are in scope for this month.'
            : 'Your login is not linked to a person in TeamPulse yet, so there is no record to show. An administrator can link it.'}
        />
      ) : (
        <div className="tp-card flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="text-2xl tracking-[-0.02em]">Team calendar</span>
            <ul className="flex flex-wrap gap-3 m-0 p-0 list-none text-xs" style={{ color: 'var(--tp-muted)' }}>
              {LEGEND.map(k => (
                <li key={k} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="w-3 h-3 rounded"
                    style={{ background: STATE_STYLE[k].bg, boxShadow: 'inset 0 0 0 1px rgba(30,50,90,0.12)' }} />
                  {STATE_STYLE[k].label}
                </li>
              ))}
            </ul>
          </div>

          {/* The grid scrolls horizontally with a sticky name column: 31 legible
              cells plus a name do not fit a laptop viewport. */}
          <div className="overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: 120 + grid.days.length * 26 }}>
              <caption className="sr-only">Attendance for {monthName(month)}, one column per day</caption>
              <thead>
                <tr>
                  <th scope="col" className="tp-label text-left font-normal pb-2 pr-3 sticky left-0 bg-white z-10">Person</th>
                  {grid.days.map(d => (
                    <th key={d} scope="col" className="tp-label font-normal pb-2 px-0 text-center w-[26px]">
                      {Number(d.slice(8, 10))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map(row => (
                  <tr key={row.personId}>
                    <th scope="row" className="text-left font-normal text-[13px] pr-3 py-1 sticky left-0 bg-white z-10">
                      <Link to={`/people/${row.personId}`}>{row.name}</Link>
                    </th>
                    {row.cells.map(cell => {
                      const style = STATE_STYLE[cell.state] || STATE_STYLE.present
                      const unrecorded = cell.recorded === false && cell.state === 'present'
                      return (
                        <td key={cell.date} className="p-0.5">
                          <span
                            tabIndex={0}
                            title={`${row.name}, ${shortDate(cell.date)}: ${
                              unrecorded ? 'nothing recorded' : style.label
                            }${cell.minutesLate ? ` · ${cell.minutesLate} min late` : ''}`}
                            className="block h-6 rounded"
                            style={{
                              background: unrecorded ? '#ffffff' : style.bg,
                              boxShadow: unrecorded
                                ? 'inset 0 0 0 1px var(--tp-line)'
                                : cell.minutesLate ? 'inset 0 0 0 2px var(--tp-cat-2)' : 'none',
                            }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-xs" style={{ color: 'var(--tp-muted)' }}>
            A hollow cell means nothing was recorded for that working day, not
            that the person was present. An amber outline marks a late login.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartFrame
          title="Absence by type"
          subtitle="Last three months. Only unplanned and sick days count against the attendance rate."
          legend={ABSENCE_SERIES.map(s => ({ label: s.label, color: s.color }))}
          table={<SimpleTable columns={['Person', 'Planned', 'Unplanned', 'Sick', 'Total']}
            rows={data.absence.map(a => [a.name, a.planned, a.unplanned, a.sick, a.total])} />}
        >
          <StackedBars rows={data.absence} />
        </ChartFrame>

        <ChartFrame title="Late logins" subtitle="This period, against the one before it">
          {data.late.length === 0
            ? <p className="m-0 py-8 text-center text-sm" style={{ color: 'var(--tp-muted)' }}>No late logins recorded</p>
            : <SimpleTable
                columns={['Person', 'Times', 'Average', 'Trend']}
                rows={data.late.map(l => [
                  l.name, l.count, `${l.avgMinutes} min`,
                  `${l.trend === 'up' ? '▲ up' : l.trend === 'down' ? '▼ down' : '— flat'} (was ${l.previous})`,
                ])}
              />}
        </ChartFrame>

        <div className="flex flex-col gap-5">
          <ChartFrame title="Overtime" subtitle="Manually entered, so coverage matters as much as the total">
            <div className="flex flex-col gap-1">
              <span className="text-4xl tracking-[-0.03em] tabular-nums">
                {m.overtimeHours == null ? DASH : `${m.overtimeHours} h`}
              </span>
              <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>
                {m.overtimeHours == null
                  ? 'Nobody has recorded overtime in this period'
                  : `recorded by ${m.peopleWithOvertime} of ${grid.rows.length} people`}
              </span>
            </div>
          </ChartFrame>

          <ChartFrame title="No leave taken" subtitle="No planned leave in the last six months">
            {data.unused.length === 0
              ? <p className="m-0 py-6 text-center text-sm" style={{ color: 'var(--tp-muted)' }}>
                  Everyone has taken leave recently
                </p>
              : <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {data.unused.map(u => (
                    <li key={u.personId} className="flex justify-between gap-3 px-4 py-3 rounded-2xl text-sm"
                      style={{ background: 'var(--tp-warn-bg)', color: 'var(--tp-warn-fg)' }}>
                      <Link to={`/people/${u.personId}`}>{u.name}</Link>
                      <span>
                        {u.lastPlanned ? `last ${shortDate(u.lastPlanned)}` : 'none recorded'}
                        {u.entitled > 0 ? ` · ${u.remaining} left` : ''}
                      </span>
                    </li>
                  ))}
                </ul>}
          </ChartFrame>
        </div>
      </div>

      <div className="tp-card flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-2xl tracking-[-0.02em]">Leave requests</span>
          <Link to="/leave/new" className="tp-btn">Request leave</Link>
        </div>
        {(leave || []).length === 0 ? (
          <TpEmpty title="No leave requests" body="A request here becomes attendance only once it is approved." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
              <caption className="sr-only">Leave requests</caption>
              <thead>
                <tr>
                  {['Person', 'Dates', 'Working days', 'Type', 'Status', ''].map(h => (
                    <th key={h} scope="col" className="tp-label text-left font-normal pb-3 px-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leave.map(r => (
                  <tr key={r.id}>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                      <Link to={`/people/${r.personId}`}>{r.personName}</Link>
                    </td>
                    <td className="border-t px-3 py-3 text-sm whitespace-nowrap" style={{ borderColor: 'var(--tp-line)' }}>
                      {shortDate(r.fromDate)}{r.toDate !== r.fromDate ? ` – ${shortDate(r.toDate)}` : ''}
                    </td>
                    <td className="border-t px-3 py-3 text-sm tabular-nums" style={{ borderColor: 'var(--tp-line)' }}>{r.workingDays}</td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>{r.type}</td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                      <LeaveStatus status={r.status} />
                    </td>
                    <td className="border-t px-3 py-3 text-sm whitespace-nowrap" style={{ borderColor: 'var(--tp-line)' }}>
                      {canDecide && r.status === 'pending' && (
                        <span className="flex gap-2">
                          <button type="button" className="tp-btn-ghost" onClick={() => decide(r.id, 'rejected')}>Reject</button>
                          <button type="button" className="tp-btn" onClick={() => decide(r.id, 'approved')}>Approve</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pending.length > 0 && canDecide && (
          <p className="m-0 text-xs" style={{ color: 'var(--tp-muted)' }}>
            Approving writes one attendance day per working day in the range and
            adds to the person's used-leave balance. You cannot decide your own
            request.
          </p>
        )}
      </div>
    </TpLayout>
  )
}

function LeaveStatus({ status }) {
  const tone = {
    pending: { bg: 'var(--tp-info-bg)', fg: 'var(--tp-info-fg)', glyph: '○' },
    approved: { bg: 'var(--tp-ok-bg)', fg: 'var(--tp-ok-fg)', glyph: '●' },
    rejected: { bg: 'var(--tp-bad-bg)', fg: 'var(--tp-bad-fg)', glyph: '■' },
    withdrawn: { bg: 'var(--tp-info-bg)', fg: 'var(--tp-info-fg)', glyph: '○' },
  }[status]
  return (
    <span className="tp-pill" style={{ background: tone.bg, color: tone.fg }}>
      <span aria-hidden="true">{tone.glyph}</span>{status}
    </span>
  )
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (m) => {
  const [y, mm] = String(m).split('-')
  return `${MONTH_NAMES[Number(mm) - 1]} ${y}`
}
