import test from 'node:test'
import assert from 'node:assert/strict'

import { int, num, isoDate, oneOf, str, paging, sortColumn, id } from '../lib/tp/validate.js'
import { addDays, dayOfWeek, eachDate, monthRange, toISO } from '../lib/tp/dates.js'
import { barWidth, shortDate, years, pct, score, initialsOf, DASH } from '../src/lib/tpFormat.js'
import { DEFAULTS } from '../lib/tp/config.js'

const throws = (fn, re) => assert.throws(fn, (e) => e.status === 400 && (!re || re.test(e.message)))

test('int rejects the values a loose Number() would let through', () => {
  assert.equal(int('7', 'x'), 7)
  throws(() => int('', 'x'))          // Number('') is 0
  throws(() => int('12abc', 'x'))     // NaN
  throws(() => int('1.5', 'x'))       // not an integer
  throws(() => int('Infinity', 'x'))
  throws(() => int(5, 'x', { max: 4 }))
  throws(() => int(-1, 'x', { min: 0 }))
  assert.equal(int(undefined, 'x', { required: false, dflt: 3 }), 3)
})

test('num enforces range but allows decimals', () => {
  assert.equal(num('2.5', 'h', { min: 0, max: 24 }), 2.5)
  throws(() => num('25', 'h', { max: 24 }))
})

test('isoDate accepts real dates only and never shifts a day', () => {
  assert.equal(isoDate('2026-09-17', 'date'), '2026-09-17')
  assert.equal(isoDate('2024-02-29', 'date'), '2024-02-29')   // real leap day
  assert.equal(isoDate('2026-09-17T11:30:00Z', 'date'), '2026-09-17')
  assert.equal(isoDate('', 'date', { required: false }), null)
  // 2026 is not a leap year, so 29 Feb must be rejected rather than rolled
  // forward to 1 March the way new Date() would.
  throws(() => isoDate('2026-02-29', 'date'), /not a real date/)
})

test('isoDate rejects impossible and malformed dates', () => {
  throws(() => isoDate('2026-02-30', 'date'), /not a real date/)
  throws(() => isoDate('17-09-2026', 'date'), /YYYY-MM-DD/)
  throws(() => isoDate('2026-13-01', 'date'))
  throws(() => isoDate('2026-01-05', 'date', { min: '2026-02-01' }), /cannot be before/)
  throws(() => isoDate('2026-12-05', 'date', { max: '2026-10-01' }), /cannot be after/)
})

test('oneOf and str guard enum and length', () => {
  assert.equal(oneOf('client', 'source', ['client', 'peer']), 'client')
  throws(() => oneOf('boss', 'source', ['client', 'peer']))
  assert.equal(str('  Priya  ', 'name'), 'Priya')
  throws(() => str('', 'name'), /required/)
  throws(() => str('a', 'name', { min: 2 }))
})

test('id rejects anything that is not a positive integer', () => {
  assert.equal(id('42', 'person id'), 42)
  throws(() => id('0', 'person id'))
  throws(() => id('-3', 'person id'))
  throws(() => id('abc', 'person id'))
})

test('paging clamps a caller asking for the whole table', () => {
  assert.deepEqual(paging({ limit: '10', page: '3' }), { limit: 10, page: 3, offset: 20 })
  assert.equal(paging({ limit: '100000' }).limit, 100)
  assert.equal(paging({ page: '-4' }).page, 1)
  assert.equal(paging({ limit: 'drop table' }).limit, 25)
})

test('sortColumn only ever emits a whitelisted column', () => {
  const map = { name: 'p.name', joined: 'p.date_joined_org' }
  assert.deepEqual(sortColumn('-joined', map, 'name'), { column: 'p.date_joined_org', direction: 'desc' })
  // An unknown or injected value falls back instead of reaching SQL.
  assert.deepEqual(sortColumn('name; drop table tp_person', map, 'name'), { column: 'p.name', direction: 'asc' })
})

test('date helpers cross month and year boundaries in UTC', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')   // 2026 is not a leap year
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')   // 2024 is
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(dayOfWeek('2026-09-17'), 4)               // a Thursday
  assert.equal(eachDate('2026-09-01', '2026-10-01').length, 30)
  assert.deepEqual(monthRange(2026, 2), { start: '2026-02-01', end: '2026-03-01' })
  assert.deepEqual(monthRange(2026, 12), { start: '2026-12-01', end: '2027-01-01' })
  assert.equal(toISO(new Date(Date.UTC(2026, 8, 17))), '2026-09-17')
})

test('bar widths never exceed their track', () => {
  assert.equal(barWidth(3, 6), '50.0%')
  assert.equal(barWidth(13, 6), '100.0%')   // the export's `days * 8 + '%'` overflowed here
  assert.equal(barWidth(-2, 6), '0.0%')
  assert.equal(barWidth(5, 0), '0.0%')      // divide by zero
  assert.equal(barWidth(null, 6), '0.0%')
})

test('formatters show an em dash rather than NaN or a fabricated zero', () => {
  assert.equal(pct(null), DASH)
  assert.equal(pct(undefined), DASH)
  assert.equal(pct(87), '87%')
  assert.equal(score(null), DASH)
  assert.equal(score(4.25), '4.3')
  assert.equal(years(null), DASH)
  assert.equal(years(8.44), '8.4 yrs')
})

test('short dates do not shift in a negative-offset timezone', () => {
  assert.equal(shortDate('2026-09-17'), '17 Sep 2026')
  assert.equal(shortDate('2026-01-01'), '1 Jan 2026')
  assert.equal(shortDate(null), DASH)
})

test('initials come from the name, not a stored duplicate', () => {
  assert.equal(initialsOf('Priya Deshmukh'), 'PD')
  assert.equal(initialsOf('  rohan  '), 'R')
  assert.equal(initialsOf(''), '')
})

test('config defaults cover every key the UI reads', () => {
  for (const key of ['targets', 'attention', 'workday', 'retention', 'skill_levels']) {
    assert.ok(DEFAULTS[key], `missing default for ${key}`)
  }
  assert.equal(DEFAULTS.attention.at_risk_signals, 3)
  assert.equal(DEFAULTS.targets.on_time_pct, 80)
})
