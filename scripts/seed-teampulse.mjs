// Inserts a small sample team so the TeamPulse screens can be exercised
// against a real database. The names come from the design export and are
// fictional — see the canvas note, "all names and numbers are sample data".
//
// Guarded on purpose: seeding a production database with invented people would
// be worse than an empty one.
//
// Usage: TP_SEED=1 node --env-file=.env.local scripts/seed-teampulse.mjs
import { sql } from '../lib/db.js'

if (process.env.TP_SEED !== '1') {
  console.error('Refusing to seed. Set TP_SEED=1 to confirm this is not a production database.')
  process.exit(1)
}

const PROJECTS = [
  { name: 'Unilever NA', client: 'Unilever', region: 'IN' },
  { name: 'Unilever UK', client: 'Unilever', region: 'UK' },
  { name: 'Bench', client: '', region: 'IN' },
]

// name, initials, designation, project, location, totalMonths, relevantMonths
const PEOPLE = [
  ['Priya D.', 'PD', 'Senior Consultant', 'Unilever NA', 'Client site', 101, 73],
  ['Rohan K.', 'RK', 'Senior Consultant', 'Unilever UK', 'Client site', 86, 60],
  ['Sameer P.', 'SP', 'Senior Consultant', 'Unilever UK', 'Client site', 109, 50],
  ['Neha S.', 'NS', 'Consultant', 'Unilever NA', 'Home', 54, 46],
  ['Vikram T.', 'VT', 'Consultant', 'Unilever UK', 'Client site', 67, 59],
  ['Kavya R.', 'KR', 'Consultant', 'Unilever NA', 'Office', 58, 49],
  ['Dev G.', 'DG', 'Consultant', 'Unilever NA', 'Client site', 47, 38],
  ['Tanvi S.', 'TS', 'Consultant', 'Unilever UK', 'Office', 60, 32],
  ['Arjun M.', 'AM', 'Analyst', 'Unilever NA', 'Office', 25, 17],
  ['Meera A.', 'MA', 'Analyst', 'Unilever NA', 'Home', 29, 24],
  ['Isha N.', 'IN', 'Analyst', 'Bench', 'Office', 19, 19],
]

const SKILLS = ['MOCA', 'PL/SQL', 'Integrator', 'Page Builder', 'Python', 'WLM', 'GenAI', 'Client comms']

