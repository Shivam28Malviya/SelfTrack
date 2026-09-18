import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import TpLayout from '../components/tp/TpLayout'
import { TpLoading, TpError } from '../components/tp/States'
import { tpGet, tpPost, tpPut } from '../lib/tpApi'

const STATUSES = [
  ['todo', 'To do'], ['in_progress', 'In progress'], ['blocked', 'Blocked'],
  ['done', 'Done'], ['cancelled', 'Cancelled'],
]

const today = () => new Date().toISOString().slice(0, 10)

const BLANK = {
  title: '', ownerId: '', projectId: '', status: 'todo', dueDate: '',
  progressPct: 0, estHours: '', actualHours: '', leakedToUat: false, blockedReason: '', note: '',
}

function validate(f, editing) {
  const e = {}
  if (!f.title || f.title.trim().length < 3) e.title = 'At least 3 characters.'
  if (!editing && f.dueDate && f.dueDate < today()) e.dueDate = 'A new task cannot be due before today.'
  const p = Number(f.progressPct)
  if (!Number.isInteger(p) || p < 0 || p > 100) e.progressPct = 'A whole number from 0 to 100.'
  if (f.estHours !== '' && !(Number(f.estHours) > 0 && Number(f.estHours) <= 500)) e.estHours = 'Between 0.25 and 500 hours.'
  if (f.actualHours !== '' && !(Number(f.actualHours) >= 0)) e.actualHours = 'Zero or more.'
  if (f.status === 'blocked' && !f.blockedReason.trim()) e.blockedReason = 'Say what it is blocked on.'
  // Keeping the bar and the status in agreement is the whole point of showing
  // both.
  if (p === 100 && f.status !== 'done' && f.status !== 'cancelled') e.status = 'A task at 100% should be marked done.'
  return e
}

export default function TpTaskForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()

  const [form, setForm] = useState(BLANK)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [people, setPeople] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [serverError, setServerError] = useState('')
  const [touched, setTouched] = useState({})

  const errors = validate(form, editing)
  const showError = (k) => (touched[k] || touched.__submit) && errors[k]

  useEffect(() => {
    tpGet('/people', { limit: 100 }).then(r => r.success && setPeople(r.people))
    tpGet('/projects').then(r => r.success && setProjects(r.projects))
  }, [])

  useEffect(() => {
    if (!editing) return
    tpGet(`/tasks/${id}`).then(r => {
      if (!r.success) { setLoadError(r.error); setLoading(false); return }
      const t = r.task
      setForm({
        title: t.title, ownerId: t.ownerId || '', projectId: t.projectId || '',
        status: t.status, dueDate: t.dueDate || '', progressPct: t.progressPct,
        estHours: t.estHours ?? '', actualHours: t.actualHours ?? '',
        leakedToUat: t.leakedToUat, blockedReason: t.blockedReason || '', note: '',
      })
      setUpdatedAt(t.updatedAt)
      setLoading(false)
    })
  }, [id, editing])

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [k]: v }))
    setTouched(t => ({ ...t, [k]: true }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setTouched(t => ({ ...t, __submit: true }))
    setServerError('')
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    const body = { ...form, updatedAt }
    const res = editing ? await tpPut(`/tasks/${id}`, body) : await tpPost('/tasks', body)
    setSaving(false)
    if (!res.success) { setServerError(res.error); return }
    navigate(`/tasks/${res.task.id}`)
  }

  if (loading) return <TpLayout title="Task"><TpLoading label="Loading task" /></TpLayout>
  if (loadError) return <TpLayout title="Task"><TpError error={loadError} /></TpLayout>

  return (
    <TpLayout title={editing ? 'Edit task' : 'New task'}>
      <section className="tp-panel">
        <Link to={editing ? `/tasks/${id}` : '/delivery'} className="text-sm hover:opacity-70">← Back</Link>
        <h1 className="tp-h1 mt-3">{editing ? 'Edit task' : 'New task'}</h1>
      </section>

      <form className="tp-card flex flex-col gap-6" onSubmit={submit} noValidate>
        {serverError && (
          <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="alert"
            style={{ background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)' }}>{serverError}</p>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Title" error={showError('title')} required>
              <input className="tp-field" value={form.title} onChange={set('title')} />
            </Field>
          </div>

          <Field label="Owner" hint="Only people in your team can be assigned.">
            <select className="tp-field" value={form.ownerId} onChange={set('ownerId')}>
              <option value="">Unassigned</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="Project">
            <select className="tp-field" value={form.projectId} onChange={set('projectId')}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="Status" error={showError('status')} required>
            <select className="tp-field" value={form.status} onChange={set('status')}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>

          <Field label="Due date" error={showError('dueDate')}>
            <input className="tp-field" type="date" value={form.dueDate} onChange={set('dueDate')}
              min={editing ? undefined : today()} />
          </Field>

          <Field label="Progress %" error={showError('progressPct')}
            hint="Marking a task done sets this to 100 automatically.">
            <input className="tp-field" type="number" min="0" max="100" step="5"
              value={form.progressPct} onChange={set('progressPct')} />
          </Field>

          <Field label="Estimated hours" error={showError('estHours')}
            hint="Needed for the estimate-against-actual figure.">
            <input className="tp-field" type="number" min="0.25" max="500" step="0.25"
              value={form.estHours} onChange={set('estHours')} />
          </Field>

          <Field label="Actual hours" error={showError('actualHours')}>
            <input className="tp-field" type="number" min="0" step="0.25"
              value={form.actualHours} onChange={set('actualHours')} />
          </Field>

          <Field label="Leaked to UAT" hint="Set by whoever triages the defect, not by the owner.">
            <label className="flex items-center gap-2 h-12 text-sm">
              <input type="checkbox" checked={form.leakedToUat} onChange={set('leakedToUat')} />
              A defect reached UAT
            </label>
          </Field>

          {form.status === 'blocked' && (
            <div className="md:col-span-2">
              <Field label="Blocked on" error={showError('blockedReason')} required>
                <input className="tp-field" value={form.blockedReason} onChange={set('blockedReason')} />
              </Field>
            </div>
          )}

          {editing && (
            <div className="md:col-span-2">
              <Field label="Note for the history" hint="Recorded against the status change.">
                <input className="tp-field" value={form.note} onChange={set('note')} />
              </Field>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 justify-end">
          <Link to={editing ? `/tasks/${id}` : '/delivery'} className="tp-btn-ghost">Cancel</Link>
          <button type="submit" className="tp-btn" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </form>
    </TpLayout>
  )
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
