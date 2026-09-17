// TeamPulse API. Kept separate from api/[...path].js so the legacy leaderboard
// router does not keep growing, and so TeamPulse routes can enforce their own
// per-row access rules in one place.
import { HttpError } from '../../lib/auth.js'
import { requireTp, assertCanSeePerson, requireRole } from '../../lib/tp/roles.js'
import { getConfig, setConfig, DEFAULTS } from '../../lib/tp/config.js'
import { listPeople, getPerson } from '../../lib/tp/people.js'
import { auditRead, audit } from '../../lib/tp/audit.js'
import { id as parseId, oneOf } from '../../lib/tp/validate.js'
import { sql } from '../../lib/db.js'

export default async function handler(req, res) {
  const rawPath = req.query.path
  const segments = Array.isArray(rawPath) ? rawPath : (rawPath ? [rawPath] : [])
  const route = '/' + segments.join('/')
  const method = req.method
  const query = req.query || {}

  try {
    // ---- health ----
    // Unauthenticated on purpose: it reports reachability, nothing else.
    if (route === '/health' && method === 'GET') {
      return res.status(200).json({ success: true, module: 'teampulse', ok: true })
    }

    // ---- who am I, in TeamPulse terms ----
    if (route === '/me' && method === 'GET') {
      const ctx = await requireTp(req)
      return res.status(200).json({
        success: true,
        role: ctx.role,
        person: ctx.self ? { id: Number(ctx.self.id), name: ctx.self.name } : null,
        visiblePeople: ctx.scope === 'all' ? null : ctx.ids.length,
      })
    }

    // ---- config ----
    if (route === '/config' && method === 'GET') {
      await requireTp(req)
      return res.status(200).json({ success: true, config: await getConfig() })
    }

    if (route === '/config' && method === 'PUT') {
      const ctx = await requireTp(req)
      requireRole(ctx, 'admin')
      const { key, value } = req.body || {}
      const k = oneOf(key, 'key', Object.keys(DEFAULTS))
      if (value === undefined || value === null) throw new HttpError(400, 'value is required.')
      const before = (await getConfig())[k]
      await setConfig(k, value)
      await audit({ actor: ctx.user, action: 'config.update', entity: 'config', before: { [k]: before }, after: { [k]: value } })
      return res.status(200).json({ success: true, config: await getConfig() })
    }

    // ---- reference data ----
    if (route === '/projects' && method === 'GET') {
      await requireTp(req)
      const { rows } = await sql`select id, name, client, region, active from tp_project where active = true order by name`
      return res.status(200).json({
        success: true,
        projects: rows.map(r => ({ id: Number(r.id), name: r.name, client: r.client, region: r.region })),
      })
    }

    // ---- people ----
    if (route === '/people' && method === 'GET') {
      const ctx = await requireTp(req)
      const result = await listPeople(ctx, query)
      return res.status(200).json({ success: true, ...result })
    }

    const personMatch = route.match(/^\/people\/(\d+)$/)
    if (personMatch && method === 'GET') {
      const ctx = await requireTp(req)
      const personId = parseId(personMatch[1], 'person id')
      assertCanSeePerson(ctx, personId)
      const person = await getPerson(personId)
      if (!person) throw new HttpError(404, 'Person not found.')
      // Reading someone else's record is itself an auditable event.
      if (ctx.self?.id !== personId) await auditRead(ctx.user, 'person', personId)
      return res.status(200).json({ success: true, person })
    }

    return res.status(404).json({ success: false, error: 'Not found.' })
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, error: err.message })
    console.error('tp api error', route, err)
    return res.status(500).json({ success: false, error: 'Server error.' })
  }
}
