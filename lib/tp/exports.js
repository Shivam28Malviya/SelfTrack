import { sql } from '../db.js'
import { HttpError } from '../auth.js'
import { toCsv } from './csv.js'
import { oneOf } from './validate.js'
import { resolvePeriod } from './metrics.js'
import { audit } from './audit.js'
import { todayISO } from './dates.js'

export const EXPORT_KINDS = ['people', 'tasks', 'attendance', 'feedback']

/**
 * CSV export.
 *
 * Exporting more than one person's data is an admin action, and every export
 * is audited and watermarked with who asked and when — an exported file
 * leaves the access controls behind, so the file has to carry the provenance
 * itself.
 */
export async function exportCsv(ctx, query = {}) {
  const kind = oneOf(query.kind, 'Kind', EXPORT_KINDS)
  const { from, to } = resolvePeriod(query)
  const ids = ctx.scope === 'all' ? null : ctx.ids
  if (ctx.scope === 'none' || (ids && ids.length === 0)) throw new HttpError(403, 'You have nothing to export.')

  const singlePerson = ids && ids.length === 1
  if (ctx.role !== 'admin' && ctx.role !== 'manager') {
    if (!singlePerson) throw new HttpError(403, 'You can only export your own record.')
  }

  let rows = []
  let columns = []

  if (kind === 'people') {
    const res = await sql.query(
      `select p.name, p.designation, p.work_location, p.region, p.allocation_pct,
              round(p.total_exp_months / 12.0, 1) as total_exp_years,
              round(p.relevant_exp_months / 12.0, 1) as relevant_exp_years,
              pr.name as project, m.name as manager, p.date_joined_org
         from tp_person p
         left join tp_project pr on pr.id = p.project_id
         left join tp_person m on m.id = p.manager_id
        where p.active = true and ($1::bigint[] is null or p.id = any($1::bigint[]))
        order by p.name`,
      [ids]
    )
    rows = res.rows
    columns = [
      { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' },
      { key: 'project', label: 'Project' }, { key: 'manager', label: 'Manager' },
      { key: 'work_location', label: 'Working from' }, { key: 'region', label: 'Region' },
      { key: 'allocation_pct', label: 'Allocation %' },
      { key: 'total_exp_years', label: 'Total experience (years)' },
      { key: 'relevant_exp_years', label: 'Relevant experience (years)' },
      { key: 'date_joined_org', label: 'Joined on', value: r => fmtDate(r.date_joined_org) },
    ]
  } else if (kind === 'tasks') {
    const res = await sql.query(
      `select t.title, p.name as owner, pr.name as project, t.status, t.progress_pct,
              t.due_date, t.completed_at, t.est_hours, t.actual_hours, t.reopened_count, t.leaked_to_uat
         from tp_task t
         left join tp_person p on p.id = t.owner_id
         left join tp_project pr on pr.id = t.project_id
        where coalesce(t.completed_at::date, t.due_date) >= $2
          and coalesce(t.completed_at::date, t.due_date) < $3
          and ($1::bigint[] is null or t.owner_id = any($1::bigint[]))
        order by t.due_date nulls last`,
      [ids, from, to]
    )
    rows = res.rows
    columns = [
      { key: 'title', label: 'Task' }, { key: 'owner', label: 'Owner' }, { key: 'project', label: 'Project' },
      { key: 'status', label: 'Status' }, { key: 'progress_pct', label: 'Progress %' },
      { key: 'due_date', label: 'Due', value: r => fmtDate(r.due_date) },
      { key: 'completed_at', label: 'Completed', value: r => fmtDate(r.completed_at) },
      { key: 'est_hours', label: 'Estimated hours' }, { key: 'actual_hours', label: 'Actual hours' },
      { key: 'reopened_count', label: 'Times reopened' },
      { key: 'leaked_to_uat', label: 'Leaked to UAT', value: r => (r.leaked_to_uat ? 'yes' : 'no') },
    ]
  } else if (kind === 'attendance') {
    const res = await sql.query(
      `select p.name, a.date, a.type, a.login_time, a.minutes_late, a.note
         from tp_attendance a join tp_person p on p.id = a.person_id
        where a.date >= $2 and a.date < $3
          and ($1::bigint[] is null or a.person_id = any($1::bigint[]))
        order by a.date desc, p.name`,
      [ids, from, to]
    )
    rows = res.rows
    columns = [
      { key: 'name', label: 'Person' },
      { key: 'date', label: 'Date', value: r => fmtDate(r.date) },
      { key: 'type', label: 'Type' }, { key: 'login_time', label: 'Login time' },
      { key: 'minutes_late', label: 'Minutes late' }, { key: 'note', label: 'Note' },
    ]
  } else {
    const res = await sql.query(
      `select p.name, f.source, f.score, f.given_on, f.comment, pr.name as project
         from tp_feedback f
         join tp_person p on p.id = f.person_id
         left join tp_project pr on pr.id = f.project_id
        where f.given_on >= $2 and f.given_on < $3
          and ($1::bigint[] is null or f.person_id = any($1::bigint[]))
        order by f.given_on desc`,
      [ids, from, to]
    )
    rows = res.rows
    columns = [
      { key: 'name', label: 'Person' }, { key: 'source', label: 'Source' },
      { key: 'score', label: 'Score' }, { key: 'project', label: 'Project' },
      { key: 'given_on', label: 'Given on', value: r => fmtDate(r.given_on) },
      { key: 'comment', label: 'Comment' },
    ]
  }

  const peopleCount = new Set(rows.map(r => r.name ?? r.owner)).size
  if (peopleCount > 1 && ctx.role !== 'admin' && ctx.role !== 'manager') {
    throw new HttpError(403, 'Exporting more than one person needs a manager or administrator.')
  }

  const body = toCsv(rows, columns)
  const watermark = [
    `# TeamPulse export — ${kind}`,
    `# Range ${from} to ${to}`,
    `# Requested by ${ctx.user.username} (${ctx.user.email}) on ${new Date().toISOString()}`,
    `# ${rows.length} rows covering ${peopleCount} people. Contains personal data: handle per the retention policy.`,
  ].join('\r\n')

  await audit({
    actor: ctx.user, action: 'export.csv', entity: kind,
    after: { kind, from, to, rows: rows.length, people: peopleCount },
  })

  return {
    filename: `teampulse-${kind}-${todayISO()}.csv`,
    csv: `${watermark}\r\n${body}\r\n`,
    rows: rows.length,
  }
}

const fmtDate = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : '')
