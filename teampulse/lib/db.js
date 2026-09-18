import { neon } from '@neondatabase/serverless'

/**
 * The database handle, usable on Vercel and on Cloudflare Workers.
 *
 * `@vercel/postgres` cannot run on Workers: it reads `process.env` at module
 * scope and rejects any host that is not a Vercel-issued pooled URL. This uses
 * the Neon driver it wraps anyway, over its stateless HTTP transport, which
 * matters on Workers — a pooled WebSocket cannot be reused across requests
 * there, while an HTTP client can.
 *
 * The two call styles the rest of the codebase relies on are both preserved:
 *
 *   sql`select * from users where id = ${id}`   // tagged template
 *   sql.query('select * from users where id = $1', [id])
 *
 * Both resolve to `{ rows, rowCount }`, as before.
 *
 * Created lazily. Throwing at module load would take down every route rather
 * than the one that needs a database — the same trap `lib/supabase.js`
 * documents.
 */
let client = null

const databaseUrl = () => process.env.POSTGRES_URL || process.env.DATABASE_URL

/**
 * Neon's HTTP transport only reaches Neon. A plain `postgres://` host — a
 * local Postgres for development, or any self-hosted one — needs a TCP
 * driver, so the connection string picks the transport.
 *
 * Without this there is no way to run the app against a local database at
 * all, which made developing anything that touches Postgres impossible
 * offline.
 */
const PG_MODULE = 'pg'

const isNeon = (url) => /\.neon\.tech|neon\.build|pooler\..*\.neon\./i.test(url)

function connect() {
  if (client) return client
  // POSTGRES_URL is what Vercel injects; DATABASE_URL is the usual name
  // elsewhere, including a Workers secret.
  const url = databaseUrl()
  if (!url) {
    throw new Error('No database configured on the server (missing POSTGRES_URL / DATABASE_URL).')
  }
  // fullResults gives the { rows, rowCount, fields } shape the callers expect.
  client = isNeon(url) ? neon(url, { fullResults: true }) : tcpClient(url)
  return client
}

/**
 * A node-postgres pool wearing the same interface as the Neon HTTP client, so
 * every call site stays identical. Loaded on demand: `pg` is a development
 * dependency and must never be pulled into the Workers bundle.
 */
function tcpClient(url) {
  let poolPromise = null
  const pool = async () => {
    if (!poolPromise) {
      // The specifier is held in a variable so the bundler cannot resolve it
      // statically and pull `pg` into the Workers bundle, where this branch
      // never runs and the package does not belong.
      poolPromise = import(/* @vite-ignore */ PG_MODULE).then(({ default: pg }) => {
        // node-postgres parses DATE into a JS Date; the Neon driver returns the
        // raw 'YYYY-MM-DD' string. The whole codebase reads dates as strings
        // (`String(row.date).slice(0, 10)`), so under the Date object that
        // yields 'Mon Sep 07' and Postgres rejects it on the way back in.
        //
        // Matching Neon's behaviour here is what keeps local development
        // honest: a driver that disagrees with production about types is worse
        // than no local database, because the disagreement is silent.
        pg.types.setTypeParser(1082, (value) => value)          // date
        pg.types.setTypeParser(1083, (value) => value)          // time
        return new pg.Pool({ connectionString: url })
      })
    }
    return poolPromise
  }
  const run = async (text, params) => (await pool()).query(text, params)

  return (first, ...values) => {
    // Tagged template: rebuild it as $1..$n, exactly as the Neon client does.
    if (Array.isArray(first) && Array.isArray(first.raw)) {
      const text = first.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '')
      return run(text, values)
    }
    return run(first, values[0] ?? [])
  }
}

export function sql(strings, ...values) {
  return connect()(strings, ...values)
}

// Neon's HTTP transport sends one statement per request over the extended
// protocol, so a string holding several statements is rejected. Callers that
// need that (the migration runner) split them first — see lib/tp/sqlSplit.js.
sql.query = (text, params = []) => connect()(text, params)
