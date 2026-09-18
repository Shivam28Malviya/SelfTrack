import { sql } from './db.js'

/**
 * Records a notification for a person's login.
 *
 * Used when a leave request is decided: a decision nobody is told about is not
 * one they can act on. Failures are swallowed — a notification that cannot be
 * written must not fail the decision it is reporting.
 */
export async function pushNotif(userId, text, icon = '🔔') {
  if (!userId) return
  try {
    await sql`insert into notifications (user_id, text, icon) values (${userId}, ${text}, ${icon})`
  } catch (err) {
    console.error('notification write failed', err)
  }
}

export async function listNotifications(userId, limit = 50) {
  const { rows } = await sql`
    select id, text, icon, ts, read from notifications
     where user_id = ${userId} order by ts desc limit ${limit}
  `
  return rows.map(r => ({
    id: String(r.id), text: r.text, icon: r.icon,
    ts: new Date(r.ts).toISOString(), read: r.read,
  }))
}
