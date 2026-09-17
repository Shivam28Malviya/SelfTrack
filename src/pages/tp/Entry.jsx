import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import { tpGet, tpPost } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'
import { shortDate } from '../../lib/tpFormat'

const TYPES = [
  { id: 'absence', label: 'Absence', hint: 'Planned, unplanned or sick', title: 'Log an absence' },
  { id: 'late', label: 'Late login', hint: 'Login time; minutes are worked out', title: 'Log a late login' },
  { id: 'feedback', label: 'Client feedback', hint: 'Score and comment', title: 'Add feedback' },
  { id: 'achievement', label: 'Achievement', hint: 'Appreciation or award', title: 'Add an achievement' },
  { id: 'overtime', label: 'Overtime', hint: 'Extra hours worked', title: 'Log overtime' },
]

const today = () => new Date().toISOString().slice(0, 10)

const BLANK = {
  personId: '', date: today(), type: 'unplanned', days: 1, force: false,
  loginTime: '', source: 'client', score: 4, projectId: '', title: '',
  hours: 2, note: '',
}

/** Mirrors the server rules so the caller is told before the round trip. The
 *  server re-checks every one of these. */
function validate(kind, f) {
  const e = {}
  if (!f.personId) e.personId = 'Choose a team member.'
  if (!f.date) e.date = 'Choose a date.'
  else if (kind !== 'absence' && f.date > today()) e.date = 'That date is in the future.'

  if (kind === 'absence') {
    const d = Number(f.days)
    if (!Number.isInteger(d) || d < 1 || d > 30) e.days = 'Between 1 and 30 days.'
  }
  if (kind === 'late') {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(f.loginTime)) e.loginTime = 'A 24-hour time, such as 10:20.'
  }
  if (kind === 'feedback') {
    const s = Number(f.score)
    if (!Number.isInteger(s) || s < 1 || s > 5) e.score = 'A whole number from 1 to 5.'
    if (f.source === 'client' && !f.projectId) e.projectId = 'Client feedback needs a project.'
    if (f.date < new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)) {
      e.date = 'Feedback older than 12 months cannot be added.'
    }
  }
  if (kind === 'achievement' && (!f.title || f.title.trim().length < 3)) {
    e.title = 'Describe the achievement in at least 3 characters.'
  }
  if (kind === 'overtime') {
    const h = Number(f.hours)
    if (!Number.isFinite(h) || h < 0.5 || h > 16) e.hours = 'Between 0.5 and 16 hours.'
  }
  return e
}

