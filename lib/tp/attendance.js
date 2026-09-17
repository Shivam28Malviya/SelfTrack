import { sql } from '../db.js'
import { HttpError } from '../auth.js'
import { str, isoDate, oneOf, int, id as parseId } from './validate.js'
import { getConfig } from './config.js'
import {
  todayISO, addDays, dayOfWeek, eachDate, holidaySet, workingDays, monthStart, nextMonthStart,
} from './dates.js'
import { audit } from './audit.js'

export const DAY_STATES = ['present', 'wfh', 'planned', 'unplanned', 'sick', 'holiday', 'off', 'future', 'pre_joining']

function parseMonth(value) {
  const m = String(value || '').slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new HttpError(400, 'Month must be in YYYY-MM form.')
  return `${m}-01`
}

/**
 * The team calendar for one month.
 *
 * Every cell is one of the DAY_STATES, computed from the real calendar: the
 * design derived weekends from the day number, which only holds for a month
 * that happens to start on the right weekday, and assumed 30 days.
 */
export async function monthGrid(ctx, query = {}) {
  const start = query.month ? parseMonth(query.month) : monthStart(todayISO())
  const end = nextMonthStart(start)
  const days = eachDate(start, end)
  const today = todayISO()

  let ids = ctx.scope === 'all' ? null : ctx.ids
  // A single person can be asked for by id — the profile uses this — and the
  // request is still narrowed to what the caller may see.
  if (query.personId) {
    const only = parseId(query.personId, 'Person')
    if (ids && !ids.includes(only)) throw new HttpError(404, 'Person not found.')
    ids = [only]
  }
  if (ctx.scope === 'none' || (ids && ids.length === 0)) {
    return { month: start.slice(0, 7), days, rows: [], workingDays: 0 }
  }

  const { rows: people } = await sql.query(
    `select id, name, region, date_joined_org from tp_person
      where active = true and ($1::bigint[] is null or id = any($1::bigint[]))
      order by name`,
    [ids]
  )

  const { rows: marks } = await sql.query(
    `select person_id, date, type, minutes_late from tp_attendance
      where date >= $2 and date < $3 and ($1::bigint[] is null or person_id = any($1::bigint[]))`,
    [ids, start, end]
  )

  const marksByPerson = new Map()
  for (const m of marks) {
    const key = Number(m.person_id)
    if (!marksByPerson.has(key)) marksByPerson.set(key, new Map())
    marksByPerson.get(key).set(String(m.date).slice(0, 10), m)
  }

  const cfg = await getConfig()
  const weekOff = cfg.workday.week_off || [0, 6]
  const regions = [...new Set(people.map(p => p.region))]
  const holidaysByRegion = {}
  for (const region of regions) holidaysByRegion[region] = await holidaySet(region, start, end)

  const rows = people.map(p => {
    const mine = marksByPerson.get(Number(p.id)) || new Map()
    const holidays = holidaysByRegion[p.region] || new Set()
    const joined = p.date_joined_org ? String(p.date_joined_org).slice(0, 10) : null

    const cells = days.map(date => {
      if (joined && date < joined) return { date, state: 'pre_joining' }
      if (holidays.has(date)) return { date, state: 'holiday' }
      if (weekOff.includes(dayOfWeek(date))) return { date, state: 'off' }
      const mark = mine.get(date)
      if (mark) return { date, state: mark.type, minutesLate: mark.minutes_late || 0 }
      // An unrecorded past working day is not "present": nobody said so. It
      // is shown as missing so the gap is visible instead of flattering.
      return { date, state: date > today ? 'future' : 'present', recorded: false }
    })

    return { personId: Number(p.id), name: p.name, region: p.region, cells }
  })

  let workingDayTotal = 0
  for (const region of regions) {
    workingDayTotal = Math.max(workingDayTotal, (await workingDays(region, start, end, weekOff)).length)
  }

  return { month: start.slice(0, 7), days, rows, workingDays: workingDayTotal }
}

