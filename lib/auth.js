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

// Resolves the bearer token in the request to a user row, or null.
export async function getSessionUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { rows } = await sql`
    select u.* from sessions s
    join users u on u.id = s.user_id
    where s.token = ${token}
  `
  return rows[0] || null
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
