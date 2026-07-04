import { sql } from '../lib/db.js'
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth, requireStaff, requireAdmin, HttpError } from '../lib/auth.js'
import { buildState, pushNotif } from '../lib/state.js'

const RANDOM_EMOJIS = ['😎', '🎯', '🔥', '⭐', '🎮', '💡', '🧠', '🎪']
const randomEmoji = () => RANDOM_EMOJIS[(Math.random() * RANDOM_EMOJIS.length) | 0]
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function insertAudit({ actorId, actorName, action, userId, userName, points, category }) {
  await sql`
    insert into audit_log (actor_id, actor_name, action, user_id, user_name, points, category)
    values (${actorId}, ${actorName}, ${action}, ${userId}, ${userName}, ${points}, ${category})
  `
}

async function resetAllScores() {
  await sql`delete from history`
  await sql`update users set score = 0, wins = 0`
}

export default async function handler(req, res) {
  const rawPath = req.query.path
  const segments = Array.isArray(rawPath) ? rawPath : (rawPath ? [rawPath] : [])
  const route = '/' + segments.join('/')
  const method = req.method

  try {
    // ---- auth ----
    if (route === '/auth/signup' && method === 'POST') {
      const { username, email, password } = req.body || {}
      const u = (username || '').trim()
      const em = (email || '').trim()
      if (u.length < 3 || u.length > 20 || !/^[a-zA-Z0-9_]+$/.test(u)) throw new HttpError(400, 'Invalid username.')
      if (!emailRe.test(em)) throw new HttpError(400, 'Invalid email.')
      if (!password || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.')

      const { rows: existing } = await sql`select id from users where email = ${em} or lower(username) = lower(${u})`
      if (existing.length) throw new HttpError(400, 'Email or username already registered.')

      const hash = await hashPassword(password)
      await sql`
        insert into users (username, email, password_hash, role, status, emoji)
        values (${u}, ${em}, ${hash}, 'user', 'pending', ${randomEmoji()})
      `
      return res.status(200).json({ success: true, pending: true })
    }

    if (route === '/auth/login' && method === 'POST') {
      const { email, password } = req.body || {}
      const { rows } = await sql`select * from users where email = ${(email || '').trim()}`
      const user = rows[0]
      if (!user || !(await verifyPassword(password || '', user.password_hash))) {
        throw new HttpError(401, 'Invalid email or password.')
      }
      if (user.status === 'pending') throw new HttpError(403, 'Account pending admin approval.')
      const token = await createSession(user.id)
      const state = await buildState(user.id)
      return res.status(200).json({ success: true, token, ...state })
    }

    if (route === '/auth/logout' && method === 'POST') {
      const header = req.headers.authorization || ''
      await destroySession(header.startsWith('Bearer ') ? header.slice(7) : null)
      return res.status(200).json({ success: true })
    }

    if (route === '/auth/reset-password' && method === 'POST') {
      const { email, newPassword } = req.body || {}
      if (!newPassword || newPassword.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.')
      const { rows } = await sql`select id from users where email = ${(email || '').trim()}`
      if (!rows[0]) throw new HttpError(404, 'No account with that email.')
      const hash = await hashPassword(newPassword)
      await sql`update users set password_hash = ${hash} where id = ${rows[0].id}`
      return res.status(200).json({ success: true })
    }

    if (route === '/state' && method === 'GET') {
      const user = await requireAuth(req)
      const state = await buildState(user.id)
      return res.status(200).json({ success: true, ...state })
    }

    // ---- user management ----
    if (route === '/users' && method === 'POST') {
      const actor = await requireAdmin(req)
      const { username, email, password, role } = req.body || {}
      const u = (username || '').trim()
      const em = (email || '').trim()
      if (u.length < 3 || u.length > 20 || !/^[a-zA-Z0-9_]+$/.test(u)) throw new HttpError(400, 'Invalid username.')
      if (!emailRe.test(em)) throw new HttpError(400, 'Invalid email.')
      if (!password || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.')
      const { rows: existing } = await sql`select id from users where email = ${em} or lower(username) = lower(${u})`
      if (existing.length) throw new HttpError(400, 'Email or username already registered.')
      const hash = await hashPassword(password)
      await sql`
        insert into users (username, email, password_hash, role, status, emoji)
        values (${u}, ${em}, ${hash}, ${role || 'user'}, 'approved', ${randomEmoji()})
      `
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    const userIdMatch = route.match(/^\/users\/([^/]+)(\/.*)?$/)
    if (userIdMatch) {
      const targetId = userIdMatch[1]
      const sub = userIdMatch[2] || ''

      if (sub === '' && method === 'DELETE') {
        const actor = await requireAdmin(req)
        if (actor.id === targetId) throw new HttpError(400, "Can't delete your own account.")
        await sql`delete from users where id = ${targetId}`
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }

      if (sub === '/approve' && method === 'POST') {
        const actor = await requireAdmin(req)
        await sql`update users set status = 'approved' where id = ${targetId}`
        await pushNotif(targetId, 'Your account has been approved. Welcome aboard!', '✅')
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }

      if (sub === '/reject' && method === 'POST') {
        const actor = await requireAdmin(req)
        await sql`delete from users where id = ${targetId}`
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }

      if (sub === '/username' && method === 'PATCH') {
        const actor = await requireAdmin(req)
        const { username } = req.body || {}
        const u = (username || '').trim()
        if (u.length < 3 || u.length > 20 || !/^[a-zA-Z0-9_]+$/.test(u)) throw new HttpError(400, 'Invalid username.')
        const { rows: clash } = await sql`select id from users where lower(username) = lower(${u}) and id != ${targetId}`
        if (clash.length) throw new HttpError(400, 'Username already taken.')
        const { rows: prev } = await sql`select username from users where id = ${targetId}`
        if (!prev[0]) throw new HttpError(404, 'User not found.')
        await sql`update users set username = ${u} where id = ${targetId}`
        // keep denormalized names in sync
        await sql`update weekly_winners set winner_name = ${u} where winner_id = ${targetId}`
        await sql`update kudos set from_name = ${u} where from_id = ${targetId}`
        await pushNotif(targetId, `An admin changed your username from "${prev[0].username}" to "${u}".`, '✏️')
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }

      if (sub === '/role' && method === 'PATCH') {
        const actor = await requireAdmin(req)
        const { role } = req.body || {}
        if (!['user', 'moderator', 'admin'].includes(role)) throw new HttpError(400, 'Invalid role.')
        await sql`update users set role = ${role} where id = ${targetId}`
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }

      if (sub === '/password' && method === 'POST') {
        const actor = await requireAuth(req)
        const isSelf = actor.id === targetId
        if (!isSelf && actor.role !== 'admin') throw new HttpError(403, 'Not allowed.')
        const { password } = req.body || {}
        if (!password || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.')
        if (isSelf && (await verifyPassword(password, actor.password_hash))) {
          throw new HttpError(400, 'New password must be different from current password.')
        }
        const hash = await hashPassword(password)
        await sql`update users set password_hash = ${hash} where id = ${targetId}`
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }

      if (sub === '/bio' && method === 'PATCH') {
        const actor = await requireAuth(req)
        if (actor.id !== targetId) throw new HttpError(403, 'Not allowed.')
        const { bio } = req.body || {}
        await sql`update users set bio = ${(bio || '').slice(0, 140)} where id = ${targetId}`
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }

      if (sub === '/avatar' && method === 'POST') {
        const actor = await requireAuth(req)
        const { action, dataUrl } = req.body || {}
        if (action === 'request') {
          if (actor.id !== targetId) throw new HttpError(403, 'Not allowed.')
          await sql`update users set pending_avatar = ${dataUrl} where id = ${targetId}`
        } else if (action === 'adminSet') {
          if (actor.role !== 'admin') throw new HttpError(403, 'Admin access required.')
          await sql`update users set avatar = ${dataUrl}, pending_avatar = '' where id = ${targetId}`
        } else if (action === 'approve') {
          if (actor.role !== 'admin') throw new HttpError(403, 'Admin access required.')
          await sql`update users set avatar = pending_avatar, pending_avatar = '' where id = ${targetId}`
          await pushNotif(targetId, 'Your new profile picture was approved.', '🖼️')
        } else if (action === 'reject') {
          if (actor.role !== 'admin') throw new HttpError(403, 'Admin access required.')
          await sql`update users set pending_avatar = '' where id = ${targetId}`
          await pushNotif(targetId, 'Your profile picture request was declined.', '🚫')
        } else {
          throw new HttpError(400, 'Invalid action.')
        }
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }
    }

    // ---- points / audit ----
    if (route === '/points' && method === 'POST') {
      const actor = await requireStaff(req)
      const { userId, points, category } = req.body || {}
      const pts = parseInt(points, 10)
      if (!Number.isFinite(pts) || pts <= 0 || pts > 10000) throw new HttpError(400, 'Invalid point amount.')
      const { rows } = await sql`select username from users where id = ${userId}`
      if (!rows[0]) throw new HttpError(404, 'User not found.')
      const cat = category || 'General'
      await sql`insert into history (user_id, date, points, category) values (${userId}, now(), ${pts}, ${cat})`
      await sql`update users set score = score + ${pts} where id = ${userId}`
      await pushNotif(userId, `You received +${pts} points (${cat}).`, '⭐')
      await insertAudit({ actorId: actor.id, actorName: actor.username, action: 'addPoints', userId, userName: rows[0].username, points: pts, category: cat })
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    const undoMatch = route.match(/^\/audit\/([^/]+)\/undo$/)
    if (undoMatch && method === 'POST') {
      const actor = await requireStaff(req)
      const auditId = undoMatch[1]
      const { rows } = await sql`select * from audit_log where id = ${auditId}`
      const entry = rows[0]
      if (!entry || entry.undone || entry.action !== 'addPoints') {
        const state = await buildState(actor.id)
        return res.status(200).json({ success: true, ...state })
      }
      const { rows: histRows } = await sql`
        select id from history where user_id = ${entry.user_id} and points = ${entry.points} and category = ${entry.category}
        order by date desc limit 1
      `
      if (histRows[0]) await sql`delete from history where id = ${histRows[0].id}`
      await sql`update users set score = greatest(0, score - ${entry.points}) where id = ${entry.user_id}`
      await sql`update audit_log set undone = true where id = ${auditId}`
      await pushNotif(entry.user_id, `An award of +${entry.points} was reverted.`, '↩️')
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    // ---- admin actions ----
    if (route === '/admin/reset-scores' && method === 'POST') {
      const actor = await requireAdmin(req)
      await resetAllScores()
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    if (route === '/admin/end-season' && method === 'POST') {
      const actor = await requireAdmin(req)
      const { name } = req.body || {}
      const { rows: seasonCount } = await sql`select count(*)::int as n from seasons`
      const { rows: top3 } = await sql`
        select id, username, emoji, avatar, score from users
        where role != 'admin' and status = 'approved'
        order by score desc limit 3
      `
      const podium = JSON.stringify(top3)
      const seasonName = (name && name.trim()) || `Season ${seasonCount[0].n + 1}`
      await sql`insert into seasons (name, podium) values (${seasonName}, ${podium}::jsonb)`
      await resetAllScores()
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    // ---- kudos ----
    if (route === '/kudos' && method === 'POST') {
      const actor = await requireAuth(req)
      const { targetId, emoji } = req.body || {}
      if (!targetId || targetId === actor.id) throw new HttpError(400, 'Invalid target.')
      await sql`
        insert into kudos (user_id, from_id, from_name, emoji)
        values (${targetId}, ${actor.id}, ${actor.username}, ${emoji})
        on conflict (user_id, from_id) do update set emoji = excluded.emoji, ts = now()
      `
      await pushNotif(targetId, `${actor.username} sent you ${emoji}`, emoji)
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    // ---- meta ----
    if (route === '/meta/rewards' && method === 'POST') {
      const actor = await requireAdmin(req)
      await sql`update meta set rewards = ${JSON.stringify(req.body || {})}::jsonb where id = 1`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    if (route === '/meta/quote' && method === 'POST') {
      const actor = await requireAdmin(req)
      await sql`update meta set quote = ${JSON.stringify(req.body || {})}::jsonb where id = 1`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    if (route === '/meta/results' && method === 'POST') {
      const actor = await requireAdmin(req)
      await sql`update meta set results = ${JSON.stringify(req.body || {})}::jsonb where id = 1`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    if (route === '/meta/categories' && method === 'POST') {
      const actor = await requireAdmin(req)
      const { name } = req.body || {}
      await sql`
        update meta set categories = (
          select case when categories @> ${JSON.stringify([name])}::jsonb
            then categories
            else categories || ${JSON.stringify([name])}::jsonb
          end from meta where id = 1
        ) where id = 1
      `
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    const catMatch = route.match(/^\/meta\/categories\/(.+)$/)
    if (catMatch && method === 'DELETE') {
      const actor = await requireAdmin(req)
      const name = decodeURIComponent(catMatch[1])
      await sql`
        update meta set categories = (
          select jsonb_agg(c) from jsonb_array_elements_text(categories) c where c != ${name}
        ) where id = 1
      `
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    if (route === '/meta/announcement' && method === 'POST') {
      const actor = await requireAdmin(req)
      const { text, hours } = req.body || {}
      const until = Date.now() + (parseInt(hours, 10) || 0) * 3600 * 1000
      await sql`update meta set announcement = ${JSON.stringify({ text, until })}::jsonb where id = 1`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    if (route === '/meta/announcement' && method === 'DELETE') {
      const actor = await requireAdmin(req)
      await sql`update meta set announcement = '{"text":"","until":0}'::jsonb where id = 1`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    if (route === '/meta/weekly-winners' && method === 'POST') {
      const actor = await requireAdmin(req)
      const { week, topic, winnerId, winnerName } = req.body || {}
      await sql`insert into weekly_winners (week, topic, winner_id, winner_name) values (${week}, ${topic}, ${winnerId}, ${winnerName})`
      if (winnerId) await sql`update users set wins = wins + 1 where id = ${winnerId}`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    const winnerMatch = route.match(/^\/meta\/weekly-winners\/([^/]+)$/)
    if (winnerMatch && method === 'DELETE') {
      const actor = await requireAdmin(req)
      const { rows: removed } = await sql`select winner_id from weekly_winners where id = ${winnerMatch[1]}`
      await sql`delete from weekly_winners where id = ${winnerMatch[1]}`
      if (removed[0]?.winner_id) await sql`update users set wins = greatest(0, wins - 1) where id = ${removed[0].winner_id}`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    // ---- notifications ----
    const notifMatch = route.match(/^\/notifications\/([^/]+)\/read$/)
    if (notifMatch && method === 'POST') {
      const actor = await requireAuth(req)
      await sql`update notifications set read = true where id = ${notifMatch[1]} and user_id = ${actor.id}`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    if (route === '/notifications/read-all' && method === 'POST') {
      const actor = await requireAuth(req)
      await sql`update notifications set read = true where user_id = ${actor.id}`
      const state = await buildState(actor.id)
      return res.status(200).json({ success: true, ...state })
    }

    return res.status(404).json({ success: false, error: 'Not found.' })
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, error: err.message })
    console.error(err)
    return res.status(500).json({ success: false, error: 'Server error.' })
  }
}
