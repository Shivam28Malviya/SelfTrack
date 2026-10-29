import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import { TpLoading, TpEmpty, TpError } from '../../components/tp/States'
import { tpGet } from '../../lib/tpApi'

/**
 * The audit trail.
 *
 * Quick log promises entries are audited; without somewhere to read the trail
 * that promise is unverifiable. Reads of another person's record appear here
 * too, as `read.*` actions.
 */
export default function TpAudit() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  const page = Number(params.get('page') || '1') || 1

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await tpGet('/audit', { personId: params.get('personId'), action: params.get('action'), page: params.get('page') })
    if (!res.success) { setError(res.error); setData(null) } else setData(res)
    setLoading(false)
  }, [params])

  useEffect(() => { load() }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <TpLayout title="Audit trail">
      <section className="tp-panel">
        <Link to="/tp/entries" className="text-sm hover:opacity-70">← Entries</Link>
        <h1 className="tp-h1 mt-3">Audit trail</h1>
        <p className="mt-2 m-0 text-base max-w-[680px]" style={{ color: 'var(--tp-muted)' }}>
          Every create, edit and deletion, and every read of another person's
          record. {data ? `${data.total} events.` : ''}
        </p>
      </section>

      {loading && <TpLoading label="Loading the audit trail" rows={8} />}
      {!loading && error && <TpError error={error} onRetry={load} />}
      {!loading && !error && data?.entries.length === 0 && (
        <TpEmpty title="Nothing recorded yet" body="Audit rows appear as soon as anyone logs or reads something." />
      )}

      {!loading && !error && data?.entries.length > 0 && (
        <div className="tp-card overflow-x-auto">
          <table className="w-full border-collapse min-w-[720px]">
            <caption className="sr-only">Audit events</caption>
            <thead>
              <tr>
                {['When', 'Who', 'Action', 'Entity', ''].map(h => (
                  <th key={h} scope="col" className="tp-label text-left font-normal pb-3 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.entries.map(row => (
                <Fragment key={row.id}>
                  <tr>
                    <td className="border-t px-3 py-3 text-sm whitespace-nowrap" style={{ borderColor: 'var(--tp-line)' }}>
                      {new Date(row.ts).toLocaleString()}
                    </td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>{row.actorName}</td>
                    <td className="border-t px-3 py-3 text-sm font-mono text-xs" style={{ borderColor: 'var(--tp-line)' }}>{row.action}</td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                      {row.entity}{row.entityId ? ` #${row.entityId}` : ''}
                    </td>
                    <td className="border-t px-3 py-3 text-sm" style={{ borderColor: 'var(--tp-line)' }}>
                      {(row.before || row.after) && (
                        <button type="button" className="tp-btn-ghost"
                          aria-expanded={open === row.id}
                          onClick={() => setOpen(open === row.id ? null : row.id)}>
                          {open === row.id ? 'Hide' : 'What changed'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === row.id && (
                    <tr>
                      <td colSpan={5} className="border-t px-3 py-3" style={{ borderColor: 'var(--tp-line)' }}>
                        <div className="grid gap-4 md:grid-cols-2 text-xs font-mono">
                          <div>
                            <p className="tp-label m-0 mb-1">Before</p>
                            <pre className="m-0 whitespace-pre-wrap">{row.before ? JSON.stringify(row.before, null, 2) : '—'}</pre>
                          </div>
                          <div>
                            <p className="tp-label m-0 mb-1">After</p>
                            <pre className="m-0 whitespace-pre-wrap">{row.after ? JSON.stringify(row.after, null, 2) : '—'}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="tp-card py-4 flex items-center justify-between" aria-label="Pagination">
          <button type="button" className="tp-btn-ghost" disabled={page <= 1}
            onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set('page', String(page - 1)); return n }, { replace: true })}>
            Previous
          </button>
          <span className="text-sm" style={{ color: 'var(--tp-muted)' }}>Page {page} of {pages}</span>
          <button type="button" className="tp-btn-ghost" disabled={page >= pages}
            onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set('page', String(page + 1)); return n }, { replace: true })}>
            Next
          </button>
        </nav>
      )}
    </TpLayout>
  )
}
