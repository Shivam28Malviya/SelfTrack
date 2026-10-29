import { HttpError } from '../auth.js'

// Server-side validation. The client duplicates some of these for fast
// feedback; this file is the authority. See docs/teampulse-spec.md section 6.

export const bad = (msg) => { throw new HttpError(400, msg) }

export function str(value, field, { min = 0, max = 500, required = true, trim = true } = {}) {
  let v = value == null ? '' : String(value)
  if (trim) v = v.trim()
  if (!v) {
    if (required) bad(`${field} is required.`)
    return ''
  }
  if (v.length < min) bad(`${field} must be at least ${min} characters.`)
  if (v.length > max) bad(`${field} must be ${max} characters or fewer.`)
  return v
}

export function int(value, field, { min, max, required = true, dflt = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`${field} is required.`)
    return dflt
  }
  const n = Number(value)
  // Number('') is 0 and Number('12abc') is NaN — both are rejected here rather
  // than silently becoming a real value in the database.
  if (!Number.isFinite(n) || !Number.isInteger(n)) bad(`${field} must be a whole number.`)
  if (min !== undefined && n < min) bad(`${field} must be at least ${min}.`)
  if (max !== undefined && n > max) bad(`${field} must be at most ${max}.`)
  return n
}

export function num(value, field, { min, max, required = true, dflt = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`${field} is required.`)
    return dflt
  }
  const n = Number(value)
  if (!Number.isFinite(n)) bad(`${field} must be a number.`)
  if (min !== undefined && n < min) bad(`${field} must be at least ${min}.`)
  if (max !== undefined && n > max) bad(`${field} must be at most ${max}.`)
  return n
}

export function oneOf(value, field, allowed, { required = true, dflt = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`${field} is required.`)
    return dflt
  }
  const v = String(value)
  if (!allowed.includes(v)) bad(`${field} must be one of: ${allowed.join(', ')}.`)
  return v
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Validates an ISO calendar date and echoes it back as a YYYY-MM-DD string. */
export function isoDate(value, field, { required = true, min, max } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`${field} is required.`)
    return null
  }
  const v = String(value).slice(0, 10)
  if (!DATE_RE.test(v)) bad(`${field} must be a date in YYYY-MM-DD form.`)
  // Round-trips through UTC so the check never shifts a day in a local zone.
  const d = new Date(v + 'T00:00:00Z')
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    bad(`${field} is not a real date.`)
  }
  if (min && v < min) bad(`${field} cannot be before ${min}.`)
  if (max && v > max) bad(`${field} cannot be after ${max}.`)
  return v
}

export function bool(value, field, { dflt = false } = {}) {
  if (value === undefined || value === null || value === '') return dflt
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value === 'false' || value === 0 || value === '0') return false
  bad(`${field} must be true or false.`)
}

export function id(value, field, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`${field} is required.`)
    return null
  }
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) bad(`${field} is not a valid id.`)
  return n
}

/** Clamps a page size so a caller cannot ask for the whole table at once. */
export function paging(query, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit))
  const page = Math.max(1, Number(query.page) || 1)
  return { limit, page, offset: (page - 1) * limit }
}

/**
 * Whitelists a sort column. Never interpolate a caller-supplied column name
 * into SQL without passing it through a map like this.
 */
export function sortColumn(value, allowedMap, fallback) {
  const key = String(value || '').replace(/^-/, '')
  const column = allowedMap[key] || allowedMap[fallback]
  const direction = String(value || '').startsWith('-') ? 'desc' : 'asc'
  return { column, direction }
}
