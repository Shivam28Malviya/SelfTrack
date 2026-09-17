import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import StatusPill from '../../components/tp/StatusPill'
import { TpLoading, TpError, TpNotBuiltYet } from '../../components/tp/States'
import { tpGet, tpDelete } from '../../lib/tpApi'
import { useTp } from '../../context/TpContext'
import { years, shortDate, initialsOf, DASH } from '../../lib/tpFormat'

export default function TpEmployee() {
  const { id } = useParams()
  const { role } = useTp()
  const [confirming, setConfirming] = useState(false)
  const [actionError, setActionError] = useState('')
  const [person, setPerson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    tpGet(`/people/${id}`).then(r => {
      if (r.success) setPerson(r.person)
      else setError(r.error)
      setLoading(false)
    })
  }
  useEffect(load, [id])

  if (loading) return <TpLayout title="Profile"><TpLoading label="Loading profile" /></TpLayout>
  if (error) return <TpLayout title="Profile"><TpError error={error} onRetry={load} /></TpLayout>

  const canEdit = role === 'admin' || role === 'manager'

  const deactivate = async () => {
    setActionError('')
    const res = await tpDelete(`/people/${id}`)
    setConfirming(false)
    if (!res.success) { setActionError(res.error); return }
    setPerson(res.person)
  }

  const facts = [
    ['Total experience', years(person.totalExpYears)],
    ['Relevant experience', years(person.relevantExpYears)],
    ['Project', person.projectName || DASH],
    ['Client', person.client || DASH],
    ['Working from', person.workLocation],
    ['Allocation', `${person.allocationPct}%`],
    ['Manager', person.managerName || DASH],
    ['Joined', shortDate(person.dateJoinedOrg)],
  ]

  return (
    <TpLayout title={person.name}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <Link to="/tp/people" className="text-sm hover:opacity-70">← All people</Link>
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <Link to={`/tp/people/${id}/edit`} className="tp-btn-ghost">Edit</Link>
            {person.active && (
              <button type="button" className="tp-btn-ghost" onClick={() => setConfirming(true)}>
                Deactivate
              </button>
            )}
          </div>
        )}
      </div>

      {!person.active && (
        <p className="m-0 tp-card py-4 text-sm" role="status" style={{ color: 'var(--tp-muted)' }}>
          This person is deactivated. Their history is kept for team reporting and
          the audit trail, and they are hidden from the people list by default.
        </p>
      )}

      {actionError && (
        <p className="m-0 tp-card py-4 text-sm" role="alert" style={{ color: 'var(--tp-bad-fg)' }}>{actionError}</p>
      )}

      {confirming && (
        <div className="tp-card flex flex-col gap-3" role="alertdialog" aria-label="Confirm deactivation">
          <p className="m-0 text-lg">Deactivate {person.name}?</p>
          <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
            Nothing is deleted. Their delivery and attendance history stays, and
            they stop appearing in the people list and in new entries. This can
            be undone by editing them back to active.
          </p>
          <div className="flex gap-3 justify-end">
            <button type="button" className="tp-btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="tp-btn" onClick={deactivate}>Deactivate</button>
          </div>
        </div>
      )}

      <section className="tp-panel flex flex-col lg:flex-row lg:items-center gap-8">
        <div aria-hidden="true" className="w-24 h-24 rounded-full bg-white grid place-items-center text-4xl shrink-0">
          {person.initials || initialsOf(person.name)}
        </div>
        <div className="flex flex-col gap-2 grow">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="tp-h1">{person.name}</h1>
            <StatusPill status={person.statusOverride} title={person.statusOverrideReason} />
          </div>
          <p className="m-0 text-base" style={{ color: 'var(--tp-muted)' }}>
            {person.designation}{person.projectName ? ` · ${person.projectName}` : ''}
          </p>
        </div>
        <dl className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 lg:w-[620px] m-0">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-[22px] bg-white/60 px-4 py-3 flex flex-col gap-1">
              <dt className="tp-label">{label}</dt>
              <dd className="m-0 text-base">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <TpNotBuiltYet
        screen="Tasks, attendance, skills and achievements for this person"
        phase="3 to 6"
        needs="Each tab needs its own capture flow before it can show anything: entries first, charts second."
      />
    </TpLayout>
  )
}
