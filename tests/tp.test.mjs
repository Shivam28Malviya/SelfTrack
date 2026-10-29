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

// ---- phase 2: person write path and CSV import ----
import { parseCsv, parseCsvObjects, toCsv } from '../lib/tp/csv.js'
import { parsePersonInput, assertNoManagerCycle } from '../lib/tp/personWrite.js'

test('CSV reader handles quotes, embedded commas and CRLF', () => {
  const rows = parseCsv('a,b\r\n"O\'Brien, Sean",2\r\n"say ""hi""",3\r\n')
  assert.deepEqual(rows, [['a', 'b'], ["O'Brien, Sean", '2'], ['say "hi"', '3']])
})

test('CSV reader keeps a field containing a newline in one cell', () => {
  const rows = parseCsv('a,b\n"line1\nline2",x\n')
  assert.equal(rows.length, 2)
  assert.equal(rows[1][0], 'line1\nline2')
  assert.equal(rows[1][1], 'x')
})

test('CSV reader drops a trailing newline and a BOM instead of making a blank row', () => {
  assert.equal(parseCsv('﻿name\nPriya\n').length, 2)
  assert.equal(parseCsv('name\nPriya\n\n\n').length, 2)
})

test('CSV headers are normalised to snake_case keys with a line number', () => {
  const { headers, records } = parseCsvObjects('Name,Total Exp Years\nPriya, 8.4 \n')
  assert.deepEqual(headers, ['name', 'total_exp_years'])
  assert.equal(records[0].name, 'Priya')
  assert.equal(records[0].total_exp_years, '8.4')
  assert.equal(records[0].__line, 2)   // header is line 1
})

test('toCsv quotes anything that would break the format', () => {
  const out = toCsv([{ a: 'x,y', b: 'say "hi"' }], [{ key: 'a' }, { key: 'b' }])
  assert.equal(out, 'a,b\r\n"x,y","say ""hi"""')
})

test('person input converts years to months and rejects the impossible combination', () => {
  const p = parsePersonInput({
    name: 'Priya D.', designation: 'Senior Consultant', workLocation: 'Client site',
    totalExpYears: 8.4, relevantExpYears: 6.1,
  })
  assert.equal(p.total_exp_months, 101)
  assert.equal(p.relevant_exp_months, 73)
  assert.equal(p.initials, 'PD')
  throws(() => parsePersonInput({
    name: 'X Y', designation: 'Analyst', workLocation: 'Office',
    totalExpYears: 2, relevantExpYears: 5,
  }), /cannot exceed total/)
})

test('person input rejects a bad designation, email and allocation', () => {
  const base = { name: 'X Y', designation: 'Analyst', workLocation: 'Office' }
  throws(() => parsePersonInput({ ...base, designation: 'Chief' }))
  throws(() => parsePersonInput({ ...base, workLocation: 'Beach' }))
  throws(() => parsePersonInput({ ...base, email: 'not-an-email' }))
  throws(() => parsePersonInput({ ...base, allocationPct: 140 }))
  throws(() => parsePersonInput({ ...base, name: 'A' }))
})

test('a status override without a reason is refused', () => {
  const base = { name: 'X Y', designation: 'Analyst', workLocation: 'Office' }
  throws(() => parsePersonInput({ ...base, statusOverride: 'At risk' }), /needs a reason/)
  const ok = parsePersonInput({ ...base, statusOverride: 'At risk', statusOverrideReason: 'Client escalation' })
  assert.equal(ok.status_override, 'At risk')
})

test('partial input only touches the keys it was given', () => {
  const p = parsePersonInput({ workLocation: 'Home' }, { partial: true })
  assert.deepEqual(Object.keys(p), ['work_location'])
})

test('a person cannot be made their own manager', async () => {
  await assert.rejects(() => assertNoManagerCycle(7, 7), (e) => e.status === 400)
  await assertNoManagerCycle(null, null)   // nothing to check, must not throw
})

// ---- phase 3: capture helpers ----
import { monthStart, nextMonthStart } from '../lib/tp/dates.js'

test('month boundaries wrap the year correctly', () => {
  assert.equal(monthStart('2026-09-17'), '2026-09-01')
  assert.equal(nextMonthStart('2026-09-17'), '2026-10-01')
  assert.equal(nextMonthStart('2026-12-31'), '2027-01-01')
  assert.equal(nextMonthStart('2026-01-01'), '2026-02-01')
})

