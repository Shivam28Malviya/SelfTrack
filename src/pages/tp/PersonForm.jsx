import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import { TpLoading, TpError } from '../../components/tp/States'
import { tpGet, tpPost, tpPut } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'

const EMPTY = {
  name: '', email: '', designation: 'Consultant', workLocation: 'Office', region: 'IN',
  projectId: '', managerId: '', allocationPct: 100,
  totalExpYears: '', relevantExpYears: '', dateJoinedOrg: '', active: true,
}

/** Client-side mirror of the server rules, for immediate feedback only. The
 *  server re-checks all of it and is the authority. */
function validate(form) {
  const errors = {}
  if (!form.name || form.name.trim().length < 2) errors.name = 'Enter a name of at least 2 characters.'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'That email does not look right.'

  const total = form.totalExpYears === '' ? null : Number(form.totalExpYears)
  const relevant = form.relevantExpYears === '' ? null : Number(form.relevantExpYears)
  if (total != null && (!Number.isFinite(total) || total < 0 || total > 60)) errors.totalExpYears = 'Between 0 and 60 years.'
  if (relevant != null && (!Number.isFinite(relevant) || relevant < 0)) errors.relevantExpYears = 'Must be 0 or more.'
  if (total != null && relevant != null && relevant > total) {
    errors.relevantExpYears = 'Relevant experience cannot exceed total experience.'
  }

  const alloc = Number(form.allocationPct)
  if (!Number.isInteger(alloc) || alloc < 0 || alloc > 100) errors.allocationPct = 'A whole number between 0 and 100.'

  if (form.dateJoinedOrg && form.dateJoinedOrg > new Date().toISOString().slice(0, 10)) {
    errors.dateJoinedOrg = 'A joining date cannot be in the future.'
  }
  return errors
}

