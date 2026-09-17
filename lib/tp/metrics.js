import { sql } from '../db.js'
import { getConfig } from './config.js'
import { todayISO, addDays, monthStart, nextMonthStart, workingDays, dayOfWeek, holidaySet, eachDate } from './dates.js'
import { isoDate } from './validate.js'

/**
 * Metric computation.
 *
 * Every formula here is the one written down in docs/teampulse-spec.md section
 * 3. Two rules hold throughout:
 *
 *  - a zero denominator returns null, never 0 and never NaN, so the UI can
 *    render an em dash and say "no data" rather than "0%"
 *  - aggregation happens in SQL, not by pulling rows into the API
 */

const ratio = (numerator, denominator) =>
  denominator > 0 ? numerator / denominator : null

const pct1 = (v) => (v == null ? null : Math.round(v * 1000) / 10)

/** True when the caller can see nobody at all. */
export const scopeIsEmpty = (ctx) =>
  ctx.scope === 'none' || (ctx.scope === 'ids' && ctx.ids.length === 0)

/**
 * What every metric reads as when there is nobody in scope.
 *
 * Counts are null rather than 0: a person whose login is not linked to anyone,
 * or a role with no access, has no data — and "0 unplanned absences" reads as
 * a clean record rather than as an empty one.
 */
const EMPTY_METRICS = {
  onTimePct: null, onTimeBasis: 0, completed: null, reopenRatePct: null,
  defectsLeaked: null, effortOverEstPct: null, effortBasisHours: 0, overdueOpen: null,
  clientScore: null, clientCount: 0, feedbackCount: 0,
  workingDays: 0, peopleCounted: 0, unplannedDays: null, sickDays: null,
  plannedDays: null, lateLogins: null, avgMinutesLate: null, attendanceRatePct: null,
  overtimeHours: null, peopleWithOvertime: 0, utilizationPct: null,
}

export function resolvePeriod(query = {}) {
  const to = query.to ? isoDate(query.to, 'To') : addDays(todayISO(), 1)
  if (query.from) return { from: isoDate(query.from, 'From'), to }
  const period = query.period || 'month'
  const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1
  const d = new Date(to + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() - months)
  return { from: monthStart(d.toISOString().slice(0, 10)), to }
}

// ------------------------------------------------------------------ delivery

export async function deliveryMetrics(ctx, { from, to }, personId = null) {
  const ids = personId ? [personId] : (ctx.scope === 'all' ? null : ctx.ids)
  const today = todayISO()

  // One pass over tp_task. The on-time denominator deliberately includes open
  // tasks that are already past due: an overdue task that is never finished
  // would otherwise silently improve the figure.
  const { rows } = await sql.query(
    `select
       count(*) filter (where completed_at is not null and completed_at::date >= $2 and completed_at::date < $3
                          and status = 'done')                                     as completed,
       count(*) filter (where completed_at is not null and completed_at::date >= $2 and completed_at::date < $3
                          and status = 'done' and due_date is not null
                          and completed_at::date <= due_date)                      as on_time,
       count(*) filter (where status in ('todo','in_progress','blocked') and due_date < $4) as open_overdue,
       count(*) filter (where completed_at is not null and completed_at::date >= $2 and completed_at::date < $3
                          and status = 'done' and reopened_count > 0)              as reopened,
       count(*) filter (where completed_at is not null and completed_at::date >= $2 and completed_at::date < $3
                          and leaked_to_uat)                                       as leaked,
       coalesce(sum(est_hours) filter (where completed_at is not null and completed_at::date >= $2
                          and completed_at::date < $3 and status = 'done'
                          and est_hours is not null and actual_hours is not null), 0)::float as est_sum,
       coalesce(sum(actual_hours) filter (where completed_at is not null and completed_at::date >= $2
                          and completed_at::date < $3 and status = 'done'
                          and est_hours is not null and actual_hours is not null), 0)::float as act_sum
     from tp_task
     where ($1::bigint[] is null or owner_id = any($1::bigint[]))`,
    [ids, from, to, today]
  )

  const r = rows[0]
  const completed = Number(r.completed)
  const onTimeDenominator = completed + Number(r.open_overdue)

  return {
    onTimePct: pct1(ratio(Number(r.on_time), onTimeDenominator)),
    onTimeBasis: onTimeDenominator,
    completed,
    reopenRatePct: pct1(ratio(Number(r.reopened), completed)),
    defectsLeaked: Number(r.leaked),
    // Positive means the work took longer than estimated.
    effortOverEstPct: r.est_sum > 0 ? Math.round((r.act_sum / r.est_sum - 1) * 1000) / 10 : null,
    effortBasisHours: r.est_sum,
    overdueOpen: Number(r.open_overdue),
  }
}