test('minutes late are derived, not typed, and respect the grace period', () => {
  // Mirrors the server computation in lib/tp/entries.js logLate.
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const late = (login, shift, grace) => Math.max(0, mins(login) - mins(shift) - grace)
  assert.equal(late('10:20', '09:30', 10), 40)
  assert.equal(late('09:35', '09:30', 10), 0)   // inside grace: not late
  assert.equal(late('09:41', '09:30', 10), 1)
  assert.equal(late('08:00', '09:30', 10), 0)   // early, never negative
})

// ---- phase 4: tasks and metrics ----
import { parseTaskInput, applyStatusRules } from '../lib/tp/tasks.js'
import { resolvePeriod } from '../lib/tp/metrics.js'

test('marking a task done forces 100% and stamps a completion time', () => {
  const out = applyStatusRules(parseTaskInput({ title: 'Wave fix', status: 'done' }), null)
  assert.equal(out.progress_pct, 100)
  assert.ok(out.completed_at)
})

test('reopening a done task clears completion and counts the reopen', () => {
  const current = { status: 'done', progress_pct: 100, reopened_count: 1, blocked_reason: '' }
  const out = applyStatusRules({ status: 'in_progress' }, current)
  assert.equal(out.completed_at, null)
  assert.equal(out.reopened_count, 2)
  assert.equal(out.progress_pct, 90)   // no longer complete
})

test('blocking without a reason is refused, with one is allowed', () => {
  throws(() => applyStatusRules({ status: 'blocked' }, { status: 'todo', blocked_reason: '' }))
  const out = applyStatusRules({ status: 'blocked', blocked_reason: 'Waiting on client data' }, { status: 'todo' })
  assert.equal(out.status, 'blocked')
})

test('a reason already on the task satisfies a later block', () => {
  const out = applyStatusRules({ status: 'blocked' }, { status: 'todo', blocked_reason: 'Waiting on access' })
  assert.equal(out.status, 'blocked')
})

test('progress and status cannot disagree', () => {
  throws(() => applyStatusRules({ progress_pct: 100, status: 'in_progress' }, { status: 'todo' }),
    /should be marked done/)
})

test('task input rejects out-of-range hours and a short title', () => {
  throws(() => parseTaskInput({ title: 'ab' }))
  throws(() => parseTaskInput({ title: 'Valid title', estHours: 900 }))
  throws(() => parseTaskInput({ title: 'Valid title', actualHours: -1 }))
  const ok = parseTaskInput({ title: 'Valid title', estHours: '', actualHours: '' })
  assert.equal(ok.est_hours, null)
  assert.equal(ok.actual_hours, null)
})

test('periods resolve to whole months and an explicit range wins', () => {
  const month = resolvePeriod({ period: 'month', to: '2026-09-17' })
  assert.equal(month.from, '2026-08-01')
  assert.equal(month.to, '2026-09-17')
  const quarter = resolvePeriod({ period: 'quarter', to: '2026-09-17' })
  assert.equal(quarter.from, '2026-06-01')
  const year = resolvePeriod({ period: 'year', to: '2026-01-15' })
  assert.equal(year.from, '2025-01-01')
  const explicit = resolvePeriod({ from: '2026-01-01', to: '2026-02-01' })
  assert.deepEqual(explicit, { from: '2026-01-01', to: '2026-02-01' })
})

// ---- phase 5: calendar cells and leave ----
test('a month grid covers the real number of days, including February', () => {
  assert.equal(eachDate('2026-02-01', '2026-03-01').length, 28)
  assert.equal(eachDate('2024-02-01', '2024-03-01').length, 29)
  assert.equal(eachDate('2026-01-01', '2026-02-01').length, 31)
  assert.equal(eachDate('2026-04-01', '2026-05-01').length, 30)
})

test('weekends are derived from the real weekday, not the day number', () => {
  // 1 Feb 2026 is a Sunday; the export computed (n + 1) % 7, which only lines
  // up for one particular month.
  const weekend = eachDate('2026-02-01', '2026-03-01').filter(d => [0, 6].includes(dayOfWeek(d)))
  assert.equal(weekend.length, 8)
  assert.equal(weekend[0], '2026-02-01')
})

