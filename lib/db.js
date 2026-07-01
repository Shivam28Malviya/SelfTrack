import { sql } from '@vercel/postgres'

export { sql }

export function rowToUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status,
    score: u.score,
    emoji: u.emoji,
    avatar: u.avatar,
    pendingAvatar: u.pending_avatar,
    bio: u.bio,
    stats: { wins: u.wins },
  }
}

export function rowToHistory(h) {
  return { date: new Date(h.date).getTime(), points: h.points, category: h.category }
}

export function rowToKudos(k) {
  return { fromId: k.from_id, fromName: k.from_name, emoji: k.emoji, ts: new Date(k.ts).getTime() }
}

export function rowToNotif(n) {
  return { id: String(n.id), userId: n.user_id, text: n.text, icon: n.icon, ts: new Date(n.ts).getTime(), read: n.read }
}

export function rowToAudit(a) {
  return {
    id: String(a.id), ts: new Date(a.ts).getTime(),
    actorId: a.actor_id, actorName: a.actor_name, action: a.action,
    userId: a.user_id, userName: a.user_name, points: a.points, category: a.category, undone: a.undone,
  }
}

export function rowToSeason(s) {
  return { id: String(s.id), name: s.name, endedAt: new Date(s.ended_at).getTime(), podium: s.podium }
}

export function rowToWinner(w) {
  return { id: String(w.id), week: w.week, topic: w.topic, winnerId: w.winner_id, winnerName: w.winner_name }
}
