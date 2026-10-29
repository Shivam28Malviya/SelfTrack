import { sql } from '../db.js'
import { HttpError } from '../auth.js'
import { subtreeIds } from './roles.js'
import { str, int, isoDate, oneOf, id as parseId, bool } from './validate.js'
import { todayISO } from './dates.js'

export const DESIGNATIONS = ['Manager', 'Senior Consultant', 'Consultant', 'Analyst']
export const LOCATIONS = ['Client site', 'Office', 'Home']
export const REGIONS = ['IN', 'UK']

const initialsFrom = (name) =>
  String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

/**
 * Normalises and validates a person payload.
 *
 * Experience arrives in years from the UI because that is what people think
 * in, and is stored in months so a half-year is not a float.
 */
export function parsePersonInput(body = {}, { partial = false } = {}) {
  const out = {}
  const has = (k) => body[k] !== undefined
  const want = (k) => !partial || has(k)

  if (want('name')) out.name = str(body.name, 'Name', { min: 2, max: 80 })
  if (want('designation')) out.designation = oneOf(body.designation, 'Designation', DESIGNATIONS)
  if (want('workLocation')) out.work_location = oneOf(body.workLocation, 'Working from', LOCATIONS)
  if (want('region')) out.region = oneOf(body.region, 'Region', REGIONS, { required: false, dflt: 'IN' })

  if (has('initials')) out.initials = str(body.initials, 'Initials', { max: 4, required: false })
  if (want('name') && !out.initials) out.initials = initialsFrom(out.name || '')

  if (has('email')) {
    const email = str(body.email, 'Email', { required: false, max: 120 })
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email is not valid.')
    out.email = email || null
  }

  if (want('allocationPct')) {
    out.allocation_pct = int(body.allocationPct, 'Allocation', { min: 0, max: 100, required: false, dflt: 100 })
  }

  if (has('totalExpYears') || has('relevantExpYears') || !partial) {
    const total = Math.round(Number(body.totalExpYears ?? 0) * 12)
    const relevant = Math.round(Number(body.relevantExpYears ?? 0) * 12)
    if (!Number.isFinite(total) || total < 0 || total > 720) throw new HttpError(400, 'Total experience must be between 0 and 60 years.')
    if (!Number.isFinite(relevant) || relevant < 0) throw new HttpError(400, 'Relevant experience must be 0 or more.')
    // The export's sample data violated this on its own screens; the database
    // has the same constraint, this is the friendly version of the error.
    if (relevant > total) throw new HttpError(400, 'Relevant experience cannot exceed total experience.')
    out.total_exp_months = total
    out.relevant_exp_months = relevant
  }

  if (has('dateJoinedOrg')) out.date_joined_org = isoDate(body.dateJoinedOrg, 'Joining date', { required: false, max: todayISO() })
  if (has('dateJoinedTeam')) out.date_joined_team = isoDate(body.dateJoinedTeam, 'Team joining date', { required: false, max: todayISO() })
  if (has('projectId')) out.project_id = body.projectId ? parseId(body.projectId, 'Project') : null
  if (has('managerId')) out.manager_id = body.managerId ? parseId(body.managerId, 'Manager') : null
  if (has('active')) out.active = bool(body.active, 'Active', { dflt: true })

  if (has('statusOverride')) {
    const s = oneOf(body.statusOverride, 'Status', ['On track', 'Watch', 'At risk'], { required: false })
    out.status_override = s || null
    out.status_override_reason = str(body.statusOverrideReason, 'Reason', { required: false, max: 300 })
    // An override that silently replaces a computed status is unreviewable.
    if (out.status_override && !out.status_override_reason) {
      throw new HttpError(400, 'A status override needs a reason.')
    }
  }

  return out
}

/**
 * Rejects a manager assignment that would create a loop.
 *
 * The table constraint stops a person managing themselves. It cannot stop
 * A -> B -> A, which would make the recursive tree query in roles.js return a
 * truncated result forever after.
 */
export async function assertNoManagerCycle(personId, managerId) {
  if (!managerId) return
  if (personId && Number(managerId) === Number(personId)) {
    throw new HttpError(400, 'A person cannot be their own manager.')
  }
  if (!personId) return
  const descendants = await subtreeIds(personId)
  if (descendants.includes(Number(managerId))) {
    throw new HttpError(400, 'That manager reports to this person, which would create a loop.')
  }
}

export async function assertProjectExists(projectId) {
  if (!projectId) return
  const { rows } = await sql`select id from tp_project where id = ${projectId} and active = true`
  if (!rows.length) throw new HttpError(400, 'That project does not exist.')
}

/**
 * A manager may only place people inside their own tree. Without this, a
 * manager could reassign someone to a manager they cannot see, and lose access
 * to a record they are still responsible for.
 */
export async function assertManagerInScope(ctx, managerId) {
  if (ctx.scope === 'all' || !managerId) return
  if (!ctx.ids.includes(Number(managerId))) {
    throw new HttpError(400, 'You can only assign a manager from your own team.')
  }
}

/** Total allocation across a person's projects. Warned on, not blocked: a
 *  short overlap during a handover is normal and managers know it. */
export function allocationWarning(allocationPct) {
  return allocationPct > 100 ? 'Allocation is over 100%.' : null
}