// ---- phase 6: skills ----
import { INDEPENDENT_LEVEL } from '../lib/tp/skills.js'

test('the independent level is the one the cover rule counts', () => {
  // Changing this changes who counts as cover for a skill, so it is pinned.
  assert.equal(INDEPENDENT_LEVEL, 3)
})

// ---- phase 7: attention status rules ----
import { STATUS } from '../lib/tp/attention.js'
import { DEFAULTS as CFG } from '../lib/tp/config.js'

// Mirrors statusFrom in lib/tp/attention.js, which is private to that module.
const statusFrom = (keys, rules = CFG.attention) => {
  const hasOvertime = keys.includes('overtime')
  const others = keys.filter(k => k !== 'overtime').length
  if (keys.length >= rules.at_risk_signals) return STATUS.AT_RISK
  if (hasOvertime && others >= 1) return STATUS.BURNOUT
  if (keys.length >= rules.watch_signals) return STATUS.WATCH
  if (hasOvertime) return STATUS.OVERTIME
  return STATUS.ON_TRACK
}

test('status follows the signal count, with overtime treated separately', () => {
  assert.equal(statusFrom([]), 'On track')
  assert.equal(statusFrom(['ontime_drop']), 'On track')        // one signal is not a flag
  assert.equal(statusFrom(['overtime']), 'Overtime')            // overtime alone is its own label
  assert.equal(statusFrom(['overtime', 'unplanned']), 'Burnout watch')
  assert.equal(statusFrom(['ontime_drop', 'unplanned']), 'Watch')
  assert.equal(statusFrom(['ontime_drop', 'unplanned', 'overdue']), 'At risk')
  assert.equal(statusFrom(['overtime', 'unplanned', 'overdue']), 'At risk')
})

test('lowering the thresholds flags more people, as configured', () => {
  const strict = { ...CFG.attention, watch_signals: 3, at_risk_signals: 4 }
  assert.equal(statusFrom(['ontime_drop', 'unplanned'], strict), 'On track')
  const loose = { ...CFG.attention, watch_signals: 1, at_risk_signals: 2 }
  assert.equal(statusFrom(['ontime_drop'], loose), 'Watch')
  assert.equal(statusFrom(['ontime_drop', 'unplanned'], loose), 'At risk')
})

// ---- phase 7: export watermark ----
import { toCsv as toCsvAgain } from '../lib/tp/csv.js'

test('an export row with a comma survives the CSV round trip', () => {
  const csv = toCsvAgain(
    [{ name: 'Rao, Priya', note: 'said "fine"' }],
    [{ key: 'name', label: 'Person' }, { key: 'note', label: 'Note' }]
  )
  assert.equal(csv, 'Person,Note\r\n"Rao, Priya","said ""fine"""')
})

