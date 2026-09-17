// Applies db/schema.sql, then every unapplied file in db/migrations in name
// order. Applied migrations are recorded in the _migrations table so reruns
// are cheap and safe.
//
// Usage: vercel env pull .env.local && node --env-file=.env.local scripts/migrate.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sql } from '@vercel/postgres'

const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url))
const migrationsDir = fileURLToPath(new URL('../db/migrations/', import.meta.url))

async function applyBaseSchema() {
  await sql.query(readFileSync(schemaPath, 'utf8'))
  console.log('Base schema applied.')
}

async function applyMigrations() {
  if (!existsSync(migrationsDir)) return

  await sql`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `

  const { rows } = await sql`select name from _migrations`
  const applied = new Set(rows.map(r => r.name))

  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  let count = 0

  for (const file of files) {
    if (applied.has(file)) continue
    const body = readFileSync(migrationsDir + file, 'utf8')
    // One statement per migration file would let us wrap this in a
    // transaction; @vercel/postgres runs multi-statement strings on a single
    // connection without one, so a half-applied file has to be fixed by hand.
    // Every migration is written idempotently (create if not exists) so a
    // rerun after a failure is safe.
    await sql.query(body)
    await sql`insert into _migrations (name) values (${file})`
    console.log(`Applied ${file}`)
    count++
  }

  console.log(count === 0 ? 'No new migrations.' : `${count} migration(s) applied.`)
}

const run = async () => {
  await applyBaseSchema()
  await applyMigrations()
  process.exit(0)
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