export default function TpEntry() {
  const [params, setParams] = useSearchParams()
  const { config } = useTp()
  const kind = TYPES.some(t => t.id === params.get('type')) ? params.get('type') : 'absence'

  const [form, setForm] = useState(() => ({ ...BLANK, personId: params.get('personId') || '' }))
  const [people, setPeople] = useState([])
  const [projects, setProjects] = useState([])
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  const [result, setResult] = useState('')
  const [conflict, setConflict] = useState(null)
  const [touched, setTouched] = useState({})

  const errors = useMemo(() => validate(kind, form), [kind, form])
  const showError = (k) => (touched[k] || touched.__submit) && errors[k]

  useEffect(() => {
    tpGet('/people', { limit: 100 }).then(r => r.success && setPeople(r.people))
    tpGet('/projects').then(r => r.success && setProjects(r.projects))
  }, [])

  const person = people.find(p => String(p.id) === String(form.personId))
  const shift = person && config?.workday?.shift_start?.[person.region]
  const grace = config?.workday?.grace_minutes

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [k]: v }))
    setTouched(t => ({ ...t, [k]: true }))
    setResult('')
    setConflict(null)
  }

  const pickType = (id) => {
    setParams(id === 'absence' ? {} : { type: id }, { replace: true })
    setResult('')
    setServerError('')
    setConflict(null)
    setTouched({})
  }

  const send = async (extra = {}) => {
    setBusy(true)
    setServerError('')
    const res = await tpPost(`/entries/${kind}`, { ...form, ...extra })
    setBusy(false)

    if (res.conflict) { setConflict(res); return }
    if (!res.success) { setServerError(res.error); return }

    setConflict(null)
    setResult(res.message || 'Saved.')
    // Keep the person and date: entries usually arrive in runs.
    setForm(f => ({ ...BLANK, personId: f.personId, date: f.date }))
    setTouched({})
  }

  const submit = (e) => {
    e.preventDefault()
    setTouched(t => ({ ...t, __submit: true }))
    if (Object.keys(errors).length > 0) return
    send()
  }

  const active = TYPES.find(t => t.id === kind)

  return (
    <TpLayout title="Quick log">
      <div className="grid gap-5 lg:grid-cols-[360px_1fr] items-start">
        <section className="tp-panel flex flex-col gap-5">
          <Link to="/tp" className="text-sm hover:opacity-70">← Overview</Link>
          <h1 className="tp-h1">Quick log</h1>
          <p className="m-0 text-base leading-relaxed" style={{ color: 'var(--tp-muted)' }}>
            Record something the moment it happens. Every entry is audited and
            can be corrected from the <Link to="/tp/entries" className="underline">entry list</Link>.
          </p>
          <div className="flex flex-col gap-2">
            {TYPES.map(t => {
              const on = t.id === kind
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickType(t.id)}
                  aria-pressed={on}
                  className="text-left flex items-center justify-between gap-3 px-5 py-4 rounded-[22px] border"
                  style={on
                    ? { background: 'var(--tp-navy)', color: '#fff', borderColor: 'var(--tp-navy)' }
                    : { background: 'rgba(255,255,255,0.6)', color: 'var(--tp-navy)', borderColor: 'rgba(255,255,255,0.8)' }}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-base">{t.label}</span>
                    <span className="text-xs opacity-80">{t.hint}</span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              )
            })}
          </div>
        </section>

        <form className="tp-card flex flex-col gap-6" onSubmit={submit} noValidate>
          <div>
            <p className="tp-label m-0">New entry</p>
            <p className="text-2xl mt-1 m-0">{active.title}</p>
          </div>

          {serverError && (
            <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="alert"
              style={{ background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)' }}>{serverError}</p>
          )}
          {result && (
            <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="status"
              style={{ background: 'var(--tp-ok-bg)', color: 'var(--tp-ok-fg)' }}>{result}</p>
          )}

          {conflict && (
            <div className="rounded-2xl px-4 py-4 flex flex-col gap-3" role="alertdialog"
              style={{ background: 'var(--tp-warn-bg)', color: 'var(--tp-warn-fg)' }}>
              <p className="m-0 text-sm">{conflict.message}</p>
              <ul className="m-0 pl-5 text-sm">
                {(conflict.existing || []).map(x => (
                  <li key={x.date}>{shortDate(x.date)} — currently {x.type}</li>
                ))}
              </ul>
              <p className="m-0 text-xs">
                Overwriting keeps the previous value in the audit trail.
              </p>
              <div className="flex gap-3 justify-end">
                <button type="button" className="tp-btn-ghost" onClick={() => setConflict(null)}>Keep what is there</button>
                <button type="button" className="tp-btn" onClick={() => send({ overwrite: true })}>Overwrite</button>
              </div>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Team member" error={showError('personId')} required>
              <select className="tp-field" value={form.personId} onChange={set('personId')}>
                <option value="">Choose…</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <Field label="Date" error={showError('date')} required>
              <input className="tp-field" type="date" value={form.date} onChange={set('date')}
                max={kind === 'absence' ? undefined : today()} />
            </Field>

            {kind === 'absence' && (
              <>
                <Field label="Type" required>
                  <select className="tp-field" value={form.type} onChange={set('type')}>
                    <option value="unplanned">Unplanned</option>
                    <option value="planned">Planned</option>
                    <option value="sick">Sick</option>
                  </select>
                </Field>
                <Field label="Days" error={showError('days')}
                  hint="Weekends and holidays in the range are skipped.">
                  <input className="tp-field" type="number" min="1" max="30" step="1"
                    value={form.days} onChange={set('days')} />
                </Field>
                <Field label="Non-working day">
                  <label className="flex items-center gap-2 h-12 text-sm">
                    <input type="checkbox" checked={form.force} onChange={set('force')} />
                    Log anyway
                  </label>
                </Field>
              </>
            )}

            {kind === 'late' && (
              <>
                <Field label="Login time" error={showError('loginTime')} required
                  hint={shift ? `Shift starts at ${shift}${grace ? `, with ${grace} minutes of grace` : ''}.` : 'Choose a person to see their shift start.'}>
                  <input className="tp-field" type="time" value={form.loginTime} onChange={set('loginTime')} />
                </Field>
                <Field label="Minutes late" hint="Worked out from the login time and the shift start, so the two cannot disagree.">
                  <input className="tp-field" value={derivedLate(form.loginTime, shift, grace)} readOnly disabled />
                </Field>
              </>
            )}

            {kind === 'feedback' && (
              <>
                <Field label="Source" required>
                  <select className="tp-field" value={form.source} onChange={set('source')}>
                    <option value="client">Client</option>
                    <option value="peer">Peer</option>
                    <option value="leadership">Leadership</option>
                  </select>
                </Field>
                <Field label="Score (1 to 5)" error={showError('score')} required>
                  <input className="tp-field" type="number" min="1" max="5" step="1"
                    value={form.score} onChange={set('score')} />
                </Field>
                <Field label="Project" error={showError('projectId')}
                  hint={form.source === 'client' ? 'Required for client feedback.' : 'Optional.'}>
                  <select className="tp-field" value={form.projectId} onChange={set('projectId')}>
                    <option value="">No project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              </>
            )}

            {kind === 'achievement' && (
              <>
                <Field label="Achievement" error={showError('title')} required>
                  <input className="tp-field" value={form.title} onChange={set('title')} />
                </Field>
                <Field label="From" required>
                  <select className="tp-field" value={form.source} onChange={set('source')}>
                    <option value="client">Client</option>
                    <option value="peer">Peer</option>
                    <option value="leadership">Leadership</option>
                  </select>
                </Field>
              </>
            )}

            {kind === 'overtime' && (
              <Field label="Hours" error={showError('hours')} required
                hint="This is the only source of overtime data, so the team figure counts how many people have any recorded.">
                <input className="tp-field" type="number" min="0.5" max="16" step="0.5"
                  value={form.hours} onChange={set('hours')} />
              </Field>
            )}
          </div>

          <Field label={kind === 'feedback' ? 'Comment' : 'Note'}
            hint={kind === 'late' ? 'Required if more than four hours late.' : 'Optional.'}>
            <textarea className="tp-field h-24 py-3" value={form.note} onChange={set('note')} />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="m-0 text-xs max-w-[420px]" style={{ color: 'var(--tp-muted)' }}>
              Recorded against this person and visible to them. Every entry,
              edit and deletion is kept in the audit trail.
            </p>
            <button type="submit" className="tp-btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save entry'}
            </button>
          </div>
        </form>
      </div>
    </TpLayout>
  )
}

/** Local preview of what the server will compute; the server value wins. */
function derivedLate(loginTime, shift, grace) {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(loginTime || '') || !shift) return '—'
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const late = Math.max(0, mins(loginTime) - mins(shift) - Number(grace || 0))
  return late === 0 ? 'Not late' : `${late} min`
}

function Field({ label, hint, error, required, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="tp-label">{label}{required && <span aria-hidden="true"> *</span>}</span>
      {children}
      {error
        ? <span className="text-xs" role="alert" style={{ color: 'var(--tp-bad-fg)' }}>{error}</span>
        : hint && <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>{hint}</span>}
    </label>
  )
}