// ---- phase 8: contrast of the token pairs that actually appear together ----
const srgb = (h) => h.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255)
const linear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (h) => {
  const [r, g, b] = srgb(h).map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('text token pairs meet WCAG AA, and marks meet 3:1', () => {
  const text = [
    ['muted on paper', '#565d6b', '#f0f0f0'],
    ['muted on tint', '#565d6b', '#dfe6ef'],
    ['muted on white', '#565d6b', '#ffffff'],
    ['ink on paper', '#1e325a', '#f0f0f0'],
    ['ok pill', '#17542f', '#e3f1e8'],
    ['warn pill', '#6b4000', '#fff4e5'],
    ['bad pill', '#8f2117', '#fde8e6'],
    ['info pill', '#3f4654', '#eef1f5'],
    ['white on navy', '#ffffff', '#1e325a'],
    ['ink on scale-3', '#10203f', '#8fa3c2'],
    // The heatmap's #6b7280 measured 4.43:1 here and was replaced.
    ['heatmap L0 label', '#5f6672', '#f3f5f8'],
  ]
  for (const [name, fg, bg] of text) {
    const r = contrast(fg, bg)
    assert.ok(r >= 4.5, `${name} is ${r.toFixed(2)}:1, under AA`)
  }

  const marks = [
    ['cat-1', '#4577c0'], ['cat-2', '#c9791a'], ['cat-3', '#2f8f6b'], ['bad fill', '#8f2117'],
  ]
  for (const [name, color] of marks) {
    const r = contrast(color, '#ffffff')
    assert.ok(r >= 3, `${name} is ${r.toFixed(2)}:1 against the chart surface, under 3:1`)
  }
})

test('the heatmap label colour that was replaced really did fail', () => {
  // #6b7280 on the palest heatmap cell is 4.43:1, just under AA.
  assert.ok(contrast('#6b7280', '#f3f5f8') < 4.5)
  // The export's own #5E6470 passes on the tint (4.73:1). It was still
  // darkened, for margin at 12px with wide letter-spacing, not to fix a
  // failure — recorded here so nobody "restores" it believing it was broken.
  assert.ok(contrast('#5E6470', '#dfe6ef') >= 4.5)
})

// ---- revalidation pass: the defects found reviewing the finished code ----
import { validateConfigValue } from '../lib/tp/config.js'
import { scopeIsEmpty } from '../lib/tp/metrics.js'

test('config values are type-checked against their defaults', () => {
  assert.equal(validateConfigValue('targets', { on_time_pct: '85' }).on_time_pct, 85)
  // Fields left out keep their default rather than vanishing.
  assert.equal(validateConfigValue('targets', { on_time_pct: 85 }).cert_target, 10)
  assert.equal(validateConfigValue('workday', { shift_start: { IN: '10:00' } }).shift_start.IN, '10:00')
  assert.deepEqual(validateConfigValue('skill_levels', ['a', 'b']), ['a', 'b'])

  throws(() => validateConfigValue('targets', 'hello'), /named values/)
  throws(() => validateConfigValue('targets', { on_time_pct: 'abc' }), /must be a number/)
  throws(() => validateConfigValue('targets', { on_time_pct: -5 }), /cannot be negative/)
  throws(() => validateConfigValue('skill_levels', { a: 1 }), /must be a list/)
  throws(() => validateConfigValue('skill_levels', [1, 2]), /list of text/)
  throws(() => validateConfigValue('nope', {}), /Unknown setting/)
})

test('an empty scope is recognised, so metrics can report nothing instead of zero', () => {
  assert.equal(scopeIsEmpty({ scope: 'none', ids: [] }), true)
  assert.equal(scopeIsEmpty({ scope: 'ids', ids: [] }), true)   // a login linked to nobody
  assert.equal(scopeIsEmpty({ scope: 'ids', ids: [7] }), false)
  assert.equal(scopeIsEmpty({ scope: 'all', ids: null }), false)
})

test('a bigint id from the driver does not compare equal to a number', () => {
  // Postgres returns int8 as a string. This is why the self-read audit check
  // fired on every read: '7' !== 7 is always true.
  const fromDriver = '7'
  assert.notEqual(fromDriver, 7)
  assert.equal(Number(fromDriver), 7)
})

// ---- embedded migrations ----
import { readFileSync } from 'node:fs'
import { buildSource } from '../scripts/build-migrations.mjs'
import { MIGRATIONS } from '../lib/tp/migrations.js'

test('the embedded migrations match db/migrations exactly', () => {
  // The generated file is what the deployed app applies. If someone edits a
  // .sql file and forgets to regenerate, production would silently run the
  // old SQL — so the drift is a test failure, not a convention.
  const onDisk = readFileSync(new URL('../lib/tp/migrations.js', import.meta.url), 'utf8')
  assert.equal(onDisk, buildSource(), 'run `npm run build:migrations`')
})

test('migrations are ordered, idempotent in shape, and non-empty', () => {
  assert.ok(MIGRATIONS.length >= 4)
  const names = MIGRATIONS.map(m => m.name)
  assert.deepEqual(names, [...names].sort(), 'migrations must apply in name order')
  for (const m of MIGRATIONS) {
    assert.ok(m.sql.trim().length > 0, `${m.name} is empty`)
    // Every create must tolerate a rerun: the runner has no transaction across
    // statements, so a half-applied file has to be finishable by running again.
    const creates = m.sql.match(/create (table|index|unique index)\s+(?!if not exists)/gi) || []
    assert.deepEqual(creates, [], `${m.name} has a create without "if not exists"`)
  }
})
