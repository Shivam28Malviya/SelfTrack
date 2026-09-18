import legacyHandler from '../api/[...path].js'
import tpHandler from '../api/tp/[...path].js'
import { runHandler } from './adapter.js'

/**
 * Cloudflare Workers entry point.
 *
 * Reproduces what `vercel.json` does on Vercel:
 *
 *   /api/tp/*   -> api/tp/[...path].js   with query.path = the rest
 *   /api/*      -> api/[...path].js      with query.path = the rest
 *   everything else -> the built SPA, falling back to index.html
 *
 * The order matters: the TeamPulse rule is more specific and has to be tested
 * first, exactly as in the Vercel config.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Workers surface bindings on `env`, while this codebase reads
    // `process.env` (shared with the Vercel deployment). `nodejs_compat`
    // populates process.env from vars and secrets, but plain-text vars added
    // later can be missing, so anything absent is copied across once.
    hydrateProcessEnv(env)

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const rest = url.pathname.replace(/^\/api\/?/, '')

      if (rest === 'tp' || rest.startsWith('tp/')) {
        const pathKey = rest.replace(/^tp\/?/, '')
        return runHandler(tpHandler, { request, url, pathKey })
      }

      return runHandler(legacyHandler, { request, url, pathKey: rest })
    }

    return serveStatic(request, env, url)
  },
}

/**
 * Serves the built client. A request for a real file gets that file; anything
 * else gets index.html, because the router owns those paths — without the
 * fallback, a reload on /tp/people would 404.
 */
async function serveStatic(request, env, url) {
  if (!env.ASSETS) {
    return new Response('Static assets are not bound to this Worker.', { status: 500 })
  }

  const direct = await env.ASSETS.fetch(request)
  if (direct.status !== 404) return direct

  // Never fall back for something that is clearly meant to be a file: a
  // missing script should 404, not silently return HTML, which turns a typo
  // into a confusing parse error in the browser.
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return direct

  const indexUrl = new URL('/index.html', url.origin)
  return env.ASSETS.fetch(new Request(indexUrl, { headers: request.headers }))
}

let hydrated = false
function hydrateProcessEnv(env) {
  if (hydrated) return
  hydrated = true
  try {
    if (typeof process === 'undefined' || !process.env) return
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  } catch {
    // process is unavailable without nodejs_compat; the bindings check in
    // lib/db.js will report the real problem with a clearer message.
  }
}