/** Late logins in a period, per person, with the previous period for a trend. */
export async function lateLoginTable(ctx, { from, to }) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  const span = eachDate(from, to).length || 1
  const prevFrom = addDays(from, -span)

  const { rows } = await sql.query(
    `select p.id, p.name,
            count(*) filter (where a.date >= $2 and a.date < $3)::int as n,
            coalesce(avg(a.minutes_late) filter (where a.date >= $2 and a.date < $3), 0)::float as avg_late,
            count(*) filter (where a.date >= $4 and a.date < $2)::int as prev_n
       from tp_person p
       join tp_attendance a on a.person_id = p.id and a.minutes_late > 0
      where p.active = true and ($1::bigint[] is null or p.id = any($1::bigint[]))
      group by p.id, p.name
      having count(*) filter (where a.date >= $2 and a.date < $3) > 0
      order by n desc, avg_late desc`,
    [ids, from, to, prevFrom]
  )

  return rows.map(r => ({
    personId: Number(r.id),
    name: r.name,
    count: Number(r.n),
    avgMinutes: Math.round(Number(r.avg_late)),
    // Direction is stated as a word, not only as a colour.
    trend: Number(r.n) > Number(r.prev_n) ? 'up' : Number(r.n) < Number(r.prev_n) ? 'down' : 'flat',
    previous: Number(r.prev_n),
  }))
}

/** Absence split by type over a period, for the stacked bars. */
export async function absenceByType(ctx, { from, to }) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  const { rows } = await sql.query(
    `select p.id, p.name,
            count(*) filter (where a.type = 'planned')::int   as planned,
            count(*) filter (where a.type = 'unplanned')::int as unplanned,
            count(*) filter (where a.type = 'sick')::int      as sick
       from tp_person p
       join tp_attendance a on a.person_id = p.id
      where a.date >= $2 and a.date < $3 and a.type in ('planned','unplanned','sick')
        and p.active = true and ($1::bigint[] is null or p.id = any($1::bigint[]))
      group by p.id, p.name
      order by unplanned desc, sick desc, planned desc`,
    [ids, from, to]
  )
  return rows.map(r => ({
    personId: Number(r.id),
    name: r.name,
    planned: Number(r.planned),
    unplanned: Number(r.unplanned),
    sick: Number(r.sick),
    total: Number(r.planned) + Number(r.unplanned) + Number(r.sick),
  }))
}

/**
 * People who have taken no leave for a long stretch.
 *
 * Reported as a fact with the last date, not as a diagnosis: no leave taken
 * may mean a heavy project, or a booked holiday nobody logged.
 */
export async function unusedLeave(ctx, { months = 6 } = {}) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  const cutoff = addDays(todayISO(), -Math.round(months * 30.4))
  const year = new Date().getUTCFullYear()

  const { rows } = await sql.query(
    `select p.id, p.name,
            max(a.date) filter (where a.type = 'planned') as last_planned,
            coalesce(b.entitled_days, 0)::float as entitled,
            coalesce(b.used_days, 0)::float as used
       from tp_person p
       left join tp_attendance a on a.person_id = p.id
       left join tp_leave_balance b on b.person_id = p.id and b.year = $2
      where p.active = true and ($1::bigint[] is null or p.id = any($1::bigint[]))
      group by p.id, p.name, b.entitled_days, b.used_days`,
    [ids, year]
  )

  return rows
    .map(r => ({
      personId: Number(r.id),
      name: r.name,
      lastPlanned: r.last_planned ? String(r.last_planned).slice(0, 10) : null,
      entitled: Number(r.entitled),
      used: Number(r.used),
      remaining: Number(r.entitled) - Number(r.used),
    }))
    .filter(r => !r.lastPlanned || r.lastPlanned < cutoff)
}

// ----------------------------------------------------------------- holidays

export async function listHolidays(query = {}) {
  const year = int(query.year, 'Year', { min: 2000, max: 2100, required: false, dflt: new Date().getUTCFullYear() })
  const { rows } = await sql`
    select date, region, name from tp_holiday
     where date >= ${`${year}-01-01`} and date < ${`${year + 1}-01-01`}
     order by date
  `
  return rows.map(r => ({ date: String(r.date).slice(0, 10), region: r.region, name: r.name }))
}

