import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import StatusPill from '../../components/tp/StatusPill'
import KpiTile from '../../components/tp/KpiTile'
import { TpLoading, TpError, TpEmpty } from '../../components/tp/States'
import { ChartFrame, Sparkline, SimpleTable } from '../../components/tp/charts/Primitives'
import { tpGet, tpDelete } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'
import { years, shortDate, initialsOf, DASH } from '../../lib/tpFormat'

const TABS = ['Overview', 'Tasks', 'Attendance', 'Growth']

const DAY_FILL = {
  present: 'var(--tp-scale-1)', wfh: 'var(--tp-scale-2)', planned: 'var(--tp-scale-3)',
  unplanned: 'var(--tp-bad-fg)', sick: 'var(--tp-cat-2)', holiday: '#efe7d8',
  off: '#f7f8fa', future: '#ffffff', pre_joining: '#ffffff',
}

export default function TpEmployee() {
  const { id } = useParams()
  const { role, person: me } = useTp()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [actionError, setActionError] = useState('')

  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'Overview'
  const canEdit = role === 'admin' || role === 'manager'
  const isSelf = me?.id === Number(id)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await tpGet(`/people/${id}/profile`)
    if (!res.success) { setError(res.error); setLoading(false); return }
    setData(res)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const deactivate = async () => {
    setActionError('')
    const res = await tpDelete(`/people/${id}`)
    setConfirming(false)
    if (!res.success) { setActionError(res.error); return }
    load()
  }

  if (loading) return <TpLayout title="Profile"><TpLoading label="Loading profile" rows={6} /></TpLayout>
  if (error) return <TpLayout title="Profile"><TpError error={error} onRetry={load} /></TpLayout>

  const p = data.person
  const m = data.metrics
  const flag = data.attention

  const facts = [
    ['Total experience', years(p.totalExpYears)],
    ['Relevant experience', years(p.relevantExpYears)],
    ['Project', p.projectName || DASH],
    ['Working from', p.workLocation],
    ['Allocation', `${p.allocationPct}%`],
    ['Manager', p.managerName || DASH],
    ['Joined', shortDate(p.dateJoinedOrg)],
    ['Leave left', data.leave?.entitled ? `${data.leave.remaining} of ${data.leave.entitled}` : DASH],
  ]

  return (
    <TpLayout title={p.name}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <Link to="/tp/people" className="text-sm hover:opacity-70">← All people</Link>
        <div className="flex flex-wrap gap-3">
          {canEdit && <Link to={`/tp/entry?personId=${p.id}`} className="tp-btn">Log for {p.name.split(' ')[0]}</Link>}
          {canEdit && <Link to={`/tp/people/${id}/edit`} className="tp-btn-ghost">Edit</Link>}
          {canEdit && p.active && (
            <button type="button" className="tp-btn-ghost" onClick={() => setConfirming(true)}>Deactivate</button>
          )}
        </div>
      </div>

      {!p.active && (
        <p className="tp-card m-0 py-4 text-sm" role="status" style={{ color: 'var(--tp-muted)' }}>
          This person is deactivated. Their history is kept for team reporting and
          the audit trail, and they are hidden from the people list by default.
        </p>
      )}
      {actionError && (
        <p className="tp-card m-0 py-4 text-sm" role="alert" style={{ color: 'var(--tp-bad-fg)' }}>{actionError}</p>
      )}
      {confirming && (
        <div className="tp-card flex flex-col gap-3" role="alertdialog" aria-label="Confirm deactivation">
          <p className="m-0 text-lg">Deactivate {p.name}?</p>
          <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
            Nothing is deleted. Their delivery and attendance history stays, and
            they stop appearing in lists and in new entries.
          </p>
          <div className="flex gap-3 justify-end">
            <button type="button" className="tp-btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="tp-btn" onClick={deactivate}>Deactivate</button>
          </div>
        </div>
      )}

      <section className="tp-panel flex flex-col lg:flex-row lg:items-center gap-8">
        <div aria-hidden="true" className="w-24 h-24 rounded-full bg-white grid place-items-center text-4xl shrink-0">
          {p.initials || initialsOf(p.name)}
        </div>
        <div className="flex flex-col gap-2 grow">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="tp-h1">{p.name}</h1>
            {flag && <StatusPill status={flag.status}
              title={flag.overridden ? `Set by a manager: ${flag.overrideReason}` : undefined} />}
          </div>
          <p className="m-0 text-base" style={{ color: 'var(--tp-muted)' }}>
            {p.designation}{p.projectName ? ` · ${p.projectName}` : ''}{p.client ? ` · ${p.client}` : ''}
          </p>
        </div>
        <dl className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 lg:w-[620px] m-0">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-[22px] bg-white/60 px-4 py-3 flex flex-col gap-1">
              <dt className="tp-label">{label}</dt>
              <dd className="m-0 text-base">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {flag && flag.signals.length > 0 && (
        <div className="tp-card flex flex-col gap-2">
          <span className="text-xl">Why this status</span>
          <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
            Compared with {p.name.split(' ')[0]}'s own previous quarter, not with anyone else.
            {isSelf && ' You can dispute any entry behind these from the entry list.'}
          </p>
          <ul className="m-0 pl-5 text-sm flex flex-col gap-1">
            {flag.signals.map(s => <li key={s.key}>{s.text}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Profile sections">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => {
              const next = new URLSearchParams(params)
              if (t === 'Overview') next.delete('tab'); else next.set('tab', t)
              setParams(next, { replace: true })
            }}
            className="px-5 py-3 rounded-full text-sm border"
            style={tab === t
              ? { background: 'var(--tp-navy)', color: '#fff', borderColor: 'var(--tp-navy)' }
              : { background: '#fff', color: 'var(--tp-navy)', borderColor: '#dfe3ea' }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiTile label="On-time" value={m.onTimePct} unit="%" basis={`${m.onTimeBasis} judged`}
              hint="nothing due or completed" />
            <KpiTile label="Client score" value={m.clientScore} basis={`${m.clientCount} ratings`}
              hint="no client feedback yet" />
            <KpiTile label="Completed" value={m.completed} />
            <KpiTile label="Overdue open" value={m.overdueOpen} tone={m.overdueOpen > 0 ? 'warn' : 'ok'} />
            <KpiTile label="Unplanned days" value={m.unplannedDays} tone={m.unplannedDays > 0 ? 'warn' : 'ok'} />
            <KpiTile label="Overtime" value={m.overtimeHours} unit=" h" hint="none recorded" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {[
              ['On-time completion', 'onTimePct', '%', false],
              ['Client score', 'clientScore', '', false],
              ['Overtime hours', 'overtimeHours', ' h', true],
            ].map(([label, key, unit, invert]) => (
              <ChartFrame key={key} title={label} subtitle="Six whole months">
                <Sparkline
                  points={(data.trend || []).map(t2 => ({ month: t2.month, value: t2[key] }))}
                  unit={unit}
                  invertGood={invert}
                  color={invert ? 'var(--tp-cat-2)' : 'var(--tp-cat-1)'}
                />
              </ChartFrame>
            ))}
          </div>
        </>
      )}

      {tab === 'Tasks' && (
        <div className="tp-card flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-2xl tracking-[-0.02em]">Open tasks</span>
            <span className="text-sm" style={{ color: 'var(--tp-muted)' }}>
              {data.openTaskCount} open · {m.overdueOpen} overdue
            </span>
          </div>
          {data.tasks.length === 0 ? (
            <TpEmpty title="No open tasks" body="Completed work still counts towards the figures above." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[680px]">
                <caption className="sr-only">Open tasks</caption>
                <thead>
                  <tr>
                    {['Task', 'Project', 'Due', 'Progress', 'Est / actual'].map(h => (
                      <th key={h} scope="col" className="tp-label text-left font-normal pb-3 px-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tasks.map(t => (
                    <tr key={t.id}>
                      <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                        <Link to={`/tp/tasks/${t.id}`}>{t.title}</Link>
                      </td>
                      <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>{t.projectName || DASH}</td>
                      <td className="border-t px-3 py-3 text-sm whitespace-nowrap" style={{ borderColor: 'var(--tp-line)' }}>
                        {shortDate(t.dueDate)}
                      </td>
                      <td className="border-t px-3 py-3 text-sm tabular-nums" style={{ borderColor: 'var(--tp-line)' }}>{t.progressPct}%</td>
                      <td className="border-t px-3 py-3 text-sm tabular-nums" style={{ borderColor: 'var(--tp-line)' }}>
                        {t.estHours == null && t.actualHours == null ? DASH : `${t.estHours ?? DASH} / ${t.actualHours ?? DASH} h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Attendance' && (
        <div className="tp-card flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-2xl tracking-[-0.02em]">This month</span>
            <span className="text-sm" style={{ color: 'var(--tp-muted)' }}>
              {m.plannedDays} planned · {m.unplannedDays} unplanned · {m.sickDays} sick ·
              {' '}{m.lateLogins} late{m.avgMinutesLate != null ? `, ${m.avgMinutesLate} min average` : ''}
            </span>
          </div>
          {data.grid.rows.length === 0 ? (
            <TpEmpty title="Nothing recorded this month" />
          ) : (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))' }}>
              {data.grid.rows[0].cells.map(cell => {
                const unrecorded = cell.recorded === false && cell.state === 'present'
                return (
                  <span
                    key={cell.date}
                    tabIndex={0}
                    title={`${shortDate(cell.date)}: ${unrecorded ? 'nothing recorded' : cell.state}${
                      cell.minutesLate ? ` · ${cell.minutesLate} min late` : ''}`}
                    className="h-9 rounded-lg grid place-items-center text-[11px]"
                    style={{
                      background: unrecorded ? '#ffffff' : DAY_FILL[cell.state],
                      color: ['unplanned', 'planned'].includes(cell.state) ? '#ffffff' : 'var(--tp-ink)',
                      boxShadow: unrecorded
                        ? 'inset 0 0 0 1px var(--tp-line)'
                        : cell.minutesLate ? 'inset 0 0 0 2px var(--tp-cat-2)' : 'none',
                    }}
                  >
                    {Number(cell.date.slice(8, 10))}
                  </span>
                )
              })}
            </div>
          )}
          <p className="m-0 text-xs" style={{ color: 'var(--tp-muted)' }}>
            A hollow cell means nothing was recorded for that working day, not that
            the person was present.
          </p>
        </div>
      )}

      {tab === 'Growth' && (
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          <ChartFrame
            title="Skills"
            subtitle="Manager rating with the self rating beside it, never merged into it"
            table={<SimpleTable columns={['Skill', 'Manager', 'Self']}
              rows={data.skillCells.map(c => [
                data.skills.find(s => s.id === c.skillId)?.name,
                c.manager == null ? DASH : `L${c.manager}`,
                c.self == null ? DASH : `L${c.self}`,
              ])} />}
          >
            {data.skillCells.length === 0 ? (
              <p className="m-0 py-6 text-center text-sm" style={{ color: 'var(--tp-muted)' }}>
                No skills in the catalogue yet
              </p>
            ) : (
              <ul className="m-0 p-0 list-none flex flex-col gap-3">
                {data.skillCells.map(c => {
                  const skill = data.skills.find(s => s.id === c.skillId)
                  return (
                    <li key={c.skillId} className="flex flex-col gap-1.5">
                      <span className="flex justify-between text-[13px]">
                        <span>{skill?.name}</span>
                        <span style={{ color: 'var(--tp-muted)' }}>
                          {c.manager == null ? 'not rated' : `L${c.manager}`}
                          {c.self != null ? ` · self L${c.self}` : ''}
                        </span>
                      </span>
                      <span className="relative h-2 rounded-full" style={{ background: 'var(--tp-track)' }}>
                        <span className="absolute left-0 top-0 h-2 rounded-full"
                          style={{ width: `${((c.manager ?? 0) / 4) * 100}%`, background: 'var(--tp-cat-1)' }} />
                        {c.self != null && (
                          <span aria-hidden="true" className="absolute -top-1 w-0.5 h-4 rounded"
                            style={{ left: `calc(${(c.self / 4) * 100}% - 1px)`, background: 'var(--tp-cat-2)' }} />
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </ChartFrame>

          <div className="flex flex-col gap-5">
            <div className="tp-card flex flex-col gap-3">
              <span className="text-xl">Certifications</span>
              {data.certs.length === 0 ? (
                <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>None recorded</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col">
                  {data.certs.map(c => (
                    <li key={c.id} className="flex justify-between gap-3 py-2.5 border-t text-sm"
                      style={{ borderColor: 'var(--tp-line)' }}>
                      <span className="flex flex-col">
                        <span>{c.name}</span>
                        <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>
                          {c.issuer || 'no issuer'} · {c.kind}
                        </span>
                      </span>
                      <span className="tp-pill" style={
                        c.status === 'expired'
                          ? { background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)' }
                          : c.daysToExpiry != null && c.daysToExpiry <= 90
                            ? { background: 'var(--tp-warn-bg)', color: 'var(--tp-warn-fg)' }
                            : { background: 'var(--tp-ok-bg)', color: 'var(--tp-ok-fg)' }
                      }>
                        {c.status === 'expired'
                          ? 'expired'
                          : c.daysToExpiry != null ? `${c.daysToExpiry} days left` : c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="tp-card flex flex-col gap-3">
              <span className="text-xl">Achievements</span>
              {data.achievements.length === 0 ? (
                <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>None recorded</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-3">
                  {data.achievements.map(a => (
                    <li key={`${a.kind}-${a.id}`} className="flex gap-3 text-sm">
                      <span aria-hidden="true" className="w-2.5 h-2.5 mt-1.5 rounded-full shrink-0"
                        style={{ background: 'var(--tp-cat-1)' }} />
                      <span className="flex flex-col">
                        <span>{a.detail}</span>
                        <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>
                          {a.label} · {shortDate(a.date)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </TpLayout>
  )
}
