/**
 * Runs a Vercel-style `(req, res)` handler inside a Cloudflare Worker.
 *
 * Both API routers in this repo were written for Vercel's Node signature. They
 * touch a small, known surface — `req.method`, `req.query`, `req.body`,
 * `req.headers`, and `res.status().json()` — so this shim lets them run
 * unchanged on Workers rather than being rewritten and diverging from the
 * version that runs on Vercel.
 *
 * `pathKey` reproduces Vercel's catch-all rewrite: `/api/tp/people/5` arrives
 * at the handler as `query.path = 'people/5'`, exactly as `vercel.json` does it.
 */

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB; the CSV import is the largest caller

export function makeReq({ request, url, pathKey, body }) {
  const query = { path: pathKey }
  for (const [k, v] of url.searchParams) {
    // Vercel gives repeated parameters as an array; a single one as a string.
    if (k === 'path') continue
    if (query[k] === undefined) query[k] = v
    else if (Array.isArray(query[k])) query[k].push(v)
    else query[k] = [query[k], v]
  }

  const headers = {}
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v

  return {
    method: request.method,
    url: url.pathname + url.search,
    query,
    headers,
    body,
  }
}

/**
 * A minimal `res`. Collects what the handler writes and resolves to a real
 * Response, so the handler's own control flow (`return res.status(...).json()`)
 * works untouched.
 */
export function makeRes() {
  let statusCode = 200
  let resolveWith
  const done = new Promise((resolve) => { resolveWith = resolve })
  const headers = new Headers()

  const res = {
    get statusCode() { return statusCode },
    status(code) {
      statusCode = code
      return res
    },
    setHeader(name, value) {
      headers.set(name, value)
      return res
    },
    json(payload) {
      headers.set('content-type', 'application/json; charset=utf-8')
      resolveWith(new Response(JSON.stringify(payload), { status: statusCode, headers }))
      return res
    },
    send(payload) {
      if (typeof payload === 'string' && !headers.has('content-type')) {
        headers.set('content-type', 'text/plain; charset=utf-8')
      }
      resolveWith(new Response(payload, { status: statusCode, headers }))
      return res
    },
    end(payload) {
      resolveWith(new Response(payload ?? null, { status: statusCode, headers }))
      return res
    },
    redirect(location, code = 302) {
      headers.set('location', location)
      resolveWith(new Response(null, { status: code, headers }))
      return res
    },
  }

  return { res, done }
}

/** Parses the request body the way Vercel does: JSON when the content type
 *  says so, raw text otherwise, and undefined when there is no body. */
export async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined

  const raw = await request.text()
  if (!raw) return undefined
  if (raw.length > MAX_BODY_BYTES) {
    throw new BodyTooLarge(`Request body is larger than ${MAX_BODY_BYTES} bytes.`)
  }

  const type = request.headers.get('content-type') || ''
  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw)
    } catch {
      // Vercel leaves body undefined on unparseable JSON rather than throwing,
      // and every handler here already guards with `req.body || {}`.
      return undefined
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  return raw
}

export class BodyTooLarge extends Error {}

/**
 * Bridges one request into a handler. Errors become a 500 in the same JSON
 * shape the routers use, so a thrown exception does not surface as a bare
 * Workers error page.
 */
export async function runHandler(handler, { request, url, pathKey }) {
  let body
  try {
    body = await readBody(request)
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return Response.json({ success: false, error: err.message }, { status: 413 })
    }
    throw err
  }

  const req = makeReq({ request, url, pathKey, body })
  const { res, done } = makeRes()

  try {
    // The handler may return before or after writing; whichever settles first
    // wins, and a handler that returns without writing yields a 500 rather
    // than hanging the request forever.
    const ran = Promise.resolve(handler(req, res)).then(() => 'returned')
    const outcome = await Promise.race([done, ran])
    if (outcome instanceof Response) return outcome
    return await Promise.race([
      done,
      new Promise((resolve) =>
        setTimeout(
          () => resolve(Response.json({ success: false, error: 'Server error.' }, { status: 500 })),
          0
        )
      ),
    ])
  } catch (err) {
    console.error('worker handler error', url.pathname, err)
    return Response.json({ success: false, error: 'Server error.' }, { status: 500 })
  }
}
