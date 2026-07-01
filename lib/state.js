import { sql, rowToUser, rowToHistory, rowToKudos, rowToNotif, rowToAudit, rowToSeason, rowToWinner } from './db.js'

// Assembles the full app-state payload the frontend needs in one shot.
// Small user count (leaderboard app) — per-user queries are fine here.
export async function buildState(currentUserId) {
  const { rows: userRows } = await sql`select * from users order by created_at asc`

  const users = await Promise.all(userRows.map(async (u) => {
    const [{ rows: historyRows }, { rows: kudosRows }] = await Promise.all([
      sql`select * from history where user_id = ${u.id} order by date asc`,
      sql`select * from kudos where user_id = ${u.id}`,
    ])
    return {
      ...rowToUser(u),
      history: historyRows.map(rowToHistory),
      kudos: kudosRows.map(rowToKudos),
    }
  }))

  const [{ rows: metaRows }, { rows: winnerRows }, { rows: auditRows }, { rows: seasonRows }, { rows: notifRows }] = await Promise.all([
    sql`select * from meta where id = 1`,
    sql`select * from weekly_winners order by created_at desc`,
    sql`select * from audit_log order by ts desc limit 300`,
    sql`select * from seasons order by ended_at desc`,
    currentUserId
      ? sql`select * from notifications where user_id = ${currentUserId} order by ts desc limit 200`
      : Promise.resolve({ rows: [] }),
  ])

  const metaRow = metaRows[0]
  const meta = {
    rewards: metaRow.rewards,
    quote: metaRow.quote,
    categories: metaRow.categories,
    announcement: metaRow.announcement,
    weeklyWinners: winnerRows.map(rowToWinner),
    auditLog: auditRows.map(rowToAudit),
    seasons: seasonRows.map(rowToSeason),
  }

  return {
    users,
    meta,
    notifications: notifRows.map(rowToNotif),
    currentUser: currentUserId ? users.find(u => u.id === currentUserId) || null : null,
  }
}

export async function pushNotif(userId, text, icon = '🔔') {
  await sql`insert into notifications (user_id, text, icon) values (${userId}, ${text}, ${icon})`
}
