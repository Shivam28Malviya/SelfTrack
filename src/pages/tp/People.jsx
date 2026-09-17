import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import StatusPill from '../../components/tp/StatusPill'
import { TpLoading, TpEmpty, TpError } from '../../components/tp/States'
import { tpGet } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'
import { years, initialsOf, DASH } from '../../lib/tpFormat'

const DESIGNATIONS = ['All', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst']
const LOCATIONS = ['All', 'Client site', 'Office', 'Home']

export default function TpPeople() {
  const { role } = useTp()
  // Filters live in the URL so a manager can share or bookmark a view, and so
  // the back button returns to the list they were looking at.
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const get = (k, dflt = '') => params.get(k) ?? dflt
  const view = get('view', 'table')
  const page = Number(get('page', '1')) || 1

  const setParam = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === 'All') next.delete(k)
      else next.set(k, v)
    }
    // Any filter change resets paging; page 7 of a narrower result set is
    // usually empty.
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await tpGet('/people', {
      q: params.get('q'),
      designation: params.get('designation'),
      projectId: params.get('projectId'),
      location: params.get('location'),
      sort: params.get('sort'),
      page: params.get('page'),
    })
    if (!res.success) { setError(res.error); setData(null) }
    else setData(res)
    setLoading(false)
  }, [params])

  useEffect(() => { load() }, [load])
  useEffect(() => { tpGet('/projects').then(r => r.success && setProjects(r.projects)) }, [])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <TpLayout title="People">
      <section className="tp-panel flex flex-col gap-5">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <h1 className="tp-h1">People</h1>
            <p className="mt-1.5 m-0 text-base" style={{ color: 'var(--tp-muted)' }}>
              {data ? `${data.total} ${data.total === 1 ? 'person' : 'people'} you can see` : DASH}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          {(role === 'admin' || role === 'manager') && (
            <Link to="/tp/people/new" className="tp-btn">Add person</Link>
          )}
          {role === 'admin' && (
            <Link to="/tp/people/import" className="tp-btn-ghost">Import</Link>
          )}
          <div className="flex gap-1 p-1 rounded-full bg-white/60" role="group" aria-label="View">
            {['table', 'cards'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setParam({ view: v === 'table' ? '' : v })}
                aria-pressed={view === v}
                className="h-11 px-5 rounded-full text-sm capitalize"
                style={view === v
                  ? { background: 'var(--tp-navy)', color: '#fff' }
                  : { color: 'var(--tp-navy)' }}
              >
                {v}
              </button>
            ))}
          </div>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="tp-label">Search</span>
            <input
              className="tp-field"
              type="search"
              placeholder="Name or email"
              defaultValue={get('q')}
              onChange={(e) => setParam({ q: e.target.value.trim() })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="tp-label">Designation</span>
            <select className="tp-field" value={get('designation', 'All')} onChange={e => setParam({ designation: e.target.value })}>
              {DESIGNATIONS.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="tp-label">Project</span>
            <select className="tp-field" value={get('projectId')} onChange={e => setParam({ projectId: e.target.value })}>
              <option value="">All</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="tp-label">Working from</span>
            <select className="tp-field" value={get('location', 'All')} onChange={e => setParam({ location: e.target.value })}>
              {LOCATIONS.map(l => <option key={l}>{l}</option>)}
            </select>
          </label>
        </div>
      </section>

      {loading && <TpLoading label="Loading people" rows={6} />}
      {!loading && error && <TpError error={error} onRetry={load} />}

      {!loading && !error && data && data.people.length === 0 && (
        <TpEmpty
          title="No people match this view"
          body={
            data.total === 0 && !params.toString()
              ? 'Nobody has been added to TeamPulse yet. Import the team from a CSV, or add people one at a time.'
              : 'Try clearing a filter.'
          }
        />
      )}

      {!loading && !error && data && data.people.length > 0 && (
        <>
          {view === 'table' ? <PeopleTable people={data.people} /> : <PeopleCards people={data.people} />}

          {pages > 1 && (
            <nav className="flex items-center justify-between tp-card py-4" aria-label="Pagination">
              <button type="button" className="tp-btn-ghost" disabled={page <= 1}
                onClick={() => setParam({ page: String(page - 1) })}>
                Previous
              </button>
              <span className="text-sm" style={{ color: 'var(--tp-muted)' }}>Page {page} of {pages}</span>
              <button type="button" className="tp-btn-ghost" disabled={page >= pages}
                onClick={() => setParam({ page: String(page + 1) })}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </TpLayout>
  )
}

function PeopleTable({ people }) {
  return (
    // Horizontal scroll rather than a squashed table: nine columns do not fit
    // a laptop viewport, let alone a tablet.
    <div className="tp-card overflow-x-auto">
      <table className="w-full border-collapse min-w-[860px]">
        <caption className="sr-only">People you have access to</caption>
        <thead>
          <tr>
            {['Person', 'Experience', 'Project', 'Working from', 'Status', ''].map(h => (
              <th key={h} scope="col" className="tp-label text-left font-normal pb-3 px-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map(p => (
            <tr key={p.id}>
              <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                <Link to={`/tp/people/${p.id}`} className="flex items-center gap-3">
                  <span aria-hidden="true" className="w-9 h-9 rounded-full grid place-items-center text-[13px]"
                    style={{ background: 'var(--tp-scale-1)' }}>
                    {p.initials || initialsOf(p.name)}
                  </span>
                  <span className="flex flex-col">
                    <span>{p.name}</span>
                    <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>{p.designation}</span>
                  </span>
                </Link>
              </td>
              <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                <span className="flex flex-col">
                  <span>{years(p.totalExpYears)}</span>
                  <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>
                    {years(p.relevantExpYears)} relevant
                  </span>
                </span>
              </td>
              <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>{p.projectName || DASH}</td>
              <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>{p.workLocation}</td>
              <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                {/* Attention status needs delivery and attendance data, which
                    arrives in later phases. Until then it is honestly unknown. */}
                <StatusPill status={p.statusOverride} title={p.statusOverrideReason || 'No signals computed yet'} />
              </td>
              <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                <Link to={`/tp/people/${p.id}`} className="tp-btn-ghost">Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PeopleCards({ people }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      {people.map(p => (
        <Link key={p.id} to={`/tp/people/${p.id}`} className="tp-card flex flex-col gap-3 hover:opacity-90">
          <div className="flex justify-between items-start">
            <span aria-hidden="true" className="w-12 h-12 rounded-full grid place-items-center text-[15px]"
              style={{ background: 'var(--tp-scale-1)' }}>
              {p.initials || initialsOf(p.name)}
            </span>
            <StatusPill status={p.statusOverride} />
          </div>
          <span className="flex flex-col">
            <span className="text-lg">{p.name}</span>
            <span className="text-sm" style={{ color: 'var(--tp-muted)' }}>
              {p.designation} · {years(p.totalExpYears)}
            </span>
          </span>
          <span className="text-sm" style={{ color: 'var(--tp-muted)' }}>
            {(p.projectName || 'No project')} · {p.workLocation}
          </span>
        </Link>
      ))}
    </div>
  )
}
