// Seeds demo users + history, matching the app's old localStorage seed data.
// Usage: vercel env pull .env.local && node --env-file=.env.local scripts/seed.mjs
import bcrypt from 'bcryptjs'
import { sql } from '@vercel/postgres'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const now = Date.now()

function historyPoints(total, weeks) {
  const per = Math.round(total / weeks)
  const out = []
  let remaining = total
  for (let i = weeks - 1; i >= 0; i--) {
    const pts = i === 0 ? remaining : per
    remaining -= pts
    out.push({ date: now - i * WEEK_MS, points: pts })
  }
  return out
}

const DEMO = [
  { username: 'Admin', email: 'admin@selftrack.com', password: 'admin123', role: 'admin', emoji: '👑', score: 0, wins: 0, history: [] },
  { username: 'AlphaWolf', email: 'alpha@demo.com', password: 'demo123', role: 'user', emoji: '🦊', score: 9850, wins: 12, history: historyPoints(9850, 6) },
  { username: 'PixelQueen', email: 'pixel@demo.com', password: 'demo123', role: 'user', emoji: '👸', score: 8420, wins: 10, history: historyPoints(8420, 6) },
  { username: 'NeonByte', email: 'neon@demo.com', password: 'demo123', role: 'user', emoji: '⚡', score: 7190, wins: 9, history: historyPoints(7190, 5) },
  { username: 'StarDrift', email: 'star@demo.com', password: 'demo123', role: 'user', emoji: '🌟', score: 6540, wins: 8, history: historyPoints(6540, 5) },
  { username: 'CryptoKid', email: 'crypto@demo.com', password: 'demo123', role: 'user', emoji: '🚀', score: 5830, wins: 7, history: historyPoints(5830, 4) },
  { username: 'IronPulse', email: 'iron@demo.com', password: 'demo123', role: 'user', emoji: '💪', score: 4920, wins: 6, history: historyPoints(4920, 4) },
  { username: 'ShadowFox', email: 'shadow@demo.com', password: 'demo123', role: 'user', emoji: '🦝', score: 3670, wins: 5, history: historyPoints(3670, 3) },
  { username: 'VortexVibe', email: 'vortex@demo.com', password: 'demo123', role: 'user', emoji: '🌀', score: 2410, wins: 4, history: historyPoints(2410, 3) },
  { username: 'MoonRider', email: 'moon@demo.com', password: 'demo123', role: 'user', emoji: '🌙', score: 1280, wins: 2, history: historyPoints(1280, 2) },
]

const run = async () => {
  for (const u of DEMO) {
    const hash = await bcrypt.hash(u.password, 10)
    const { rows } = await sql`
      insert into users (username, email, password_hash, role, status, score, wins, emoji)
      values (${u.username}, ${u.email}, ${hash}, ${u.role}, 'approved', ${u.score}, ${u.wins}, ${u.emoji})
      on conflict (email) do nothing
      returning id
    `
    const userId = rows[0]?.id
    if (!userId) { console.log(`Skipped ${u.username} (already exists).`); continue }
    for (const h of u.history) {
      await sql`insert into history (user_id, date, points, category) values (${userId}, to_timestamp(${h.date / 1000}), ${h.points}, 'General')`
    }
    console.log(`Seeded ${u.username}.`)
  }
  process.exit(0)
}

run().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
