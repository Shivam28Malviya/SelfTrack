// Applies db/schema.sql to the Postgres DB pointed to by POSTGRES_URL.
// Usage: vercel env pull .env.local && node --env-file=.env.local scripts/migrate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sql } from '@vercel/postgres'

const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url))
const schema = readFileSync(schemaPath, 'utf8')

const run = async () => {
  await sql.query(schema)
  console.log('Schema applied.')
  process.exit(0)
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