export async function addHoliday(ctx, body) {
  const date = isoDate(body.date, 'Date')
  const region = oneOf(body.region, 'Region', ['IN', 'UK'])
  const name = str(body.name, 'Name', { min: 2, max: 120 })
  await sql`
    insert into tp_holiday (date, region, name) values (${date}, ${region}, ${name})
    on conflict (date, region) do update set name = excluded.name
  `
  await audit({ actor: ctx.user, action: 'holiday.upsert', entity: 'holiday', after: { date, region, name } })
  return { date, region, name }
}

export async function removeHoliday(ctx, body) {
  const date = isoDate(body.date, 'Date')
  const region = oneOf(body.region, 'Region', ['IN', 'UK'])
  const { rows } = await sql`delete from tp_holiday where date = ${date} and region = ${region} returning name`
  if (!rows.length) throw new HttpError(404, 'That holiday is not in the calendar.')
  await audit({ actor: ctx.user, action: 'holiday.delete', entity: 'holiday', before: { date, region, name: rows[0].name } })
  return { date, region }
}

// ------------------------------------------------------------ leave requests

/**
 * Creates a leave request.
 *
 * A member may only request for themselves; a manager may raise one on behalf
 * of someone in their team. Approval, not the request, is what writes
 * attendance.
 */
export async function requestLeave(ctx, body) {
  const personId = body.personId ? parseId(body.personId, 'Person') : Number(ctx.self?.id || 0)
  if (!personId) throw new HttpError(400, 'No person to request leave for.')
  if (ctx.role === 'member' && personId !== Number(ctx.self?.id)) {
    throw new HttpError(403, 'You can only request leave for yourself.')
  }
  if (ctx.scope === 'ids' && !ctx.ids.includes(personId)) throw new HttpError(404, 'Person not found.')

  const from = isoDate(body.fromDate, 'From')
  const to = isoDate(body.toDate ?? body.fromDate, 'To')
  if (to < from) throw new HttpError(400, 'The end date is before the start date.')
  const type = oneOf(body.type, 'Type', ['planned', 'sick'], { required: false, dflt: 'planned' })
  const reason = str(body.reason, 'Reason', { required: false, max: 500 })

  const { rows: personRows } = await sql`select name, region, date_joined_org from tp_person where id = ${personId}`
  const person = personRows[0]
  if (!person) throw new HttpError(404, 'Person not found.')

  const cfg = await getConfig()
  const days = (await workingDays(person.region, from, addDays(to, 1), cfg.workday.week_off || [0, 6])).length
  if (days === 0) throw new HttpError(400, 'That range contains no working days.')
  if (days > 60) throw new HttpError(400, 'A single request cannot cover more than 60 working days.')

  const { rows: overlap } = await sql`
    select id from tp_leave_request
     where person_id = ${personId} and status in ('pending', 'approved')
       and from_date <= ${to} and to_date >= ${from}
  `
  if (overlap.length) throw new HttpError(400, 'That overlaps a request that is already pending or approved.')

  const { rows } = await sql`
    insert into tp_leave_request (person_id, from_date, to_date, type, reason, working_days, requested_by)
    values (${personId}, ${from}, ${to}, ${type}, ${reason}, ${days}, ${ctx.user.id})
    returning id
  `
  const requestId = Number(rows[0].id)
  await audit({ actor: ctx.user, action: 'leave.request', entity: 'leave', entityId: requestId, personId, after: { from, to, type, days } })

  const balance = await leaveBalance(personId)
  return {
    id: requestId,
    workingDays: days,
    // A request over the balance is a warning for the approver, not a block:
    // exceptions are a manager's call.
    warning: type === 'planned' && balance.entitled > 0 && days > balance.remaining
      ? `This is ${days} days against ${balance.remaining} remaining.`
      : null,
  }
}

export async function leaveBalance(personId) {
  const year = new Date().getUTCFullYear()
  const { rows } = await sql`
    select entitled_days, used_days from tp_leave_balance where person_id = ${personId} and year = ${year}
  `
  const entitled = Number(rows[0]?.entitled_days || 0)
  const used = Number(rows[0]?.used_days || 0)
  return { year, entitled, used, remaining: entitled - used }
}