const run = async () => {
  for (const p of PROJECTS) {
    await sql`
      insert into tp_project (name, client, region) values (${p.name}, ${p.client}, ${p.region})
      on conflict do nothing
    `
  }
  const { rows: projectRows } = await sql`select id, name from tp_project`
  const projectId = Object.fromEntries(projectRows.map(r => [r.name, r.id]))

  // The manager is seeded first so everyone else can point at them.
  const { rows: mgrRows } = await sql`
    insert into tp_person (name, initials, designation, region, work_location, total_exp_months, relevant_exp_months)
    values ('Sample Manager', 'SM', 'Manager', 'IN', 'Office', 150, 120)
    returning id
  `
  const managerId = mgrRows[0].id

  for (const [name, initials, designation, project, location, total, relevant] of PEOPLE) {
    await sql`
      insert into tp_person
        (name, initials, designation, manager_id, project_id, region, work_location,
         total_exp_months, relevant_exp_months, date_joined_org)
      values
        (${name}, ${initials}, ${designation}, ${managerId}, ${projectId[project]},
         ${project === 'Unilever UK' ? 'UK' : 'IN'}, ${location},
         ${total}, ${relevant}, current_date - interval '2 years')
    `
  }

  for (const [i, name] of SKILLS.entries()) {
    await sql`insert into tp_skill (name, sort) values (${name}, ${i}) on conflict do nothing`
  }

  // ---- activity ----
  // People alone leave every screen empty, which demonstrates nothing. This
  // adds enough delivery, attendance, feedback and ratings for the metrics,
  // the charts and the attention rule to have something real to compute.
  const { rows: people } = await sql`select id, name from tp_person where name <> 'Sample Manager' order by id`
  const byName = Object.fromEntries(people.map(p => [p.name, Number(p.id)]))
  const { rows: skillRows } = await sql`select id, name from tp_skill`
  const skillId = Object.fromEntries(skillRows.map(r => [r.name, Number(r.id)]))

  const day = (offset) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + offset)
    return d.toISOString().slice(0, 10)
  }

  // title, owner, project, dueOffset, status, completedOffset, est, actual, reopened, leaked
  const TASKS = [
    ['Wave planning MOCA fix', 'Priya D.', 'Unilever NA', -5, 'done', -2, 8, 11, 0, false],
    ['Pick label report', 'Priya D.', 'Unilever NA', -12, 'done', -14, 6, 5, 0, false],
    ['ASN inbound integration', 'Vikram T.', 'Unilever UK', 3, 'in_progress', null, 24, 16, 0, false],
    ['Label printer mapping', 'Rohan K.', 'Unilever UK', -9, 'in_progress', null, 6, 9, 1, false],
    ['Replenishment rule change', 'Neha S.', 'Unilever NA', 5, 'blocked', null, 12, 3, 0, false],
    ['Cycle count report', 'Meera A.', 'Unilever NA', -3, 'done', -3, 5, 5, 0, false],
    ['UAT defect triage', 'Arjun M.', 'Unilever NA', -7, 'done', -1, 10, 16, 1, true],
    ['Inventory adjustment audit', 'Kavya R.', 'Unilever NA', -20, 'done', -21, 9, 8, 0, false],
    ['Outbound wave tuning', 'Dev G.', 'Unilever NA', 8, 'todo', null, 14, null, 0, false],
    ['Carrier integration retry', 'Sameer P.', 'Unilever UK', -11, 'in_progress', null, 10, 14, 0, false],
    ['Putaway rule cleanup', 'Tanvi S.', 'Unilever UK', -16, 'done', -15, 7, 6, 0, false],
    ['Cartonisation review', 'Vikram T.', 'Unilever UK', -25, 'done', -24, 12, 11, 0, false],
  ]

  for (const [title, owner, project, due, status, completed, est, actual, reopened, leaked] of TASKS) {
    await sql`
      insert into tp_task (title, owner_id, project_id, status, progress_pct, due_date, completed_at,
                           est_hours, actual_hours, reopened_count, leaked_to_uat, blocked_reason)
      values (${title}, ${byName[owner]}, ${projectId[project]}, ${status},
              ${status === 'done' ? 100 : status === 'todo' ? 0 : 45},
              ${day(due)}, ${completed == null ? null : day(completed) + 'T12:00:00Z'},
              ${est}, ${actual}, ${reopened}, ${leaked},
              ${status === 'blocked' ? 'Waiting on client sign-off' : ''})
    `
  }

  // Attendance across the last 45 days: present by default, with a handful of
  // absences and late logins so the calendar and the rate are not flat.
  const MARKS = {
    'Rohan K.': { '-4': 'unplanned', '-5': 'unplanned', '-11': 'unplanned', '-18': 'unplanned' },
    'Arjun M.': { '-7': 'sick', '-8': 'sick' },
    'Kavya R.': { '-14': 'planned', '-15': 'planned' },
    'Neha S.': { '-9': 'planned' },
    'Vikram T.': { '-2': 'unplanned' },
  }
  const LATE = { 'Priya D.': [-3, -10, -17], 'Rohan K.': [-6, -13], 'Neha S.': [-12], 'Sameer P.': [-19] }

  for (const person of people) {
    const marks = MARKS[person.name] || {}
    const late = LATE[person.name] || []
    for (let off = -45; off <= 0; off++) {
      const date = day(off)
      const dow = new Date(date + 'T00:00:00Z').getUTCDay()
      if (dow === 0 || dow === 6) continue
      const type = marks[String(off)] || 'present'
      const minutesLate = late.includes(off) ? [18, 34, 12, 25][Math.abs(off) % 4] : 0
      await sql`
        insert into tp_attendance (person_id, date, type, minutes_late, login_time)
        values (${Number(person.id)}, ${date}, ${type}, ${minutesLate},
                ${minutesLate ? '10:0' + (minutesLate % 10) : null})
        on conflict (person_id, date) do nothing
      `
    }
  }

  const FEEDBACK = [
    ['Priya D.', 5, -6, 'Unilever NA', 'Excellent go-live support.'],
    ['Priya D.', 5, -20, 'Unilever NA', 'Very responsive through UAT.'],
    ['Vikram T.', 4, -8, 'Unilever UK', 'Solid integration work.'],
    ['Rohan K.', 3, -5, 'Unilever UK', 'Missed two committed dates.'],
    ['Rohan K.', 4, -40, 'Unilever UK', 'Good recovery on the printer issue.'],
    ['Neha S.', 4, -11, 'Unilever NA', 'Clear communication.'],
    ['Arjun M.', 3, -9, 'Unilever NA', 'Needs closer review before handover.'],
    ['Meera A.', 5, -13, 'Unilever NA', 'Report was exactly what we asked for.'],
    ['Kavya R.', 4, -22, 'Unilever NA', 'Dependable.'],
  ]
  for (const [name, score, off, project, comment] of FEEDBACK) {
    await sql`
      insert into tp_feedback (person_id, source, score, comment, project_id, given_on)
      values (${byName[name]}, 'client', ${score}, ${comment}, ${projectId[project]}, ${day(off)})
    `
  }

  const OVERTIME = [['Priya D.', -6, 4], ['Priya D.', -13, 5], ['Neha S.', -7, 6], ['Neha S.', -21, 7], ['Rohan K.', -10, 3]]
  for (const [name, off, hours] of OVERTIME) {
    await sql`insert into tp_overtime (person_id, date, hours, note) values (${byName[name]}, ${day(off)}, ${hours}, 'Go-live support')`
  }

  // level by person and skill; self ratings deliberately differ in places, so
  // the heatmap's self-versus-manager marker has something to show.
  const RATINGS = [
    ['Priya D.', 'MOCA', 4, 4], ['Priya D.', 'PL/SQL', 3, 4], ['Priya D.', 'Integrator', 3, 3],
    ['Vikram T.', 'Integrator', 4, 3], ['Vikram T.', 'MOCA', 3, 3], ['Vikram T.', 'PL/SQL', 3, 3],
    ['Rohan K.', 'MOCA', 3, 4], ['Rohan K.', 'Page Builder', 3, 2],
    ['Neha S.', 'PL/SQL', 3, 3], ['Neha S.', 'WLM', 3, 2], ['Neha S.', 'Client comms', 3, 3],
    ['Kavya R.', 'WLM', 4, 4], ['Kavya R.', 'PL/SQL', 2, 3],
    ['Arjun M.', 'Python', 3, 2], ['Arjun M.', 'GenAI', 2, 3],
    ['Sameer P.', 'MOCA', 3, 3], ['Sameer P.', 'PL/SQL', 3, 3],
    ['Meera A.', 'Page Builder', 3, 3], ['Meera A.', 'Client comms', 2, 2],
    ['Dev G.', 'Integrator', 2, 2], ['Isha N.', 'GenAI', 3, 2], ['Tanvi S.', 'PL/SQL', 2, 2],
  ]
  for (const [name, skill, mgr, self] of RATINGS) {
    for (const [ratedBy, level] of [['manager', mgr], ['self', self]]) {
      await sql`
        insert into tp_skill_rating (person_id, skill_id, level, rated_by)
        values (${byName[name]}, ${skillId[skill]}, ${level}, ${ratedBy})
        on conflict (person_id, skill_id, rated_by) do update set level = excluded.level
      `
    }
  }

  const CERTS = [
    ['Priya D.', 'BY WMS Technical Consultant', 'Blue Yonder', 'core', 'completed', -400, 55],
    ['Rohan K.', 'BY WMS Functional Consultant', 'Blue Yonder', 'core', 'completed', -300, 70],
    ['Sameer P.', 'ITIL Foundation', 'Axelos', 'adjacent', 'completed', -500, 85],
    ['Vikram T.', 'Azure Fundamentals', 'Microsoft', 'adjacent', 'completed', -120, 600],
    ['Meera A.', 'BY WMS Technical Consultant', 'Blue Yonder', 'core', 'enrolled', null, null],
  ]
  for (const [name, cert, issuer, kind, status, completedOff, expiresOff] of CERTS) {
    await sql`
      insert into tp_cert (person_id, name, issuer, kind, status, completed_on, expires_on)
      values (${byName[name]}, ${cert}, ${issuer}, ${kind}, ${status},
              ${completedOff == null ? null : day(completedOff)},
              ${expiresOff == null ? null : day(expiresOff)})
    `
  }

  const { rows: counts } = await sql`
    select (select count(*) from tp_task)::int as tasks,
           (select count(*) from tp_attendance)::int as attendance,
           (select count(*) from tp_feedback)::int as feedback,
           (select count(*) from tp_skill_rating)::int as ratings,
           (select count(*) from tp_cert)::int as certs
  `
  const c = counts[0]
  console.log(`Seeded 1 manager, ${PEOPLE.length} people, ${PROJECTS.length} projects, ${SKILLS.length} skills.`)
  console.log(`Activity: ${c.tasks} tasks, ${c.attendance} attendance days, ${c.feedback} feedback, ${c.ratings} skill ratings, ${c.certs} certifications.`)
  console.log('Link a login to a person with: update tp_person set user_id = <users.id> where name = \'Sample Manager\';')
  process.exit(0)
}

run().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
