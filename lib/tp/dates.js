import { sql } from '../db.js'

// Calendar helpers. Attendance dates are plain calendar dates with no
// timezone: a day off in Pune is the same day off when a manager in London
// looks at it. Everything here works on 'YYYY-MM-DD' strings and UTC-anchored
// Date objects so no local offset can shift a day.

export const toISO = (d) => d.toISOString().slice(0, 10)
export const parseISO = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z')
export const todayISO = () => toISO(new Date())

export function addDays(iso, n) {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

/** 0 = Sunday .. 6 = Saturday, in UTC. */
export const dayOfWeek = (iso) => parseISO(iso).getUTCDay()

export function monthRange(year, month /* 1-12 */) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = toISO(new Date(Date.UTC(year, month, 1))) // exclusive
  return { start, end }
}

export function monthStart(iso) {
  return String(iso).slice(0, 7) + '-01'
}

export function nextMonthStart(iso) {
  const [y, m] = String(iso).slice(0, 7).split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export function eachDate(startISO, endExclusiveISO) {
  const out = []
  for (let d = startISO; d < endExclusiveISO; d = addDays(d, 1)) out.push(d)
  return out
}

export async function holidaySet(region, startISO, endExclusiveISO) {
  const { rows } = await sql`
    select date from tp_holiday
    where region = ${region} and date >= ${startISO} and date < ${endExclusiveISO}
  `
  return new Set(rows.map(r => toISO(new Date(r.date))))
}

/**
 * Working days in [start, end), honouring the region's holiday table.
 * The design export hardcoded "21 working days" and derived weekends from the
 * day number, which only holds for one particular month.
 */
export async function workingDays(region, startISO, endExclusiveISO, weekOff = [0, 6]) {
  const holidays = await holidaySet(region, startISO, endExclusiveISO)
  return eachDate(startISO, endExclusiveISO).filter(
    d => !weekOff.includes(dayOfWeek(d)) && !holidays.has(d)
  )
}

/** Working days strictly between two dates — used for task aging. */
export async function workingDaysBetween(region, fromISO, toISOExclusive, weekOff = [0, 6]) {
  if (toISOExclusive <= fromISO) return 0
  const days = await workingDays(region, fromISO, toISOExclusive, weekOff)
  return days.length
}
