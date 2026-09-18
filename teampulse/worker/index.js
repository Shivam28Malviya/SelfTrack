import handler from '../api/[...path].js'
import { runHandler } from './adapter.js'

/**
 * Cloudflare Workers entry point.
 *
 *   /api/*          -> the API, with query.path set to the rest
 *   everything else -> the built client, falling back to index.html
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    hydrateProcessEnv(env)

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const pathKey = url.pathname.replace(/^\/api\/?/, '')
      return runHandler(handler, { request, url, pathKey })
    }

    return serveStatic(request, env, url)
  },
}

/**
 * A request for a real file gets that file; anything else gets index.html,
 * because the router owns those paths — without the fallback, a reload on
 * /people would 404. A path that looks like a file still 404s, so a missing
 * script fails as a missing script rather than returning HTML.
 */
async function serveStatic(request, env, url) {
  if (!env.ASSETS) return new Response('Static assets are not bound to this Worker.', { status: 500 })

  const direct = await env.ASSETS.fetch(request)
  if (direct.status !== 404) return direct
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return direct

  return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), { headers: request.headers }))
}

let hydrated = false
function hydrateProcessEnv(env) {
  if (hydrated) return
  hydrated = true
  try {
    if (typeof process === 'undefined' || !process.env) return
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // Without nodejs_compat there is no process; lib/db.js reports the real
    // problem with a clearer message than this would.
  }
}
