import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import { TpLoading, TpError, TpEmpty } from '../../components/tp/States'
import { ChartFrame, SimpleTable } from '../../components/tp/charts/Primitives'
import { tpGet, tpPost } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'
import { shortDate, DASH } from '../../lib/tpFormat'

/**
 * A sequential ramp: one hue getting darker as the level rises. Level is a
 * magnitude, not four unrelated categories, and each cell also prints its
 * level, so the reading never depends on the fill alone.
 */
const RAMP = [
  // Not #6b7280: it measures 4.43:1 against this cell, just under AA.
  { bg: '#f3f5f8', fg: '#5f6672' },
  { bg: 'var(--tp-scale-1)', fg: 'var(--tp-ink)' },
  { bg: 'var(--tp-scale-2)', fg: 'var(--tp-ink)' },
  { bg: 'var(--tp-scale-3)', fg: '#10203f' },
  { bg: 'var(--tp-scale-4)', fg: '#ffffff' },
]

export default function TpSkills() {
  const { role, person, config } = useTp()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [certs, setCerts] = useState(null)
  const [matches, setMatches] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rateError, setRateError] = useState('')

  const skillQuery = params.get('skill') || ''
  const minLevel = params.get('minLevel') || '3'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [s, c] = await Promise.all([tpGet('/skills'), tpGet('/certs')])
    if (!s.success) { setError(s.error); setLoading(false); return }
    setData(s)
    setCerts(c.success ? c : null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const search = async (e) => {
    e.preventDefault()
    const res = await tpGet('/skills/find', { skill: skillQuery, minLevel })
    setMatches(res.success ? res.matches : [])
  }

  const rateSelf = async (skillId, level) => {
    setRateError('')
    const res = await tpPost('/skills/rate', { skillId, level, ratedBy: 'self' })
    if (!res.success) { setRateError(res.error); return }
    load()
  }

  if (loading) return <TpLayout title="Skills"><TpLoading label="Loading skills" rows={8} /></TpLayout>
  if (error) return <TpLayout title="Skills"><TpError error={error} onRetry={load} /></TpLayout>

  const levels = data.levels || []
  const target = config?.targets?.cert_target
  const myRow = person ? data.rows.find(r => r.personId === person.id) : null

  return (
    <TpLayout title="Skills">
      <section className="tp-panel flex flex-col gap-5">
        <div>
          <h1 className="tp-h1">Find the right person</h1>
          <p className="mt-1.5 m-0 text-base" style={{ color: 'var(--tp-muted)' }}>
            Searches manager ratings, which are the ones staffing decisions use.
          </p>
        </div>

        <form className="flex flex-wrap gap-3 items-end" onSubmit={search}>
          <label className="flex flex-col gap-1.5 grow min-w-[220px]">
            <span className="tp-label">Skill</span>
            <input className="tp-field" value={skillQuery} placeholder="MOCA, PL/SQL…"
              onChange={(e) => {
                const next = new URLSearchParams(params)
                if (e.target.value) next.set('skill', e.target.value); else next.delete('skill')
                setParams(next, { replace: true })
              }} />
          </label>
          <label className="flex flex-col gap-1.5 w-56">
            <span className="tp-label">Minimum level</span>
            <select className="tp-field" value={minLevel}
              onChange={(e) => {
                const next = new URLSearchParams(params)
                next.set('minLevel', e.target.value)
                setParams(next, { replace: true })
              }}>
              {levels.map((l, i) => <option key={i} value={i}>{`L${i} · ${l}`}</option>)}
            </select>
          </label>
          <button type="submit" className="tp-btn h-12" disabled={!skillQuery.trim()}>Search</button>
        </form>

        {matches != null && (
          matches.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              Nobody in your team is rated at that level for “{skillQuery}”. Either
              nobody has the skill, or nobody has been rated for it yet — the
              heatmap below shows which.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2.5 m-0 p-0 list-none text-sm">
              {matches.map(m => (
                <li key={`${m.personId}-${m.skill}`}>
                  <Link to={`/tp/people/${m.personId}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white">
                    <span>{m.name}</span>
                    <span style={{ color: 'var(--tp-muted)' }}>
                      L{m.level} · {m.freePct > 0 ? `${m.freePct}% free` : `fully allocated${m.project ? ` to ${m.project}` : ''}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      {rateError && (
        <p className="tp-card m-0 py-4 text-sm" role="alert" style={{ color: 'var(--tp-bad-fg)' }}>{rateError}</p>
      )}

      {data.skills.length === 0 ? (
        <TpEmpty
          title="The skill catalogue is empty"
          body="A heatmap needs skills to chart. An administrator adds them in Settings."
          action={role === 'admin' && <Link to="/tp/settings" className="tp-btn">Open settings</Link>}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr] items-start">
          <ChartFrame
            title="Skills heatmap"
            subtitle="Manager rating in the cell; a corner mark shows where the person rates themselves differently."
            table={<SimpleTable
              columns={['Person', ...data.skills.map(s => s.name)]}
              rows={data.rows.map(r => [r.name, ...r.cells.map(c => c.manager == null ? DASH : `L${c.manager}`)])}
            />}
          >
            {data.rows.length === 0 ? (
              <p className="m-0 py-8 text-center text-sm" style={{ color: 'var(--tp-muted)' }}>
                Nobody in scope to chart
              </p>
            ) : (
              <>
                <ul className="flex flex-wrap gap-3 m-0 mb-3 p-0 list-none text-xs" style={{ color: 'var(--tp-muted)' }}>
                  {levels.map((l, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="w-3 h-3 rounded" style={{ background: RAMP[i].bg }} />
                      L{i} {l}
                    </li>
                  ))}
                </ul>
                <div className="overflow-x-auto">
                  <table className="border-collapse w-full" style={{ minWidth: 140 + data.skills.length * 64 }}>
                    <caption className="sr-only">Skill levels by person</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="tp-label text-left font-normal pb-2 pr-3 sticky left-0 bg-white z-10">Person</th>
                        {data.skills.map(s => (
                          <th key={s.id} scope="col" className="tp-label font-normal pb-2 px-1 text-center">{s.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map(row => (
                        <tr key={row.personId}>
                          <th scope="row" className="text-left font-normal text-sm pr-3 py-1 sticky left-0 bg-white z-10">
                            <Link to={`/tp/people/${row.personId}`}>{row.name}</Link>
                          </th>
                          {row.cells.map(cell => {
                            const level = cell.manager
                            const style = RAMP[level ?? 0]
                            const gap = cell.self != null && cell.manager != null && cell.self !== cell.manager
                            return (
                              <td key={cell.skillId} className="p-1">
                                <span
                                  tabIndex={0}
                                  title={`${row.name} · ${data.skills.find(s => s.id === cell.skillId)?.name}: ${
                                    level == null ? 'not rated by a manager' : `L${level} ${levels[level]}`
                                  }${cell.self != null ? ` · self L${cell.self}` : ''}`}
                                  className="relative block h-10 rounded-[10px] grid place-items-center text-xs"
                                  style={{ background: style.bg, color: style.fg }}
                                >
                                  {level == null ? DASH : `L${level}`}
                                  {gap && (
                                    // A self rating that differs is the useful
                                    // signal, so it is marked rather than merged.
                                    <span aria-hidden="true"
                                      className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                                      style={{ background: 'var(--tp-cat-2)' }} />
                                  )}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </ChartFrame>

          <div className="flex flex-col gap-5">
            <ChartFrame
              title="Single points of failure"
              subtitle={`Skills with at most one active person rated L${3} or above by a manager`}
            >
              {data.spof.length === 0 ? (
                <p className="m-0 py-6 text-center text-sm" style={{ color: 'var(--tp-muted)' }}>
                  Every skill in the catalogue has cover
                </p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {data.spof.map(s => (
                    <li key={s.skillId} className="flex justify-between gap-3 px-4 py-3 rounded-2xl text-sm"
                      style={{ background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)' }}>
                      <span>{s.skill}</span>
                      <span>{s.capable === 0 ? 'nobody rated' : s.who}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartFrame>

            <ChartFrame title="Certifications" subtitle={target ? `Quarterly target ${target}` : undefined}>
              {!certs ? (
                <p className="m-0 py-6 text-center text-sm" style={{ color: 'var(--tp-muted)' }}>Not available</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl tracking-[-0.03em] tabular-nums">{certs.completedThisQuarter}</span>
                    <span className="text-base" style={{ color: 'var(--tp-muted)' }}>
                      completed since {shortDate(certs.quarterStart)}{target ? `, of ${target}` : ''}
                    </span>
                  </div>
                  {target > 0 && (
                    <div className="h-2.5 rounded-full" style={{ background: 'var(--tp-track)' }}>
                      <div className="h-2.5 rounded-full"
                        style={{
                          width: `${Math.min(100, (certs.completedThisQuarter / target) * 100)}%`,
                          background: 'var(--tp-cat-1)',
                        }} />
                    </div>
                  )}

                  <p className="tp-label m-0">Expiring within 90 days</p>
                  {certs.expiring.length === 0 ? (
                    <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>Nothing expiring soon</p>
                  ) : (
                    <ul className="m-0 p-0 list-none flex flex-col">
                      {certs.expiring.map(c => (
                        <li key={c.id} className="flex justify-between gap-3 py-2.5 border-t text-sm"
                          style={{ borderColor: 'var(--tp-line)' }}>
                          <span className="flex flex-col">
                            <span>{c.name}</span>
                            <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>{c.personName}</span>
                          </span>
                          <span style={{ color: 'var(--tp-warn-fg)' }}>
                            {c.daysToExpiry <= 0 ? 'expired' : `${c.daysToExpiry} days`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {certs.expired.length > 0 && (
                    <p className="m-0 text-xs" style={{ color: 'var(--tp-muted)' }}>
                      {certs.expired.length} already expired. A past expiry date flips
                      the status automatically, so nothing stays "completed" once it lapses.
                    </p>
                  )}
                </div>
              )}
            </ChartFrame>
          </div>
        </div>
      )}

      {myRow && (
        <div className="tp-card flex flex-col gap-4">
          <div>
            <span className="text-2xl tracking-[-0.02em]">Your own rating</span>
            <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              Your rating is stored separately from your manager's, so the gap
              between them stays visible. That gap is the point; neither
              overwrites the other.
            </p>
          </div>
          <ul className="grid gap-3 m-0 p-0 list-none sm:grid-cols-2 lg:grid-cols-3">
            {myRow.cells.map(cell => {
              const skill = data.skills.find(s => s.id === cell.skillId)
              return (
                <li key={cell.skillId} className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-sm">
                    <span>{skill?.name}</span>
                    <span style={{ color: 'var(--tp-muted)' }}>
                      manager {cell.manager == null ? DASH : `L${cell.manager}`}
                    </span>
                  </span>
                  <select
                    className="tp-field h-10"
                    value={cell.self ?? ''}
                    onChange={(e) => rateSelf(cell.skillId, Number(e.target.value))}
                  >
                    <option value="" disabled>Rate yourself…</option>
                    {levels.map((l, i) => <option key={i} value={i}>{`L${i} · ${l}`}</option>)}
                  </select>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </TpLayout>
  )
}
