import { sql } from '../db.js'
import { HttpError } from '../auth.js'
import { str, int, num, isoDate, oneOf, id as parseId, paging } from './validate.js'
import { audit } from './audit.js'
import { todayISO, addDays } from './dates.js'

/**
 * A single reverse-chronological feed across the entry tables, so a
 * mistyped entry can be found and corrected. The design export could only
 * create entries, which makes every typo permanent.
 */
export const FEED_KINDS = ['attendance', 'feedback', 'achievement', 'overtime']

export async function listEntries(ctx, query = {}) {
  const { limit, page, offset } = paging(query, { defaultLimit: 30, maxLimit: 100 })
  const from = query.from ? isoDate(query.from, 'From') : addDays(todayISO(), -90)
  const to = query.to ? isoDate(query.to, 'To') : addDays(todayISO(), 1)
  const kinds = query.kind ? [oneOf(query.kind, 'Kind', FEED_KINDS)] : FEED_KINDS

  if (ctx.scope === 'none') return { entries: [], total: 0, page, limit }
  const scopeIds = ctx.scope === 'ids' ? ctx.ids : null
  if (scopeIds && scopeIds.length === 0) return { entries: [], total: 0, page, limit }

  const personId = query.personId ? parseId(query.personId, 'Person') : null
  if (personId && scopeIds && !scopeIds.includes(personId)) throw new HttpError(404, 'Person not found.')

  // One UNION so paging is correct across kinds. Filtering in SQL rather than
  // fetching everything and slicing in the browser.
  const parts = []
  if (kinds.includes('attendance')) parts.push(`
    select 'attendance' as kind, a.id, a.person_id, p.name as person_name, a.date as on_date,
           a.type as label,
           case when a.minutes_late > 0 then a.minutes_late || ' min late' else '' end as detail,
           a.note, a.created_at, a.created_by
      from tp_attendance a join tp_person p on p.id = a.person_id`)
  if (kinds.includes('feedback')) parts.push(`
    select 'feedback' as kind, f.id, f.person_id, p.name as person_name, f.given_on as on_date,
           f.source as label, f.score || ' of 5' as detail,
           f.comment as note, f.created_at, f.created_by
      from tp_feedback f join tp_person p on p.id = f.person_id`)
  if (kinds.includes('achievement')) parts.push(`
    select 'achievement' as kind, w.id, w.person_id, p.name as person_name, w.happened_on as on_date,
           w.source as label, w.title as detail,
           w.note, w.created_at, w.created_by
      from tp_achievement w join tp_person p on p.id = w.person_id`)
  if (kinds.includes('overtime')) parts.push(`
    select 'overtime' as kind, o.id, o.person_id, p.name as person_name, o.date as on_date,
           'overtime' as label, o.hours || ' h' as detail,
           o.note, o.created_at, o.created_by
      from tp_overtime o join tp_person p on p.id = o.person_id`)

  const params = []
  const bind = (v) => { params.push(v); return `$${params.length}` }
  const fromP = bind(from)
  const toP = bind(to)
  const conditions = [`u.on_date >= ${fromP}`, `u.on_date < ${toP}`]
  if (scopeIds) conditions.push(`u.person_id = any(${bind(scopeIds)}::bigint[])`)
  if (personId) conditions.push(`u.person_id = ${bind(personId)}`)

  const unionSql = `select * from (${parts.join(' union all ')}) u where ${conditions.join(' and ')}`

  const countRes = await sql.query(`select count(*)::int as n from (${unionSql}) c`, params)
  const rowsRes = await sql.query(
    `${unionSql} order by u.on_date desc, u.created_at desc limit ${bind(limit)} offset ${bind(offset)}`,
    params
  )

  return {
    entries: rowsRes.rows.map(r => ({
      kind: r.kind,
      id: Number(r.id),
      personId: Number(r.person_id),
      personName: r.person_name,
      date: String(r.on_date).slice(0, 10),
      label: r.label,
      detail: r.detail || '',
      note: r.note || '',
      createdAt: new Date(r.created_at).toISOString(),
    })),
    total: countRes.rows[0].n,
    page,
    limit,
  }
}

const TABLES = {
  attendance: 'tp_attendance',
  feedback: 'tp_feedback',
  achievement: 'tp_achievement',
  overtime: 'tp_overtime',
}

async function loadEntry(kind, entryId) {
  const table = TABLES[kind]
  const { rows } = await sql.query(`select * from ${table} where id = $1`, [entryId])
  return rows[0] || null
}

function assertEntryScope(ctx, row) {
  if (!row) throw new HttpError(404, 'Entry not found.')
  if (ctx.scope === 'all') return
  if (ctx.scope === 'ids' && ctx.ids.includes(Number(row.person_id))) return
  throw new HttpError(404, 'Entry not found.')
}

