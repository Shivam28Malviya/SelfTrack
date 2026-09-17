import { sql } from '../db.js'
import { HttpError } from '../auth.js'
import { str, int, isoDate, oneOf, bool, id as parseId } from './validate.js'
import { getConfig } from './config.js'
import { todayISO, addDays } from './dates.js'
import { audit } from './audit.js'

export const SKILL_LEVELS = [0, 1, 2, 3, 4]
/** Level at and above which someone can work unsupervised. The single-point-of
 *  -failure rule counts people at or above it. */
export const INDEPENDENT_LEVEL = 3

// -------------------------------------------------------------- catalogue

export async function listSkills({ includeInactive = false } = {}) {
  const { rows } = await sql`
    select id, name, category, active, sort from tp_skill
     where ${includeInactive} or active = true
     order by sort, name
  `
  return rows.map(r => ({
    id: Number(r.id), name: r.name, category: r.category, active: r.active, sort: r.sort,
  }))
}

export async function addSkill(ctx, body) {
  const name = str(body.name, 'Skill', { min: 2, max: 60 })
  const category = str(body.category, 'Category', { required: false, max: 60 }) || 'General'
  const sort = int(body.sort, 'Order', { min: 0, max: 999, required: false, dflt: 0 })

  const { rows: clash } = await sql`select id from tp_skill where lower(name) = lower(${name})`
  if (clash.length) throw new HttpError(400, `${name} is already in the catalogue.`)

  const { rows } = await sql`
    insert into tp_skill (name, category, sort) values (${name}, ${category}, ${sort}) returning id
  `
  await audit({ actor: ctx.user, action: 'skill.create', entity: 'skill', entityId: Number(rows[0].id), after: { name, category } })
  return { id: Number(rows[0].id), name, category, sort, active: true }
}

export async function updateSkill(ctx, skillId, body) {
  const id = parseId(skillId, 'Skill')
  const { rows: before } = await sql`select * from tp_skill where id = ${id}`
  if (!before.length) throw new HttpError(404, 'Skill not found.')

  const patch = {}
  if (body.name !== undefined) patch.name = str(body.name, 'Skill', { min: 2, max: 60 })
  if (body.category !== undefined) patch.category = str(body.category, 'Category', { required: false, max: 60 }) || 'General'
  if (body.sort !== undefined) patch.sort = int(body.sort, 'Order', { min: 0, max: 999 })
  // Retiring a skill keeps its ratings: they are history, and the heatmap for
  // a past quarter still needs them.
  if (body.active !== undefined) patch.active = bool(body.active, 'Active', { dflt: true })
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to update.')

  if (patch.name) {
    const { rows: clash } = await sql`select id from tp_skill where lower(name) = lower(${patch.name}) and id <> ${id}`
    if (clash.length) throw new HttpError(400, `${patch.name} is already in the catalogue.`)
  }

  const keys = Object.keys(patch)
  await sql.query(
    `update tp_skill set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1}`,
    [...keys.map(k => patch[k]), id]
  )
  await audit({ actor: ctx.user, action: 'skill.update', entity: 'skill', entityId: id, before: before[0], after: patch })
  return { id, ...patch }
}

// ----------------------------------------------------------------- ratings

/**
 * Records a rating.
 *
 * Self and manager ratings are separate rows, so the gap between them stays
 * visible — that gap is the useful signal, and overwriting one with the other
 * would destroy it. A person rates only themselves; a manager rates only the
 * people they are responsible for.
 */
