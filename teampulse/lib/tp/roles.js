import { sql } from '../db.js'
import { requireAuth, HttpError } from '../auth.js'

// Team Pulse roles map onto the account's role column. See README.
const ROLE_MAP = {
  admin: 'admin',
  moderator: 'manager',
  user: 'member',
  spectator: 'spectator',
}

export const tpRole = (user) => ROLE_MAP[user?.role] || 'spectator'

// Depth cap: a manager_id cycle would otherwise make the recursive CTE spin.
// The constraint stops self-parenting; it cannot stop A -> B -> A.
const MAX_TREE_DEPTH = 10

export async function subtreeIds(rootPersonId) {
  if (!rootPersonId) return []
  const { rows } = await sql`
    with recursive tree as (
      select id, 1 as depth from tp_person where id = ${rootPersonId}
      union all
      select p.id, t.depth + 1 from tp_person p
      join tree t on p.manager_id = t.id
      where t.depth < ${MAX_TREE_DEPTH}
    )
    select distinct id from tree
  `
  return rows.map(r => Number(r.id))
}

export async function personForUser(userId) {
  if (!userId) return null
  const { rows } = await sql`select * from tp_person where user_id = ${userId} limit 1`
  return rows[0] || null
}

/**
 * Resolves what a signed-in user may see.
 *
 *   { role, user, self, scope: 'all' | 'ids' | 'none', ids }
 *
 * `scope: 'all'` means no person filter. `'ids'` means restrict to `ids`
 * (possibly empty, which correctly yields nothing). Callers must apply this —
 * it is the single place row access is decided.
 */
export async function requireTp(req) {
  const user = await requireAuth(req)
  if (user.status !== 'approved') throw new HttpError(403, 'Account not approved yet.')

  const role = tpRole(user)
  const self = await personForUser(user.id)

  if (role === 'admin') return { role, user, self, scope: 'all', ids: null }

  if (role === 'manager') {
    if (!self) throw new HttpError(403, 'No Team Pulse profile is linked to this account.')
    return { role, user, self, scope: 'ids', ids: await subtreeIds(self.id) }
  }

  if (role === 'member') {
    return { role, user, self, scope: 'ids', ids: self ? [self.id] : [] }
  }

  // Spectator was specified as "names and team aggregates only", but nothing
  // ever implemented that: the role resolved to an empty scope, so every
  // screen rendered em dashes and every metric read as nothing. A role that
  // can open the product and see only blanks is worse than one that is told
  // plainly it has no access, so it is refused here until there is a real
  // requirement to build the read-only view.
  throw new HttpError(403, 'Team Pulse is not available to spectator accounts.')
}

export function canSeePerson(ctx, personId) {
  if (ctx.scope === 'all') return true
  if (ctx.scope === 'none') return false
  return ctx.ids.includes(Number(personId))
}

export function assertCanSeePerson(ctx, personId) {
  // 404 rather than 403: telling a manager that person 57 exists but is not
  // theirs is itself a disclosure.
  if (!canSeePerson(ctx, personId)) throw new HttpError(404, 'Person not found.')
}

export function requireRole(ctx, ...roles) {
  if (!roles.includes(ctx.role)) throw new HttpError(403, 'You do not have access to this.')
}