/** Only the free-text and value fields are editable. Moving an entry to a
 *  different person would rewrite two people's history at once; that is a
 *  delete and a re-entry, and the audit trail shows both. */
const EDITABLE = {
  attendance: (body) => {
    const out = {}
    if (body.type !== undefined) out.type = oneOf(body.type, 'Type', ['present', 'wfh', 'planned', 'unplanned', 'sick', 'holiday'])
    if (body.note !== undefined) out.note = str(body.note, 'Note', { required: false, max: 1000 })
    return out
  },
  feedback: (body) => {
    const out = {}
    if (body.score !== undefined) out.score = int(body.score, 'Score', { min: 1, max: 5 })
    if (body.comment !== undefined) out.comment = str(body.comment, 'Comment', { required: false, max: 2000 })
    return out
  },
  achievement: (body) => {
    const out = {}
    if (body.title !== undefined) out.title = str(body.title, 'Achievement', { min: 3, max: 200 })
    if (body.note !== undefined) out.note = str(body.note, 'Note', { required: false, max: 1000 })
    return out
  },
  overtime: (body) => {
    const out = {}
    if (body.hours !== undefined) out.hours = num(body.hours, 'Hours', { min: 0.5, max: 16 })
    if (body.note !== undefined) out.note = str(body.note, 'Note', { required: false, max: 1000 })
    return out
  },
}

export async function updateEntry(ctx, kind, entryId, body) {
  const k = oneOf(kind, 'Kind', FEED_KINDS)
  const row = await loadEntry(k, parseId(entryId, 'Entry'))
  assertEntryScope(ctx, row)

  const patch = EDITABLE[k](body || {})
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to change.')

  const keys = Object.keys(patch)
  const setSql = keys.map((c, i) => `${c} = $${i + 1}`).join(', ')
  const hasUpdatedAt = k === 'attendance' || k === 'feedback'
  await sql.query(
    `update ${TABLES[k]} set ${setSql}${hasUpdatedAt ? ', updated_at = now()' : ''} where id = $${keys.length + 1}`,
    [...keys.map(c => patch[c]), row.id]
  )

  const after = await loadEntry(k, row.id)
  await audit({ actor: ctx.user, action: `${k}.update`, entity: k, entityId: Number(row.id), personId: Number(row.person_id), before: row, after })
  return { kind: k, id: Number(row.id) }
}

export async function deleteEntry(ctx, kind, entryId) {
  const k = oneOf(kind, 'Kind', FEED_KINDS)
  const row = await loadEntry(k, parseId(entryId, 'Entry'))
  assertEntryScope(ctx, row)

  await sql.query(`delete from ${TABLES[k]} where id = $1`, [row.id])
  // The row is gone, so the audit entry carries its whole previous value —
  // that is the only remaining record of it.
  await audit({ actor: ctx.user, action: `${k}.delete`, entity: k, entityId: Number(row.id), personId: Number(row.person_id), before: row })
  return { kind: k, id: Number(row.id) }
}

export async function listAudit(ctx, query = {}) {
  const { limit, page, offset } = paging(query, { defaultLimit: 50, maxLimit: 200 })
  const params = []
  const bind = (v) => { params.push(v); return `$${params.length}` }
  const conditions = []

  if (ctx.scope === 'ids') {
    if (ctx.ids.length === 0) return { entries: [], total: 0, page, limit }
    // A manager sees audit rows about their own team, plus their own actions.
    conditions.push(`(person_id = any(${bind(ctx.ids)}::bigint[]) or actor_id = ${bind(ctx.user.id)})`)
  } else if (ctx.scope === 'none') {
    return { entries: [], total: 0, page, limit }
  }
  if (query.personId) conditions.push(`person_id = ${bind(parseId(query.personId, 'Person'))}`)
  if (query.action) conditions.push(`action = ${bind(str(query.action, 'Action', { max: 60 }))}`)

  const whereSql = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const countRes = await sql.query(`select count(*)::int as n from tp_audit ${whereSql}`, params)
  const rowsRes = await sql.query(
    `select * from tp_audit ${whereSql} order by ts desc limit ${bind(limit)} offset ${bind(offset)}`,
    params
  )

  return {
    entries: rowsRes.rows.map(r => ({
      id: Number(r.id),
      ts: new Date(r.ts).toISOString(),
      actorName: r.actor_name || 'System',
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id == null ? null : Number(r.entity_id),
      personId: r.person_id == null ? null : Number(r.person_id),
      before: r.before,
      after: r.after,
    })),
    total: countRes.rows[0].n,
    page,
    limit,
  }
}