export async function rateSkill(ctx, body) {
  const skillId = parseId(body.skillId, 'Skill')
  const level = int(body.level, 'Level', { min: 0, max: 4 })
  const ratedBy = oneOf(body.ratedBy, 'Rated by', ['self', 'manager'])
  const personId = body.personId ? parseId(body.personId, 'Person') : Number(ctx.self?.id || 0)
  if (!personId) throw new HttpError(400, 'No person to rate.')

  if (ratedBy === 'self') {
    if (personId !== Number(ctx.self?.id)) throw new HttpError(403, 'A self rating can only be set by that person.')
  } else {
    if (ctx.role !== 'admin' && ctx.role !== 'manager') throw new HttpError(403, 'Only a manager can set a manager rating.')
    if (personId === Number(ctx.self?.id)) throw new HttpError(403, 'Rate yourself under "self", not as your own manager.')
    if (ctx.scope === 'ids' && !ctx.ids.includes(personId)) throw new HttpError(404, 'Person not found.')
  }

  const { rows: skill } = await sql`select name, active from tp_skill where id = ${skillId}`
  if (!skill.length) throw new HttpError(404, 'Skill not found.')
  if (!skill[0].active) throw new HttpError(400, `${skill[0].name} has been retired from the catalogue.`)

  const { rows: before } = await sql`
    select level from tp_skill_rating where person_id = ${personId} and skill_id = ${skillId} and rated_by = ${ratedBy}
  `

  await sql`
    insert into tp_skill_rating (person_id, skill_id, level, rated_by, rater_id, rated_on)
    values (${personId}, ${skillId}, ${level}, ${ratedBy}, ${ctx.user.id}, ${todayISO()})
    on conflict (person_id, skill_id, rated_by)
      do update set level = excluded.level, rater_id = excluded.rater_id, rated_on = excluded.rated_on
  `
  await audit({
    actor: ctx.user, action: `skill.rate.${ratedBy}`, entity: 'skill_rating', entityId: skillId, personId,
    before: before[0] || null, after: { skill: skill[0].name, level },
  })
  return { personId, skillId, level, ratedBy }
}

/** The heatmap: a row per person, a cell per skill, both ratings per cell. */
export async function heatmap(ctx) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  if (ctx.scope === 'none' || (ids && ids.length === 0)) return { skills: [], rows: [] }

  const skills = await listSkills()
  const { rows: people } = await sql.query(
    `select id, name, allocation_pct from tp_person
      where active = true and ($1::bigint[] is null or id = any($1::bigint[])) order by name`,
    [ids]
  )
  const { rows: ratings } = await sql.query(
    `select person_id, skill_id, level, rated_by from tp_skill_rating
      where ($1::bigint[] is null or person_id = any($1::bigint[]))`,
    [ids]
  )

  const byPerson = new Map()
  for (const r of ratings) {
    const key = Number(r.person_id)
    if (!byPerson.has(key)) byPerson.set(key, new Map())
    const cell = byPerson.get(key).get(Number(r.skill_id)) || {}
    cell[r.rated_by] = r.level
    byPerson.get(key).set(Number(r.skill_id), cell)
  }

  return {
    skills,
    rows: people.map(p => ({
      personId: Number(p.id),
      name: p.name,
      allocationPct: p.allocation_pct,
      cells: skills.map(s => {
        const cell = byPerson.get(Number(p.id))?.get(s.id) || {}
        return {
          skillId: s.id,
          // The manager rating is the one used for staffing decisions; the
          // self rating is shown beside it, never merged into it.
          manager: cell.manager ?? null,
          self: cell.self ?? null,
        }
      }),
    })),
  }
}

/**
 * Skills where only one person is at the independent level or above.
 *
 * The export listed skills as single points of failure that its own heatmap
 * showed two people covering. This counts the data.
 */
