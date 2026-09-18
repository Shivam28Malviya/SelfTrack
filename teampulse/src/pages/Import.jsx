import { useState } from 'react'
import { Link } from 'react-router-dom'
import TpLayout from '../components/tp/TpLayout'
import { tpPost } from '../lib/tpApi'

const TEMPLATE = [
  'name,email,designation,working_from,region,project,manager_email,total_exp_years,relevant_exp_years,joined_on',
  'Priya D.,priya@example.com,Senior Consultant,Client site,IN,Unilever NA,manager@example.com,8.4,6.1,2023-06-01',
].join('\r\n')

/**
 * Bulk import.
 *
 * Always a dry run first, and nothing is written unless every row validates.
 * A half-imported team costs more to clean up than a rejected file.
 */
export default function TpImport() {
  const [csv, setCsv] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  const run = async (commit) => {
    setBusy(true)
    setError('')
    const res = await tpPost('/people/import', { csv, commit })
    setBusy(false)
    if (!res.success) { setError(res.error); setResult(null); return }
    setResult(res)
    if (commit) setDone(res.committed)
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsv(await file.text())
    setResult(null)
    setDone(0)
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'teampulse-people-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const badRows = result?.results?.filter(r => r.errors.length > 0) ?? []

  return (
    <TpLayout title="Import people">
      <section className="tp-panel">
        <Link to="/people" className="text-sm hover:opacity-70">← People</Link>
        <h1 className="tp-h1 mt-3">Import people</h1>
        <p className="mt-2 m-0 text-base max-w-[640px]" style={{ color: 'var(--tp-muted)' }}>
          A CSV with a header row. <code>name</code> and <code>designation</code> are
          required; everything else is optional. Managers must already exist, so
          import them first.
        </p>
        <button type="button" className="tp-btn-ghost mt-4" onClick={download}>
          Download the template
        </button>
      </section>

      <div className="tp-card flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="tp-label">CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="tp-label">Or paste the rows</span>
          <textarea
            className="tp-field h-40 py-3 font-mono text-xs"
            value={csv}
            onChange={(e) => { setCsv(e.target.value); setResult(null); setDone(0) }}
            placeholder={TEMPLATE}
          />
        </label>

        {error && (
          <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="alert"
            style={{ background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)' }}>{error}</p>
        )}

        {result && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm">
              {result.rows} rows read · {result.valid} valid · {result.invalid} with problems
              {done > 0 && ` · ${done} imported`}
            </p>

            {badRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm min-w-[520px]">
                  <thead>
                    <tr>
                      {['Line', 'Name', 'Problem'].map(h => (
                        <th key={h} scope="col" className="tp-label text-left font-normal pb-2 px-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tp-rows tp-stagger">
                    {badRows.map(r => (
                      <tr key={r.line}>
                        <td className="border-t px-2 py-2" style={{ borderColor: 'var(--tp-line)' }}>{r.line}</td>
                        <td className="border-t px-2 py-2" style={{ borderColor: 'var(--tp-line)' }}>{r.name || '—'}</td>
                        <td className="border-t px-2 py-2" style={{ borderColor: 'var(--tp-bad-fg)', color: 'var(--tp-bad-fg)' }}>
                          {r.errors.join(' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.invalid > 0 && (
              <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
                Nothing has been imported. Fix the rows above and check again.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3 justify-end">
          <button type="button" className="tp-btn-ghost" disabled={!csv.trim() || busy} onClick={() => run(false)}>
            {busy ? 'Checking…' : 'Check the file'}
          </button>
          <button
            type="button"
            className="tp-btn"
            disabled={busy || !result || result.invalid > 0 || result.valid === 0 || done > 0}
            onClick={() => run(true)}
          >
            {done > 0 ? `Imported ${done}` : `Import ${result?.valid ?? 0} people`}
          </button>
        </div>
      </div>
    </TpLayout>
  )
}
