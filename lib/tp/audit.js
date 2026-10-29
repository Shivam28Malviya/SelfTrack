import { sql } from '../db.js'

/**
 * Writes one audit row. Every write in TeamPulse, and every read of another
 * person's attendance or feedback, goes through here — see
 * docs/teampulse-spec.md section 7.
 *
 * Auditing must never break the request it is recording, so failures are
 * logged and swallowed.
 */
export async function audit({ actor, action, entity = '', entityId = null, personId = null, before = null, after = null }) {
  try {
    await sql`
      insert into tp_audit (actor_id, actor_name, action, entity, entity_id, person_id, before, after)
      values (
        ${actor?.id || null}, ${actor?.username || 'System'}, ${action},
        ${entity}, ${entityId}, ${personId},
        ${before ? JSON.stringify(before) : null}, ${after ? JSON.stringify(after) : null}
      )
    `
  } catch (err) {
    console.error('tp audit write failed', action, err)
  }
}

export const auditRead = (actor, entity, personId) =>
  audit({ actor, action: `read.${entity}`, entity, personId })