export async function singlePointsOfFailure(ctx) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  if (ctx.scope === 'none' || (ids && ids.length === 0)) return []

  const { rows } = await sql.query(
    `select s.id, s.name,
            -- counts p.id, not r.person_id: a rating belonging to a
            -- deactivated person must not make a skill look covered
            count(distinct p.id)::int as capable,
            min(p.name) as who
       from tp_skill s
       left join tp_skill_rating r
              on r.skill_id = s.id and r.rated_by = 'manager' and r.level >= $2
       left join tp_person p on p.id = r.person_id and p.active = true
      where s.active = true and ($1::bigint[] is null or p.id is null or p.id = any($1::bigint[]))
      group by s.id, s.name
      order by capable, s.name`,
    [ids, INDEPENDENT_LEVEL]
  )

  return rows
    .filter(r => Number(r.capable) <= 1)
    .map(r => ({
      skillId: Number(r.id),
      skill: r.name,
      capable: Number(r.capable),
      // Zero people is worse than one, and the two need different wording.
      who: Number(r.capable) === 1 ? r.who : null,
    }))
}

/**
 * Finds people with a skill at or above a level.
 *
 * Availability is reported as the allocation figure rather than a yes or no:
 * "40% free" is a staffing conversation, "available" is a promise the data
 * cannot make.
 */
export async function findBySkill(ctx, query = {}) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  if (ctx.scope === 'none' || (ids && ids.length === 0)) return []

  const name = str(query.skill, 'Skill', { required: false, max: 60 })
  if (!name) return []
  const minLevel = int(query.minLevel, 'Minimum level', { min: 0, max: 4, required: false, dflt: INDEPENDENT_LEVEL })

  const { rows } = await sql.query(
    `select p.id, p.name, p.designation, p.allocation_pct, r.level, s.name as skill,
            pr.name as project
       from tp_skill_rating r
       join tp_skill s on s.id = r.skill_id
       join tp_person p on p.id = r.person_id
       left join tp_project pr on pr.id = p.project_id
      where r.rated_by = 'manager' and r.level >= $3
        and s.name ilike $2 and p.active = true
        and ($1::bigint[] is null or p.id = any($1::bigint[]))
      order by r.level desc, p.allocation_pct asc, p.name`,
    [ids, `%${name}%`, minLevel]
  )

  return rows.map(r => ({
    personId: Number(r.id),
    name: r.name,
    designation: r.designation,
    skill: r.skill,
    level: r.level,
    allocationPct: r.allocation_pct,
    freePct: Math.max(0, 100 - r.allocation_pct),
    project: r.project,
  }))
}

// ------------------------------------------------------------ certifications

const CERT_KINDS = ['core', 'adjacent']
const CERT_STATUSES = ['enrolled', 'completed', 'expired']

export async function listCerts(ctx, query = {}) {
  const ids = ctx.scope === 'all' ? null : ctx.ids
  if (ctx.scope === 'none' || (ids && ids.length === 0)) return { certs: [], expiring: [], completedThisQuarter: 0 }

  const personId = query.personId ? parseId(query.personId, 'Person') : null
  if (personId && ids && !ids.includes(personId)) throw new HttpError(404, 'Person not found.')

  // A certificate whose expiry has passed is expired whether or not anyone
  // updated the row, so the status is corrected on read.
  await sql`
    update tp_cert set status = 'expired'
     where status = 'completed' and expires_on is not null and expires_on < ${todayISO()}
  `

  const { rows } = await sql.query(
    `select c.*, p.name as person_name from tp_cert c
       join tp_person p on p.id = c.person_id
      where p.active = true
        and ($1::bigint[] is null or c.person_id = any($1::bigint[]))
        and ($2::bigint is null or c.person_id = $2)
      order by c.expires_on nulls last, p.name`,
    [ids, personId]
  )

  const certs = rows.map(r => ({
    id: Number(r.id),
    personId: Number(r.person_id),
    personName: r.person_name,
    name: r.name,
    issuer: r.issuer,
    kind: r.kind,
    status: r.status,
    completedOn: r.completed_on ? String(r.completed_on).slice(0, 10) : null,
    expiresOn: r.expires_on ? String(r.expires_on).slice(0, 10) : null,
    daysToExpiry: r.expires_on
      ? Math.round((new Date(String(r.expires_on).slice(0, 10)) - new Date(todayISO())) / 864e5)
      : null,
  }))

  const horizon = addDays(todayISO(), 90)
  const quarterStart = quarterStartISO()

  return {
    certs,
    expiring: certs.filter(c => c.expiresOn && c.expiresOn <= horizon && c.status !== 'expired'),
    expired: certs.filter(c => c.status === 'expired'),
    completedThisQuarter: certs.filter(c => c.status === 'completed' && c.completedOn && c.completedOn >= quarterStart).length,
    quarterStart,
  }
}

