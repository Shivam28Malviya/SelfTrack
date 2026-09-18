import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TpLayout from '../components/tp/TpLayout'
import { TpLoading, TpEmpty, TpError } from '../components/tp/States'
import { tpGet, tpPut, tpDelete } from '../lib/tpApi'
import { useTp } from '../context/TpContext'
import { shortDate } from '../lib/tpFormat'

const KINDS = [
  ['', 'Everything'],
  ['attendance', 'Attendance'],
  ['feedback', 'Feedback'],
  ['achievement', 'Achievements'],
  ['overtime', 'Overtime'],
]

/**
 * The entry list, so a mistyped entry can be found and corrected.
 *
 * Correcting an entry is the whole point: a log you cannot fix quietly turns
 * into a log nobody trusts, and then nobody uses.
 */
export default function TpEntries() {
  const { role } = useTp()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [actionError, setActionError] = useState('')

  const canEdit = role === 'admin' || role === 'manager'
  const kind = params.get('kind') || ''
  const page = Number(params.get('page') || '1') || 1

  const setParam = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) { if (!v) next.delete(k); else next.set(k, v) }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await tpGet('/entries', {
      kind: params.get('kind'),
      personId: params.get('personId'),
      from: params.get('from'),
      to: params.get('to'),
      page: params.get('page'),
    })
    if (!res.success) { setError(res.error); setData(null) } else setData(res)
    setLoading(false)
  }, [params])

  useEffect(() => { load() }, [load])

  const save = async (entry, patch) => {
    setActionError('')
    const res = await tpPut(`/entries/${entry.kind}/${entry.id}`, patch)
    if (!res.success) { setActionError(res.error); return }
    setEditing(null)
    load()
  }

  const remove = async (entry) => {
    setActionError('')
    const res = await tpDelete(`/entries/${entry.kind}/${entry.id}`)
    setConfirming(null)
    if (!res.success) { setActionError(res.error); return }
    load()
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <TpLayout title="Entries">
      <section className="tp-panel flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="tp-h1">Entries</h1>
            <p className="mt-1.5 m-0 text-base" style={{ color: 'var(--tp-muted)' }}>
              Everything recorded in the last 90 days, newest first.
            </p>
          </div>
          <div className="flex gap-3">
            {canEdit && <Link to="/entry" className="tp-btn">Quick log</Link>}
            {canEdit && <Link to="/audit" className="tp-btn-ghost">Audit trail</Link>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="tp-label">Kind</span>
            <select className="tp-field" value={kind} onChange={e => setParam({ kind: e.target.value })}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="tp-label">From</span>
            <input className="tp-field" type="date" value={params.get('from') || ''}
              onChange={e => setParam({ from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="tp-label">To</span>
            <input className="tp-field" type="date" value={params.get('to') || ''}
              onChange={e => setParam({ to: e.target.value })} />
          </label>
        </div>
      </section>

      {actionError && (
        <p className="tp-card m-0 py-4 text-sm" role="alert" style={{ color: 'var(--tp-bad-fg)' }}>{actionError}</p>
      )}

      {loading && <TpLoading label="Loading entries" rows={6} />}
      {!loading && error && <TpError error={error} onRetry={load} />}
      {!loading && !error && data?.entries.length === 0 && (
        <TpEmpty title="No entries in this range" body="Widen the dates, or clear the kind filter." />
      )}

      {!loading && !error && data?.entries.length > 0 && (
        <div className="tp-card overflow-x-auto">
          <table className="w-full border-collapse min-w-[760px]">
            <caption className="sr-only">Recorded entries</caption>
            <thead>
              <tr>
                {['Date', 'Person', 'Kind', 'Detail', 'Note', ''].map(h => (
                  <th key={h} scope="col" className="tp-label text-left font-normal pb-3 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tp-rows tp-stagger">
              {data.entries.map(entry => {
                const key = `${entry.kind}-${entry.id}`
                const isEditing = editing?.key === key
                return (
                  <tr key={key}>
                    <td className="border-t px-3 py-3 text-sm whitespace-nowrap" style={{ borderColor: 'var(--tp-line)' }}>
                      {shortDate(entry.date)}
                    </td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                      <Link to={`/people/${entry.personId}`}>{entry.personName}</Link>
                    </td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                      {entry.kind} · {entry.label}
                    </td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                      {isEditing
                        ? <input className="tp-field h-10" value={editing.value}
                            onChange={e => setEditing({ ...editing, value: e.target.value })} />
                        : (entry.detail || '—')}
                    </td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                      {isEditing
                        ? <input className="tp-field h-10" value={editing.note}
                            onChange={e => setEditing({ ...editing, note: e.target.value })} />
                        : (entry.note || '—')}
                    </td>
                    <td className="border-t px-3 py-3 text-sm whitespace-nowrap" style={{ borderColor: 'var(--tp-line)' }}>
                      {canEdit && (isEditing ? (
                        <span className="flex gap-2">
                          <button type="button" className="tp-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                          <button type="button" className="tp-btn"
                            onClick={() => save(entry, patchFor(entry, editing))}>Save</button>
                        </span>
                      ) : (
                        <span className="flex gap-2">
                          <button type="button" className="tp-btn-ghost"
                            onClick={() => setEditing({ key, value: rawValue(entry), note: entry.note })}>
                            Edit
                          </button>
                          <button type="button" className="tp-btn-ghost" onClick={() => setConfirming(entry)}>Delete</button>
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirming && (
        <div className="tp-card flex flex-col gap-3" role="alertdialog" aria-label="Confirm deletion">
          <p className="m-0 text-lg">
            Delete the {confirming.kind} entry for {confirming.personName} on {shortDate(confirming.date)}?
          </p>
          <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
            The entry is removed from reports. Its previous value stays in the
            audit trail, which becomes the only record of it.
          </p>
          <div className="flex gap-3 justify-end">
            <button type="button" className="tp-btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
            <button type="button" className="tp-btn" onClick={() => remove(confirming)}>Delete</button>
          </div>
        </div>
      )}

      {pages > 1 && (
        <nav className="tp-card py-4 flex items-center justify-between" aria-label="Pagination">
          <button type="button" className="tp-btn-ghost" disabled={page <= 1}
            onClick={() => setParam({ page: String(page - 1) })}>Previous</button>
          <span className="text-sm" style={{ color: 'var(--tp-muted)' }}>Page {page} of {pages}</span>
          <button type="button" className="tp-btn-ghost" disabled={page >= pages}
            onClick={() => setParam({ page: String(page + 1) })}>Next</button>
        </nav>
      )}
    </TpLayout>
  )
}

/** The editable value differs per kind; the detail column is a rendered
 *  string, so the raw value is recovered from it for editing. */
function rawValue(entry) {
  if (entry.kind === 'feedback') return String(parseInt(entry.detail, 10) || '')
  if (entry.kind === 'overtime') return String(parseFloat(entry.detail) || '')
  if (entry.kind === 'achievement') return entry.detail
  return entry.label
}

function patchFor(entry, edit) {
  if (entry.kind === 'feedback') return { score: Number(edit.value), comment: edit.note }
  if (entry.kind === 'overtime') return { hours: Number(edit.value), note: edit.note }
  if (entry.kind === 'achievement') return { title: edit.value, note: edit.note }
  return { type: edit.value, note: edit.note }
}
