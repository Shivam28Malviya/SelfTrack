import test from 'node:test'
import assert from 'node:assert/strict'

import { makeReq, makeRes, readBody, runHandler } from '../worker/adapter.js'
import { splitStatements } from '../lib/tp/sqlSplit.js'

const req = (url, init = {}) => new Request(url, init)

test('the catch-all path is reproduced the way vercel.json rewrites it', () => {
  const url = new URL('https://x/api/people/5?sort=-joined&page=2')
  const r = makeReq({ request: req(url), url, pathKey: 'people/5' })
  assert.equal(r.query.path, 'people/5')
  assert.equal(r.query.sort, '-joined')
  assert.equal(r.query.page, '2')
  assert.equal(r.method, 'GET')
})

test('a repeated query parameter becomes an array, a single one stays a string', () => {
  const url = new URL('https://x/api/entries?kind=feedback&kind=overtime&page=1')
  const r = makeReq({ request: req(url), url, pathKey: 'entries' })
  assert.deepEqual(r.query.kind, ['feedback', 'overtime'])
  assert.equal(r.query.page, '1')
})

test('a path query parameter in the URL cannot override the routed path', () => {
  // Otherwise ?path=admin/secret would let a caller pick a different route.
  const url = new URL('https://x/api/people?path=../../admin')
  const r = makeReq({ request: req(url), url, pathKey: 'people' })
  assert.equal(r.query.path, 'people')
})

test('headers are lowercased, which is what the auth check reads', () => {
  const url = new URL('https://x/api/me')
  const r = makeReq({ request: req(url, { headers: { Authorization: 'Bearer abc' } }), url, pathKey: 'me' })
  assert.equal(r.headers.authorization, 'Bearer abc')
})

test('a JSON body is parsed, and unparseable JSON is left undefined', async () => {
  const good = await readBody(req('https://x/api/entries/absence', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"personId":3}',
  }))
  assert.deepEqual(good, { personId: 3 })

  // Every handler guards with `req.body || {}`, so undefined is the safe shape
  // and matches what Vercel does rather than throwing.
  const bad = await readBody(req('https://x/api/entries/absence', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
  }))
  assert.equal(bad, undefined)

  const empty = await readBody(req('https://x/api/me'))
  assert.equal(empty, undefined)
})

test('res.status().json() resolves to a Response with that status', async () => {
  const { res, done } = makeRes()
  res.status(409).json({ success: false, error: 'conflict' })
  const response = await done
  assert.equal(response.status, 409)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.deepEqual(await response.json(), { success: false, error: 'conflict' })
})

test('a handler that writes nothing yields a 500 rather than hanging', async () => {
  const url = new URL('https://x/api/health')
  const response = await runHandler(async () => {}, { request: req(url), url, pathKey: 'health' })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { success: false, error: 'Server error.' })
})

test('a throwing handler becomes a 500 in the routers own JSON shape', async () => {
  const url = new URL('https://x/api/health')
  const response = await runHandler(async () => { throw new Error('boom') },
    { request: req(url), url, pathKey: 'health' })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { success: false, error: 'Server error.' })
})

test('an oversized body is refused with 413 instead of being parsed', async () => {
  const url = new URL('https://x/api/people/import')
  const response = await runHandler(async (_q, res) => res.status(200).json({ ok: true }), {
    request: req(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: 'x'.repeat(1024 * 1024 + 10) }),
    }),
    url,
    pathKey: 'people/import',
  })
  assert.equal(response.status, 413)
})

test('the handler receives the body and query the router expects', async () => {
  const url = new URL('https://x/api/entries/absence?dryRun=1')
  let seen = null
  const response = await runHandler(async (request, res) => {
    seen = request
    return res.status(200).json({ success: true })
  }, {
    request: req(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: '{"personId":7,"days":3}',
    }),
    url,
    pathKey: 'entries/absence',
  })
  assert.equal(response.status, 200)
  assert.equal(seen.method, 'POST')
  assert.equal(seen.query.path, 'entries/absence')
  assert.equal(seen.query.dryRun, '1')
  assert.deepEqual(seen.body, { personId: 7, days: 3 })
})

test('SQL scripts split on statement boundaries, not on every semicolon', () => {
  assert.equal(splitStatements("insert into t values ('a;b'); select 1;").length, 2)
  assert.equal(splitStatements("insert into t values ('it''s; ok'); select 1;").length, 2)
  assert.equal(splitStatements('do $$ begin; end; $$; select 1;').length, 2)
  assert.equal(splitStatements('do $tag$ begin; end; $tag$; select 1;').length, 2)
  // A semicolon inside a comment must not split the statement that follows it.
  assert.equal(splitStatements('-- drop this; really\nselect 1;').length, 1)
  assert.equal(splitStatements('/* a; b */ select 1;').length, 1)
  assert.equal(splitStatements('-- nothing but a comment\n').length, 0)
  assert.equal(splitStatements('select 1').length, 1)
})
