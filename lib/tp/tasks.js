import { sql } from '../db.js'
import { HttpError } from '../auth.js'
import { str, int, num, isoDate, oneOf, bool, id as parseId, paging, sortColumn } from './validate.js'
import { audit } from './audit.js'
import { todayISO } from './dates.js'

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled']
const OPEN_STATUSES = ['todo', 'in_progress', 'blocked']

export function rowToTask(t) {
  return {
    id: Number(t.id),
    title: t.title,
    projectId: t.project_id == null ? null : Number(t.project_id),
    projectName: t.project_name ?? null,
    client: t.client ?? null,
    ownerId: t.owner_id == null ? null : Number(t.owner_id),
    ownerName: t.owner_name ?? null,
    status: t.status,
    progressPct: t.progress_pct,
    dueDate: t.due_date ? String(t.due_date).slice(0, 10) : null,
    completedAt: t.completed_at ? new Date(t.completed_at).toISOString() : null,
    estHours: t.est_hours == null ? null : Number(t.est_hours),
    actualHours: t.actual_hours == null ? null : Number(t.actual_hours),
    reopenedCount: t.reopened_count,
    leakedToUat: t.leaked_to_uat,
    blockedReason: t.blocked_reason,
    updatedAt: t.updated_at ? new Date(t.updated_at).toISOString() : null,
  }
}

export function parseTaskInput(body = {}, { partial = false } = {}) {
  const out = {}
  const has = (k) => body[k] !== undefined
  const want = (k) => !partial || has(k)

  if (want('title')) out.title = str(body.title, 'Title', { min: 3, max: 200 })
  if (want('ownerId')) out.owner_id = body.ownerId ? parseId(body.ownerId, 'Owner') : null
  if (has('projectId')) out.project_id = body.projectId ? parseId(body.projectId, 'Project') : null
  if (want('status')) out.status = oneOf(body.status, 'Status', TASK_STATUSES, { required: false, dflt: 'todo' })
  if (has('dueDate')) out.due_date = isoDate(body.dueDate, 'Due date', { required: false })
  if (has('progressPct')) out.progress_pct = int(body.progressPct, 'Progress', { min: 0, max: 100, required: false, dflt: 0 })
  if (has('estHours')) out.est_hours = body.estHours === '' || body.estHours == null ? null : num(body.estHours, 'Estimated hours', { min: 0.25, max: 500 })
  if (has('actualHours')) out.actual_hours = body.actualHours === '' || body.actualHours == null ? null : num(body.actualHours, 'Actual hours', { min: 0, max: 2000 })
  if (has('leakedToUat')) out.leaked_to_uat = bool(body.leakedToUat, 'Leaked to UAT', { dflt: false })
  if (has('blockedReason')) out.blocked_reason = str(body.blockedReason, 'Blocked reason', { required: false, max: 500 })

  return out
}

/**
 * Applies the status rules that the schema cannot express.
 *
 * `done` forces 100% and stamps a completion time; reopening a completed task
 * clears it and increments the reopen count, which is what the reopen-rate and
 * on-time metrics read. Blocking without a reason produces a board nobody can
 * act on, so it is refused.
 */
export function applyStatusRules(patch, current) {
  const next = { ...patch }
  const status = next.status ?? current?.status
  const wasDone = current?.status === 'done'

  if (status === 'done') {
    next.progress_pct = 100
    if (!current || !wasDone) next.completed_at = new Date().toISOString()
  }

  if (status === 'blocked') {
    const reason = next.blocked_reason ?? current?.blocked_reason ?? ''
    if (!reason.trim()) throw new HttpError(400, 'A blocked task needs a reason.')
  }

  if (current && wasDone && status && status !== 'done') {
    next.completed_at = null
    next.reopened_count = (current.reopened_count ?? 0) + 1
    if (next.progress_pct === undefined && current.progress_pct === 100) next.progress_pct = 90
  }

  if (status === 'cancelled') next.progress_pct = next.progress_pct ?? current?.progress_pct ?? 0

  // Progress and status must agree, or the board says one thing and the bar
  // another.
  if (next.progress_pct === 100 && status && status !== 'done' && status !== 'cancelled') {
    throw new HttpError(400, 'A task at 100% should be marked done.')
  }

  return next
}

async function assertOwnerVisible(ctx, ownerId) {
  if (!ownerId) return
  if (ctx.scope === 'all') return
  if (!ctx.ids.includes(Number(ownerId))) throw new HttpError(400, 'You can only assign tasks to people in your team.')
}

export async function createTask(ctx, body) {
  const patch = applyStatusRules(parseTaskInput(body), null)
  await assertOwnerVisible(ctx, patch.owner_id)

  // due_date >= creation date cannot be a check constraint (timestamptz::date
  // is not immutable), so it is enforced here.
  if (patch.due_date && patch.due_date < todayISO()) {
    throw new HttpError(400, 'A new task cannot be due before today.')
  }

  const { rows } = await sql`
    insert into tp_task
      (title, project_id, owner_id, status, progress_pct, due_date, completed_at,
       est_hours, actual_hours, leaked_to_uat, blocked_reason, created_by)
    values
      (${patch.title}, ${patch.project_id ?? null}, ${patch.owner_id ?? null},
       ${patch.status ?? 'todo'}, ${patch.progress_pct ?? 0}, ${patch.due_date ?? null},
       ${patch.completed_at ?? null}, ${patch.est_hours ?? null}, ${patch.actual_hours ?? null},
       ${patch.leaked_to_uat ?? false}, ${patch.blocked_reason ?? ''}, ${ctx.user.id})
    returning id
  `
  const taskId = Number(rows[0].id)
  await sql`
    insert into tp_task_event (task_id, actor_id, from_status, to_status, note)
    values (${taskId}, ${ctx.user.id}, '', ${patch.status ?? 'todo'}, 'created')
  `
  await audit({ actor: ctx.user, action: 'task.create', entity: 'task', entityId: taskId, personId: patch.owner_id ?? null, after: patch })
  return getTask(taskId)
}

