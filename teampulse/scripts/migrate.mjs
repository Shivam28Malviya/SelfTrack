// Applies db/schema.sql (accounts, sessions, notifications), then every
// unapplied file in db/migrations in name order. Applied migrations are
// recorded in the _migrations table, so reruns are cheap and safe.
//
// Usage: vercel env pull .env.local && node --env-file=.env.local scripts/migrate.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sql } from '../lib/db.js'
import { splitStatements } from '../lib/tp/sqlSplit.js'

const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url))
const migrationsDir = fileURLToPath(new URL('../db/migrations/', import.meta.url))

// One statement per request: the Neon driver's HTTP transport takes a single
// statement, so a whole file cannot be sent as one string.
async function applyScript(script) {
  for (const statement of splitStatements(script)) {
    await sql.query(statement)
  }
}

async function applyBaseSchema() {
  await applyScript(readFileSync(schemaPath, 'utf8'))
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
    // No transaction across statements, so a half-applied file has to be
    // finished by rerunning — which every migration supports, being written
    // `if not exists` throughout.
    await applyScript(readFileSync(migrationsDir + file, 'utf8'))
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
