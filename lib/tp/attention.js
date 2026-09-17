import { sql } from '../db.js'
import { getConfig } from './config.js'
import { todayISO, addDays, dayOfWeek, eachDate, holidaySet, monthStart, nextMonthStart } from './dates.js'

/**
 * The attention engine.
 *
 * Implements docs/teampulse-spec.md section 4. Three rules shape it:
 *
 *  1. **Each person is compared with their own recent past**, not with each
 *     other. Ranking people against one another punishes whoever has the
 *     harder project.
 *  2. **A signal needs data to fire.** Somebody with no client feedback does
 *     not get a "score dropped" signal; missing data is never a bad signal.
 *  3. **The signals are always returned with the status.** A label like "at
 *     risk" with no reasons attached is not reviewable and not fair, and the
 *     person is entitled to see exactly what produced it.
 *
 * Everything is computed in a handful of grouped queries rather than per
 * person, so this stays usable past a dozen people.
 */

const CURRENT_DAYS = 30
const BASELINE_DAYS = 90

export const STATUS = { ON_TRACK: 'On track', WATCH: 'Watch', AT_RISK: 'At risk', OVERTIME: 'Overtime', BURNOUT: 'Burnout watch' }

export async function attentionReport(ctx, { personId = null } = {}) {
  // personId narrows every query below to one row. The profile needs a single
  // person's signals, and running the whole team's report to pick one out of
  // it made opening one profile cost O(team).
  const ids = personId ? [personId] : (ctx.scope === 'all' ? null : ctx.ids)
  if (ctx.scope === 'none' || (ids && ids.length === 0)) return { people: [], rules: null }

  const cfg = await getConfig()
  const rules = cfg.attention
  const target = cfg.targets?.on_time_pct
  const weekOff = cfg.workday.week_off || [0, 6]

  const today = todayISO()
  const curFrom = addDays(today, -CURRENT_DAYS)
  const baseFrom = addDays(curFrom, -BASELINE_DAYS)

  const { rows: people } = await sql.query(
    `select id, name, initials, designation, region, status_override, status_override_reason
       from tp_person
      where active = true and ($1::bigint[] is null or id = any($1::bigint[]))
      order by name`,
    [ids]
  )
  // ids is null only for an admin with no personId, which means "everyone".
  if (people.length === 0) return { people: [], rules }

  const personIds = people.map(p => Number(p.id))

  // --- on-time, current window and baseline, per person
  const { rows: taskRows } = await sql.query(
    `select owner_id,
            count(*) filter (where completed_at::date >= $2 and status = 'done')                       as cur_done,
            count(*) filter (where completed_at::date >= $2 and status = 'done'
                               and due_date is not null and completed_at::date <= due_date)            as cur_on_time,
            count(*) filter (where completed_at::date >= $3 and completed_at::date < $2
                               and status = 'done')                                                    as base_done,
            count(*) filter (where completed_at::date >= $3 and completed_at::date < $2
                               and status = 'done' and due_date is not null
                               and completed_at::date <= due_date)                                     as base_on_time,
            count(*) filter (where status in ('todo','in_progress','blocked') and due_date < $4)        as open_overdue
       from tp_task
      where owner_id = any($1::bigint[])
      group by owner_id`,
    [personIds, curFrom, baseFrom, today]
  )
  const tasksBy = new Map(taskRows.map(r => [Number(r.owner_id), r]))

  // --- client score, current and baseline
  const { rows: fbRows } = await sql.query(
    `select person_id,
            avg(score) filter (where given_on >= $2)::float                          as cur_avg,
            count(*)   filter (where given_on >= $2)                                 as cur_n,
            avg(score) filter (where given_on >= $3 and given_on < $2)::float        as base_avg,
            count(*)   filter (where given_on >= $3 and given_on < $2)               as base_n
       from tp_feedback
      where source = 'client' and person_id = any($1::bigint[])
      group by person_id`,
    [personIds, curFrom, baseFrom]
  )
  const fbBy = new Map(fbRows.map(r => [Number(r.person_id), r]))

  // --- unplanned days in the trailing 90
  const { rows: absRows } = await sql.query(
    `select person_id, count(*)::int as unplanned
       from tp_attendance
      where type = 'unplanned' and date >= $2 and person_id = any($1::bigint[])
      group by person_id`,
    [personIds, addDays(today, -90)]
  )
  const absBy = new Map(absRows.map(r => [Number(r.person_id), Number(r.unplanned)]))

  // --- overtime per calendar month, for the consecutive-months test
  const { rows: otRows } = await sql.query(
    `select person_id, date_trunc('month', date)::date as month, sum(hours)::float as hours
       from tp_overtime
      where date >= $2 and person_id = any($1::bigint[])
      group by person_id, date_trunc('month', date)`,
    [personIds, addDays(today, -190)]
  )
  const otBy = new Map()
  for (const r of otRows) {
    const key = Number(r.person_id)
    if (!otBy.has(key)) otBy.set(key, new Map())
    otBy.get(key).set(String(r.month).slice(0, 10), Number(r.hours))
  }

  // --- open overdue tasks, with their due dates, for working-day aging
  const { rows: overdueRows } = await sql.query(
    `select owner_id, due_date from tp_task
      where status in ('todo','in_progress','blocked') and due_date < $2
        and owner_id = any($1::bigint[])`,
    [personIds, today]
  )
  const regions = [...new Set(people.map(p => p.region))]
  const earliestDue = overdueRows.reduce((acc, r) => {
    const d = String(r.due_date).slice(0, 10)
    return !acc || d < acc ? d : acc
  }, null)
  const holidaysByRegion = {}
  for (const region of regions) {
    holidaysByRegion[region] = earliestDue ? await holidaySet(region, earliestDue, today) : new Set()
  }
  const regionByPerson = new Map(people.map(p => [Number(p.id), p.region]))
  const agedBy = new Map()
  for (const r of overdueRows) {
    const owner = Number(r.owner_id)
    const holidays = holidaysByRegion[regionByPerson.get(owner)] || new Set()
    const due = String(r.due_date).slice(0, 10)
    const age = eachDate(addDays(due, 1), today)
      .filter(d => !weekOff.includes(dayOfWeek(d)) && !holidays.has(d)).length
    if (age > rules.overdue_age_days) agedBy.set(owner, (agedBy.get(owner) || 0) + 1)
  }

  // --- the two most recent whole months, for the overtime test
  const thisMonth = monthStart(today)
  const prevMonth = monthStart(addDays(thisMonth, -1))
  const monthsToTest = [prevMonth, monthStart(addDays(prevMonth, -1))]

  const out = people.map(p => {
    const id = Number(p.id)
    const signals = []

    // On-time
    const t = tasksBy.get(id)
    const curDenominator = t ? Number(t.cur_done) + Number(t.open_overdue) : 0
    const curOnTime = curDenominator > 0 ? (Number(t.cur_on_time) / curDenominator) * 100 : null
    const baseDenominator = t ? Number(t.base_done) : 0
    const baseOnTime = baseDenominator > 0 ? (Number(t.base_on_time) / baseDenominator) * 100 : null

    if (curOnTime != null) {
      if (baseOnTime != null && curOnTime < baseOnTime - rules.ontime_drop_pp) {
        signals.push({
          key: 'ontime_drop',
          text: `On-time fell to ${round(curOnTime)}% from ${round(baseOnTime)}% over the previous quarter`,
        })
      } else if (target != null && curOnTime < target) {
        signals.push({ key: 'ontime_below_target', text: `On-time is ${round(curOnTime)}%, under the ${target}% target` })
      }
    }

    // Client score
    const f = fbBy.get(id)
    const curScore = f?.cur_avg ?? null
    const baseScore = f?.base_avg ?? null
    if (curScore != null && baseScore != null && curScore < baseScore - rules.score_drop) {
      signals.push({
        key: 'score_drop',
        text: `Client score fell to ${curScore.toFixed(1)} from ${baseScore.toFixed(1)}`,
      })
    }

    // Unplanned absence
    const unplanned = absBy.get(id) || 0
    if (unplanned >= rules.unplanned_days_90d) {
      signals.push({ key: 'unplanned', text: `${unplanned} unplanned days in the last 90` })
    }

    // Overtime across two consecutive whole months
    const months = otBy.get(id) || new Map()
    const overMonths = monthsToTest.filter(m => (months.get(m) || 0) > rules.overtime_hours_month)
    if (overMonths.length >= rules.overtime_months) {
      signals.push({
        key: 'overtime',
        text: `Over ${rules.overtime_hours_month} overtime hours in ${overMonths.length} consecutive months`,
      })
    }

    // Aged overdue work
    const aged = agedBy.get(id) || 0
    if (aged >= rules.overdue_aged_tasks) {
      signals.push({ key: 'overdue', text: `${aged} open tasks more than ${rules.overdue_age_days} working days past due` })
    }

    const status = statusFrom(signals, rules)

    return {
      personId: id,
      name: p.name,
      initials: p.initials,
      designation: p.designation,
      // An override always wins, and always carries its reason, so a manual
      // label can be challenged.
      status: p.status_override || status,
      computedStatus: status,
      overridden: Boolean(p.status_override),
      overrideReason: p.status_override_reason || null,
      signals,
      facts: {
        onTimePct: curOnTime == null ? null : round(curOnTime),
        clientScore: curScore == null ? null : Math.round(curScore * 10) / 10,
        unplannedDays: unplanned,
        agedOverdue: aged,
        overtimeHours: months.get(prevMonth) ?? null,
      },
    }
  })

  return {
    people: out,
    rules,
    window: { current: { from: curFrom, to: today }, baseline: { from: baseFrom, to: curFrom } },
  }
}

