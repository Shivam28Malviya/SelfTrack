// TeamPulse API. Kept separate from api/[...path].js so the legacy leaderboard
// router does not keep growing, and so TeamPulse routes can enforce their own
// per-row access rules in one place.
import { HttpError } from '../../lib/auth.js'
import { requireTp, assertCanSeePerson, requireRole } from '../../lib/tp/roles.js'
import { getConfig, setConfig, DEFAULTS } from '../../lib/tp/config.js'
import { listPeople, getPerson } from '../../lib/tp/people.js'
import { auditRead, audit } from '../../lib/tp/audit.js'
import { id as parseId, oneOf, str } from '../../lib/tp/validate.js'
import {
  parsePersonInput, assertNoManagerCycle, assertProjectExists,
  assertManagerInScope, allocationWarning, DESIGNATIONS, LOCATIONS, REGIONS,
} from '../../lib/tp/personWrite.js'
import { importPeople, IMPORT_TEMPLATE_HEADERS } from '../../lib/tp/personImport.js'
import { HANDLERS, ENTRY_TYPES } from '../../lib/tp/entries.js'
import { listEntries, updateEntry, deleteEntry, listAudit, FEED_KINDS } from '../../lib/tp/entryFeed.js'
import { createTask, updateTask, getTask, listTasks, taskHistory, TASK_STATUSES } from '../../lib/tp/tasks.js'
import {
  teamMetrics, personMetrics, monthlyTrend, onTimeByPerson, taskAging, effortScatter, resolvePeriod,
} from '../../lib/tp/metrics.js'
import { attentionReport, teamShape } from '../../lib/tp/attention.js'
import { exportCsv, EXPORT_KINDS } from '../../lib/tp/exports.js'
import { pushNotif } from '../../lib/state.js'
import {
  listSkills, addSkill, updateSkill, rateSkill, heatmap, singlePointsOfFailure,
  findBySkill, listCerts, saveCert, deleteCert, skillLevelLabels,
} from '../../lib/tp/skills.js'
import {
  monthGrid, lateLoginTable, absenceByType, unusedLeave,
  listHolidays, addHoliday, removeHoliday,
  requestLeave, listLeave, decideLeave, leaveBalance, setLeaveEntitlement,
} from '../../lib/tp/attendance.js'
import { sql } from '../../lib/db.js'

