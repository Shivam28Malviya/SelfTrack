import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import { tpGet, tpPost } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'

const today = () => new Date().toISOString().slice(0, 10)

export default function TpLeaveForm() {
  const { role, person } = useTp()
  const navigate = useNavigate()
  const isMember = role === 'member'

  const [form, setForm] = useState({
    personId: '', fromDate: today(), toDate: today(), type: 'planned', reason: '',
  })
  const [people, setPeople] = useState([])
  const [balance, setBalance] = useState(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isMember) return
    tpGet('/people', { limit: 100 }).then(r => r.success && setPeople(r.people))
  }, [isMember])

  const targetId = isMember ? person?.id : form.personId
  useEffect(() => {
    if (!targetId) { setBalance(null); return }
    tpGet(`/people/${targetId}/leave`).then(r => r.success && setBalance(r.balance))
  }, [targetId])

  const set = (k) => (e) => {
    const value = e.target.value
    setForm(f => {
      const next = { ...f, [k]: value }
      // Keep the range valid rather than letting the server reject it.
      if (k === 'fromDate' && next.toDate < value) next.toDate = value
      return next
    })
    setError('')
    setWarning('')
  }

  const errors = {}
  if (!isMember && !form.personId) errors.personId = 'Choose a person.'
  if (!form.fromDate) errors.fromDate = 'Choose a start date.'
  if (form.toDate < form.fromDate) errors.toDate = 'The end date is before the start date.'

  const submit = async (e) => {
    e.preventDefault()
    if (Object.keys(errors).length > 0) { setError(Object.values(errors)[0]); return }
    setBusy(true)
    setError('')
    const res = await tpPost('/leave', isMember ? { ...form, personId: undefined } : form)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    if (res.warning) { setWarning(`${res.warning} The request is in, for a manager to decide.`); return }
    navigate('/tp/attendance')
  }

  return (
    <TpLayout title="Request leave">
      <section className="tp-panel">
        <Link to="/tp/attendance" className="text-sm hover:opacity-70">← Attendance</Link>
        <h1 className="tp-h1 mt-3">Request leave</h1>
        <p className="mt-2 m-0 text-base max-w-[600px]" style={{ color: 'var(--tp-muted)' }}>
          Nothing is recorded as attendance until a manager approves it. Weekends
          and holidays inside the range are not counted.
        </p>
      </section>

      <form className="tp-card flex flex-col gap-6" onSubmit={submit} noValidate>
        {error && (
          <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="alert"
            style={{ background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)' }}>{error}</p>
        )}
        {warning && (
          <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="status"
            style={{ background: 'var(--tp-warn-bg)', color: 'var(--tp-warn-fg)' }}>{warning}</p>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {!isMember && (
            <label className="flex flex-col gap-1.5">
              <span className="tp-label">Person *</span>
              <select className="tp-field" value={form.personId} onChange={set('personId')}>
                <option value="">Choose…</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="tp-label">Type *</span>
            <select className="tp-field" value={form.type} onChange={set('type')}>
              <option value="planned">Planned leave</option>
              <option value="sick">Sick leave</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="tp-label">From *</span>
            <input className="tp-field" type="date" value={form.fromDate} onChange={set('fromDate')} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="tp-label">To *</span>
            <input className="tp-field" type="date" min={form.fromDate} value={form.toDate} onChange={set('toDate')} />
          </label>

          <div className="md:col-span-2">
            <label className="flex flex-col gap-1.5">
              <span className="tp-label">Reason</span>
              <textarea className="tp-field h-24 py-3" value={form.reason} onChange={set('reason')} />
            </label>
          </div>
        </div>

        {balance && balance.entitled > 0 && (
          <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
            {balance.remaining} of {balance.entitled} days remaining for {balance.year}.
            Going over does not block the request; the approver decides.
          </p>
        )}

        <div className="flex flex-wrap gap-3 justify-end">
          <Link to="/tp/attendance" className="tp-btn-ghost">Cancel</Link>
          <button type="submit" className="tp-btn" disabled={busy}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </TpLayout>
  )
}
