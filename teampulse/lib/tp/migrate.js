import { sql } from '../db.js'
import { MIGRATIONS } from './migrations.js'
import { splitStatements } from './sqlSplit.js'

/**
 * Applies any unapplied TeamPulse migrations from inside the running app.
 *
 * The repository has no way to reach the production database from a developer
 * machine — `@vercel/postgres` talks to Neon over HTTPS and the connection
 * string lives only in the deployment's environment — so without this, the
 * tables can only be created by someone with the credentials at hand. That is
 * why the legacy router grew `create table if not exists` calls inside route
 * handlers; this replaces that pattern with something tracked and auditable.
 *
 * Admin-only at the route. Every migration is written idempotently, and
 * applied names are recorded in `_migrations`, so running it twice is a no-op.
 */
export async function runMigrations({ dryRun = false } = {}) {
  await sql`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `

  const { rows } = await sql`select name, applied_at from _migrations order by name`
  const applied = new Map(rows.map(r => [r.name, r.applied_at]))

  const pending = MIGRATIONS.filter(m => !applied.has(m.name))
  if (dryRun) {
    return {
      applied: [...applied.keys()],
      pending: pending.map(m => m.name),
      appliedNow: [],
    }
  }

  const appliedNow = []
  for (const migration of pending) {
    // One statement per request. Neon's HTTP transport uses the extended
    // protocol, which accepts a single statement — handing it a whole file
    // fails, which is why this is split rather than sent as one string.
    //
    // There is no transaction across the statements, so a migration that fails
    // halfway leaves the earlier ones applied. Every file is written
    // `if not exists` precisely so that a rerun finishes the job instead of
    // tripping over what already ran.
    for (const statement of splitStatements(migration.sql)) {
      await sql.query(statement)
    }
    await sql`insert into _migrations (name) values (${migration.name}) on conflict do nothing`
    appliedNow.push(migration.name)
  }

  return {
    applied: [...applied.keys(), ...appliedNow],
    pending: [],
    appliedNow,
  }
}

/** Whether the TeamPulse tables exist at all — used by the health check so a
 *  deployment that has never been migrated says so instead of 500ing. */
export async function schemaStatus() {
  const { rows } = await sql`
    select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_name like 'tp\\_%'
  `
  const { rows: cfg } = await sql`
    select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_name = '_migrations'
  `
  return {
    tables: rows[0].n,
    tracked: cfg[0].n > 0,
    // 18 tp_ tables at migration 004. A lower count means the schema is
    // partly applied, which is a state a rerun of /migrate resolves.
    ready: rows[0].n >= 18,
    expected: MIGRATIONS.length,
  }
}
