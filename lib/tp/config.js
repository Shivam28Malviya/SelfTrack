import { sql } from '../db.js'
import { HttpError } from '../auth.js'

// Targets, thresholds and calendar settings live in tp_config so they can be
// tuned without a deploy. Defaults here are the fallback when a key is missing
// (a fresh database, or a key added after the migration ran).
export const DEFAULTS = {
  targets: { on_time_pct: 80, client_score: 4.0, reopen_rate_pct: 8, effort_over_est_pct: 10, defects_leaked: 0, cert_target: 10 },
  attention: {
    ontime_drop_pp: 10, score_drop: 0.5, unplanned_days_90d: 3,
    overtime_hours_month: 20, overtime_months: 2,
    overdue_aged_tasks: 2, overdue_age_days: 5,
    at_risk_signals: 3, watch_signals: 2,
  },
  // grace_minutes: a login inside the grace period is not a late login. Without
  // it, a 09:31 arrival against a 09:30 shift becomes a tracked infraction.
  workday: { shift_start: { IN: '09:30', UK: '09:00' }, grace_minutes: 10, hours_per_day: 8, week_off: [0, 6] },
  retention: { raw_months: 24, aggregate_years: 5 },
  skill_levels: ['Not rated', 'Aware', 'Guided', 'Independent', 'Lead'],
}

export async function getConfig() {
  const { rows } = await sql`select key, value from tp_config`
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]))
  const out = {}
  for (const [key, dflt] of Object.entries(DEFAULTS)) {
    out[key] = Array.isArray(dflt) ? (stored[key] ?? dflt) : { ...dflt, ...(stored[key] || {}) }
  }
  return out
}

/**
 * Type-checks a config value against the shape of its default.
 *
 * Config drives targets, thresholds and the working calendar, so a wrong type
 * here does not fail at the settings form — it fails later, on a dashboard,
 * far from the change that caused it. Numbers must be finite numbers, arrays
 * must be arrays of strings, and unknown keys are dropped rather than stored.
 */
export function validateConfigValue(key, value) {
  const dflt = DEFAULTS[key]
  if (dflt === undefined) throw new HttpError(400, `Unknown setting "${key}".`)

  if (Array.isArray(dflt)) {
    if (!Array.isArray(value)) throw new HttpError(400, `${key} must be a list.`)
    if (value.some(v => typeof v !== 'string')) throw new HttpError(400, `${key} must be a list of text values.`)
    return value
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, `${key} must be a set of named values.`)
  }

  const out = {}
  for (const [field, fallback] of Object.entries(dflt)) {
    const given = value[field]
    if (given === undefined) { out[field] = fallback; continue }

    if (typeof fallback === 'number') {
      const n = Number(given)
      if (!Number.isFinite(n)) throw new HttpError(400, `${key}.${field} must be a number.`)
      if (n < 0) throw new HttpError(400, `${key}.${field} cannot be negative.`)
      out[field] = n
    } else if (Array.isArray(fallback)) {
      if (!Array.isArray(given)) throw new HttpError(400, `${key}.${field} must be a list.`)
      out[field] = given
    } else if (typeof fallback === 'object' && fallback !== null) {
      // A per-region map, such as shift_start. Values are checked as text.
      if (typeof given !== 'object' || given === null) throw new HttpError(400, `${key}.${field} must be a set of named values.`)
      const nested = {}
      for (const [k2, v2] of Object.entries(given)) {
        if (typeof v2 !== 'string') throw new HttpError(400, `${key}.${field}.${k2} must be text.`)
        nested[k2] = v2
      }
      out[field] = nested
    } else {
      out[field] = String(given)
    }
  }
  return out
}

export async function setConfig(key, value) {
  await sql`
    insert into tp_config (key, value, updated_at) values (${key}, ${JSON.stringify(value)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `
}
