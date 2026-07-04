import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { sql } from './db.js'

export const hashPassword = (pw) => bcrypt.hash(pw, 10)
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash)

export function newToken() {
  return crypto.randomBytes(32).toString('hex')
}

export async function createSession(userId) {
  const token = newToken()
  await sql`insert into sessions (token, user_id) values (${token}, ${userId})`
  return token
}

export async function destroySession(token) {
  if (!token) return
  await sql`delete from sessions where token = ${token}`
}

const SESSION_TTL_MINUTES = 30

// Resolves the bearer token in the request to a user row, or null.
// Sessions expire 30 minutes after creation; expired ones are deleted on touch.
export async function getSessionUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { rows } = await sql`
    select u.*, s.created_at as session_created_at from sessions s
    join users u on u.id = s.user_id
    where s.token = ${token}
  `
  const row = rows[0]
  if (!row) return null
  const ageMs = Date.now() - new Date(row.session_created_at).getTime()
  if (ageMs > SESSION_TTL_MINUTES * 60 * 1000) {
    await sql`delete from sessions where token = ${token}`
    return null
  }
  return row
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function requireAuth(req) {
  const user = await getSessionUser(req)
  if (!user) throw new HttpError(401, 'Not signed in.')
  return user
}

export async function requireStaff(req) {
  const user = await requireAuth(req)
  if (user.role !== 'admin' && user.role !== 'moderator') throw new HttpError(403, 'Staff access required.')
  return user
}

export async function requireAdmin(req) {
  const user = await requireAuth(req)
  if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.')
  return user
}
