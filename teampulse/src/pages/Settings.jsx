import { useCallback, useEffect, useState } from 'react'
import TpLayout from '../components/tp/TpLayout'
import { TpLoading, TpError } from '../components/tp/States'
import { tpGet, tpPost, tpPut } from '../lib/tpApi'
import { shortDate } from '../lib/tpFormat'

/**
 * Administration.
 *
 * Everything the design hardcoded on a screen — the 80% target, the 90-day
 * expiry horizon, the L3 threshold, the eight skill columns, "21 working
 * days" — is editable here, because a number baked into a component is a
 * number nobody can change without a deploy.
 */
const TARGET_FIELDS = [
  ['on_time_pct', 'On-time completion target', '%', 0, 100],
  ['client_score', 'Client score target', '/5', 1, 5],
  ['reopen_rate_pct', 'Reopen rate ceiling', '%', 0, 100],
  ['effort_over_est_pct', 'Effort over estimate ceiling', '%', 0, 200],
  ['defects_leaked', 'Defects leaked target', '', 0, 100],
  ['cert_target', 'Certifications per quarter', '', 0, 100],
]

const ATTENTION_FIELDS = [
  ['ontime_drop_pp', 'On-time drop that fires a signal', 'pp', 1, 100],
  ['score_drop', 'Client score drop that fires a signal', 'points', 0.1, 4],
  ['unplanned_days_90d', 'Unplanned days in 90 that fire a signal', 'days', 1, 90],
  ['overtime_hours_month', 'Overtime hours a month that count as high', 'h', 1, 200],
  ['overtime_months', 'Consecutive high-overtime months needed', 'months', 1, 12],
  ['overdue_aged_tasks', 'Aged overdue tasks that fire a signal', 'tasks', 1, 50],
  ['overdue_age_days', 'Working days past due before a task is aged', 'days', 1, 60],
  ['watch_signals', 'Signals for Watch', '', 1, 10],
  ['at_risk_signals', 'Signals for At risk', '', 1, 10],
]

