// Formatters that render "no data" as an em dash instead of NaN, 0 or a
// fabricated value. A blank denominator is a fact about the data, not zero.

export const DASH = '—'

export const pct = (v, digits = 0) =>
  v == null || !Number.isFinite(Number(v)) ? DASH : `${Number(v).toFixed(digits)}%`

export const score = (v) =>
  v == null || !Number.isFinite(Number(v)) ? DASH : Number(v).toFixed(1)

export const hours = (v) =>
  v == null || !Number.isFinite(Number(v)) ? DASH : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(0)} h`

export const years = (v) =>
  v == null || !Number.isFinite(Number(v)) ? DASH : `${Number(v).toFixed(1)} yrs`

export const count = (v) => (v == null ? DASH : String(v))

export const initialsOf = (name) =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Dates are plain YYYY-MM-DD strings; parsing them with new Date() in a
 *  negative-offset zone shifts them a day, so they are split by hand. */
export function shortDate(iso) {
  if (!iso) return DASH
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return DASH
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}

/** Normalises a value to a 0-100 bar width against an explicit maximum, so a
 *  raw count can never produce a bar wider than its track. */
export function barWidth(value, max) {
  const v = Number(value)
  const m = Number(max)
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return '0.0%'
  return `${Math.max(0, Math.min(100, (v / m) * 100)).toFixed(1)}%`
}
