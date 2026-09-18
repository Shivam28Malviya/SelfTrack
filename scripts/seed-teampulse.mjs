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

  console.log(`Seeded 1 manager, ${PEOPLE.length} people, ${PROJECTS.length} projects, ${SKILLS.length} skills.`)
  console.log('Link a login to a person with: update tp_person set user_id = <users.id> where name = \'Sample Manager\';')
  process.exit(0)
}

run().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