export async function updateTask(ctx, taskId, body) {
  const id = parseId(taskId, 'Task')
  const { rows: currentRows } = await sql`select * from tp_task where id = ${id}`
  const current = currentRows[0]
  if (!current) throw new HttpError(404, 'Task not found.')
  if (ctx.scope === 'ids' && current.owner_id != null && !ctx.ids.includes(Number(current.owner_id))) {
    throw new HttpError(404, 'Task not found.')
  }

  const expected = body?.updatedAt
  if (expected && new Date(expected).getTime() !== new Date(current.updated_at).getTime()) {
    throw new HttpError(409, 'Someone else changed this task while you were editing it. Reload and try again.')
  }

  const patch = applyStatusRules(parseTaskInput(body, { partial: true }), current)
  if ('owner_id' in patch) await assertOwnerVisible(ctx, patch.owner_id)
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to update.')

  const keys = Object.keys(patch)
  const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  await sql.query(
    `update tp_task set ${setSql}, updated_at = now() where id = $${keys.length + 1}`,
    [...keys.map(k => patch[k]), id]
  )

  if (patch.status && patch.status !== current.status) {
    await sql`
      insert into tp_task_event (task_id, actor_id, from_status, to_status, note)
      values (${id}, ${ctx.user.id}, ${current.status}, ${patch.status}, ${str(body.note, 'Note', { required: false, max: 500 })})
    `
  }

  const after = await getTask(id)
  await audit({ actor: ctx.user, action: 'task.update', entity: 'task', entityId: id, personId: after.ownerId, before: rowToTask(current), after })
  return after
}

export async function getTask(taskId) {
  const { rows } = await sql`
    select t.*, p.name as owner_name, pr.name as project_name, pr.client
      from tp_task t
      left join tp_person p on p.id = t.owner_id
      left join tp_project pr on pr.id = t.project_id
     where t.id = ${taskId}
  `
  return rows[0] ? rowToTask(rows[0]) : null
}

const TASK_SORTABLE = {
  due: 't.due_date',
  title: 't.title',
  owner: 'p.name',
  status: 't.status',
  progress: 't.progress_pct',
  updated: 't.updated_at',
}

export async function listTasks(ctx, query = {}) {
  const { limit, page, offset } = paging(query, { defaultLimit: 25, maxLimit: 100 })
  const { column, direction } = sortColumn(query.sort, TASK_SORTABLE, 'due')

  if (ctx.scope === 'none') return { tasks: [], total: 0, page, limit }

  const params = []
  const bind = (v) => { params.push(v); return `$${params.length}` }
  const where = []

  if (ctx.scope === 'ids') {
    if (ctx.ids.length === 0) return { tasks: [], total: 0, page, limit }
    // An unassigned task has no owner to scope by, so a manager sees only
    // tasks owned by their team.
    where.push(`t.owner_id = any(${bind(ctx.ids)}::bigint[])`)
  }
  if (query.ownerId) where.push(`t.owner_id = ${bind(parseId(query.ownerId, 'Owner'))}`)
  if (query.projectId) where.push(`t.project_id = ${bind(parseId(query.projectId, 'Project'))}`)
  if (query.q) {
    const q = bind(`%${query.q}%`)
    where.push(`t.title ilike ${q}`)
  }
  if (query.status && query.status !== 'All') {
    if (query.status === 'open') where.push(`t.status = any(${bind(OPEN_STATUSES)}::text[])`)
    else if (query.status === 'overdue') {
      where.push(`t.status = any(${bind(OPEN_STATUSES)}::text[]) and t.due_date < ${bind(todayISO())}`)
    } else where.push(`t.status = ${bind(oneOf(query.status, 'Status', TASK_STATUSES))}`)
  }
  if (query.from) where.push(`coalesce(t.completed_at::date, t.due_date) >= ${bind(isoDate(query.from, 'From'))}`)
  if (query.to) where.push(`coalesce(t.completed_at::date, t.due_date) < ${bind(isoDate(query.to, 'To'))}`)

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''
  const countRes = await sql.query(`select count(*)::int as n from tp_task t ${whereSql}`, params)
  const rowsRes = await sql.query(
    `select t.*, p.name as owner_name, pr.name as project_name, pr.client
       from tp_task t
       left join tp_person p on p.id = t.owner_id
       left join tp_project pr on pr.id = t.project_id
       ${whereSql}
       order by ${column} ${direction} nulls last, t.id desc
       limit ${bind(limit)} offset ${bind(offset)}`,
    params
  )

  return { tasks: rowsRes.rows.map(rowToTask), total: countRes.rows[0].n, page, limit }
}

export async function taskHistory(taskId) {
  const { rows } = await sql`
    select e.*, u.username from tp_task_event e
      left join users u on u.id = e.actor_id
     where task_id = ${taskId} order by ts asc
  `
  return rows.map(r => ({
    id: Number(r.id),
    ts: new Date(r.ts).toISOString(),
    actor: r.username || 'System',
    from: r.from_status,
    to: r.to_status,
    note: r.note,
  }))
}