/** On-time percentage per person, for the ranked bar chart. */
export async function onTimeByPerson(ctx, { from, to }) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  const today = todayISO()
  const { rows } = await sql.query(
    `select p.id, p.name,
            count(*) filter (where t.completed_at::date >= $2 and t.completed_at::date < $3
                               and t.status = 'done')                                  as completed,
            count(*) filter (where t.completed_at::date >= $2 and t.completed_at::date < $3
                               and t.status = 'done' and t.due_date is not null
                               and t.completed_at::date <= t.due_date)                 as on_time,
            count(*) filter (where t.status in ('todo','in_progress','blocked')
                               and t.due_date < $4)                                    as open_overdue
       from tp_person p
       join tp_task t on t.owner_id = p.id
      where p.active = true and ($1::bigint[] is null or p.id = any($1::bigint[]))
      group by p.id, p.name`,
    [ids, from, to, today]
  )

  return rows
    .map(r => {
      const denominator = Number(r.completed) + Number(r.open_overdue)
      return {
        personId: Number(r.id),
        name: r.name,
        onTimePct: pct1(ratio(Number(r.on_time), denominator)),
        basis: denominator,
      }
    })
    // People with nothing due in the period have no percentage to show; a bar
    // at 0% would read as failure rather than absence.
    .filter(x => x.onTimePct != null)
    .sort((a, b) => b.onTimePct - a.onTimePct)
}

/**
 * Open overdue tasks bucketed by age in **working** days.
 *
 * Calendar days would age a Friday deadline by three days over a weekend
 * nobody worked.
 */
export async function taskAging(ctx) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  const today = todayISO()
  const { rows } = await sql.query(
    `select t.id, t.due_date, coalesce(p.region, 'IN') as region
       from tp_task t left join tp_person p on p.id = t.owner_id
      where t.status in ('todo','in_progress','blocked') and t.due_date < $2
        and ($1::bigint[] is null or t.owner_id = any($1::bigint[]))`,
    [ids, today]
  )

  const cfg = await getConfig()
  const weekOff = cfg.workday.week_off || [0, 6]
  const buckets = [
    { label: '0–2 days', min: 0, max: 2, n: 0 },
    { label: '3–5 days', min: 3, max: 5, n: 0 },
    { label: '6–10 days', min: 6, max: 10, n: 0 },
    { label: '10+ days', min: 11, max: Infinity, n: 0 },
  ]

  // Holidays are fetched once per region rather than per task.
  const regions = [...new Set(rows.map(r => r.region))]
  const earliest = rows.reduce((acc, r) => {
    const d = String(r.due_date).slice(0, 10)
    return !acc || d < acc ? d : acc
  }, null)
  const holidaysByRegion = {}
  for (const region of regions) {
    holidaysByRegion[region] = earliest ? await holidaySet(region, earliest, today) : new Set()
  }

  for (const r of rows) {
    const due = String(r.due_date).slice(0, 10)
    const holidays = holidaysByRegion[r.region] || new Set()
    const age = eachDate(addDays(due, 1), today)
      .filter(d => !weekOff.includes(dayOfWeek(d)) && !holidays.has(d)).length
    const bucket = buckets.find(b => age >= b.min && age <= b.max)
    if (bucket) bucket.n++
  }

  return buckets.map(({ label, n }) => ({ label, n }))
}

/** Estimated against actual hours, for the scatter. */
export async function effortScatter(ctx, { from, to }) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  const { rows } = await sql.query(
    `select t.id, t.title, t.est_hours::float as est, t.actual_hours::float as act, p.name as owner
       from tp_task t left join tp_person p on p.id = t.owner_id
      where t.status = 'done' and t.completed_at::date >= $2 and t.completed_at::date < $3
        and t.est_hours is not null and t.actual_hours is not null
        and ($1::bigint[] is null or t.owner_id = any($1::bigint[]))
      limit 400`,
    [ids, from, to]
  )
  return rows.map(r => ({
    id: Number(r.id), title: r.title, owner: r.owner, est: r.est, actual: r.act,
    over: r.act > r.est,
  }))
}

