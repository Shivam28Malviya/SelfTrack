import { sql } from '../db.js'
import { paging, sortColumn } from './validate.js'

export const monthsToYears = (m) => (m == null ? null : Math.round((m / 12) * 10) / 10)

export function rowToPerson(p) {
  return {
    id: Number(p.id),
    userId: p.user_id,
    name: p.name,
    initials: p.initials,
    email: p.email,
    designation: p.designation,
    managerId: p.manager_id == null ? null : Number(p.manager_id),
    managerName: p.manager_name ?? null,
    projectId: p.project_id == null ? null : Number(p.project_id),
    projectName: p.project_name ?? null,
    client: p.client ?? null,
    region: p.region,
    workLocation: p.work_location,
    allocationPct: p.allocation_pct,
    dateJoinedOrg: p.date_joined_org ? String(p.date_joined_org).slice(0, 10) : null,
    dateJoinedTeam: p.date_joined_team ? String(p.date_joined_team).slice(0, 10) : null,
    totalExpYears: monthsToYears(p.total_exp_months),
    relevantExpYears: monthsToYears(p.relevant_exp_months),
    statusOverride: p.status_override,
    statusOverrideReason: p.status_override_reason,
    active: p.active,
  }
}

const SORTABLE = {
  name: 'p.name',
  designation: 'p.designation',
  experience: 'p.total_exp_months',
  relevant: 'p.relevant_exp_months',
  project: 'pr.name',
  location: 'p.work_location',
  joined: 'p.date_joined_org',
}

/**
 * Filtered, sorted, paginated people list, restricted to what `ctx` may see.
 *
 * Filtering and paging happen in SQL rather than in the browser. The design
 * prototype filtered a hardcoded array of twelve; that approach stops working
 * somewhere around two hundred people.
 */
export async function listPeople(ctx, query = {}) {
  const { limit, page, offset } = paging(query)
  const { column, direction } = sortColumn(query.sort, SORTABLE, 'name')

  const where = []
  const params = []

  // Adds one parameter and returns its placeholder, so a clause can reference
  // the same value more than once without pushing it twice.
  const bind = (value) => { params.push(value); return `$${params.length}` }

  if (ctx.scope === 'none') return { people: [], total: 0, page, limit }
  if (ctx.scope === 'ids') {
    if (ctx.ids.length === 0) return { people: [], total: 0, page, limit }
    where.push(`p.id = any(${bind(ctx.ids)}::bigint[])`)
  }

  if (query.q) {
    const q = bind(`%${query.q}%`)
    where.push(`(p.name ilike ${q} or p.email ilike ${q})`)
  }
  if (query.designation && query.designation !== 'All') where.push(`p.designation = ${bind(query.designation)}`)
  if (query.projectId) where.push(`p.project_id = ${bind(Number(query.projectId))}`)
  if (query.location && query.location !== 'All') where.push(`p.work_location = ${bind(query.location)}`)
  if (query.managerId) where.push(`p.manager_id = ${bind(Number(query.managerId))}`)

  // Inactive people stay queryable for history, but are hidden by default.
  if (query.includeInactive !== 'true') where.push('p.active = true')

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''

  const countRes = await sql.query(
    `select count(*)::int as n from tp_person p ${whereSql}`,
    params
  )

  const rowsRes = await sql.query(
    `select p.*, m.name as manager_name, pr.name as project_name, pr.client
       from tp_person p
       left join tp_person m on m.id = p.manager_id
       left join tp_project pr on pr.id = p.project_id
       ${whereSql}
       order by ${column} ${direction} nulls last, p.id asc
       limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, offset]
  )

  return {
    people: rowsRes.rows.map(rowToPerson),
    total: countRes.rows[0].n,
    page,
    limit,
  }
}

export async function getPerson(personId) {
  const { rows } = await sql`
    select p.*, m.name as manager_name, pr.name as project_name, pr.client
      from tp_person p
      left join tp_person m on m.id = p.manager_id
      left join tp_project pr on pr.id = p.project_id
     where p.id = ${personId}
  `
  return rows[0] ? rowToPerson(rows[0]) : null
}