function statusFrom(signals, rules) {
  const keys = signals.map(s => s.key)
  const hasOvertime = keys.includes('overtime')
  const others = keys.filter(k => k !== 'overtime').length

  if (signals.length >= rules.at_risk_signals) return STATUS.AT_RISK
  if (hasOvertime && others >= 1) return STATUS.BURNOUT
  if (signals.length >= rules.watch_signals) return STATUS.WATCH
  if (hasOvertime) return STATUS.OVERTIME
  return STATUS.ON_TRACK
}

const round = (v) => Math.round(v * 10) / 10

/** The shape of the team, for the pyramid and the working-from split. */
export async function teamShape(ctx) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  if (ctx.scope === 'none' || (ids && ids.length === 0)) return { pyramid: [], locations: [], headcount: 0 }

  const { rows } = await sql.query(
    `select designation, work_location, count(*)::int as n from tp_person
      where active = true and ($1::bigint[] is null or id = any($1::bigint[]))
      group by designation, work_location`,
    [ids]
  )

  const order = ['Manager', 'Senior Consultant', 'Consultant', 'Analyst']
  const byDesignation = new Map()
  const byLocation = new Map()
  let headcount = 0
  for (const r of rows) {
    headcount += r.n
    byDesignation.set(r.designation, (byDesignation.get(r.designation) || 0) + r.n)
    byLocation.set(r.work_location, (byLocation.get(r.work_location) || 0) + r.n)
  }

  return {
    headcount,
    pyramid: order.filter(d => byDesignation.has(d)).map(d => ({ label: d, n: byDesignation.get(d) })),
    locations: [...byLocation.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
  }
}
