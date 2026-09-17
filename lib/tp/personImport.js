import { sql } from '../db.js'
import { parseCsvObjects } from './csv.js'
import { parsePersonInput, assertProjectExists } from './personWrite.js'
import { HttpError } from '../auth.js'

export const IMPORT_TEMPLATE_HEADERS = [
  'name', 'email', 'designation', 'working_from', 'region',
  'project', 'manager_email', 'total_exp_years', 'relevant_exp_years', 'joined_on',
]

const MAX_IMPORT_ROWS = 500

/**
 * Validates an import and, when `commit` is set, applies it.
 *
 * Always a dry run first: the caller sees every row error before anything is
 * written. Nothing is written unless every row validates — a half-imported
 * team is harder to clean up than a rejected file.
 */
export async function importPeople(csvText, { commit = false, actorUserId = null } = {}) {
  const { headers, records } = parseCsvObjects(csvText)
  if (records.length === 0) throw new HttpError(400, 'The file has no data rows.')
  if (records.length > MAX_IMPORT_ROWS) throw new HttpError(400, `Import is limited to ${MAX_IMPORT_ROWS} rows per file.`)

  const missing = ['name', 'designation'].filter(h => !headers.includes(h))
  if (missing.length) throw new HttpError(400, `The file is missing required columns: ${missing.join(', ')}.`)

  const { rows: projectRows } = await sql`select id, name from tp_project where active = true`
  const projectByName = new Map(projectRows.map(p => [p.name.toLowerCase(), Number(p.id)]))

  const { rows: personRows } = await sql`select id, lower(email) as email from tp_person where email is not null`
  const personByEmail = new Map(personRows.map(p => [p.email, Number(p.id)]))

  const seenEmails = new Set()
  const results = []
  const prepared = []

  for (const rec of records) {
    const errors = []
    let payload = null

    try {
      const projectName = (rec.project || '').toLowerCase()
      if (projectName && !projectByName.has(projectName)) {
        errors.push(`Unknown project "${rec.project}".`)
      }

      const managerEmail = (rec.manager_email || '').toLowerCase()
      if (managerEmail && !personByEmail.has(managerEmail)) {
        // Managers must already exist: resolving forward references inside one
        // file would need a second pass and a cycle check per row.
        errors.push(`Manager "${rec.manager_email}" is not in TeamPulse yet. Import managers first.`)
      }

      const email = (rec.email || '').toLowerCase()
      if (email && personByEmail.has(email)) errors.push(`${rec.email} already exists.`)
      if (email && seenEmails.has(email)) errors.push(`${rec.email} appears twice in this file.`)
      if (email) seenEmails.add(email)

      payload = parsePersonInput({
        name: rec.name,
        email: rec.email || undefined,
        designation: rec.designation,
        workLocation: rec.working_from || 'Office',
        region: rec.region || 'IN',
        totalExpYears: rec.total_exp_years || 0,
        relevantExpYears: rec.relevant_exp_years || 0,
        dateJoinedOrg: rec.joined_on || undefined,
        projectId: projectName ? projectByName.get(projectName) : undefined,
        managerId: managerEmail ? personByEmail.get(managerEmail) : undefined,
      })
    } catch (err) {
      errors.push(err instanceof HttpError ? err.message : 'Row could not be read.')
    }

    results.push({ line: rec.__line, name: rec.name || '', errors })
    if (errors.length === 0) prepared.push(payload)
  }

  const invalid = results.filter(r => r.errors.length > 0)
  const summary = { rows: records.length, valid: prepared.length, invalid: invalid.length, results, committed: 0 }

  if (!commit || invalid.length > 0) return summary

  for (const p of prepared) {
    await assertProjectExists(p.project_id)
    await sql`
      insert into tp_person
        (name, initials, email, designation, manager_id, project_id, region, work_location,
         allocation_pct, total_exp_months, relevant_exp_months, date_joined_org)
      values
        (${p.name}, ${p.initials}, ${p.email ?? null}, ${p.designation}, ${p.manager_id ?? null},
         ${p.project_id ?? null}, ${p.region ?? 'IN'}, ${p.work_location},
         ${p.allocation_pct ?? 100}, ${p.total_exp_months}, ${p.relevant_exp_months},
         ${p.date_joined_org ?? null})
    `
    summary.committed++
  }

  await sql`
    insert into tp_audit (actor_id, action, entity, after)
    values (${actorUserId}, 'person.import', 'person', ${JSON.stringify({ committed: summary.committed })})
  `

  return summary
}