export async function listLeave(ctx, query = {}) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  if (ctx.scope === 'none' || (ids && ids.length === 0)) return { requests: [] }
  const status = query.status ? oneOf(query.status, 'Status', ['pending', 'approved', 'rejected', 'withdrawn']) : null

  const { rows } = await sql.query(
    `select r.*, p.name as person_name from tp_leave_request r
       join tp_person p on p.id = r.person_id
      where ($1::bigint[] is null or r.person_id = any($1::bigint[]))
        and ($2::text is null or r.status = $2)
      order by r.status = 'pending' desc, r.from_date desc
      limit 100`,
    [ids, status]
  )

  return {
    requests: rows.map(r => ({
      id: Number(r.id),
      personId: Number(r.person_id),
      personName: r.person_name,
      fromDate: String(r.from_date).slice(0, 10),
      toDate: String(r.to_date).slice(0, 10),
      type: r.type,
      reason: r.reason,
      status: r.status,
      workingDays: r.working_days,
      decisionNote: r.decision_note,
      decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    })),
  }
}

/**
 * Approves or rejects a request.
 *
 * Approving is what writes attendance, one row per working day, and adds to
 * the used-days balance. An approver cannot approve their own request.
 */
export async function decideLeave(ctx, requestId, body) {
  const id = parseId(requestId, 'Request')
  const decision = oneOf(body.decision, 'Decision', ['approved', 'rejected'])
  const note = str(body.note, 'Note', { required: false, max: 500 })

  const { rows } = await sql`select * from tp_leave_request where id = ${id}`
  const request = rows[0]
  if (!request) throw new HttpError(404, 'Request not found.')
  if (request.status !== 'pending') throw new HttpError(400, `That request is already ${request.status}.`)
  if (ctx.scope === 'ids' && !ctx.ids.includes(Number(request.person_id))) throw new HttpError(404, 'Request not found.')
  if (Number(request.person_id) === Number(ctx.self?.id)) {
    throw new HttpError(403, 'You cannot decide your own leave request.')
  }

  await sql`
    update tp_leave_request
       set status = ${decision}, decided_by = ${ctx.user.id}, decided_at = now(),
           decision_note = ${note}, updated_at = now()
     where id = ${id}
  `

  let written = 0
  if (decision === 'approved') {
    const { rows: personRows } = await sql`select region from tp_person where id = ${request.person_id}`
    const cfg = await getConfig()
    const days = await workingDays(
      personRows[0].region,
      String(request.from_date).slice(0, 10),
      addDays(String(request.to_date).slice(0, 10), 1),
      cfg.workday.week_off || [0, 6]
    )
    for (const date of days) {
      await sql`
        insert into tp_attendance (person_id, date, type, note, created_by)
        values (${request.person_id}, ${date}, ${request.type}, ${`Approved leave #${id}`}, ${ctx.user.id})
        on conflict (person_id, date) do update
          set type = excluded.type, note = excluded.note, minutes_late = 0, login_time = null, updated_at = now()
      `
      written++
    }
    const year = Number(String(request.from_date).slice(0, 4))
    await sql`
      insert into tp_leave_balance (person_id, year, entitled_days, used_days)
      values (${request.person_id}, ${year}, 0, ${written})
      on conflict (person_id, year) do update set used_days = tp_leave_balance.used_days + ${written}
    `
  }

  await audit({
    actor: ctx.user, action: `leave.${decision}`, entity: 'leave', entityId: id,
    personId: Number(request.person_id),
    before: { status: 'pending' }, after: { status: decision, daysWritten: written, note },
  })

  return { id, status: decision, daysWritten: written }
}

export async function setLeaveEntitlement(ctx, personId, body) {
  const id = parseId(personId, 'Person')
  if (ctx.scope === 'ids' && !ctx.ids.includes(id)) throw new HttpError(404, 'Person not found.')
  const year = int(body.year, 'Year', { min: 2000, max: 2100, required: false, dflt: new Date().getUTCFullYear() })
  const entitled = int(body.entitledDays, 'Entitled days', { min: 0, max: 365 })
  await sql`
    insert into tp_leave_balance (person_id, year, entitled_days)
    values (${id}, ${year}, ${entitled})
    on conflict (person_id, year) do update set entitled_days = excluded.entitled_days
  `
  await audit({ actor: ctx.user, action: 'leave.entitlement', entity: 'leave_balance', personId: id, after: { year, entitled } })
  return leaveBalance(id)
}
