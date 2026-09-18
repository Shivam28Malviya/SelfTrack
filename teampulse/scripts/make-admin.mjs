// Creates (or promotes) an admin login and links it to a Team Pulse person, so
// a fresh local database is usable immediately.
//
// Without this, a new database has no way in: signup creates a `pending` user
// with the `user` role, and Team Pulse needs an approved admin or manager that
// is linked to a tp_person before any screen has anything to scope to.
//
// Usage:
//   npm run db:admin -- you@example.com yourpassword ["Person Name"]
import { sql } from '../lib/db.js'
import { hashPassword } from '../lib/auth.js'

const [email, password, personName = 'Sample Manager'] = process.argv.slice(2)

if (!email || !password) {
  console.error('Usage: npm run db:admin -- <email> <password> ["Person Name"]')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Choose a password of at least 8 characters.')
  process.exit(1)
}

const run = async () => {
  const hash = await hashPassword(password)
  const username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'admin'

  await sql`
    insert into users (username, email, password_hash, role, status)
    values (${username}, ${email}, ${hash}, 'admin', 'approved')
    on conflict (email) do update
      set password_hash = excluded.password_hash, role = 'admin', status = 'approved'
  `
  const { rows: users } = await sql`select id from users where email = ${email}`
  const userId = users[0].id

  const { rows: linked } = await sql`
    update tp_person set user_id = ${userId} where name = ${personName} returning name
  `

  console.log(`Admin ready: ${email}`)
  console.log(linked.length
    ? `Linked to "${linked[0].name}".`
    : `No person named "${personName}" — sign in and add people, or pass a name that exists.`)
  process.exit(0)
}

run().catch((err) => {
  console.error('Failed:', err.message)
  process.exit(1)
})