// ------------------------------------------------------------------ feedback

export async function feedbackMetrics(ctx, { from, to }, personId = null) {
  const ids = personId ? [personId] : (ctx.scope === 'all' ? null : ctx.ids)
  const { rows } = await sql.query(
    `select avg(score) filter (where source = 'client')::float as client_avg,
            count(*) filter (where source = 'client') as client_n,
            count(*) as total_n
       from tp_feedback
      where given_on >= $2 and given_on < $3
        and ($1::bigint[] is null or person_id = any($1::bigint[]))`,
    [ids, from, to]
  )
  const r = rows[0]
  return {
    clientScore: r.client_avg == null ? null : Math.round(r.client_avg * 10) / 10,
    clientCount: Number(r.client_n),
    feedbackCount: Number(r.total_n),
  }
}

// ---------------------------------------------------------------- attendance

/**
 * Attendance over a period.
 *
 * The working-day denominator comes from each person's own region calendar and
 * holiday table, not a hardcoded count, and a person is only counted from the
 * day they joined.
 */
export async function attendanceMetrics(ctx, { from, to }, personId = null) {
  const ids = personId ? [personId] : (ctx.scope === 'all' ? null : ctx.ids)

  const { rows: people } = await sql.query(
    `select id, region, date_joined_org from tp_person
      where active = true and ($1::bigint[] is null or id = any($1::bigint[]))`,
    [ids]
  )

  const { rows: marks } = await sql.query(
    `select type, count(*)::int as n, coalesce(sum(minutes_late), 0)::int as late_minutes,
            count(*) filter (where minutes_late > 0)::int as late_count
       from tp_attendance
      where date >= $2 and date < $3 and ($1::bigint[] is null or person_id = any($1::bigint[]))
      group by type`,
    [ids, from, to]
  )

  const byType = Object.fromEntries(marks.map(m => [m.type, m]))
  const unplanned = Number(byType.unplanned?.n || 0)
  const sick = Number(byType.sick?.n || 0)
  const planned = Number(byType.planned?.n || 0)
  const lateCount = marks.reduce((a, m) => a + Number(m.late_count), 0)
  const lateMinutes = marks.reduce((a, m) => a + Number(m.late_minutes), 0)

  const cfg = await getConfig()
  const weekOff = cfg.workday.week_off || [0, 6]

  let workingDayTotal = 0
  for (const p of people) {
    const joined = p.date_joined_org ? String(p.date_joined_org).slice(0, 10) : null
    const start = joined && joined > from ? joined : from
    if (start >= to) continue
    workingDayTotal += (await workingDays(p.region, start, to, weekOff)).length
  }

  return {
    workingDays: workingDayTotal,
    peopleCounted: people.length,
    unplannedDays: unplanned,
    sickDays: sick,
    plannedDays: planned,
    lateLogins: lateCount,
    avgMinutesLate: lateCount > 0 ? Math.round(lateMinutes / lateCount) : null,
    // Planned leave is approved time off and does not count against the rate.
    attendanceRatePct: pct1(ratio(workingDayTotal - unplanned - sick, workingDayTotal)),
  }
}

// ------------------------------------------------------------------ overtime

/**
 * Overtime is manually entered, so it is incomplete by nature. The coverage
 * count ships with the number so nobody reads a low total as a calm month.
 */
export async function overtimeMetrics(ctx, { from, to }, personId = null) {
  const ids = personId ? [personId] : (ctx.scope === 'all' ? null : ctx.ids)
  const { rows } = await sql.query(
    `select coalesce(sum(hours), 0)::float as hours, count(distinct person_id)::int as people
       from tp_overtime
      where date >= $2 and date < $3 and ($1::bigint[] is null or person_id = any($1::bigint[]))`,
    [ids, from, to]
  )
  const total = Number(rows[0].hours)
  return {
    overtimeHours: total > 0 ? total : null,
    peopleWithOvertime: Number(rows[0].people),
  }
}

// --------------------------------------------------------------- roll-up

