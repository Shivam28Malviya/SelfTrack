import { sql } from '../db.js'
import { HttpError } from '../auth.js'
import { str, int, num, isoDate, oneOf, id as parseId } from './validate.js'
import { getConfig } from './config.js'
import { todayISO, addDays, dayOfWeek, eachDate, holidaySet, monthStart, nextMonthStart } from './dates.js'
import { audit } from './audit.js'

export const ENTRY_TYPES = ['absence', 'late', 'feedback', 'achievement', 'overtime']

const ABSENCE_TYPES = ['planned', 'unplanned', 'sick']
const PRESENCE_TYPES = ['present', 'wfh']
const FEEDBACK_SOURCES = ['client', 'peer', 'leadership']

const MAX_FUTURE_DAYS = 90

/** Every entry type shares these: a person the caller may see, and a date
 *  inside the person's own employment window. */
async function resolvePerson(ctx, personId) {
  const pid = parseId(personId, 'Team member')
  if (ctx.scope !== 'all' && !ctx.ids.includes(pid)) throw new HttpError(404, 'Person not found.')
  const { rows } = await sql`select id, name, region, date_joined_org, active from tp_person where id = ${pid}`
  const person = rows[0]
  if (!person) throw new HttpError(404, 'Person not found.')
  if (!person.active) throw new HttpError(400, `${person.name} is deactivated. Reactivate them before logging anything.`)
  return person
}

function assertDateInWindow(person, date, field = 'Date') {
  const joined = person.date_joined_org ? String(person.date_joined_org).slice(0, 10) : null
  if (joined && date < joined) throw new HttpError(400, `${field} is before ${person.name} joined on ${joined}.`)
  const limit = addDays(todayISO(), MAX_FUTURE_DAYS)
  if (date > limit) throw new HttpError(400, `${field} cannot be more than ${MAX_FUTURE_DAYS} days in the future.`)
}

const minutesOfDay = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// ---------------------------------------------------------------- absence

/**
 * Logs an absence over one or more days.
 *
 * A multi-day absence expands to one row per working day: a Friday-to-Tuesday
 * leave is three days off, not five, and counting the weekend would distort
 * both the absence total and the attendance rate.
 */
export async function logAbsence(ctx, body) {
  const person = await resolvePerson(ctx, body.personId)
  const type = oneOf(body.type, 'Type', ABSENCE_TYPES)
  const from = isoDate(body.date, 'Date')
  const days = int(body.days, 'Days', { min: 1, max: 30, required: false, dflt: 1 })
  const note = str(body.note, 'Note', { required: false, max: 1000 })
  const force = body.force === true
  const overwrite = body.overwrite === true

  assertDateInWindow(person, from)

  const cfg = await getConfig()
  const weekOff = cfg.workday.week_off || [0, 6]
  const end = addDays(from, days)
  const holidays = await holidaySet(person.region, from, end)

  const candidates = eachDate(from, end)
  const working = candidates.filter(d => !weekOff.includes(dayOfWeek(d)) && !holidays.has(d))

  if (working.length === 0) {
    // Refusing beats silently writing nothing and reporting success.
    if (!force) {
      throw new HttpError(400, days === 1
        ? 'That date is a non-working day. Tick "log anyway" if it really is a working day for this person.'
        : 'Every day in that range is a weekend or holiday.')
    }
    working.push(...candidates)
  }

  const { rows: clashRows } = await sql.query(
    'select date, type from tp_attendance where person_id = $1 and date = any($2::date[])',
    [person.id, working]
  )
  if (clashRows.length > 0 && !overwrite) {
    return {
      conflict: true,
      existing: clashRows.map(r => ({ date: String(r.date).slice(0, 10), type: r.type })),
      message: `${person.name} already has attendance recorded on ${clashRows.length} of those days.`,
    }
  }

  const written = []
  for (const date of working) {
    const { rows: beforeRows } = await sql`
      select type, minutes_late, note from tp_attendance where person_id = ${person.id} and date = ${date}
    `
    await sql`
      insert into tp_attendance (person_id, date, type, note, created_by)
      values (${person.id}, ${date}, ${type}, ${note}, ${ctx.user.id})
      on conflict (person_id, date) do update
        set type = excluded.type, note = excluded.note,
            minutes_late = 0, login_time = null,
            created_by = excluded.created_by, updated_at = now()
    `
    written.push(date)
    await audit({
      actor: ctx.user,
      action: beforeRows[0] ? 'attendance.overwrite' : 'attendance.create',
      entity: 'attendance', personId: person.id,
      before: beforeRows[0] || null, after: { date, type, note },
    })
  }

  const skipped = candidates.filter(d => !working.includes(d))
  return {
    written: written.length,
    dates: written,
    skipped: skipped.length,
    message: skipped.length
      ? `Logged ${written.length} day(s). ${skipped.length} weekend or holiday day(s) were skipped.`
      : `Logged ${written.length} day(s).`,
  }
}