function quarterStartISO() {
  const now = new Date()
  const month = Math.floor(now.getUTCMonth() / 3) * 3
  return `${now.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}-01`
}

export async function saveCert(ctx, body, certId = null) {
  const personId = body.personId ? parseId(body.personId, 'Person') : null
  if (!certId && !personId) throw new HttpError(400, 'Choose a person.')
  if (personId && ctx.scope === 'ids' && !ctx.ids.includes(personId)) throw new HttpError(404, 'Person not found.')

  const name = str(body.name, 'Certification', { min: 2, max: 160 })
  const issuer = str(body.issuer, 'Issuer', { required: false, max: 120 })
  const kind = oneOf(body.kind, 'Kind', CERT_KINDS, { required: false, dflt: 'core' })
  const status = oneOf(body.status, 'Status', CERT_STATUSES, { required: false, dflt: 'enrolled' })
  const completedOn = isoDate(body.completedOn, 'Completed on', { required: false, max: todayISO() })
  const expiresOn = isoDate(body.expiresOn, 'Expires on', { required: false })

  if (status === 'completed' && !completedOn) throw new HttpError(400, 'A completed certification needs its completion date.')
  if (completedOn && expiresOn && expiresOn <= completedOn) {
    throw new HttpError(400, 'The expiry date must be after the completion date.')
  }
  if (status === 'enrolled' && completedOn) throw new HttpError(400, 'An enrolled certification has no completion date yet.')

  if (certId) {
    const id = parseId(certId, 'Certification')
    const { rows: before } = await sql`select * from tp_cert where id = ${id}`
    if (!before.length) throw new HttpError(404, 'Certification not found.')
    if (ctx.scope === 'ids' && !ctx.ids.includes(Number(before[0].person_id))) throw new HttpError(404, 'Certification not found.')
    await sql`
      update tp_cert set name = ${name}, issuer = ${issuer}, kind = ${kind}, status = ${status},
             completed_on = ${completedOn}, expires_on = ${expiresOn}
       where id = ${id}
    `
    await audit({ actor: ctx.user, action: 'cert.update', entity: 'cert', entityId: id, personId: Number(before[0].person_id), before: before[0], after: { name, status, expiresOn } })
    return { id }
  }

  const { rows } = await sql`
    insert into tp_cert (person_id, name, issuer, kind, status, completed_on, expires_on)
    values (${personId}, ${name}, ${issuer}, ${kind}, ${status}, ${completedOn}, ${expiresOn})
    returning id
  `
  const id = Number(rows[0].id)
  await audit({ actor: ctx.user, action: 'cert.create', entity: 'cert', entityId: id, personId, after: { name, status, expiresOn } })
  return { id }
}

export async function deleteCert(ctx, certId) {
  const id = parseId(certId, 'Certification')
  const { rows } = await sql`select * from tp_cert where id = ${id}`
  if (!rows.length) throw new HttpError(404, 'Certification not found.')
  if (ctx.scope === 'ids' && !ctx.ids.includes(Number(rows[0].person_id))) throw new HttpError(404, 'Certification not found.')
  await sql`delete from tp_cert where id = ${id}`
  await audit({ actor: ctx.user, action: 'cert.delete', entity: 'cert', entityId: id, personId: Number(rows[0].person_id), before: rows[0] })
  return { id }
}

export async function skillLevelLabels() {
  const cfg = await getConfig()
  return cfg.skill_levels
}