export async function teamMetrics(ctx, query = {}) {
  const period = resolvePeriod(query)
  if (scopeIsEmpty(ctx)) {
    const cfg = await getConfig()
    return { period, targets: cfg.targets, scopeEmpty: true, ...EMPTY_METRICS }
  }
  const [delivery, feedback, attendance, overtime] = await Promise.all([
    deliveryMetrics(ctx, period),
    feedbackMetrics(ctx, period),
    attendanceMetrics(ctx, period),
    overtimeMetrics(ctx, period),
  ])
  const cfg = await getConfig()
  return {
    period,
    targets: cfg.targets,
    ...delivery,
    ...feedback,
    ...attendance,
    ...overtime,
    // Utilization needs billable hours, which nothing records yet. Reporting
    // null keeps it off the screen instead of inventing a denominator.
    utilizationPct: null,
  }
}

export async function personMetrics(ctx, personId, query = {}) {
  const period = resolvePeriod(query)
  if (scopeIsEmpty(ctx)) return { period, scopeEmpty: true, ...EMPTY_METRICS }
  const [delivery, feedback, attendance, overtime] = await Promise.all([
    deliveryMetrics(ctx, period, personId),
    feedbackMetrics(ctx, period, personId),
    attendanceMetrics(ctx, period, personId),
    overtimeMetrics(ctx, period, personId),
  ])
  return { period, ...delivery, ...feedback, ...attendance, ...overtime }
}

/**
 * Monthly trend for a metric set, used by the six-month sparklines.
 *
 * Reads the snapshot table where a month has been rolled up, and computes any
 * month that has not. A closed month never changes, so it is only computed
 * once.
 */
/**
 * Upserts one monthly snapshot.
 *
 * Team and person rows are guaranteed by two different partial unique indexes
 * (migration 002), because a plain unique constraint does not dedupe rows
 * whose person_id is NULL, so the conflict target differs per shape.
 */
async function saveSnapshot(personId, periodStart, metrics) {
  const payload = JSON.stringify(metrics)
  if (personId) {
    await sql`
      insert into tp_metric_snapshot (scope, person_id, period_start, metrics)
      values ('person', ${personId}, ${periodStart}, ${payload})
      on conflict (scope, person_id, period_start) where person_id is not null
        do update set metrics = excluded.metrics, computed_at = now()
    `
  } else {
    await sql`
      insert into tp_metric_snapshot (scope, person_id, period_start, metrics)
      values ('team', null, ${periodStart}, ${payload})
      on conflict (scope, period_start) where person_id is null
        do update set metrics = excluded.metrics, computed_at = now()
    `
  }
}

export async function monthlyTrend(ctx, { months = 6, personId = null } = {}) {
  const out = []
  const thisMonth = monthStart(todayISO())
  let cursor = thisMonth
  const starts = []
  for (let i = 0; i < months; i++) {
    starts.unshift(cursor)
    const d = new Date(cursor + 'T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() - 1)
    cursor = monthStart(d.toISOString().slice(0, 10))
  }

  const { rows: cached } = await sql.query(
    `select period_start, metrics from tp_metric_snapshot
      where scope = $1 and ($2::bigint is null and person_id is null or person_id = $2)
        and period_start = any($3::date[])`,
    [personId ? 'person' : 'team', personId, starts]
  )
  const cacheByStart = Object.fromEntries(
    cached.map(c => [String(c.period_start).slice(0, 10), c.metrics])
  )

  for (const start of starts) {
    const end = nextMonthStart(start)
    const isClosed = end <= thisMonth
    if (isClosed && cacheByStart[start]) {
      out.push({ month: start, ...cacheByStart[start] })
      continue
    }
    const metrics = personId
      ? await personMetrics(ctx, personId, { from: start, to: end })
      : await teamMetrics(ctx, { from: start, to: end })
    const slim = {
      onTimePct: metrics.onTimePct,
      clientScore: metrics.clientScore,
      reopenRatePct: metrics.reopenRatePct,
      defectsLeaked: metrics.defectsLeaked,
      unplannedDays: metrics.unplannedDays,
      overtimeHours: metrics.overtimeHours,
    }
    // Only a finished month is cached; the current one still moves.
    if (isClosed) await saveSnapshot(personId, start, slim)
    out.push({ month: start, ...slim })
  }

  return out
}
