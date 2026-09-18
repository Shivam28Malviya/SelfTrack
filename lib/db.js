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

function connect() {
  if (client) return client
  // POSTGRES_URL is what Vercel injects; DATABASE_URL is the usual name
  // elsewhere, including a Workers secret.
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (!url) {
    throw new Error('No database configured on the server (missing POSTGRES_URL / DATABASE_URL).')
  }
  // fullResults gives the { rows, rowCount, fields } shape the callers expect.
  client = neon(url, { fullResults: true })
  return client
}

export function sql(strings, ...values) {
  return connect()(strings, ...values)
}

// Neon's HTTP transport sends one statement per request over the extended
// protocol, so a string holding several statements is rejected. Callers that
// need that (the migration runner) split them first — see lib/tp/sqlSplit.js.
sql.query = (text, params = []) => connect()(text, params)

export function rowToUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status,
    score: u.score,
    emoji: u.emoji,
    avatar: u.avatar,
    pendingAvatar: u.pending_avatar,
    bio: u.bio,
    stats: { wins: u.wins },
  }
}

export function rowToHistory(h) {
  return { date: new Date(h.date).getTime(), points: h.points, category: h.category }
}

export function rowToKudos(k) {
  return { fromId: k.from_id, fromName: k.from_name, emoji: k.emoji, ts: new Date(k.ts).getTime() }
}

export function rowToNotif(n) {
  return { id: String(n.id), userId: n.user_id, text: n.text, icon: n.icon, ts: new Date(n.ts).getTime(), read: n.read }
}

export function rowToAudit(a) {
  return {
    id: String(a.id), ts: new Date(a.ts).getTime(),
    actorId: a.actor_id, actorName: a.actor_name, action: a.action,
    userId: a.user_id, userName: a.user_name, points: a.points, category: a.category, undone: a.undone,
  }
}

export function rowToSeason(s) {
  return { id: String(s.id), name: s.name, endedAt: new Date(s.ended_at).getTime(), podium: s.podium }
}

export function rowToWinner(w) {
  return { id: String(w.id), week: w.week, topic: w.topic, winnerId: w.winner_id, winnerName: w.winner_name }
}