export default async function handler(req, res) {
  const rawPath = req.query.path
  const segments = Array.isArray(rawPath) ? rawPath : (rawPath ? [rawPath] : [])
  const route = '/' + segments.join('/')
  const method = req.method
  const query = req.query || {}

  try {
    // ---- health ----
    // Unauthenticated on purpose: it reports reachability, nothing else.
    if (route === '/health' && method === 'GET') {
      return res.status(200).json({ success: true, module: 'teampulse', ok: true })
    }

    // ---- who am I, in TeamPulse terms ----
    if (route === '/me' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({
        success: true,
        role: ctx.role,
        person: ctx.self ? { id: Number(ctx.self.id), name: ctx.self.name } : null,
        visiblePeople: ctx.scope === 'all' ? null : ctx.ids.length,
      })
    }

    // ---- config ----
    if (route === '/config' && method === 'GET') {
      await requireTp(req)
      return res.status(200).json({ success: true, config: await getConfig() })
    }

    if (route === '/config' && method === 'PUT') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin')
      const { key, value } = req.body || {}
      const k = oneOf(key, 'key', Object.keys(DEFAULTS))
      if (value === undefined || value === null) throw new HttpError(400, 'value is required.')
      const before = (await getConfig())[k]
      await setConfig(k, value)
      await audit({ actor: ctx.user, action: 'config.update', entity: 'config', before: { [k]: before }, after: { [k]: value } })
      return res.status(200).json({ success: true, config: await getConfig() })
    }

    // ---- reference data ----
    if (route === '/projects' && method === 'GET') {
      await requireTp(req)
      const { rows } = await sql`select id, name, client, region, active from tp_project where active = true order by name`
      return res.status(200).json({
        success: true,
        projects: rows.map(r => ({ id: Number(r.id), name: r.name, client: r.client, region: r.region })),
      })
    }

    // ---- people ----
    if (route === '/people' && method === 'GET') {
      const ctx = await requireTp(req)
      const result = await listPeople(ctx, query)
      return res.status(200).json({ success: true, ...result })
    }

    const personMatch = route.match(/^\/people\/(\d+)$/)
    if (personMatch && method === 'GET') {
      const ctx = await requireTp(req)
      const personId = parseId(personMatch[1], 'person id')
      assertCanSeePerson(ctx, personId)
      const person = await getPerson(personId)
      if (!person) throw new HttpError(404, 'Person not found.')
      // Reading someone else's record is itself an auditable event.
      if (ctx.self?.id !== personId) await auditRead(ctx.user, 'person', personId)
      return res.status(200).json({ success: true, person })
    }

    // ---- people: write ----
    if (route === '/people' && method === 'POST') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')

      const p = parsePersonInput(req.body || {})
      // A manager adding someone must place them under themselves or someone
      // in their tree, otherwise they create a record they cannot then read.
      if (ctx.role === 'manager' && !p.manager_id) p.manager_id = Number(ctx.self.id)
      await assertManagerInScope(ctx, p.manager_id)
      await assertProjectExists(p.project_id)

      const { rows } = await sql`
        insert into tp_person
          (name, initials, email, designation, manager_id, project_id, region, work_location,
           allocation_pct, total_exp_months, relevant_exp_months, date_joined_org, date_joined_team)
        values
          (${p.name}, ${p.initials}, ${p.email ?? null}, ${p.designation}, ${p.manager_id ?? null},
           ${p.project_id ?? null}, ${p.region ?? 'IN'}, ${p.work_location},
           ${p.allocation_pct ?? 100}, ${p.total_exp_months}, ${p.relevant_exp_months},
           ${p.date_joined_org ?? null}, ${p.date_joined_team ?? null})
        returning id
      `
      const personId = Number(rows[0].id)
      await audit({ actor: ctx.user, action: 'person.create', entity: 'person', entityId: personId, personId, after: p })
      return res.status(200).json({
        success: true,
        person: await getPerson(personId),
        warning: allocationWarning(p.allocation_pct ?? 100),
      })
    }

    const personWriteMatch = route.match(/^\/people\/(\d+)$/)
    if (personWriteMatch && method === 'PUT') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      const personId = parseId(personWriteMatch[1], 'person id')
      assertCanSeePerson(ctx, personId)

      const before = await getPerson(personId)
      if (!before) throw new HttpError(404, 'Person not found.')

      // Optimistic locking: two managers editing the same person must not
      // silently overwrite each other.
      const { rows: current } = await sql`select updated_at from tp_person where id = ${personId}`
      const expected = req.body?.updatedAt
      if (expected && new Date(expected).getTime() !== new Date(current[0].updated_at).getTime()) {
        return res.status(409).json({
          success: false,
          error: 'Someone else changed this person while you were editing. Review the current version and try again.',
          person: before,
        })
      }

      const p = parsePersonInput(req.body || {}, { partial: true })
      if ('manager_id' in p) {
        await assertNoManagerCycle(personId, p.manager_id)
        await assertManagerInScope(ctx, p.manager_id)
      }
      if ('project_id' in p) await assertProjectExists(p.project_id)
      if (Object.keys(p).length === 0) throw new HttpError(400, 'Nothing to update.')

      // Column names come from parsePersonInput's fixed key set, never from
      // the request body, so this interpolation cannot be steered.
      const keys = Object.keys(p)
      const assignments = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
      await sql.query(
        `update tp_person set ${assignments}, updated_at = now() where id = $${keys.length + 1}`,
        [...keys.map(k => p[k]), personId]
      )

      const after = await getPerson(personId)
      await audit({ actor: ctx.user, action: 'person.update', entity: 'person', entityId: personId, personId, before, after })
      return res.status(200).json({ success: true, person: after, warning: allocationWarning(after.allocationPct) })
    }

    if (personWriteMatch && method === 'DELETE') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      const personId = parseId(personWriteMatch[1], 'person id')
      assertCanSeePerson(ctx, personId)

      const before = await getPerson(personId)
      if (!before) throw new HttpError(404, 'Person not found.')

      // Deactivate, never delete: their delivery and attendance history is
      // still needed for team-level history and for the audit trail.
      const { rows: reports } = await sql`select count(*)::int as n from tp_person where manager_id = ${personId} and active = true`
      if (reports[0].n > 0) {
        throw new HttpError(400, `${before.name} still manages ${reports[0].n} active people. Reassign them first.`)
      }
      await sql`update tp_person set active = false, updated_at = now() where id = ${personId}`
      await audit({ actor: ctx.user, action: 'person.deactivate', entity: 'person', entityId: personId, personId, before })
      return res.status(200).json({ success: true, person: await getPerson(personId) })
    }

    // ---- people: import ----
    if (route === '/people/import' && method === 'POST') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin')
      const csv = str(req.body?.csv, 'File contents', { max: 400000 })
      const commit = req.body?.commit === true
      const summary = await importPeople(csv, { commit, actorUserId: ctx.user.id })
      return res.status(200).json({ success: true, ...summary })
    }

    if (route === '/people/import/template' && method === 'GET') {
      await requireTp(req)
      return res.status(200).json({ success: true, headers: IMPORT_TEMPLATE_HEADERS })
    }

    // ---- reference lists for forms ----
    if (route === '/options' && method === 'GET') {
      const ctx = await requireTp(req)
      // Manager choices are limited to what the caller may see, so the picker
      // cannot be used to enumerate the wider organisation.
      const managers = ctx.scope === 'all'
        ? (await sql`select id, name from tp_person where active = true order by name`).rows
        : ctx.ids.length
          ? (await sql.query(
              'select id, name from tp_person where active = true and id = any($1::bigint[]) order by name',
              [ctx.ids]
            )).rows
          : []
      return res.status(200).json({
        success: true,
        designations: DESIGNATIONS,
        locations: LOCATIONS,
        regions: REGIONS,
        managers: managers.map(m => ({ id: Number(m.id), name: m.name })),
      })
    }

    // ---- quick log ----
    const entryMatch = route.match(/^\/entries\/([a-z]+)$/)
    if (entryMatch && method === 'POST') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      const type = oneOf(entryMatch[1], 'Entry type', ENTRY_TYPES)
      const result = await HANDLERS[type](ctx, req.body || {})
      // A same-day clash is not an error: the caller is asked to confirm an
      // overwrite, and the existing values are returned so they can see what
      // they would replace.
      if (result?.conflict) return res.status(409).json({ success: false, ...result, error: result.message })
      return res.status(200).json({ success: true, ...result })
    }

    if (route === '/entries' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({ success: true, ...(await listEntries(ctx, query)) })
    }

    const entryItemMatch = route.match(/^\/entries\/([a-z]+)\/(\d+)$/)
    if (entryItemMatch && (method === 'PUT' || method === 'DELETE')) {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      const [, kind, entryId] = entryItemMatch
      oneOf(kind, 'Kind', FEED_KINDS)
      const result = method === 'PUT'
        ? await updateEntry(ctx, kind, entryId, req.body || {})
        : await deleteEntry(ctx, kind, entryId)
      return res.status(200).json({ success: true, ...result })
    }

    // ---- audit trail ----
    if (route === '/audit' && method === 'GET') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      return res.status(200).json({ success: true, ...(await listAudit(ctx, query)) })
    }

    // ---- tasks ----
    if (route === '/tasks' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({ success: true, statuses: TASK_STATUSES, ...(await listTasks(ctx, query)) })
    }

    if (route === '/tasks' && method === 'POST') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      return res.status(200).json({ success: true, task: await createTask(ctx, req.body || {}) })
    }

    const taskMatch = route.match(/^\/tasks\/(\d+)$/)
    if (taskMatch && method === 'GET') {
      const ctx = await requireTp(req)
      const task = await getTask(parseId(taskMatch[1], 'Task'))
      if (!task) throw new HttpError(404, 'Task not found.')
      if (task.ownerId != null) assertCanSeePerson(ctx, task.ownerId)
      return res.status(200).json({ success: true, task, history: await taskHistory(task.id) })
    }

    if (taskMatch && method === 'PUT') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      return res.status(200).json({ success: true, task: await updateTask(ctx, taskMatch[1], req.body || {}) })
    }

    // ---- metrics ----
    if (route === '/metrics' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({ success: true, metrics: await teamMetrics(ctx, query) })
    }

    if (route === '/metrics/trend' && method === 'GET') {
      const ctx = await requireTp(req)
      const personId = query.personId ? parseId(query.personId, 'Person') : null
      if (personId) assertCanSeePerson(ctx, personId)
      const months = Math.min(24, Math.max(2, Number(query.months) || 6))
      return res.status(200).json({ success: true, trend: await monthlyTrend(ctx, { months, personId }) })
    }

    if (route === '/metrics/delivery' && method === 'GET') {
      const ctx = await requireTp(req)
      const period = resolvePeriod(query)
      const [byPerson, aging, scatter] = await Promise.all([
        onTimeByPerson(ctx, period),
        taskAging(ctx),
        effortScatter(ctx, period),
      ])
      return res.status(200).json({ success: true, period, byPerson, aging, scatter })
    }

    // One call for everything the profile draws, so the page does not fan out
    // into eight requests that each re-derive the same access check.
    const profileMatch = route.match(/^\/people\/(\d+)\/profile$/)
    if (profileMatch && method === 'GET') {
      const ctx = await requireTp(req)
      const personId = parseId(profileMatch[1], 'Person')
      assertCanSeePerson(ctx, personId)
      const person = await getPerson(personId)
      if (!person) throw new HttpError(404, 'Person not found.')

      const [metrics, trend, tasks, grid, certs, achievements, balance, attention] = await Promise.all([
        personMetrics(ctx, personId, query),
        monthlyTrend(ctx, { months: 6, personId }),
        listTasks(ctx, { ownerId: String(personId), status: 'open', limit: '10', sort: 'due' }),
        monthGrid(ctx, { month: query.month, personId: String(personId) }),
        listCerts(ctx, { personId: String(personId) }),
        listEntries(ctx, { personId: String(personId), kind: 'achievement', limit: '5' }),
        leaveBalance(personId),
        attentionReport(ctx),
      ])

      const skills = await heatmap(ctx)
      const myRow = skills.rows.find(r => r.personId === personId)

      if (ctx.self?.id !== personId) await auditRead(ctx.user, 'person', personId)

      return res.status(200).json({
        success: true,
        person,
        metrics,
        trend,
        tasks: tasks.tasks,
        openTaskCount: tasks.total,
        grid,
        certs: certs.certs,
        achievements: achievements.entries,
        leave: balance,
        skills: skills.skills,
        skillCells: myRow ? myRow.cells : [],
        attention: (attention.people || []).find(p => p.personId === personId) || null,
      })
    }

    const personMetricsMatch = route.match(/^\/people\/(\d+)\/metrics$/)
    if (personMetricsMatch && method === 'GET') {
      const ctx = await requireTp(req)
      const personId = parseId(personMetricsMatch[1], 'Person')
      assertCanSeePerson(ctx, personId)
      return res.status(200).json({ success: true, metrics: await personMetrics(ctx, personId, query) })
    }

    // ---- attendance ----
    // Attendance is the most sensitive data here, so a spectator is refused
    // outright and every other role is still filtered per row.
    if (route === '/attendance' && method === 'GET') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager', 'member')
      const period = resolvePeriod(query)
      const [grid, metrics, late, absence, unused] = await Promise.all([
        monthGrid(ctx, query),
        teamMetrics(ctx, query),
        lateLoginTable(ctx, period),
        absenceByType(ctx, resolvePeriod({ period: 'quarter', to: query.to })),
        unusedLeave(ctx),
      ])
      if (ctx.role !== 'member') await audit({ actor: ctx.user, action: 'read.attendance', entity: 'attendance' })
      return res.status(200).json({ success: true, grid, metrics, late, absence, unused, period })
    }

    // ---- holidays ----
    if (route === '/holidays' && method === 'GET') {
      await requireTp(req)
      return res.status(200).json({ success: true, holidays: await listHolidays(query) })
    }

    if (route === '/holidays' && (method === 'POST' || method === 'DELETE')) {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin')
      const result = method === 'POST'
        ? await addHoliday(ctx, req.body || {})
        : await removeHoliday(ctx, req.body || {})
      return res.status(200).json({ success: true, ...result, holidays: await listHolidays({ year: String(result.date).slice(0, 4) }) })
    }

    // ---- leave ----
    if (route === '/leave' && method === 'GET') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager', 'member')
      return res.status(200).json({ success: true, ...(await listLeave(ctx, query)) })
    }

    if (route === '/leave' && method === 'POST') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager', 'member')
      return res.status(200).json({ success: true, ...(await requestLeave(ctx, req.body || {})) })
    }

    const leaveDecideMatch = route.match(/^\/leave\/(\d+)\/decide$/)
    if (leaveDecideMatch && method === 'POST') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      const result = await decideLeave(ctx, leaveDecideMatch[1], req.body || {})
      // Tell the person, through SelfTrack's existing notifications. A decision
      // nobody is told about is not a decision they can act on.
      const { rows: linked } = await sql`
        select p.user_id, p.name from tp_leave_request r
          join tp_person p on p.id = r.person_id
         where r.id = ${result.id}
      `
      if (linked[0]?.user_id) {
        await pushNotif(
          linked[0].user_id,
          result.status === 'approved'
            ? `Your leave request was approved (${result.daysWritten} working day(s)).`
            : 'Your leave request was not approved.',
          result.status === 'approved' ? '✅' : '🚫'
        )
      }
      return res.status(200).json({ success: true, ...result })
    }

    const leaveBalanceMatch = route.match(/^\/people\/(\d+)\/leave$/)
    if (leaveBalanceMatch && method === 'GET') {
      const ctx = await requireTp(req)
      const personId = parseId(leaveBalanceMatch[1], 'Person')
      assertCanSeePerson(ctx, personId)
      return res.status(200).json({ success: true, balance: await leaveBalance(personId) })
    }

    if (leaveBalanceMatch && method === 'PUT') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      return res.status(200).json({ success: true, balance: await setLeaveEntitlement(ctx, leaveBalanceMatch[1], req.body || {}) })
    }

    // ---- skills ----
    if (route === '/skills' && method === 'GET') {
      const ctx = await requireTp(req)
      const [map, spof, levels] = await Promise.all([
        heatmap(ctx),
        singlePointsOfFailure(ctx),
        skillLevelLabels(),
      ])
      return res.status(200).json({ success: true, ...map, spof, levels })
    }

    if (route === '/skills/catalogue' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({
        success: true,
        skills: await listSkills({ includeInactive: ctx.role === 'admin' && query.includeInactive === 'true' }),
        levels: await skillLevelLabels(),
      })
    }

    if (route === '/skills/catalogue' && method === 'POST') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin')
      return res.status(200).json({ success: true, skill: await addSkill(ctx, req.body || {}) })
    }

    const skillMatch = route.match(/^\/skills\/catalogue\/(\d+)$/)
    if (skillMatch && method === 'PUT') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin')
      return res.status(200).json({ success: true, skill: await updateSkill(ctx, skillMatch[1], req.body || {}) })
    }

    if (route === '/skills/rate' && method === 'POST') {
      const ctx = await requireTp(req)
      return res.status(200).json({ success: true, ...(await rateSkill(ctx, req.body || {})) })
    }

    if (route === '/skills/find' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({ success: true, matches: await findBySkill(ctx, query) })
    }

    // ---- certifications ----
    if (route === '/certs' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({ success: true, ...(await listCerts(ctx, query)) })
    }

    if (route === '/certs' && method === 'POST') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      return res.status(200).json({ success: true, ...(await saveCert(ctx, req.body || {})) })
    }

    const certMatch = route.match(/^\/certs\/(\d+)$/)
    if (certMatch && (method === 'PUT' || method === 'DELETE')) {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin', 'manager')
      const result = method === 'PUT'
        ? await saveCert(ctx, req.body || {}, certMatch[1])
        : await deleteCert(ctx, certMatch[1])
      return res.status(200).json({ success: true, ...result })
    }

    // ---- overview ----
    if (route === '/overview' && method === 'GET') {
      const ctx = await requireTp(req)
      const [metrics, attention, shape, certs, trend] = await Promise.all([
        teamMetrics(ctx, query),
        attentionReport(ctx),
        teamShape(ctx),
        listCerts(ctx),
        monthlyTrend(ctx, { months: 6 }),
      ])
      return res.status(200).json({
        success: true,
        metrics,
        attention,
        shape,
        trend,
        expiringCerts: certs.expiring.length,
      })
    }

    if (route === '/attention' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({ success: true, ...(await attentionReport(ctx)) })
    }

    // ---- export ----
    if (route === '/export' && method === 'GET') {
      const ctx = await requireTp(req)
      const result = await exportCsv(ctx, query)
      return res.status(200).json({ success: true, kinds: EXPORT_KINDS, ...result })
    }

    return res.status(404).json({ success: false, error: 'Not found.' })
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, error: err.message })
    console.error('tp api error', route, err)
    return res.status(500).json({ success: false, error: 'Server error.' })
  }
}
