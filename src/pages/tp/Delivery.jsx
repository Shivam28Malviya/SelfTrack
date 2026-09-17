import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import KpiTile from '../../components/tp/KpiTile'
import { TpLoading, TpError, TpEmpty } from '../../components/tp/States'
import { ChartFrame, RankedBars, Columns, EffortScatter, SimpleTable } from '../../components/tp/charts/Primitives'
import { tpGet } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'
import { shortDate, DASH } from '../../lib/tpFormat'

const PERIODS = [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']]
const FILTERS = [
  ['All', 'All'], ['overdue', 'Overdue'], ['blocked', 'Blocked'],
  ['in_progress', 'In progress'], ['done', 'Done'],
]
const STATUS_LABEL = {
  todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done', cancelled: 'Cancelled',
}

export default function TpDelivery() {
  const { role } = useTp()
  const [params, setParams] = useSearchParams()
  const [metrics, setMetrics] = useState(null)
  const [charts, setCharts] = useState(null)
  const [tasks, setTasks] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const period = params.get('period') || 'month'
  const filter = params.get('status') || 'All'
  const page = Number(params.get('page') || '1') || 1

  const setParam = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) { if (!v || v === 'All') next.delete(k); else next.set(k, v) }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [m, c, t] = await Promise.all([
      tpGet('/metrics', { period }),
      tpGet('/metrics/delivery', { period }),
      tpGet('/tasks', { status: filter, page: params.get('page'), sort: 'due' }),
    ])
    if (!m.success) { setError(m.error); setLoading(false); return }
    setMetrics(m.metrics)
    setCharts(c.success ? c : null)
    setTasks(t.success ? t : null)
    setLoading(false)
  }, [period, filter, params])

  useEffect(() => { load() }, [load])

  if (loading) return <TpLayout title="Delivery"><TpLoading label="Loading delivery" rows={8} /></TpLayout>
  if (error) return <TpLayout title="Delivery"><TpError error={error} onRetry={load} /></TpLayout>

  const t = metrics.targets || {}
  const pages = tasks ? Math.max(1, Math.ceil(tasks.total / tasks.limit)) : 1
  const hasAnyTask = (tasks?.total ?? 0) > 0 || metrics.completed > 0 || metrics.overdueOpen > 0

  return (
    <TpLayout title="Delivery">
      <section className="tp-panel flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="tp-h1">Delivery</h1>
            <p className="mt-1.5 m-0 text-base" style={{ color: 'var(--tp-muted)' }}>
              {metrics.completed} task{metrics.completed === 1 ? '' : 's'} completed
              between {shortDate(metrics.period.from)} and {shortDate(metrics.period.to)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {role !== 'spectator' && (role === 'admin' || role === 'manager') && (
              <Link to="/tp/tasks/new" className="tp-btn">New task</Link>
            )}
            <div className="flex gap-1 p-1 rounded-full bg-white/60" role="group" aria-label="Period">
              {PERIODS.map(([v, l]) => (
                <button key={v} type="button" onClick={() => setParam({ period: v === 'month' ? '' : v })}
                  aria-pressed={period === v}
                  className="h-11 px-5 rounded-full text-sm"
                  style={period === v ? { background: 'var(--tp-navy)', color: '#fff' } : { color: 'var(--tp-navy)' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiTile label="On-time completion" value={metrics.onTimePct} unit="%" target={t.on_time_pct}
            basis={`${metrics.onTimeBasis} task${metrics.onTimeBasis === 1 ? '' : 's'} judged`}
            tone={tone(metrics.onTimePct, t.on_time_pct, 'above')}
            hint="no tasks due or completed in this period" />
          <KpiTile label="Effort over estimate" value={metrics.effortOverEstPct} unit="%" target={t.effort_over_est_pct}
            basis={`${metrics.effortBasisHours} estimated hours`}
            tone={tone(metrics.effortOverEstPct, t.effort_over_est_pct, 'below')}
            hint="no completed task has both an estimate and an actual" />
          <KpiTile label="Reopen rate" value={metrics.reopenRatePct} unit="%" target={t.reopen_rate_pct}
            tone={tone(metrics.reopenRatePct, t.reopen_rate_pct, 'below')}
            hint="nothing completed in this period" />
          <KpiTile label="Defects leaked to UAT" value={metrics.defectsLeaked} target={t.defects_leaked}
            tone={metrics.defectsLeaked > (t.defects_leaked ?? 0) ? 'bad' : 'ok'} />
          <KpiTile label="Overdue tasks" value={metrics.overdueOpen}
            basis="open and past due" tone={metrics.overdueOpen > 0 ? 'warn' : 'ok'} />
        </div>
      </section>

      {!hasAnyTask ? (
        <TpEmpty
          title="No tasks yet"
          body="Delivery metrics are computed from tasks. Add the first one and the figures above start filling in."
          action={(role === 'admin' || role === 'manager') && <Link to="/tp/tasks/new" className="tp-btn">New task</Link>}
        />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <ChartFrame
              title="On-time by person"
              subtitle={`Target ${t.on_time_pct}%. People with nothing due in this period are left out.`}
              table={<SimpleTable columns={['Person', 'On-time', 'Tasks judged']}
                rows={(charts?.byPerson || []).map(p => [p.name, p.onTimePct == null ? DASH : `${p.onTimePct}%`, p.basis])} />}
            >
              <RankedBars
                rows={(charts?.byPerson || []).map(p => ({ label: p.name, value: p.onTimePct, basis: p.basis }))}
                target={t.on_time_pct}
              />
            </ChartFrame>

            <ChartFrame
              title="Estimate against actual"
              subtitle="Completed tasks that carry both figures"
              table={<SimpleTable columns={['Task', 'Estimated', 'Actual']}
                rows={(charts?.scatter || []).map(p => [p.title, `${p.est} h`, `${p.actual} h`])} />}
            >
              <EffortScatter points={charts?.scatter || []} />
            </ChartFrame>

            <ChartFrame
              title="Overdue task aging"
              subtitle="Working days past the due date, so a weekend does not age a task"
              table={<SimpleTable columns={['Age', 'Tasks']} rows={(charts?.aging || []).map(a => [a.label, a.n])} />}
            >
              <Columns rows={charts?.aging || []} />
            </ChartFrame>
          </div>

          <div className="tp-card flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-2xl tracking-[-0.02em]">Task tracker</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter tasks">
                {FILTERS.map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setParam({ status: v })}
                    aria-pressed={filter === v}
                    className="h-11 px-4 rounded-full text-[13px] border"
                    style={filter === v
                      ? { background: 'var(--tp-navy)', color: '#fff', borderColor: 'var(--tp-navy)' }
                      : { background: '#fff', color: 'var(--tp-navy)', borderColor: '#dfe3ea' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {tasks?.tasks.length === 0 ? (
              <TpEmpty title="No tasks match this filter" body="Clear the filter to see everything." />
            ) : (
              <>
              {/* Phones get a card list; the eight-column table needs 900px
                  and would push status and effort off-screen. */}
              <ul className="tp-cards-narrow flex-col gap-3 m-0 p-0 list-none">
                {(tasks?.tasks || []).map(task => (
                  <li key={task.id} className="rounded-3xl p-4 flex flex-col gap-2"
                    style={{ background: 'var(--tp-paper)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/tp/tasks/${task.id}`} className="text-sm">{task.title}</Link>
                      <TaskStatus task={task} />
                    </div>
                    <p className="m-0 text-xs" style={{ color: 'var(--tp-muted)' }}>
                      {task.ownerName || 'Unassigned'}{task.projectName ? ` · ${task.projectName}` : ''}
                      {task.dueDate ? ` · due ${shortDate(task.dueDate)}` : ''}
                    </p>
                    <p className="m-0 text-xs tabular-nums" style={{ color: 'var(--tp-muted)' }}>
                      {task.progressPct}% ·{' '}
                      {task.estHours == null && task.actualHours == null
                        ? 'no estimate'
                        : `${task.estHours ?? DASH} / ${task.actualHours ?? DASH} h`}
                      {task.reopenedCount > 0 ? ` · reopened ${task.reopenedCount}×` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="tp-table-wide overflow-x-auto">
                <table className="w-full border-collapse min-w-[900px]">
                  <caption className="sr-only">Tasks</caption>
                  <thead>
                    <tr>
                      {['Task', 'Owner', 'Project', 'Due', 'Progress', 'Est / actual', 'Reopened', 'Status'].map(h => (
                        <th key={h} scope="col" className="tp-label text-left font-normal pb-3 px-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(tasks?.tasks || []).map(task => (
                      <tr key={task.id}>
                        <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                          <Link to={`/tp/tasks/${task.id}`}>{task.title}</Link>
                        </td>
                        <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                          {task.ownerId
                            ? <Link to={`/tp/people/${task.ownerId}`}>{task.ownerName}</Link>
                            : <span style={{ color: 'var(--tp-muted)' }}>Unassigned</span>}
                        </td>
                        <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>{task.projectName || DASH}</td>
                        <td className="border-t px-3 py-3 text-sm whitespace-nowrap" style={{ borderColor: 'var(--tp-line)' }}>
                          {shortDate(task.dueDate)}
                        </td>
                        <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                          <span className="flex items-center gap-2">
                            <span className="w-24 h-1.5 rounded-full" style={{ background: 'var(--tp-track)' }}>
                              <span className="block h-1.5 rounded-full"
                                style={{ width: `${task.progressPct}%`, background: 'var(--tp-cat-1)' }} />
                            </span>
                            <span className="text-xs tabular-nums" style={{ color: 'var(--tp-muted)' }}>{task.progressPct}%</span>
                          </span>
                        </td>
                        <td className="border-t px-3 py-3 text-sm tabular-nums" style={{ borderColor: 'var(--tp-line)' }}>
                          {task.estHours == null && task.actualHours == null
                            ? DASH
                            : `${task.estHours ?? DASH} / ${task.actualHours ?? DASH} h`}
                        </td>
                        <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                          {task.reopenedCount > 0 ? `${task.reopenedCount}×` : 'No'}
                        </td>
                        <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                          <TaskStatus task={task} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}

            {pages > 1 && (
              <nav className="flex items-center justify-between pt-2" aria-label="Pagination">
                <button type="button" className="tp-btn-ghost" disabled={page <= 1}
                  onClick={() => setParam({ page: String(page - 1) })}>Previous</button>
                <span className="text-sm" style={{ color: 'var(--tp-muted)' }}>Page {page} of {pages}</span>
                <button type="button" className="tp-btn-ghost" disabled={page >= pages}
                  onClick={() => setParam({ page: String(page + 1) })}>Next</button>
              </nav>
            )}
          </div>
        </>
      )}
    </TpLayout>
  )
}

/** Status carries a glyph and a word, so it survives greyscale and colour
 *  blindness. Overdue is derived here, not stored. */
function TaskStatus({ task }) {
  const overdue = task.dueDate && task.status !== 'done' && task.status !== 'cancelled'
    && task.dueDate < new Date().toISOString().slice(0, 10)
  const tone = overdue ? 'bad' : task.status === 'blocked' ? 'warn' : task.status === 'done' ? 'ok' : 'info'
  const style = {
    bad: { background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)', glyph: '■' },
    warn: { background: 'var(--tp-warn-bg)', color: 'var(--tp-warn-fg)', glyph: '▲' },
    ok: { background: 'var(--tp-ok-bg)', color: 'var(--tp-ok-fg)', glyph: '●' },
    info: { background: 'var(--tp-info-bg)', color: 'var(--tp-info-fg)', glyph: '○' },
  }[tone]
  return (
    <span className="tp-pill" style={{ background: style.background, color: style.color }}
      title={task.blockedReason || undefined}>
      <span aria-hidden="true">{style.glyph}</span>
      {overdue ? 'Overdue' : STATUS_LABEL[task.status]}
    </span>
  )
}

/** Compares a value with its target in the direction that counts as good. */
function tone(value, target, good) {
  if (value == null || target == null) return 'plain'
  const meets = good === 'above' ? value >= target : value <= target
  return meets ? 'ok' : 'bad'
}