export default function TpSettings() {
  const [config, setConfig] = useState(null)
  const [skills, setSkills] = useState([])
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const [newSkill, setNewSkill] = useState({ name: '', category: '' })
  const [newHoliday, setNewHoliday] = useState({ date: '', region: 'IN', name: '' })
  const year = new Date().getUTCFullYear()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [c, s, h] = await Promise.all([
      tpGet('/config'),
      tpGet('/skills/catalogue', { includeInactive: 'true' }),
      tpGet('/holidays', { year }),
    ])
    if (!c.success) { setError(c.error); setLoading(false); return }
    setConfig(c.config)
    setSkills(s.success ? s.skills : [])
    setHolidays(h.success ? h.holidays : [])
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  const saveConfig = async (key) => {
    setActionError('')
    setMessage('')
    const res = await tpPut('/config', { key, value: config[key] })
    if (!res.success) { setActionError(res.error); return }
    setConfig(res.config)
    setMessage('Saved. It applies from the next time anything is computed.')
  }

  const setNested = (key, field, value) =>
    setConfig(c => ({ ...c, [key]: { ...c[key], [field]: value } }))

  const addSkill = async (e) => {
    e.preventDefault()
    setActionError('')
    const res = await tpPost('/skills/catalogue', newSkill)
    if (!res.success) { setActionError(res.error); return }
    setNewSkill({ name: '', category: '' })
    load()
  }

  const toggleSkill = async (skill) => {
    setActionError('')
    const res = await tpPut(`/skills/catalogue/${skill.id}`, { active: !skill.active })
    if (!res.success) { setActionError(res.error); return }
    load()
  }

  const addHoliday = async (e) => {
    e.preventDefault()
    setActionError('')
    const res = await tpPost('/holidays', newHoliday)
    if (!res.success) { setActionError(res.error); return }
    setNewHoliday({ date: '', region: newHoliday.region, name: '' })
    load()
  }

  const download = async (kind) => {
    setActionError('')
    const res = await tpGet('/export', { kind })
    if (!res.success) { setActionError(res.error); return }
    const url = URL.createObjectURL(new Blob([res.csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = res.filename
    a.click()
    URL.revokeObjectURL(url)
    setMessage(`Exported ${res.rows} rows. The file records who asked and when.`)
  }

  if (loading) return <TpLayout title="Settings"><TpLoading label="Loading settings" rows={6} /></TpLayout>
  if (error) return <TpLayout title="Settings"><TpError error={error} onRetry={load} /></TpLayout>

  return (
    <TpLayout title="Settings">
      <section className="tp-panel">
        <h1 className="tp-h1">Settings</h1>
        <p className="mt-2 m-0 text-base max-w-[680px]" style={{ color: 'var(--tp-muted)' }}>
          Targets, the attention thresholds, the working calendar and the skill
          catalogue. Changing a threshold changes who gets flagged, so every
          change here is recorded in the audit trail.
        </p>
      </section>

      {message && (
        <p className="tp-card m-0 py-4 text-sm" role="status"
          style={{ background: 'var(--tp-ok-bg)', color: 'var(--tp-ok-fg)' }}>{message}</p>
      )}
      {actionError && (
        <p className="tp-card m-0 py-4 text-sm" role="alert" style={{ color: 'var(--tp-bad-fg)' }}>{actionError}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="tp-card flex flex-col gap-4">
          <span className="text-xl">Targets</span>
          <div className="grid gap-4 sm:grid-cols-2">
            {TARGET_FIELDS.map(([key, label, unit, min, max]) => (
              <label key={key} className="flex flex-col gap-1.5">
                <span className="tp-label">{label}{unit && ` (${unit})`}</span>
                <input className="tp-field" type="number" min={min} max={max} step={key === 'client_score' ? 0.1 : 1}
                  value={config.targets[key] ?? ''}
                  onChange={(e) => setNested('targets', key, e.target.value === '' ? '' : Number(e.target.value))} />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="button" className="tp-btn" onClick={() => saveConfig('targets')}>Save targets</button>
          </div>
        </div>

        <div className="tp-card flex flex-col gap-4">
          <div>
            <span className="text-xl">Attention thresholds</span>
            <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              A signal fires when a person's own last 30 days move away from
              their previous 90. Lowering these flags more people.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {ATTENTION_FIELDS.map(([key, label, unit, min, max]) => (
              <label key={key} className="flex flex-col gap-1.5">
                <span className="tp-label">{label}{unit && ` (${unit})`}</span>
                <input className="tp-field" type="number" min={min} max={max}
                  step={key === 'score_drop' ? 0.1 : 1}
                  value={config.attention[key] ?? ''}
                  onChange={(e) => setNested('attention', key, e.target.value === '' ? '' : Number(e.target.value))} />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="button" className="tp-btn" onClick={() => saveConfig('attention')}>Save thresholds</button>
          </div>
        </div>

        <div className="tp-card flex flex-col gap-4">
          <div>
            <span className="text-xl">Working day</span>
            <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              Shift start is per region and decides what counts as a late login.
              Grace means an arrival inside it is not late at all.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.keys(config.workday.shift_start || {}).map(region => (
              <label key={region} className="flex flex-col gap-1.5">
                <span className="tp-label">Shift start · {region}</span>
                <input className="tp-field" type="time"
                  value={config.workday.shift_start[region]}
                  onChange={(e) => setNested('workday', 'shift_start', { ...config.workday.shift_start, [region]: e.target.value })} />
              </label>
            ))}
            <label className="flex flex-col gap-1.5">
              <span className="tp-label">Grace (minutes)</span>
              <input className="tp-field" type="number" min="0" max="120"
                value={config.workday.grace_minutes ?? 0}
                onChange={(e) => setNested('workday', 'grace_minutes', Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="tp-label">Hours per day</span>
              <input className="tp-field" type="number" min="1" max="24"
                value={config.workday.hours_per_day ?? 8}
                onChange={(e) => setNested('workday', 'hours_per_day', Number(e.target.value))} />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="button" className="tp-btn" onClick={() => saveConfig('workday')}>Save working day</button>
          </div>
        </div>

        <div className="tp-card flex flex-col gap-4">
          <div>
            <span className="text-xl">Retention</span>
            <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              Published in the footer of every screen. Attendance and late-login
              data is employee monitoring, so how long it is kept is not an
              implementation detail.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="tp-label">Raw records (months)</span>
              <input className="tp-field" type="number" min="1" max="120"
                value={config.retention.raw_months}
                onChange={(e) => setNested('retention', 'raw_months', Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="tp-label">Aggregates (years)</span>
              <input className="tp-field" type="number" min="1" max="30"
                value={config.retention.aggregate_years}
                onChange={(e) => setNested('retention', 'aggregate_years', Number(e.target.value))} />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="button" className="tp-btn" onClick={() => saveConfig('retention')}>Save retention</button>
          </div>
        </div>

        <div className="tp-card flex flex-col gap-4">
          <div>
            <span className="text-xl">Skill catalogue</span>
            <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              These are the heatmap's columns. Retiring a skill hides it from new
              ratings but keeps the ones already recorded.
            </p>
          </div>
          <form className="flex flex-wrap gap-3 items-end" onSubmit={addSkill}>
            <label className="flex flex-col gap-1.5 grow min-w-[160px]">
              <span className="tp-label">Skill</span>
              <input className="tp-field" value={newSkill.name}
                onChange={e => setNewSkill(s => ({ ...s, name: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1.5 w-40">
              <span className="tp-label">Category</span>
              <input className="tp-field" value={newSkill.category} placeholder="General"
                onChange={e => setNewSkill(s => ({ ...s, category: e.target.value }))} />
            </label>
            <button type="submit" className="tp-btn h-12" disabled={newSkill.name.trim().length < 2}>Add</button>
          </form>
          <ul className="m-0 p-0 list-none flex flex-col">
            {skills.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 border-t text-sm"
                style={{ borderColor: 'var(--tp-line)' }}>
                <span className="flex flex-col">
                  <span style={{ opacity: s.active ? 1 : 0.55 }}>{s.name}</span>
                  <span className="text-xs" style={{ color: 'var(--tp-muted)' }}>
                    {s.category}{s.active ? '' : ' · retired'}
                  </span>
                </span>
                <button type="button" className="tp-btn-ghost" onClick={() => toggleSkill(s)}>
                  {s.active ? 'Retire' : 'Restore'}
                </button>
              </li>
            ))}
            {skills.length === 0 && (
              <li className="py-3 text-sm" style={{ color: 'var(--tp-muted)' }}>
                Nothing yet. The heatmap stays empty until there are skills to chart.
              </li>
            )}
          </ul>
        </div>

        <div className="tp-card flex flex-col gap-4">
          <div>
            <span className="text-xl">Holidays · {year}</span>
            <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              Working-day counts, absence expansion and task aging all read this.
              Without it, a public holiday counts as a missed working day.
            </p>
          </div>
          <form className="flex flex-wrap gap-3 items-end" onSubmit={addHoliday}>
            <label className="flex flex-col gap-1.5 w-44">
              <span className="tp-label">Date</span>
              <input className="tp-field" type="date" value={newHoliday.date}
                onChange={e => setNewHoliday(h => ({ ...h, date: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1.5 w-28">
              <span className="tp-label">Region</span>
              <select className="tp-field" value={newHoliday.region}
                onChange={e => setNewHoliday(h => ({ ...h, region: e.target.value }))}>
                <option value="IN">IN</option>
                <option value="UK">UK</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 grow min-w-[160px]">
              <span className="tp-label">Name</span>
              <input className="tp-field" value={newHoliday.name}
                onChange={e => setNewHoliday(h => ({ ...h, name: e.target.value }))} />
            </label>
            <button type="submit" className="tp-btn h-12"
              disabled={!newHoliday.date || newHoliday.name.trim().length < 2}>Add</button>
          </form>
          {holidays.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              No holidays recorded for {year}, so only weekends are treated as non-working.
            </p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col max-h-64 overflow-y-auto">
              {holidays.map(h => (
                <li key={`${h.date}-${h.region}`} className="flex justify-between gap-3 py-2 border-t text-sm"
                  style={{ borderColor: 'var(--tp-line)' }}>
                  <span>{shortDate(h.date)} · {h.name}</span>
                  <span style={{ color: 'var(--tp-muted)' }}>{h.region}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tp-card flex flex-col gap-4 lg:col-span-2">
          <div>
            <span className="text-xl">Export</span>
            <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              Every file starts with a header naming who asked for it and when,
              and the export itself is audited. An exported file leaves the
              access controls behind, so it has to carry its own provenance.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {['people', 'tasks', 'attendance', 'feedback'].map(kind => (
              <button key={kind} type="button" className="tp-btn-ghost capitalize" onClick={() => download(kind)}>
                Export {kind}
              </button>
            ))}
          </div>
        </div>
      </div>
    </TpLayout>
  )
}