// ------------------------------------------------------------- late login

/**
 * Logs a late login.
 *
 * `minutes_late` is derived from the login time and the region's shift start,
 * never accepted from the caller: the design let both be typed, which allows
 * a 10:20 login recorded as 5 minutes late.
 */
export async function logLate(ctx, body) {
  const person = await resolvePerson(ctx, body.personId)
  const date = isoDate(body.date, 'Date', { max: todayISO() })
  const loginTime = str(body.loginTime, 'Login time', { max: 5 })
  if (!TIME_RE.test(loginTime)) throw new HttpError(400, 'Login time must be a 24-hour time such as 10:20.')
  const note = str(body.note, 'Note', { required: false, max: 1000 })

  assertDateInWindow(person, date)

  const cfg = await getConfig()
  const shift = cfg.workday.shift_start?.[person.region] || '09:30'
  const grace = Number(cfg.workday.grace_minutes ?? 0)
  const minutesLate = Math.max(0, minutesOfDay(loginTime) - minutesOfDay(shift) - grace)

  if (minutesLate === 0) {
    throw new HttpError(400, `${loginTime} is within the ${shift} start time plus ${grace} minutes of grace, so it is not a late login.`)
  }
  if (minutesLate > 480) throw new HttpError(400, 'That is more than eight hours late. Log it as an absence instead.')
  // A very late login is likelier to be a data-entry slip than a fact, so it
  // has to be explained.
  if (minutesLate > 240 && !note) throw new HttpError(400, 'More than four hours late needs a note explaining it.')

  const { rows: existing } = await sql`
    select type, minutes_late, login_time, note from tp_attendance where person_id = ${person.id} and date = ${date}
  `
  if (existing[0] && ABSENCE_TYPES.includes(existing[0].type)) {
    throw new HttpError(400, `${person.name} is recorded as ${existing[0].type} leave on that date. Remove the absence first.`)
  }

  const presence = existing[0] && PRESENCE_TYPES.includes(existing[0].type) ? existing[0].type : 'present'

  await sql`
    insert into tp_attendance (person_id, date, type, login_time, minutes_late, note, created_by)
    values (${person.id}, ${date}, ${presence}, ${loginTime}, ${minutesLate}, ${note}, ${ctx.user.id})
    on conflict (person_id, date) do update
      set login_time = excluded.login_time, minutes_late = excluded.minutes_late,
          note = excluded.note, created_by = excluded.created_by, updated_at = now()
  `
  await audit({
    actor: ctx.user, action: existing[0] ? 'late.update' : 'late.create',
    entity: 'attendance', personId: person.id,
    before: existing[0] || null, after: { date, loginTime, minutesLate },
  })

  return { minutesLate, shift, grace, message: `Logged ${minutesLate} minutes late against a ${shift} start.` }
}

// --------------------------------------------------------------- feedback