export default function TpPersonForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { role } = useTp()

  const [form, setForm] = useState(EMPTY)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [options, setOptions] = useState({ designations: [], locations: [], regions: [], managers: [] })
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [serverError, setServerError] = useState('')
  const [warning, setWarning] = useState('')
  const [touched, setTouched] = useState({})

  const errors = validate(form)
  const showError = (k) => (touched[k] || touched.__submit) && errors[k]

  useEffect(() => {
    tpGet('/options').then(r => r.success && setOptions(r))
    tpGet('/projects').then(r => r.success && setProjects(r.projects))
  }, [])

  useEffect(() => {
    if (!editing) return
    setLoading(true)
    tpGet(`/people/${id}`).then(r => {
      if (!r.success) { setLoadError(r.error); setLoading(false); return }
      const p = r.person
      setForm({
        name: p.name, email: p.email || '', designation: p.designation,
        workLocation: p.workLocation, region: p.region,
        projectId: p.projectId || '', managerId: p.managerId || '',
        allocationPct: p.allocationPct,
        totalExpYears: p.totalExpYears ?? '', relevantExpYears: p.relevantExpYears ?? '',
        dateJoinedOrg: p.dateJoinedOrg || '',
        active: p.active,
      })
      setUpdatedAt(p.updatedAt || null)
      setLoading(false)
    })
  }, [id, editing])

  const set = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setTouched(t => ({ ...t, [k]: true }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setTouched(t => ({ ...t, __submit: true }))
    setServerError('')
    setWarning('')
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    const body = { ...form, updatedAt }
    const res = editing ? await tpPut(`/people/${id}`, body) : await tpPost('/people', body)
    setSaving(false)

    if (!res.success) { setServerError(res.error); return }
    if (res.warning) setWarning(res.warning)
    navigate(`/tp/people/${res.person.id}`)
  }

  if (loading) return <TpLayout title="Person"><TpLoading label="Loading person" /></TpLayout>
  if (loadError) return <TpLayout title="Person"><TpError error={loadError} /></TpLayout>

  return (
    <TpLayout title={editing ? 'Edit person' : 'Add person'}>
      <section className="tp-panel">
        <Link to={editing ? `/tp/people/${id}` : '/tp/people'} className="text-sm hover:opacity-70">← Back</Link>
        <h1 className="tp-h1 mt-3">{editing ? 'Edit person' : 'Add person'}</h1>
        {role === 'manager' && !editing && (
          <p className="mt-2 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
            New people are added to your team unless you pick another manager from it.
          </p>
        )}
      </section>

      <form className="tp-card flex flex-col gap-6" onSubmit={submit} noValidate>
        {serverError && (
          <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="alert"
            style={{ background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)' }}>
            {serverError}
          </p>
        )}
        {warning && (
          <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="status"
            style={{ background: 'var(--tp-warn-bg)', color: 'var(--tp-warn-fg)' }}>
            {warning}
          </p>
        )}

        <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
          <Field label="Name" error={showError('name')} required>
            <input className="tp-field" value={form.name} onChange={set('name')} autoComplete="off" />
          </Field>

          <Field label="Email" error={showError('email')} hint="Optional. Used to match imports and to link a login.">
            <input className="tp-field" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
          </Field>

          <Field label="Designation" required>
            <select className="tp-field" value={form.designation} onChange={set('designation')}>
              {options.designations.map(d => <option key={d}>{d}</option>)}
            </select>
          </Field>

          <Field label="Working from" required>
            <select className="tp-field" value={form.workLocation} onChange={set('workLocation')}>
              {options.locations.map(l => <option key={l}>{l}</option>)}
            </select>
          </Field>

          <Field label="Region" hint="Sets the working calendar and shift start.">
            <select className="tp-field" value={form.region} onChange={set('region')}>
              {options.regions.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>

          <Field label="Project">
            <select className="tp-field" value={form.projectId} onChange={set('projectId')}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="Manager">
            <select className="tp-field" value={form.managerId} onChange={set('managerId')}>
              <option value="">No manager</option>
              {options.managers
                .filter(m => String(m.id) !== String(id))
                .map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>

          <Field label="Allocation %" error={showError('allocationPct')}>
            <input className="tp-field" type="number" min="0" max="100" step="1"
              value={form.allocationPct} onChange={set('allocationPct')} />
          </Field>

          <Field label="Total experience (years)" error={showError('totalExpYears')}>
            <input className="tp-field" type="number" min="0" max="60" step="0.1"
              value={form.totalExpYears} onChange={set('totalExpYears')} />
          </Field>

          <Field label="Relevant experience (years)" error={showError('relevantExpYears')}
            hint="Cannot be more than total experience.">
            <input className="tp-field" type="number" min="0" max="60" step="0.1"
              value={form.relevantExpYears} onChange={set('relevantExpYears')} />
          </Field>

          <Field label="Joined on" error={showError('dateJoinedOrg')}>
            <input className="tp-field" type="date" max={new Date().toISOString().slice(0, 10)}
              value={form.dateJoinedOrg} onChange={set('dateJoinedOrg')} />
          </Field>

          {editing && (
            <Field label="Active" hint="Deactivated people keep their history but drop out of lists and new entries.">
              <label className="flex items-center gap-2 h-12 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm(f => ({ ...f, active: e.target.checked }))}
                />
                Currently on the team
              </label>
            </Field>
          )}
        </div>

        <div className="flex flex-wrap gap-3 justify-end">
          <Link to={editing ? `/tp/people/${id}` : '/tp/people'} className="tp-btn-ghost">Cancel</Link>
          <button type="submit" className="tp-btn" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add person'}
          </button>
        </div>
      </form>
    </TpLayout>
  )
}

function Field({ label, hint, error, required, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="tp-label">
        {label}{required && <span aria-hidden="true"> *</span>}
      </span>
      {children}
      {error
        ? <span className="text-xs" role="alert" style={{ color: 'var(--tp-bad-fg)' }}>{error}</span>
        : hint && <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>{hint}</span>}
    </label>
  )
}
