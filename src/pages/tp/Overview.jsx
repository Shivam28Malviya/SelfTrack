import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TpLayout from '../../components/tp/TpLayout'
import { TpEmpty } from '../../components/tp/States'
import { useTp } from '../../context/TpContext'
import { tpGet } from '../../lib/tpApi'
import { DASH } from '../../lib/tpFormat'

/**
 * Team overview.
 *
 * The KPI row deliberately renders em dashes until the delivery and attendance
 * tables carry real rows. Overtime and utilization stay hidden entirely: there
 * is no hours source yet (docs/teampulse-spec.md, gap 1), and a dashboard that
 * guesses a number is worse than one that admits it has none.
 */
const PLANNED_KPIS = [
  { label: 'On-time completion', from: 'phase 4 · tasks' },
  { label: 'Avg client score', from: 'phase 3 · feedback' },
  { label: 'Defects leaked', from: 'phase 4 · tasks' },
  { label: 'Unplanned absences', from: 'phase 5 · attendance' },
  { label: 'Overdue tasks', from: 'phase 4 · tasks' },
]

export default function TpOverview() {
  const { role, config } = useTp()
  const [people, setPeople] = useState(null)

  useEffect(() => {
    tpGet('/people', { limit: 1 }).then(r => setPeople(r.success ? r.total : null))
  }, [])

  const target = config?.targets?.on_time_pct

  return (
    <TpLayout title="Overview">
      <section className="tp-panel flex flex-col gap-6">
        <div>
          <p className="tp-label m-0">TeamPulse</p>
          <h1 className="tp-h1 mt-2">Team at a glance</h1>
          <p className="mt-3 m-0 max-w-[560px] text-base leading-relaxed" style={{ color: 'var(--tp-muted)' }}>
            Delivery, client impact, attendance and growth for everyone in your
            team, in one place.
          </p>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-[28px] bg-white/60 px-5 py-4 flex flex-col gap-1.5">
            <span className="text-3xl tracking-[-0.03em]">{people == null ? DASH : people}</span>
            <span className="tp-label">People tracked</span>
          </div>
          {PLANNED_KPIS.map(k => (
            <div key={k.label} className="rounded-[28px] bg-white/60 px-5 py-4 flex flex-col gap-1.5">
              <span className="text-3xl tracking-[-0.03em]" title="No data recorded yet">{DASH}</span>
              <span className="tp-label">{k.label}</span>
              <span className="text-[11px]" style={{ color: 'var(--tp-muted)' }}>{k.from}</span>
            </div>
          ))}
        </div>

        {target != null && (
          <p className="m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
            On-time target is currently {target}%. {role === 'admin'
              ? <Link to="/tp/settings" className="underline">Change targets</Link>
              : 'An administrator can change it.'}
          </p>
        )}
      </section>

      <TpEmpty
        title="Needs attention is not computing yet"
        body="The attention rule needs delivery and attendance history before it can flag anyone. Its thresholds are already configurable, and the rule is written down in docs/teampulse-spec.md section 4."
        action={<Link to="/tp/people" className="tp-btn">See all people</Link>}
      />
    </TpLayout>
  )
}