export async function logFeedback(ctx, body) {
  const person = await resolvePerson(ctx, body.personId)
  const source = oneOf(body.source, 'Source', FEEDBACK_SOURCES)
  const score = int(body.score, 'Score', { min: 1, max: 5 })
  const givenOn = isoDate(body.givenOn ?? body.date, 'Date', { max: todayISO() })
  const comment = str(body.comment, 'Comment', { required: false, max: 2000 })
  const taskId = body.taskId ? parseId(body.taskId, 'Task') : null
  const projectId = body.projectId ? parseId(body.projectId, 'Project') : null

  assertDateInWindow(person, givenOn)
  // Older than a year, it no longer describes how the person works now, and it
  // would silently reshape a closed reporting period.
  if (givenOn < addDays(todayISO(), -365)) throw new HttpError(400, 'Feedback older than 12 months cannot be added.')
  if (source === 'client' && !projectId) throw new HttpError(400, 'Client feedback needs a project.')

  if (source === 'client' && taskId) {
    const { rows } = await sql`
      select id from tp_feedback
       where person_id = ${person.id} and task_id = ${taskId} and source = 'client'
         and given_on >= ${monthStart(givenOn)} and given_on < ${nextMonthStart(givenOn)}
    `
    if (rows.length) throw new HttpError(400, 'Client feedback for that task this month is already recorded.')
  }

  const { rows } = await sql`
    insert into tp_feedback (person_id, source, score, comment, task_id, project_id, given_on, created_by)
    values (${person.id}, ${source}, ${score}, ${comment}, ${taskId}, ${projectId}, ${givenOn}, ${ctx.user.id})
    returning id
  `
  const entryId = Number(rows[0].id)
  await audit({ actor: ctx.user, action: 'feedback.create', entity: 'feedback', entityId: entryId, personId: person.id, after: { source, score, givenOn } })
  return { id: entryId, message: `Logged a ${score} of 5 from ${source}.` }
}

// ------------------------------------------------------------ achievement

export async function logAchievement(ctx, body) {
  const person = await resolvePerson(ctx, body.personId)
  const title = str(body.title, 'Achievement', { min: 3, max: 200 })
  const source = oneOf(body.source, 'From', FEEDBACK_SOURCES)
  const happenedOn = isoDate(body.happenedOn ?? body.date, 'Date', { max: todayISO() })
  const note = str(body.note, 'Note', { required: false, max: 1000 })

  assertDateInWindow(person, happenedOn)

  const { rows } = await sql`
    insert into tp_achievement (person_id, title, source, happened_on, note, created_by)
    values (${person.id}, ${title}, ${source}, ${happenedOn}, ${note}, ${ctx.user.id})
    returning id
  `
  const entryId = Number(rows[0].id)
  await audit({ actor: ctx.user, action: 'achievement.create', entity: 'achievement', entityId: entryId, personId: person.id, after: { title, source, happenedOn } })
  return { id: entryId, message: 'Achievement recorded.' }
}

// --------------------------------------------------------------- overtime

/**
 * Logs overtime hours.
 *
 * This is the hours source the overtime KPI was blocked on. It is manual and
 * therefore incomplete, so the overtime metric is always reported alongside
 * how many people have any overtime recorded at all.
 */
export async function logOvertime(ctx, body) {
  const person = await resolvePerson(ctx, body.personId)
  const date = isoDate(body.date, 'Date', { max: todayISO() })
  const hours = num(body.hours, 'Hours', { min: 0.5, max: 16 })
  const note = str(body.note, 'Note', { required: false, max: 1000 })

  assertDateInWindow(person, date)

  const { rows: sameDay } = await sql`
    select coalesce(sum(hours), 0)::float as total from tp_overtime where person_id = ${person.id} and date = ${date}
  `
  if (sameDay[0].total + hours > 16) {
    throw new HttpError(400, `That would put ${person.name} over 16 overtime hours on one day.`)
  }

  const { rows } = await sql`
    insert into tp_overtime (person_id, date, hours, note, created_by)
    values (${person.id}, ${date}, ${hours}, ${note}, ${ctx.user.id})
    returning id
  `
  const entryId = Number(rows[0].id)
  await audit({ actor: ctx.user, action: 'overtime.create', entity: 'overtime', entityId: entryId, personId: person.id, after: { date, hours } })
  return { id: entryId, message: `Logged ${hours} overtime hours.` }
}

export const HANDLERS = {
  absence: logAbsence,
  late: logLate,
  feedback: logFeedback,
  achievement: logAchievement,
  overtime: logOvertime,
}
