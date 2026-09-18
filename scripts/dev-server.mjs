// Runs the whole app on localhost: both API routers and the built client.
//
// There was previously no way to run the API locally at all — the handlers
// only existed as Vercel functions, and `vite dev` serves the client alone.
// This mounts the same handlers under node:http, so what runs here is the code
// that runs in production rather than a stand-in.
//
// Usage:
//   POSTGRES_URL=postgres://... node scripts/dev-server.mjs [--port 5174]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const portArg = process.argv.indexOf('--port')
const PORT = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.PORT || 5174)

const legacy = (await import('../api/[...path].js')).default
const teampulse = (await import('../api/tp/[...path].js')).default

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

/** Collects a JSON body the way Vercel's runtime does. */
function readBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined)
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (!raw) return resolve(undefined)
      const type = req.headers['content-type'] || ''
      if (type.includes('application/json')) {
        try { return resolve(JSON.parse(raw)) } catch { return resolve(undefined) }
      }
      resolve(raw)
    })
  })
}

/** The catch-all rewrite from vercel.json, applied here so the handlers see
 *  exactly the `query.path` they expect. */
function queryFor(url, pathKey) {
  const query = { path: pathKey }
  for (const [k, v] of url.searchParams) {
    if (k === 'path') continue
    if (query[k] === undefined) query[k] = v
    else if (Array.isArray(query[k])) query[k].push(v)
    else query[k] = [query[k], v]
  }
  return query
}

async function serveStatic(url, res) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  // normalize + the prefix check keeps ../ out of the served directory.
  const file = normalize(join(root, rel))
  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(await readFile(file))
  } catch {
    // A path that looks like a file stays a 404; anything else is a client
    // route, so the SPA gets to handle it.
    if (/\.[a-z0-9]+$/i.test(url.pathname)) {
      res.writeHead(404).end('Not found')
      return
    }
    try {
      res.writeHead(200, { 'content-type': MIME['.html'] })
      res.end(await readFile(join(root, 'index.html')))
    } catch {
      res.writeHead(500).end('Run `npm run build` first — dist/ is missing.')
    }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const rest = url.pathname.replace(/^\/api\/?/, '')
    const isTp = rest === 'tp' || rest.startsWith('tp/')
    const handler = isTp ? teampulse : legacy
    const pathKey = isTp ? rest.replace(/^tp\/?/, '') : rest

    req.query = queryFor(url, pathKey)
    req.body = await readBody(req)

    // The handlers are already Node-shaped; only `status().json()` chaining and
    // a default content type need adding.
    res.status = (code) => { res.statusCode = code; return res }
    res.json = (payload) => {
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(payload))
      return res
    }

    try {
      await handler(req, res)
    } catch (err) {
      console.error('dev-server handler error', url.pathname, err)
      if (!res.writableEnded) res.status(500).json({ success: false, error: 'Server error.' })
    }
    if (!res.writableEnded) res.status(500).json({ success: false, error: 'Handler wrote no response.' })
    return
  }

  await serveStatic(url, res)
})

server.listen(PORT, () => {
  const db = process.env.POSTGRES_URL || process.env.DATABASE_URL
  console.log(`Team Pulse dev server on http://localhost:${PORT}`)
  console.log(db ? `Database: ${db.replace(/:[^:@/]+@/, ':****@')}` : 'No database configured (POSTGRES_URL is unset)')
})
